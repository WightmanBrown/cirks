'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// API-key machine credentials (SOC enrichment — Stage 3).
//
// Keys are high-entropy random tokens, so they are stored as a fast SHA-256 hash
// (NOT bcrypt — bcrypt's deliberate slowness would throttle an event pipeline, and
// brute-forcing a 192-bit random secret is infeasible regardless). Lookup is a
// direct indexed match on the hash; key_prefix exists only for human-readable
// display in the admin list. The plaintext key is shown ONCE at creation and never
// stored. See docs/soc-enrichment-stage3.md.

const crypto = require('crypto');
const { query } = require('../db/pool');

const KEY_PREFIX = 'cirks_sk_';

/** SHA-256 hex of the presented key — the stored + looked-up value. */
function hashKey(key) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Mint a new key. Returns { key, prefix, hash } — `key` is the ONLY time the
 * plaintext exists; caller returns it to the user once and stores `hash`/`prefix`.
 */
function generateKey() {
  const secret = crypto.randomBytes(24).toString('base64url'); // 192 bits
  const key = `${KEY_PREFIX}${secret}`;
  return { key, prefix: key.slice(0, 16), hash: hashKey(key) };
}

/** Persist a new key row; returns the stored metadata (never the plaintext). */
// Default is the machine role (v111). The admin route allow-lists this
// separately and is the authoritative gate; this default exists so a direct
// caller cannot accidentally mint a human-role key.
async function createApiKey({ label, role = 'soc_integration', createdBy, expiresAt = null }) {
  const { key, prefix, hash } = generateKey();
  const { rows } = await query(
    `INSERT INTO api_keys (label, key_prefix, key_hash, role, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, label, key_prefix, role, created_by, created_at, last_used_at, expires_at, revoked_at`,
    [label, prefix, hash, role, createdBy, expiresAt]
  );
  return { key, record: rows[0] }; // `key` shown once to the caller
}

/** Resolve a presented key to a live (non-revoked, non-expired) row, or null. */
async function findLiveByKey(presentedKey) {
  if (typeof presentedKey !== 'string' || !presentedKey.startsWith(KEY_PREFIX)) return null;
  // The hash comparison happens INSIDE the database (migration 0132, H-17): the
  // app role holds EXECUTE on this function and no longer reads
  // `api_keys.key_hash`. The presented key — not its hash — is the argument.
  const { rows } = await query('SELECT * FROM verify_api_key($1)', [presentedKey]);
  return rows[0] || null;
}

/** Best-effort liveness stamp; never blocks or throws into the request path. */
function touchLastUsed(id) {
  query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [id]).catch(() => {});
}

/** Admin list — metadata only, newest first. Never exposes hash or plaintext. */
async function listApiKeys() {
  const { rows } = await query(
    `SELECT k.id, k.label, k.key_prefix, k.role, k.created_at, k.last_used_at,
            k.expires_at, k.revoked_at, u.full_name AS created_by_name
     FROM api_keys k
     LEFT JOIN users u ON u.id = k.created_by
     ORDER BY k.created_at DESC`
  );
  return rows;
}

/** Revoke (idempotent-ish; returns the row or null if unknown). */
async function revokeApiKey(id) {
  const { rows } = await query(
    `UPDATE api_keys SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING id, label, revoked_at`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  KEY_PREFIX,
  hashKey,
  generateKey,
  createApiKey,
  findLiveByKey,
  touchLastUsed,
  listApiKeys,
  revokeApiKey,
};
