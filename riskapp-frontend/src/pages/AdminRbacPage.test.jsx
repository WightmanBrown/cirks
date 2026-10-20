// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { groupByResource } from './AdminRbacPage';

describe('groupByResource', () => {
  const caps = [
    { key: 'systems.read', resource: 'systems', action: 'read' },
    { key: 'assets.write', resource: 'assets', action: 'write' },
    { key: 'assets.read',  resource: 'assets', action: 'read' },
  ];

  test('groups capabilities by resource, resources and keys sorted', () => {
    const groups = groupByResource(caps);
    expect(groups.map((g) => g[0])).toEqual(['assets', 'systems']); // resources sorted
    expect(groups[0][1].map((c) => c.key)).toEqual(['assets.read', 'assets.write']); // keys sorted
  });

  test('does not mutate the input array', () => {
    const input = [...caps];
    groupByResource(input);
    expect(input).toEqual(caps);
  });

  test('handles an empty catalogue', () => {
    expect(groupByResource([])).toEqual([]);
  });
});
