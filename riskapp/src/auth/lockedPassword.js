'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The password a new account is created with: random, its own, and never told to
// anyone (v164, owner 2026-11-02). It is a valid bcrypt hash, so a sign-in is
// simply refused, and the account stays active — an active account is what makes
// a person a department's risk owner. users.password_set_at stays NULL until an
// administrator sets a real password, which is how the screens know the account
// cannot be signed in to yet.
//
// Used by the admin API (create user), db/import.js (a person loaded without a
// password) and the Misty Isles install (locking its personas).

const crypto = require('crypto');
const bcrypt = require('bcrypt');

// 32 random bytes as base64: 44 characters, well inside bcrypt's 72 bytes.
async function lockedPasswordHash(cost = 12) {
  return bcrypt.hash(crypto.randomBytes(32).toString('base64'), cost);
}

module.exports = { lockedPasswordHash };
