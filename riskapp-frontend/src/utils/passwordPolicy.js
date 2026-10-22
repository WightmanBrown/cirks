// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The browser's copy of the password rule, so Account Management refuses a
// password before sending it. The server's riskapp/src/auth/passwordPolicy.js is
// the authority and holds the reasons; keep the two in step.
//
// At least 12 characters; at most 72 BYTES (bcrypt ignores anything beyond), in
// UTF-8, so accented and non-English letters count as two bytes or more.

export const MIN_PASSWORD_CHARS = 12;
export const MAX_PASSWORD_BYTES = 72;

// The reason a password is refused, or null when it is acceptable.
export function passwordProblem(password) {
  if (typeof password !== 'string' || password === '') return 'A password is required.';
  if ([...password].length < MIN_PASSWORD_CHARS) {
    return `Password must be at least ${MIN_PASSWORD_CHARS} characters.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Password is too long: at most ${MAX_PASSWORD_BYTES} bytes, which is ${MAX_PASSWORD_BYTES} plain English`
      + ' characters, fewer with accented or other non-English letters. bcrypt would ignore the rest.';
  }
  return null;
}
