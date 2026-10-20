'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const { pool, query } = require('../db/pool');

// ── Helpers ───────────────────────────────────────────────────────────────────

function signAccessToken(user, familyId = null) {
  return jwt.sign(
    // `fam` identifies the session (the refresh-token family), so a role switch
    // can be recorded against this session rather than the person (v105).
    { sub: user.id, email: user.email, role: user.role, fam: familyId },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user, familyId) {
  const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '30', 10);
  return jwt.sign(
    // `jti` is a per-token nonce, and it is load-bearing rather than decorative.
    // The payload was { sub, family }, and JWT `iat` has ONE-SECOND resolution —
    // so two refresh tokens for the same session issued in the same second were
    // byte-identical, hashed identically, and the second insert died on
    // refresh_tokens_token_hash_key with a 500. Reachable by refreshing just
    // after logging in, or by two browser tabs refreshing together.
    { sub: user.id, family: familyId, jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${expiresInDays}d` }
  );
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function refreshExpiresAt() {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '30', 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email, password, totp_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    // The comparison happens INSIDE the database (v112, H-17). The app role no
    // longer holds SELECT on users.password_hash, so a compromised container
    // yields no bcrypt hashes — the outcome most worth removing, because those
    // hashes are what turn a CIRKS breach into a breach of whatever else the
    // passwords open. The function is SECURITY DEFINER and returns a yes/no
    // plus the fields below; it never returns a hash.
    //
    // Enumeration resistance is preserved inside the function: an unknown email
    // still costs a real bcrypt, so timing does not distinguish it from a known
    // one. Do not "optimise" that away.
    const { rows } = await query(
      'SELECT * FROM verify_user_credentials($1, $2)',
      [email, password]
    );

    const user = rows[0];

    if (!user || !user.password_ok || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.totp_enabled) {
      // TOTP verification has NOT moved into the database, and the secret is no
      // longer readable from here. That is deliberate rather than an oversight:
      // MFA cannot be enrolled at all today (H-05 — nothing ever writes
      // totp_secret, so no account can legitimately be in this state), and
      // implementing base32 + HMAC-SHA1 + dynamic truncation in PL/pgSQL to
      // support a feature that does not work would be the wrong order of
      // events. When H-05 makes enrolment real, verification gets its own
      // definer function alongside this one. Until then this fails CLOSED and
      // says so, rather than silently admitting anyone.
      return res.status(401).json({
        error: 'This account requires a second factor, which is not yet available. An administrator can clear it.',
        totp_required: true,
      });
    }

    const { rows: roleRows } = await query(
      `SELECT role FROM v_user_roles
        WHERE user_id = $1
        ORDER BY CASE source WHEN 'primary' THEN 0 ELSE 1 END, role`,
      [user.id]
    );
    // Dedupe: a role held as both primary and additional must appear once.
    const roles = [...new Set(roleRows.map(r => r.role))];

    const familyId     = crypto.randomUUID();
    const accessToken  = signAccessToken(user, familyId);
    const refreshToken = signRefreshToken(user, familyId);
    const tokenHash    = hashToken(refreshToken);

    await query(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        tokenHash,
        familyId,
        refreshExpiresAt(),
        req.headers['user-agent'] || null,
        req.ip || null,
      ]
    );

    await query(
      `UPDATE users SET last_login_at = now() WHERE id = $1`,
      [user.id]
    );

    return res.status(200).json({
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    'Bearer',
      expires_in:    process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      user: {
        id:              user.id,
        email:           user.email,
        full_name:       user.full_name,
        role:            user.role,
        roles,
        department_id:   user.department_id   || null,
        department_name: user.department_name || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

async function refresh(req, res, next) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required.' });
  }

  let payload;
  try {
    payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  const tokenHash = hashToken(refresh_token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id, family_id, revoked_at, expires_at, active_role
         FROM refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash]
    );

    const stored = rows[0];

    if (!stored) {
      return res.status(401).json({ error: 'Refresh token not found.' });
    }

    if (stored.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [stored.family_id]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Refresh token reuse detected. Please log in again.' });
    }

    if (new Date(stored.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Refresh token expired.' });
    }

    const userRes = await client.query(
      `SELECT id, email, full_name, role, is_active FROM users WHERE id = $1`,
      [stored.user_id]
    );
    const user = userRes.rows[0];

    if (!user || !user.is_active) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'User account inactive.' });
    }

    // Restore the role this SESSION was operating as (v105). Refresh used to
    // sign with users.role — the primary role — so a user who had switched
    // was quietly demoted fifteen minutes later while the UI still showed the
    // switched role. It failed toward LOWER privilege, which is why it went
    // unnoticed until a delete refused with a message about departments.
    //
    // The stored value is a hint, never an authority: a role revoked while
    // this refresh token was outstanding must NOT come back to life here, so
    // it is re-verified against the roles the user holds right now.
    let activeRole = user.role;
    if (stored.active_role && stored.active_role !== user.role) {
      const { rows: held } = await client.query(
        `SELECT 1 FROM v_user_roles WHERE user_id = $1 AND role = $2`,
        [user.id, stored.active_role],
      );
      // If it is no longer held, fall back to the primary role. That is the
      // correct outcome, not an error worth failing the refresh over.
      if (held.length) activeRole = stored.active_role;
    }
    const sessionUser = { ...user, role: activeRole };

    const newRaw       = signRefreshToken(user, stored.family_id);
    const newHash      = hashToken(newRaw);
    const newAccessTok = signAccessToken(sessionUser, stored.family_id);

    const { rows: newRows } = await client.query(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, family_id, expires_at, user_agent, ip_address, active_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        user.id,
        newHash,
        stored.family_id,
        refreshExpiresAt(),
        req.headers['user-agent'] || null,
        req.ip || null,
        activeRole,
      ]
    );

    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2`,
      [newRows[0].id, stored.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      access_token:  newAccessTok,
      refresh_token: newRaw,
      token_type:    'Bearer',
      expires_in:    process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

async function logout(req, res, next) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(204).send();
    }

    const tokenHash = hashToken(refresh_token);

    const { rows } = await query(
      `SELECT family_id FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    if (rows[0]) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [rows[0].family_id]
      );
    }

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// signAccessToken is exported so switch-role signs tokens the same way login
// and refresh do. It previously kept its own copy, which is how a payload
// change (the `fam` session claim, v105) could reach two of the three paths
// and silently miss the third.
module.exports = { login, refresh, logout, signAccessToken };