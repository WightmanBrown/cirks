// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';

// A system's control objectives as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), the folded view of its Control objectives tab:
//
//   WHY IT IS ASKED          HOW IT IS DELIVERED          HOW IT STANDS HERE
//   Threats ──────┬────────▶ Security solutions ──┬─────▶ In place
//   Triggers ─────┤                               ├─────▶ Degraded
//   Choices ──────┘          No solution yet ─ ─ ─┴─ ─ ─▶ Missing
//
// The objectives this system is responsible for come from three places: the
// threats identified on it, the security pattern triggers (a component recorded
// on it, or its pattern, implies a solution) and a person's choice of solution.
// Solutions decide each objective's state; with none it is missing. On request a
// second band shows what the organisation delivers once (the SoA gives its
// status) and what a threat here calls for that the SoA rules not applicable.
//
// Every box filters the objectives listed beneath (`onFilter(key)`), or for the
// organisation's band opens the Statement of Applicability.
//
//   security  GET /systems/:id/security   { solutions, objectives }
//   controls  GET /systems/:id/controls   the objectives recorded on the system
//   org       GET /systems/:id/controls/organisation (only when asked)

const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

// The colour of each set: the box's left trim in the picture, and the trim the
// objectives listed when it is selected wear, so the list is visibly the box's
// (owner, 2026-11-19: a direct visual link between the picture and the list).
export const SET_STRIPE = {
  threats: 'var(--graph-threat)', triggers: 'var(--ppitf-technology)', choices: 'var(--ppitf-people)',
  solutions: 'var(--accent)', no_solution: 'var(--red)',
  operational: 'var(--green)', degraded: 'var(--amber)', missing: 'var(--red)',
  unrecorded: 'var(--amber)', not_applicable: 'var(--text-muted)',
};
const PER_SYSTEM = (c) => !c.delivery || c.delivery === 'system';

// A solution's state on this system from its parts, the rule settle_system_security
// uses: every part operational → complete; any degraded → degraded; else incomplete.
export function solutionState(parts) {
  if (!parts?.length) return 'complete';
  if (parts.every((p) => p.status === 'operational')) return 'complete';
  if (parts.some((p) => p.status === 'degraded')) return 'degraded';
  return 'incomplete';
}

// The sets each box stands for: the ids of the objectives it filters to.
export function objectiveSets(security, controls) {
  const objectives = security?.objectives || [];
  const recorded = (controls || []).filter(PER_SYSTEM);
  const ids = (list) => new Set(list.map((o) => o.control_id ?? o.id));
  const byStatus = (st) => ids(recorded.filter((c) => c.status === st));
  return {
    threats: ids(objectives.filter((o) => o.for_threat)),
    triggers: ids(objectives.filter((o) => !o.for_threat)),
    // A choice is a person's, or counted automatically because the solution is
    // complete in place (v150, source in_place): both are choices, said apart.
    choices: ids(objectives.filter((o) => o.state === 'delivered' && o.choice_source)),
    solutions: ids(objectives.filter((o) => o.state === 'delivered')),
    no_solution: ids(objectives.filter((o) => o.state !== 'delivered')),
    operational: byStatus('operational'),
    degraded: byStatus('degraded'),
    missing: new Set([...byStatus('missing'), ...byStatus('unknown')]),
    not_applicable: byStatus('not_applicable'),
    unrecorded: ids(objectives.filter((o) => o.state === 'delivered' && !o.recorded)),
  };
}

