// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// The component-record finding's reasons (v138, v148), in the words the findings
// API uses. A membership not answered comes first: without it the security
// architecture cannot apply to the system at all (docs/system-security-view.md §8).
export const objectiveName = (o) => (o.reference_code ? `${o.reference_code} ${o.title}` : o.title);

// Each reason with the kind of pattern it is about (for PatternChip), or null.
export function componentRecordReasonItems(f) {
  if (!f) return [];
  const out = [];
  const push = (pattern, text, objectives) => out.push({ pattern, text, objectives });
  for (const g of f.missing_membership_names || []) push('template', `Nothing recorded for ${g}`);
  if (f.missing_count > 0) {
    push(null, `Not recorded, though its controls need ${f.missing_count === 1 ? 'it' : 'them'}: ${f.missing_component_names.join(', ')}`);
  }
  if ((f.unrecorded_objective_names || []).length) {
    // A pattern adopted in one step can leave a dozen; that many titles in a row
    // are unreadable, so past three the count stands in and the tab lists them.
    const names = f.unrecorded_objective_names;
    push(null, names.length > 3
      ? `${names.length} control objectives implied by the security architecture are not recorded on the system (see the Control objectives tab)`
      : `Implied by the security architecture, not recorded: ${names.join(', ')}`);
  }
  // Named where the API names them: a count alone cannot be acted on.
  if (f.needs_solution_count > 0) {
    const n = f.needs_solution_count, named = f.needs_solution_objectives || [];
    if (named.length) {
      push('solution', `No security solution is chosen for ${n === 1 ? 'a control objective' : `${n} control objectives`} a threat here calls for`, named);
    } else {
      push('solution', `${n} control objective${n === 1 ? '' : 's'} a threat here calls for ${n === 1 ? 'has' : 'have'} no security solution chosen`);
    }
  }
  if (f.conflict_count > 0) {
    const n = f.conflict_count, named = f.conflict_objectives || [];
    if (named.length) {
      push('solution', `Two required security solutions deliver ${n === 1 ? 'the same control objective' : `${n} control objectives`}, choose one`, named);
    } else {
      push('solution', `${n} control objective${n === 1 ? ' is' : 's are'} delivered by two required security solutions — choose one`);
    }
  }
  return out;
}

export function componentRecordReasons(f) {
  return componentRecordReasonItems(f).map(r => (r.objectives ? `${r.text}: ${r.objectives.map(objectiveName).join(', ')}` : r.text));
}
