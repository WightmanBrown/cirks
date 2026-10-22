'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The one password rule: at least 12 characters, at most 72 bytes (bcrypt reads
// no further). Every path that sets a password uses it.

const { passwordProblem, assertPassword, MIN_PASSWORD_CHARS, MAX_PASSWORD_BYTES } = require('../auth/passwordPolicy');

describe('password rule', () => {
  test('the limits', () => {
    expect(MIN_PASSWORD_CHARS).toBe(12);
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });

  test('missing or not a string is refused', () => {
    for (const p of [undefined, null, '', 123456789012]) expect(passwordProblem(p)).toBe('A password is required.');
  });

  test('11 characters is refused, 12 accepted', () => {
    expect(passwordProblem('a'.repeat(11))).toMatch(/at least 12 characters/);
    expect(passwordProblem('a'.repeat(12))).toBeNull();
  });

  test('characters are counted as people see them: 12 emoji are 12 characters', () => {
    expect(passwordProblem('🔒'.repeat(11))).toMatch(/at least 12/);   // 22 UTF-16 units, but 11 characters
    expect(passwordProblem('🔒'.repeat(12))).toBeNull();               // 4 bytes each: 48
    expect(passwordProblem('🔒'.repeat(19))).toMatch(/too long/);      // 76 bytes
  });

  test('72 bytes is accepted, 73 refused', () => {
    expect(passwordProblem('x'.repeat(72))).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toMatch(/too long: at most 72 bytes/);
  });

  test('bytes, not characters: accented letters are two bytes each', () => {
    expect(passwordProblem('é'.repeat(36))).toBeNull();      // 36 characters, 72 bytes
    expect(passwordProblem('é'.repeat(37))).toMatch(/too long/); // 37 characters, 74 bytes
  });

  test('assertPassword throws the reason, naming whose password it is', () => {
    expect(() => assertPassword('a'.repeat(12))).not.toThrow();
    expect(() => assertPassword('short')).toThrow(/^Password must be at least 12 characters\.$/);
    expect(() => assertPassword('short', 'The starting password')).toThrow(/^The starting password: Password must/);
  });
});