export function systemObjectivesNodes(security, controls, org = null, { onFilter = () => {}, onSoa = () => {}, active = null } = {}) {
  const sets = objectiveSets(security, controls);
  const solutions = security?.solutions || [];
  const objectives = security?.objectives || [];
  const threatNames = [...new Set(objectives.flatMap((o) => o.threats || []))];
  const triggerNames = [...new Set(solutions.flatMap((s) => s.reasons
    .filter((r) => r.reason === 'architecture').map((r) => r.trigger_component_name || r.trigger_pattern)).filter(Boolean))];
  const chosenObjectives = objectives.filter((o) => o.state === 'delivered' && o.choice_source);
  const byPerson = chosenObjectives.filter((o) => o.choice_source === 'person').length;
  const automatic = chosenObjectives.length - byPerson;
  const state = { complete: 0, degraded: 0, incomplete: 0 };
  for (const s of solutions) state[solutionState(s.parts)] += 1;
  const go = (key) => () => onFilter(key);
  const nodes = [];
  const links = [];

  // Why it is asked
  nodes.push({ id: 'threats', col: 0, row: 0, kind: 'threat', tag: `Threats · ${threatNames.length}`,
    title: plural(sets.threats.size, 'objective'), detail: threatNames.slice(0, 2).join(', ') + (threatNames.length > 2 ? '…' : ''),
    onClick: go('threats'), tone: threatNames.length ? null : 'quiet' });
  nodes.push({ id: 'triggers', col: 0, row: 1, kind: 'technology', tag: `Triggers · ${triggerNames.length}`,
    title: sets.triggers.size ? `${plural(sets.triggers.size, 'objective')} more` : 'No more objectives',
    detail: triggerNames.slice(0, 2).join(', ') + (triggerNames.length > 2 ? '…' : ''),
    onClick: go('triggers'), tone: triggerNames.length ? null : 'quiet' });
  if (chosenObjectives.length) {
    nodes.push({ id: 'choices', col: 0, row: 2, kind: 'people',
      tag: byPerson && !automatic ? 'Chosen by a person' : !byPerson ? 'Chosen automatically' : 'Choices',
      title: plural(chosenObjectives.length, 'objective'),
      detail: byPerson && automatic ? `${byPerson} by a person, ${automatic} automatically`
        : byPerson ? 'a solution chosen for each' : 'its solution is complete here',
      onClick: go('choices') });
  }

  // How it is delivered
  nodes.push({ id: 'solutions', col: 1, row: 0.5, kind: 'control',
    tone: state.incomplete ? 'warn' : state.degraded ? 'warn' : solutions.length ? 'good' : 'quiet',
    tag: `Solutions · ${solutions.length}`,
    title: [state.complete && `${state.complete} complete`, state.degraded && `${state.degraded} degraded`,
      state.incomplete && `${state.incomplete} incomplete`].filter(Boolean).join(' · ') || 'None in play',
    detail: plural(sets.solutions.size, 'objective') + ' delivered', onClick: go('solutions') });
  nodes.push({ id: 'no_solution', col: 1, row: 2, tone: sets.no_solution.size ? 'bad' : 'quiet',
    tag: 'No solution yet', title: plural(sets.no_solution.size, 'objective'),
    detail: sets.no_solution.size ? 'asked for, nothing delivers it' : 'every one has a solution',
    onClick: go('no_solution') });

  links.push({ from: 'threats', to: 'solutions' });
  links.push({ from: 'triggers', to: 'solutions' });
  if (chosenObjectives.length) links.push({ from: 'choices', to: 'solutions' });
  if (sets.no_solution.size) links.push({ from: 'threats', to: 'no_solution', dashed: true, tone: 'bad' });

  // How it stands on this system
  const standing = [
    ['operational', 'In place', 'good'], ['degraded', 'Degraded', 'warn'], ['missing', 'Missing', 'bad'],
  ];
  standing.forEach(([key, word, tone], k) => {
    const n = sets[key].size;
    nodes.push({ id: key, col: 2, row: k, tone: n ? tone : 'quiet', tag: word, title: plural(n, 'objective'),
      detail: key === 'missing' ? 'or not checked' : 'recorded on this system', onClick: go(key) });
    links.push({ from: 'solutions', to: key, tone: n ? tone : undefined });
  });
  if (sets.no_solution.size) links.push({ from: 'no_solution', to: 'missing', dashed: true, tone: 'bad' });
  let row = 3;
  if (sets.unrecorded.size) {
    nodes.push({ id: 'unrecorded', col: 2, row, tone: 'warn', tag: 'Not recorded yet',
      title: plural(sets.unrecorded.size, 'objective'), detail: 'implied, with no state here', onClick: go('unrecorded') });
    links.push({ from: 'solutions', to: 'unrecorded', dashed: true });
    row += 1;
  }
  if (sets.not_applicable.size) {
    nodes.push({ id: 'not_applicable', col: 2, row, tone: 'quiet', tag: 'Not applicable here',
      title: plural(sets.not_applicable.size, 'objective'), detail: 'excluded by a person, with a reason', onClick: go('not_applicable') });
    row += 1;
  }

  // What the organisation delivers once (on request).
  if (org) {
    const base = Math.max(row, 3) + 0.4;
    const reach = org.reach || [];
    const by = (st) => reach.filter((r) => r.status === st).length;
    const groups = reach.filter((r) => r.via === 'group').length;
    nodes.push({ id: 'soa', col: 0, row: base, kind: 'information', tag: 'SoA',
      title: 'Delivered once', detail: 'for the organisation or a group', onClick: onSoa });
    nodes.push({ id: 'org', col: 1, row: base, kind: 'control', tag: 'Organisation-wide',
      title: plural(reach.length - groups, 'objective'), detail: groups ? `and ${groups} for a group it is in` : 'the same on every system',
      onClick: onSoa });
    nodes.push({ id: 'org_state', col: 2, row: base, tone: by('missing') ? 'warn' : 'good', tag: 'As the SoA records',
      title: `${by('operational')} implemented · ${by('degraded')} partial`, detail: `${by('missing')} not yet`, onClick: onSoa });
    links.push({ from: 'soa', to: 'org' });
    links.push({ from: 'org', to: 'org_state' });
    if ((org.not_applicable || []).length) {
      nodes.push({ id: 'soa_na', col: 0, row: base + 1, tone: 'quiet', tag: 'Ruled not applicable',
        title: plural(org.not_applicable.length, 'objective'), detail: 'a threat here calls for it; counts on no risk',
        onClick: onSoa });
    }
  }

  // Each set's box: its colour, and pressed while its objectives are listed.
  for (const n of nodes) {
    if (SET_STRIPE[n.id]) { n.stripe = SET_STRIPE[n.id]; n.selected = active === n.id; }
  }

  const label = `This system is asked for ${sets.threats.size + sets.triggers.size} control objectives: `
    + `${sets.threats.size} by ${plural(threatNames.length, 'threat')}, ${sets.triggers.size} more by security pattern triggers. `
    + `${solutions.length} security solutions deliver ${sets.solutions.size}; ${sets.no_solution.size} have none. `
    + `Recorded here: ${sets.operational.size} in place, ${sets.degraded.size} degraded, ${sets.missing.size} missing or not checked.`
    + (org ? ` The organisation delivers ${(org.reach || []).length} more once.` : '');
  return { nodes, links, label, sets };
}

export function SystemObjectivesDiagram({ security, controls, org, onFilter, onSoa, active }) {
  const { nodes, links, label } = systemObjectivesNodes(security, controls, org, { onFilter, onSoa, active });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
