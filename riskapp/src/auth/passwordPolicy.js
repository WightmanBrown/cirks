'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The one password rule. Every path that SETS a password checks it here: the
// admin API (create user, reset password), db/create-admin.js,
// db/reset-password.js, db/import.js and the Misty Isles install. The Account
// Management page mirrors it (riskapp-frontend/src/utils/passwordPolicy.js) so
// the refusal comes before the request; this file is the authority. Until
// 2026-10-22 the API and the page allowed 8 characters, the command-line tools
// 12, and the importer anything at all.
//
// At most 72 BYTES because bcrypt reads only the first 72 bytes and ignores the
// rest without a word — a longer password looks stronger than it is, so it is
// refused rather than quietly cut short. That also keeps every password far
// below the 256-byte point where pgcrypto's $2a$ and node-bcrypt's $2b$ stop
// agreeing (H-17 / v112: the sign-in check runs in the database), which was the
// reason for the old 128-character cap. Counted in UTF-8 bytes, not characters:
// "é" is two bytes, most other scripts two to four.
//
// Signing in is NOT checked against this rule: a password set under an older
// rule keeps working until it is next changed.

const MIN_PASSWORD_CHARS = 12;
const MAX_PASSWORD_BYTES = 72;

// The reason a password is refused, or null when it is acceptable.
function passwordProblem(password) {
  if (typeof password !== 'string' || password === '') return 'A password is required.';
  if ([...password].length < MIN_PASSWORD_CHARS) {
    return `Password must be at least ${MIN_PASSWORD_CHARS} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password is too long: at most ${MAX_PASSWORD_BYTES} bytes, which is ${MAX_PASSWORD_BYTES} plain English`
      + ' characters, fewer with accented or other non-English letters. bcrypt would ignore the rest.';
  }
  return null;
}

// For the command-line tools: throw the reason, prefixed with whose password it is.
function assertPassword(password, whose = 'Password') {
  const problem = passwordProblem(password);
  if (problem) throw new Error(whose === 'Password' ? problem : `${whose}: ${problem}`);
}

module.exports = { MIN_PASSWORD_CHARS, MAX_PASSWORD_BYTES, passwordProblem, assertPassword };
