// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RiskGrid } from './RiskGrid';

/**
 * One risk's position on the shared probability-impact grid (RiskGrid): the
 * square at (prob, impact) is outlined and shows its score.
 *
 * @param {string}       label   — displayed above the grid (e.g. "MAX", "C")
 * @param {number|null}  prob    — probability 1–5
 * @param {number|null}  impact  — impact 1–5
 */
export function RiskPIG({ label, prob, impact, size }) {
  const hasData = prob != null && impact != null && prob > 0 && impact > 0;
  const marked = hasData
    ? { likelihood: Math.min(5, Math.max(1, Math.round(prob))), impact: Math.min(5, Math.max(1, Math.round(impact))) }
    : null;
  return <RiskGrid label={label} marked={marked} size={size === 'large' ? 'large' : 'small'} />;
}
