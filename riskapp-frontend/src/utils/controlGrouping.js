// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Splitting the coverage panel into the three questions it was answering at once.
//
// One list was doing three jobs: recording what protects the system today,
// flagging what is present but not doing its job, and planning what is absent.
// Those want different actions from the reader — nothing, repair, and build — so
// they are now separate sections.
//
// The definition of OPERATIONAL here is the owner's, and is stricter than the
// stored status: "fully effective and have all the components in place and are
// not marked as degraded". A control whose delivering component is missing is
// not protecting anything, whatever its own row says — which is the same rule
// the gap analysis already uses (docs/per-system-control-status.md).

export const OPERATIONAL = 'operational';
export const IMPAIRED    = 'impaired';
export const MISSING     = 'missing';
export const EXCLUDED    = 'excluded';

/**
 * Delivering components that are absent or not working on this system.
 *
 * None for a control delivered organisation-wide or for a group (v127/v128): its
 * components — a policy, a training course, a people group — are delivered once,
 * not system by system, and its status on every system it reaches is the
 * control's own. Counting them per system would mark it impaired for bookkeeping.
 */
export function componentGaps(control) {
  if (control?.delivery === 'organisation' || control?.delivery === 'group') return [];
  return (control?.components ?? []).filter(
    cc => !cc.on_system || (cc.system_status && cc.system_status !== 'operational'));
}

/**
 * Which of the three sections a control belongs in, and why.
 *
 * `reason` matters for the impaired group: "marked degraded" and "its components
 * are not all here" are different faults needing different work, and merging
 * them under one heading would hide which one a reader is looking at.
 */
export function classifyControl(control) {
  const status = control?.system_status;
  const onSystem = control?.on_system;

  if (status === 'not_applicable') return { group: EXCLUDED, reason: 'excluded' };
  if (!onSystem || status === 'missing' || status === 'unknown' || status == null) {
    return { group: MISSING, reason: status === 'unknown' ? 'unknown' : 'absent' };
  }

  const gaps = componentGaps(control);
  if (status === 'degraded') {
    return { group: IMPAIRED, reason: gaps.length ? 'degraded_and_components' : 'degraded', gaps };
  }
  if (gaps.length) return { group: IMPAIRED, reason: 'components', gaps };
  return { group: OPERATIONAL, reason: null, gaps: [] };
}

/** The panel's sections, in reading order, each with its controls. */
export function groupControls(controls = []) {
  const out = { [OPERATIONAL]: [], [IMPAIRED]: [], [MISSING]: [], [EXCLUDED]: [] };
  for (const c of controls) out[classifyControl(c).group].push(c);
  return out;
}
