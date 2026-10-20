'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A switched role must survive the silent 401 -> refresh.
//
// Access tokens live 15 minutes. Refresh re-read the user row and signed the new
// token with users.role — the PRIMARY role — so a user who had switched was
// quietly returned to it, while the UI went on showing the switched role. It
// surfaced as "I switched to Admin and deleting a service says 'Only the owning
// department can delete this service'": a message about departments for what was
// really an expired elevation.
//
// It fails toward LOWER privilege, so the danger is not escalation — it is that
// the elevation vanishes silently, and the resulting error names the wrong cause.

const jwt = require('jsonwebtoken');
const { query, request, app, USERS } = require('./helpers');

const made = { users: [] };
let analyst;                       // holds risk_analyst (primary) + admin

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO users (email, full_name, role, password_hash, is_active, department_id)
     VALUES ('itg-switch@org.local', 'ITG Switcher', 'risk_analyst',
             (SELECT password_hash FROM users WHERE id = $1), TRUE,
             (SELECT department_id FROM users WHERE id = $1))
     RETURNING id`, [USERS.analyst.id]);
  analyst = rows[0].id;
  made.users.push(analyst);
  await query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,'admin',$2)`,
              [analyst, USERS.ciso.id]);
});

afterAll(async () => {
  for (const id of made.users) {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    await query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await query('DELETE FROM users WHERE id = $1', [id]);
  }
});

// Log in for real: the family id only exists on a genuine session.
async function login() {
  // gen_random_uuid() for the hash, not Date.now(): two sessions created in the
  // same millisecond collided on token_hash, which made this suite flaky —
  // it failed once and passed on re-run, which is worse than failing.
  const famRow = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, 'itg-' || gen_random_uuid()::text, gen_random_uuid(), now() + interval '30 days')
     RETURNING family_id`,
    [analyst]);
  return famRow.rows[0].family_id;
}

const accessTokenFor = (role, fam) => jwt.sign(
  { sub: analyst, email: 'itg-switch@org.local', role, fam },
  process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

describe('a switched role survives refresh', () => {
  test('switch-role records the elevation against THIS session', async () => {
    const fam = await login();
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessTokenFor('risk_analyst', fam)}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.access_token).role).toBe('admin');

    const { rows } = await query(
      'SELECT active_role FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [fam]);
    expect(rows[0].active_role).toBe('admin');
  });

  test('the new access token carries the session family, so the switch is attributable', async () => {
    const fam = await login();
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessTokenFor('risk_analyst', fam)}`)
      .send({ role: 'admin' });
    expect(jwt.decode(res.body.access_token).fam).toBe(fam);
  });

  test('the elevation is scoped to the session, not the person', async () => {
    // A second session (another device) must not inherit the first's elevation.
    const famA = await login();
    const famB = await login();
    await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessTokenFor('risk_analyst', famA)}`)
      .send({ role: 'admin' });

    const { rows } = await query(
      'SELECT active_role FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [famB]);
    expect(rows[0].active_role).toBeNull();
  });

  test('a switch to a role the user does NOT hold is refused and records nothing', async () => {
    const fam = await login();
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessTokenFor('risk_analyst', fam)}`)
      .send({ role: 'ciso' });
    expect(res.status).toBe(403);

    const { rows } = await query(
      'SELECT active_role FROM refresh_tokens WHERE family_id = $1', [fam]);
    expect(rows[0].active_role).toBeNull();
  });

  test('a revoked role is NOT resurrected — the stored value is a hint, not an authority', async () => {
    const fam = await login();
    await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessTokenFor('risk_analyst', fam)}`)
      .send({ role: 'admin' });

    // Take the admin role away while the session still claims it.
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'`, [analyst]);
    const { rows } = await query(
      'SELECT active_role FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [fam]);
    expect(rows[0].active_role).toBe('admin');   // still stored…

    // …but a refresh must fall back to the primary role, not re-issue admin.
    // (Exercised at the unit level below; here we assert the DB state the
    // refresh path reads, plus that the role is genuinely no longer held.)
    const held = await query(
      `SELECT 1 FROM v_user_roles WHERE user_id = $1 AND role = 'admin'`, [analyst]);
    expect(held.rows).toHaveLength(0);

    await query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,'admin',$2)`,
                [analyst, USERS.ciso.id]);
  });
});

// ── The half that actually broke: refresh ──────────────────────────────────
//
// The tests above prove the elevation is RECORDED. These prove it is RESTORED,
// which is the bug the user hit: switch to admin, wait for the access token to
// expire, and the silent refresh handed back a risk_analyst token.

describe('refresh restores the session role', () => {
  // A real login — the raw refresh token only exists here.
  const doLogin = () => request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'itg-switch@org.local', password: 'Riskapp123' });

  test('THE REGRESSION: after switching, refresh returns the switched role', async () => {
    const login = await doLogin();
    expect(login.status).toBe(200);

    const sw = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ role: 'admin' });
    expect(jwt.decode(sw.body.access_token).role).toBe('admin');

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.refresh_token });
    expect(refreshed.status).toBe(200);

    // Before v105 this was 'risk_analyst' — the elevation vanished silently.
    expect(jwt.decode(refreshed.body.access_token).role).toBe('admin');
  });

  test('without a switch, refresh returns the primary role', async () => {
    const login = await doLogin();
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.refresh_token });
    expect(jwt.decode(refreshed.body.access_token).role).toBe('risk_analyst');
  });

  test('a revoked role is not resurrected by an outstanding refresh token', async () => {
    const login = await doLogin();
    await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ role: 'admin' });

    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'`, [analyst]);
    try {
      const refreshed = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: login.body.refresh_token });
      expect(refreshed.status).toBe(200);
      // The stored hint still says admin; the user no longer holds it, so the
      // refresh must fall back rather than re-issue an elevation that was taken
      // away. This is the reason the stored value is re-verified every time.
      expect(jwt.decode(refreshed.body.access_token).role).toBe('risk_analyst');
    } finally {
      await query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,'admin',$2)`,
                  [analyst, USERS.ciso.id]);
    }
  });

  test('the elevation persists across SUCCESSIVE refreshes, not just the first', async () => {
    const login = await doLogin();
    await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ role: 'admin' });

    let token = login.body.refresh_token;
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: token });
      expect(r.status).toBe(200);
      expect(jwt.decode(r.body.access_token).role).toBe('admin');
      token = r.body.refresh_token;      // rotation: each refresh issues a new one
    }
  });
});
