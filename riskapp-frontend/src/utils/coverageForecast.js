// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// What would this risk score if the coverage gap were closed?
//
// The panel already shows what IS deployed and what is missing. The question a
// reader actually has is the next one — "is it worth closing?" — and nothing on
// the page answered it. This derives that from the gap payload alone; no new
// endpoint, no new stored value.
//
// The model: if every threat-linked control were deployed and performing at the
// figure recorded against it, the risk's probability would be the MIN across
// them (the best control sets the floor — docs/threat-coverage-panel.md), taken
// per C/I/A. Impact does not move: it is derived from the system's assets and
// remediation is not an impact lever (v90).
//
// Note what is deliberately NOT applied here: the degraded penalty (v115). A
// degraded control counts a rung worse TODAY, but "if the gap were closed"
// includes repairing it, so the forecast uses its stated figure. That is why
// this is not simply the current aggregate with the gaps filled in.

import { coverageDrivers } from './coverageDriver';

const DIMS = ['c', 'i', 'a'];

/**
 * @param {object[]} controls  gap.controls — every control linked to the threat,
 *                             deployed or not, each with probability_c/i/a
 * @param {object}   impact    the risk's per-dimension impact (1–5)
 * @param {object}   inherent  the threat's inherent probability, the ceiling
 * @returns {{score: number|null, prob: object|null, closesTo: boolean}}
 */
export function coverageForecast(controls = [], impact = {}) {
  // ONLY controls carrying a real judgement. The gap payload reports an unjudged
  // control's probability as the THREAT INHERENT — i.e. "no control at all" — so
  // including those would forecast that closing the gap achieves nothing, and
  // the MIN would simply return whatever the risk already scores. The panel
  // would then announce "closing this gap would reduce the risk to" its current
  // value, which is worse than saying nothing.
  //
  // A control nobody has judged has no forecast, and the honest output is that
  // we do not know yet.
  const usable = controls.filter(c =>
    c.probability_judged && DIMS.every(d => c[`probability_${d}`] != null));
  if (!usable.length) return { score: null, prob: null, judged: 0, total: controls.length };

  const prob = {};
  for (const d of DIMS) {
    prob[d] = Math.min(...usable.map(c => c[`probability_${d}`]));
  }

  const scores = DIMS
    .map(d => (impact?.[d] != null ? prob[d] * impact[d] : null))
    .filter(v => v != null);
  const score = scores.length ? Math.max(...scores) : null;

  // WHICH controls set that figure, and are they actually here? A forecast is
  // only as good as the control holding it down, and on 6 of 203 risks that
  // control is one nobody has deployed — so the number is a claim about work
  // that has not started, not a property of the system. Naming it lets the panel
  // say so instead of presenting a bare figure.
  const restsOn = usable.filter(c =>
    DIMS.some(d => c[`probability_${d}`] === prob[d]));
  const absent = restsOn.filter(c => !['operational', 'degraded'].includes(c.system_status));

  return {
    score, prob, judged: usable.length, total: controls.length,
    restsOn, absent,
  };
}

/**
 * Is the work to close this gap actually planned?
 *
 * `has_open_action` is already computed per control and per component by
 * GET /risks/gap. A gap element with no open action is work nobody has
 * committed to — which is the difference between a forecast and a plan, and the
 * distinction the one-line summary exists to make.
 */
export function gapPlanning(controls = []) {
  const gapCtl = controls.filter(c => c.system_status !== 'operational'
                                   && c.system_status !== 'not_applicable');
  const gapCmp = controls.flatMap(c => (c.components ?? []).filter(
    cc => !cc.on_system || (cc.system_status && cc.system_status !== 'operational')));

  const items = [...gapCtl, ...gapCmp];
  if (!items.length) return { state: 'none', planned: 0, total: 0 };

  const planned = items.filter(x => x.has_open_action).length;
  if (planned === 0)            return { state: 'not_planned', planned, total: items.length };
  if (planned === items.length) return { state: 'planned',     planned, total: items.length };
  return { state: 'part_planned', planned, total: items.length };
}

/** Counts for the collapsed header: how much is missing, at a glance. */
export function gapCounts(gap) {
  const controls = gap?.controls ?? [];
  const ctlGap = controls.filter(c => c.system_status !== 'operational'
                                   && c.system_status !== 'not_applicable').length;
  const cmpGap = controls.flatMap(c => c.components ?? [])
    .filter(cc => !cc.on_system || (cc.system_status && cc.system_status !== 'operational'))
    .length;
  return { controls: ctlGap, components: cmpGap, total: ctlGap + cmpGap };
}

export { coverageDrivers };

/**
 * What the panel says about the controls a forecast rests on that are not in
 * place here (`forecast.absent`). Two different next steps hide behind "not in
 * place", and naming the wrong one sends people to the wrong page:
 *   - an objective delivered per system with NO security solution cannot be put
 *     in place at all until it is given one (v159: it reads missing);
 *   - the rest are put in place through their security solution's parts, and
 *     the question is whether anyone has committed to that (an open action).
 * Returns the sentences after "…but that rests on X, which is not in place on
 * this system." — empty when there is nothing to add.
 */
export function absentNextSteps(absent = []) {
  const noSolution = absent.filter(c =>
    c.delivery === 'system' && !(Array.isArray(c.solutions) && c.solutions.length));
  const rest = absent.filter(c => !noSolution.includes(c));
  const unplanned = rest.filter(c => !c.has_open_action);
  const mixed = noSolution.length > 0 && unplanned.length > 0;
  const who = (list) => (mixed
    ? list.map(c => c.title).join(' and ')
    : (list.length === 1 ? 'it' : 'them'));
  const out = [];
  if (noSolution.length) {
    const one = noSolution.length === 1;
    out.push(`No security solution delivers ${who(noSolution)} yet, so ${one ? 'it' : 'they'} cannot be put in place until ${one ? 'it is' : 'they are'} given one.`);
  }
  if (unplanned.length) {
    out.push(`Nobody has committed to putting ${who(unplanned)} in place.`);
  }
  return out.join(' ');
}
