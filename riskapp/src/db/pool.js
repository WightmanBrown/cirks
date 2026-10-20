'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Pool } = require('pg');

// How long an idle client is kept before being closed. Unset = node-postgres's
// default (10 s), which is right for the app. The integration suite sets it short:
// Jest gives every test file its own pool, and with 41 files running back to back
// the idle clients of finished files were still open while later files ran, until
// PostgreSQL refused new connections (max_connections 100, 2026-09-22).
const idleTimeoutMillis = process.env.PG_IDLE_TIMEOUT_MS
  ? parseInt(process.env.PG_IDLE_TIMEOUT_MS, 10)
  : undefined;

// JIT compilation off for the app's sessions. CIRKS reads small tables through
// nested views (the security-architecture views, v148), whose cost ESTIMATES pass
// PostgreSQL's jit_above_cost although the work is a few milliseconds — so every
// such query paid ~2 s of LLVM compilation (the component-record finding: 2.2 s
// with JIT, 80 ms without). JIT pays off on long analytical scans, which the app
// does not run. Set per connection so it needs no superuser or role change.
const options = '-c jit=off';

// Support either a full connection string or individual vars.
// DATABASE_URL takes precedence.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep ssl off for local dev; override per environment as needed.
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis,
      options,
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'riskapp_dev',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      idleTimeoutMillis,
      options,
    });

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Convenience wrapper: run a query with automatic client checkout/release.
 * For transactions, use pool.connect() directly.
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[db] query ${duration}ms | rows: ${res.rowCount} | ${text.slice(0, 80)}`);
  }
  return res;
}

/**
 * Run work as a named user, so database triggers can attribute the change.
 *
 * A trigger cannot see the application user, so `cirks.actor_id` is set for the
 * duration of one transaction and read by `cirks_audit_actor()` (v106). It is
 * SET LOCAL, which means:
 *
 *   - it is scoped to this transaction, so a pooled connection cannot leak one
 *     request's identity into the next — the failure mode that would make the
 *     audit trail actively misleading rather than merely incomplete;
 *   - it disappears on COMMIT or ROLLBACK without any cleanup to forget.
 *
 * Callers get a client and must use it for the writes they want attributed:
 *
 *   await withActor(req.user.id, (db) => db.query('UPDATE systems SET ...'));
 *
 * Work done outside this helper is still audited, with a NULL actor. That is
 * deliberate — recording an unattributed change is more useful than recording
 * nothing, and it makes an uninstrumented path visible instead of silent.
 */
async function withActor(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Parameterised: the actor is a request-derived value and must not be
    // concatenated into SQL, even as a UUID.
    await client.query('SELECT set_config($1, $2, true)', ['cirks.actor_id', userId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` in a transaction that is ALWAYS rolled back.
 *
 * For answering "what would happen if…": the work is done for real — triggers
 * fire, derived values recompute, audit rows are written — and then undone. A
 * preview computed any other way is a second implementation of the rules, and
 * the two drift (the whole argument for deriving rather than storing).
 *
 * Returns whatever `fn` returns, so read the answer out before it vanishes.
 */
async function withRollback(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['cirks.actor_id', userId ?? '']);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

module.exports = { pool, query, withActor, withRollback };
