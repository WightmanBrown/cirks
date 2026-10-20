// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { ASSIGNABLE_ROLES } from './AccountManagementPage';

describe('AccountManagementPage', () => {
  test('assignable roles cover the human roles and exclude the ai_agent system role', () => {
    expect(ASSIGNABLE_ROLES).toContain('ciso');
    expect(ASSIGNABLE_ROLES).toContain('admin');
    expect(ASSIGNABLE_ROLES).toContain('meeting_secretary');
    expect(ASSIGNABLE_ROLES).not.toContain('ai_agent');
    expect(new Set(ASSIGNABLE_ROLES).size).toBe(ASSIGNABLE_ROLES.length); // no dupes
  });
});
