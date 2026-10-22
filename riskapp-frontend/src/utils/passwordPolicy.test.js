// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { passwordProblem, MIN_PASSWORD_CHARS, MAX_PASSWORD_BYTES } from './passwordPolicy';

// The browser's copy must give the same answers as riskapp/src/auth/passwordPolicy.js.
describe('password rule (browser copy)', () => {
  test('the same limits as the server', () => {
    expect(MIN_PASSWORD_CHARS).toBe(12);
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });

  test('missing is refused', () => {
    expect(passwordProblem('')).toBe('A password is required.');
    expect(passwordProblem(undefined)).toBe('A password is required.');
  });

  test('11 characters refused, 12 accepted', () => {
    expect(passwordProblem('a'.repeat(11))).toMatch(/at least 12 characters/);
    expect(passwordProblem('a'.repeat(12))).toBeNull();
  });

  test('72 bytes accepted, 73 refused; accented letters count as two', () => {
    expect(passwordProblem('x'.repeat(72))).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toMatch(/too long: at most 72 bytes/);
    expect(passwordProblem('é'.repeat(36))).toBeNull();
    expect(passwordProblem('é'.repeat(37))).toMatch(/too long/);
  });

  test('characters are counted as people see them', () => {
    expect(passwordProblem('🔒'.repeat(11))).toMatch(/at least 12/);
    expect(passwordProblem('🔒'.repeat(12))).toBeNull();
    expect(passwordProblem('🔒'.repeat(19))).toMatch(/too long/);
  });
});
