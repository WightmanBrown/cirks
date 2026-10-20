// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The audit narrative for a security action.
//
// Everything here is DERIVED from the action detail payload — nothing new is
// stored. The material was already being captured and simply never shown: the
// per-item rationale comment reached the UI as a tooltip on one page and not at
// all on the other, and the Responsible person, the target, the confirmed
// residual and the completion attribution were scattered across a table.
//
// An auditor's question is not "what is the state of this action" but "what was
// decided, by whom, on what grounds, and what actually happened" — which is a
// narrative, in time order, naming people and their roles. This module turns the
// payload into that, as structured sections a page can render and a future audit
// pack can freeze verbatim.

const ROLE_LABELS = {
  ciso: 'CISO',
  risk_analyst: 'Risk Analyst',
  siro: 'SIRO',
  admin: 'Administrator',
  information_asset_owner: 'Information Asset Owner',
  information_asset_manager: 'Information Asset Manager',
  security_consultant: 'Security Consultant',
  meeting_secretary: 'Meeting Secretary',
  soc_analyst: 'SOC Analyst',
  security_architect: 'Security Architect',
};

export function roleLabel(role) {
  if (!role) return null;
  return ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

/** "Edwina Lectric (Information Asset Owner)" — or just the name, or a dash. */
export function personLabel(person) {
  if (!person?.name) return null;
  const r = roleLabel(person.role);
  return r ? `${person.name} (${r})` : person.name;
}

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CHANGE_VERB = {
  control_add: 'Add the control',
  control_improve: 'Improve the control',
  component_add: 'Add the component',
  component_improve: 'Improve the component',
};

/** A single note, attributed and dated. A null author is a backfilled one. */
export function noteNarrative(n) {
  return {
    id: n.id,
    text: n.note,
    by: personLabel(n.author) || 'an unrecorded user',
    on: formatDate(n.created_at),
  };
}

/** One sentence per item, naming the change, the system, and who is Responsible. */
export function itemNarrative(item) {
  const what = CHANGE_VERB[item.change_kind] || item.change_kind;
  const ref = item.framework_ref ? `${item.framework_ref} — ` : '';
  const who = personLabel(item.owner);
  return {
    id: item.id,
    headline: `${what} “${ref}${item.label}” on ${item.system?.name ?? 'an unnamed system'}.`,
    responsible: who,
    // What was planned, and what was actually accepted as the outcome. They can
    // differ: the residual is editable at completion precisely so the person
    // doing the work confirms what it really bought rather than the plan's guess.
    target: item.target?.c != null
      ? `${item.target.c}/${item.target.i}/${item.target.a}` : null,
    confirmed: item.confirmed?.c != null
      ? `${item.confirmed.c}/${item.confirmed.i}/${item.confirmed.a}` : null,
    rationale: item.comment?.trim() || null,
    // The dialogue as this item progressed — the SWG's question is about the
    // work on THIS control, not the container it happens to sit in.
    notes: (item.notes ?? []).map(noteNarrative),
    done: item.status === 'completed',
    // "Planned, then judged unnecessary" — the item stays on the record so the
    // narrative can say the work was considered, which is the opposite of
    // deleting it (0119).
    withdrawn: item.status === 'withdrawn',
    completion: item.status === 'completed'
      ? {
          by: personLabel(item.completed_by) || 'an unrecorded user',
          on: formatDate(item.completed_at),
        }
      : null,
  };
}

/**
 * The whole narrative, as sections.
 *
 * `gaps` names what the record cannot yet answer, rather than leaving a silent
 * hole — an auditor reading a document that quietly omits its own limits is
 * worse served than one told plainly what is missing.
 */
export function buildNarrative(action) {
  if (!action) return null;
  const items = action.items ?? [];
  const risks = action.risks ?? [];
  const done = items.filter(i => i.status === 'completed');
  const live = items.filter(i => i.status !== 'withdrawn');

  const accepted = action.accepted_at
    ? {
        by: personLabel({ name: action.accepted_by_name, role: 'ciso' }) || 'an unrecorded user',
        on: formatDate(action.accepted_at),
      }
    : null;

  const gaps = [];
  if (live.some(i => !i.comment?.trim())) {
    gaps.push('Some items carry no recorded rationale.');
  }
  if (live.some(i => !i.owner?.name)) {
    gaps.push('Some items name no Responsible person, so they fall to the system owner by default.');
  }
  if (!accepted && action.status !== 'proposed') {
    gaps.push('No acceptance is recorded against this action.');
  }
  if ((action.notes ?? []).length === 0 && items.every(i => (i.notes ?? []).length === 0)) {
    gaps.push('No progress has been recorded, so the record says nothing about how the work went.');
  }

  return {
    summary: {
      title: action.title,
      status: action.status,
      accepted,
      targetDate: formatDate(action.target_date),
      owner: personLabel({ name: action.owner_name, role: action.owner_role }) || action.owner_name,
      itemsTotal: live.length,
      itemsDone: done.length,
      itemsWithdrawn: items.length - live.length,
    },
    risks: risks.map(r => ({
      id: r.risk_id,
      headline: `${r.threat_name} on ${r.system_name}${r.department ? ` (${r.department})` : ''}`,
      baseline: r.baseline_risk_score != null
        ? `${r.baseline_risk_score} (${r.baseline_risk_c}/${r.baseline_risk_i}/${r.baseline_risk_a})`
        : null,
      now: r.risk_score,
    })),
    items: items.map(itemNarrative),
    notes: (action.notes ?? []).map(noteNarrative),
    // Populated once exclusions exist as a per-system fact; named here so the
    // section's absence is a known gap rather than an oversight.
    exclusions: [],
    gaps,
  };
}
