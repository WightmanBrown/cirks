// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// SoA findings (v130): where the Statement of Applicability contradicts what is
// deployed or linked. Derived, never stored — each disappears when the fact is
// fixed — and each is resolved by an act that already exists, which the words say.

export const FINDING_TEXT = {
  deployed_where_not_applicable: {
    title: 'Recorded where it does not apply',
    risksLabel: n => `counts on ${n} risk${n === 1 ? '' : 's'}`,
    explain: 'The SoA says this control does not apply on these systems, yet it is recorded on them — and where it is in place it still lowers the risks there.',
    resolve: 'If it does apply, change the decision (narrow it to a scope if it applies only there — a control you chose to implement applies, with the business driver). If it does not, remove it from these systems.',
  },
  not_applicable_counters_threat: {
    title: 'Not applicable, but it treats a threat',
    risksLabel: n => `its threats carry ${n} risk${n === 1 ? '' : 's'}`,
    explain: 'Marked not applicable, yet the threat catalogue links it to threats it counters.',
    resolve: 'If it is needed, change the decision. If it does not in fact treat those threats, unlink them on the control page.',
  },
  not_applicable_without_reason: {
    title: 'Not applicable, with no reason',
    risksLabel: () => null,
    explain: 'An exclusion nobody can read the reason for — an auditor will ask.',
    resolve: 'Record why it does not apply.',
  },
};

export const FINDING_ORDER = Object.keys(FINDING_TEXT);

/**
 * Findings grouped by type, then by control (a mirror finding is one row per
 * system; the reader thinks in controls). Types with none are left out.
 */
export function groupFindings(findings = []) {
  const byType = new Map();
  for (const f of findings) {
    if (!byType.has(f.finding_type)) byType.set(f.finding_type, new Map());
    const controls = byType.get(f.finding_type);
    if (!controls.has(f.control_id)) {
      controls.set(f.control_id, {
        control_id: f.control_id, ref: f.ref, title: f.title,
        justification: f.justification, risks_affected: 0, systems: [],
      });
    }
    const c = controls.get(f.control_id);
    c.risks_affected += f.risks_affected || 0;
    if (f.system_id) {
      c.systems.push({ id: f.system_id, name: f.system_name, status: f.system_status, why: f.why, risks_affected: f.risks_affected || 0 });
    }
  }
  return FINDING_ORDER.filter(t => byType.has(t)).map(type => ({
    type, ...FINDING_TEXT[type],
    controls: [...byType.get(type).values()],
    count: [...byType.get(type).values()].reduce((n, c) => n + Math.max(1, c.systems.length), 0),
  }));
}
