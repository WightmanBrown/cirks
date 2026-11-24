// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { decisionNodes } from './DecisionDiagram';

const A = {
  department_name: 'Ports', score: { now: 25 },
  work: { actions: [], open: 0, overdue: 0 },
  decision: { validation_status: 'validated', treatment_decision: 'accept', owner_names: 'Grace', owner_is_siro_fallback: false,
    agreement: 'decided_not_agreed', minuted: null, owner_act: null, owner_max: 19,
    acceptance: { by: 'Lewis', role: 'ciso', expires_at: '2027-02-15' } },
};
const RISK = { validated_by_name: 'Lewis', validated_at: '2026-11-17', no_action_required: false };
const at = new Date('2026-12-01');

describe('Who decided what? as a picture', () => {
  test('a chain from the owner to the acceptance, each step in words', () => {
    const { nodes, links } = decisionNodes(A, RISK, undefined, at);
    expect(nodes.map((n) => n.id)).toEqual(['owner', 'validated', 'treatment', 'agreed', 'accepted']);
    expect(links).toEqual([{ from: 'owner', to: 'validated' }, { from: 'validated', to: 'treatment' },
      { from: 'treatment', to: 'agreed' }, { from: 'agreed', to: 'accepted' }]);
    expect(nodes.find((n) => n.id === 'validated').detail).toBe('by Lewis, 17 Nov 2026');
    expect(nodes.find((n) => n.id === 'agreed')).toMatchObject({ title: 'Not agreed', tone: 'warn' });
    // 25 is above the owner's limit of 19: said on the acceptance.
    expect(nodes.find((n) => n.id === 'accepted')).toMatchObject({ tag: 'Accepted · above 19', title: 'Until 15 Feb 2027', tone: 'warn' });
  });

  test('an acceptance that has run out, and a mitigation with no action, are red', () => {
    const ran = decisionNodes({ ...A, score: { now: 10 }, decision: { ...A.decision, acceptance: { ...A.decision.acceptance, expires_at: '2026-11-01' } } }, RISK, undefined, at);
    expect(ran.nodes.find((n) => n.id === 'accepted')).toMatchObject({ tone: 'bad', title: 'Ran out 1 Nov 2026' });
    const mit = decisionNodes({ ...A, decision: { ...A.decision, treatment_decision: 'mitigate' } }, RISK, undefined, at);
    expect(mit.nodes.find((n) => n.id === 'work')).toMatchObject({ tone: 'bad', title: 'None built' });
  });

  test('nothing decided yet: the treatment box says so and nothing follows it', () => {
    const { nodes } = decisionNodes({ ...A, decision: { ...A.decision, validation_status: 'pending', treatment_decision: null, agreement: 'not_decided' } }, RISK, undefined, at);
    expect(nodes.find((n) => n.id === 'validated')).toMatchObject({ tone: 'bad', title: 'Not yet validated' });
    expect(nodes.find((n) => n.id === 'treatment')).toMatchObject({ tone: 'bad', title: 'Not decided' });
    expect(nodes.map((n) => n.id)).not.toContain('accepted');
  });

  test('each box goes to its record', () => {
    const onGo = vi.fn();
    decisionNodes(A, RISK, onGo, at).nodes.forEach((n) => n.onClick());
    expect(onGo.mock.calls).toEqual([['about', 'risk-owner'], ['decision', 'risk-validation'],
      ['decision', 'risk-section-treatment-decision'], ['decision', 'risk-section-treatment-decision'], ['decision', 'risk-section-exceptions']]);
  });
});
