// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { solutionSummary, solutionStateLabel } from './securitySolutions';

const sol = (name, o = {}) => ({ id: name, name, kind: 'parts', in_use: false, in_play: false, state: 'incomplete', ...o });

describe('solutionSummary', () => {
  test('no solutions: the flat list applies', () => {
    expect(solutionSummary(null)).toBeNull();
    expect(solutionSummary([])).toBeNull();
  });

  test('two complete solutions: one in use, the other also complete, the rest alternatives — not gaps', () => {
    const s = solutionSummary([
      sol('Wazuh agent', { in_use: true, in_play: true, state: 'complete' }),
      sol('CrowdStrike EDR', { in_play: true, state: 'complete' }),
      sol('OSSEC agent'), sol('Defender for Servers'),
    ]);
    expect(s.inUse.name).toBe('Wazuh agent');
    expect(s.alsoComplete.map(x => x.name)).toEqual(['CrowdStrike EDR']);
    expect(s.alternatives.map(x => x.name)).toEqual(['OSSEC agent', 'Defender for Servers']);
  });

  test('nothing in place: no solution in use, every one an alternative', () => {
    const s = solutionSummary([sol('A', { state: null }), sol('B', { state: null })]);
    expect(s.inUse).toBeNull();
    expect(s.alternatives).toHaveLength(2);
  });

  test('state words', () => {
    expect(solutionStateLabel('complete')).toBe('complete');
    expect(solutionStateLabel(null)).toBe('not in place');
  });
});
