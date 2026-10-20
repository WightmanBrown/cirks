// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Why a control has the implementation status it has (v129).
//
// A control delivered on each system has its status DERIVED from those systems,
// judged over the systems carrying an identified threat it treats — so
// "implemented" means implemented for the risks we have identified, and the
// words say so. Partial is never shown bare: it carries its reason. Everything
// else is STATED by a person, and the words say that too.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Short qualifier shown after the status word, e.g. "degraded on 4 systems". */
export function partialQualifier(entry) {
  if (entry?.implementation_status !== 'partial' || entry?.implementation_source !== 'derived') return null;
  const reasons = entry.partial_reasons || [];
  const parts = [];
  if (reasons.includes('coverage')) {
    parts.push(`on ${entry.threat_systems_present} of ${entry.threat_systems} at risk`);
  }
  if (reasons.includes('health')) parts.push(`degraded on ${plural(entry.degraded_systems, 'system')}`);
  return parts.join(' · ') || null;
}

/** Sentences explaining the status, for the objective page. */
export function explainImplementation(entry) {
  if (!entry) return [];
  if (entry.implementation_source !== 'derived') {
    return entry.delivery_not_stated
      ? ['Stated by hand. If this control is delivered on each system, say so and CIRKS will derive its status from those systems.']
      : ['Stated by hand: a control delivered once has no per-system record to derive it from.'];
  }
  const out = [];
  const {
    implementation_status: st, threat_systems: t = 0, threat_systems_present: tp = 0, threat_systems_unknown: tu = 0,
    present_systems: p = 0, degraded_systems: d = 0,
    expected_systems: e = 0, expected_systems_present: ep = 0, work_planned: planned,
  } = entry;
  if (st === 'not_implemented' || st === 'planned') {
    out.push(`Derived from the systems: it is not operational on any system${t ? ` — ${plural(t, 'system')} carry a threat it treats` : ''}.`);
    if (planned) out.push('An open security action is planned to put it in place.');
    return out;
  }
  if (t > 0) {
    out.push(`Derived for the risks we have identified: in place on ${tp} of ${plural(t, 'system')} carrying a threat it treats.`);
    if (tu > 0) out.push(`Its state is not recorded on ${plural(tu, 'system')} — check those before deploying anything.`);
  } else {
    out.push(`Derived from the systems: in place on ${plural(p, 'system')}; it treats no identified threat, so it is judged where it is deployed.`);
  }
  if (d > 0) out.push(`Degraded on ${plural(d, 'system')}.`);
  if (e > 0) out.push(`Coverage where it applies: on ${ep} of ${plural(e, 'system')}.`);
  return out;
}
