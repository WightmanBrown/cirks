// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { isQuietOrgComponent } from './SharedComponentChip';

describe('isQuietOrgComponent — what the Components tab leaves out', () => {
  test('an organisation-wide component only implied here, working: hidden', () => {
    expect(isQuietOrgComponent({ instantiation: 'organisational', delivered_via: 'organisation', system_status: 'operational', recorded: false })).toBe(true);
  });
  test('the same component degraded or missing: shown', () => {
    expect(isQuietOrgComponent({ instantiation: 'organisational', system_status: 'degraded', recorded: false })).toBe(false);
    expect(isQuietOrgComponent({ instantiation: 'organisational', system_status: 'missing', recorded: false })).toBe(false);
  });
  test('recorded on the system (its network zone, its server room): shown', () => {
    expect(isQuietOrgComponent({ instantiation: 'organisational', system_status: 'operational', recorded: true })).toBe(false);
  });
  test('a per-system component: always shown', () => {
    expect(isQuietOrgComponent({ instantiation: 'per_system', system_status: 'operational', recorded: true })).toBe(false);
  });
});
