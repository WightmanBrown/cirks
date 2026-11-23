// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// A GET /risks/:id/answer response, for tests: decided, not agreed, nothing in
// place lowering confidentiality, no action.
export function riskAnswerSample(overrides = {}) {
  return {
    risk_id: 'r1', system_id: 's1', system_name: 'Payroll', threat_name: 'Ransomware',
    department_id: 'd1', department_name: 'Treasury',
    score: { now: 20, target: null, probability: { c: 5, i: 2, a: 2 }, impact: { c: 4, i: 4, a: 4 }, driving: ['c'], threat_probability: 5 },
    why: {
      counts: { total: 3, operational: 2, degraded: 0, missing: 1, unknown: 0, not_applicable: 0, not_recorded: 0 },
      setting: { dimension: 'c', probability: 5, threat_probability: 5, by: [] },
      in_place_unjudged: 1, in_place_no_effect: 1,
      best_fix: { control_id: 'c9', ref: 'CIRKS1.BRR-02', title: 'Backups are protected', status: 'missing', score_if_fixed: 8 },
      fixes_unjudged: 0,
      not_in_place: [{ control_id: 'c9', ref: 'CIRKS1.BRR-02', title: 'Backups are protected', status: 'missing', judged: true }],
    },
    work: { actions: [], open: 0, overdue: 0 },
    decision: {
      validation_status: 'validated', treatment_decision: 'mitigate', owner_names: 'Ada Owner', owner_is_siro_fallback: false,
      agreement: 'decided_not_agreed', minuted: null, owner_act: null, acceptance: null, action_threshold: 12, owner_max: 19,
    },
    ...overrides,
  };
}
