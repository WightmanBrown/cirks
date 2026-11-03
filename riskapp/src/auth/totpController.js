'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Two-factor sign-in, set up by the person themselves (H-05, v166; owner
// 2026-11-02). Every route acts on the signed-in account only.
//
//   GET  /auth/totp          { enabled, enabled_at, pending }
//   POST /auth/totp/setup    a new secret to scan: { secret, otpauth_url, qr }
//   POST /auth/totp/confirm  { code } — switches it on once the code is right
//   POST /auth/totp/disable  { password, code } — both, so a session left open
//                            on someone's desk cannot switch it off
//
// The secret is generated here, shown once to be scanned, and written to the
// database; it is never read back. Codes are checked inside the database
// (verify_user_totp / confirm_user_totp), because the app role holds no SELECT
// on the secret columns (H-17). An administrator clears a lost authenticator
// with POST /admin/users/:id/reset-totp.

const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { query } = require('../db/pool');

// Shown by the authenticator app beside the account.
const ISSUER = 'CIRKS';

async function audit(user, narrative) {
  await query(
    `INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, entity_label, action, human_narrative)
     SELECT u.id, $2, u.full_name, 'users', u.id, u.email, 'update', $3 FROM users u WHERE u.id = $1`,
    [user.id, user.role, narrative]);
}

async function status(req, res, next) {
  try {
    const { rows: [u] } = await query(
      `SELECT totp_enabled, totp_enabled_at, totp_pending_at FROM users WHERE id = $1`, [req.user.id]);
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    res.json({ enabled: u.totp_enabled, enabled_at: u.totp_enabled_at, pending: !!u.totp_pending_at && !u.totp_enabled });
  } catch (err) { next(err); }
}

async function setup(req, res, next) {
  try {
    const { rows: [u] } = await query('SELECT email, totp_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    if (u.totp_enabled) {
      return res.status(409).json({ error: 'Two-factor sign-in is already on. Turn it off first to set up a new authenticator.' });
    }
    // 20 bytes (160 bits), the size RFC 4226 recommends; base32 for the apps.
    const secret = authenticator.generateSecret(20);
    await query(
      // A new secret starts with no step used: the last step belonged to the old one.
      `UPDATE users SET totp_pending_secret = $1, totp_pending_at = now(), totp_last_step = NULL, updated_at = now()
        WHERE id = $2`,
      [secret, req.user.id]);
    const otpauthUrl = authenticator.keyuri(u.email, ISSUER, secret);
    const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    res.json({ secret, otpauth_url: otpauthUrl, qr });
  } catch (err) { next(err); }
}

async function confirm(req, res, next) {
  try {
    const { rows: [r] } = await query('SELECT confirm_user_totp($1, $2) AS ok', [req.user.id, String(req.body?.code ?? '')]);
    if (!r.ok) {
      return res.status(400).json({
        error: 'That code is not right. Check the time on your phone is set automatically, and use the newest code.',
      });
    }
    // Other sessions were signed in with the password alone: end them. This one
    // stays — the person has just proved they hold the authenticator.
    await query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND family_id IS DISTINCT FROM $2`,
      [req.user.id, req.user.family]);
    await audit(req.user, 'Two-factor sign-in switched on.');
    res.json({ enabled: true });
  } catch (err) { next(err); }
}

async function disable(req, res, next) {
  try {
    const { password, code } = req.body || {};
    const { rows: [u] } = await query('SELECT email, totp_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    if (!u.totp_enabled) return res.status(409).json({ error: 'Two-factor sign-in is not on.' });
    const { rows: [cred] } = await query('SELECT password_ok FROM verify_user_credentials($1, $2)', [u.email, String(password ?? '')]);
    const { rows: [t] } = await query('SELECT verify_user_totp($1, $2) AS ok', [req.user.id, String(code ?? '')]);
    if (!cred?.password_ok || !t.ok) {
      return res.status(400).json({ error: 'The password or the code is not right.' });
    }
    await query(
      `UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_enabled_at = NULL,
                        totp_pending_secret = NULL, totp_pending_at = NULL, totp_last_step = NULL, updated_at = now()
        WHERE id = $1`, [req.user.id]);
    await audit(req.user, 'Two-factor sign-in switched off by the account holder.');
    res.json({ enabled: false });
  } catch (err) { next(err); }
}

module.exports = { status, setup, confirm, disable };
