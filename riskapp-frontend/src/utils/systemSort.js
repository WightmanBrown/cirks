// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Shared ordering rule for system lists. Used in both the SystemsWidget
// (full list preview) and the full SystemsPage, so that clicking a row
// in the widget finds the same item in the same position on the list.
//
// Rule: highest current risk score first (1–25), then name (case-insensitive).

export function byMaxRiskDescThenName(a, b) {
  const ra = a.max_risk_score ?? 0;
  const rb = b.max_risk_score ?? 0;
  if (ra !== rb) return rb - ra;
  return a.name.localeCompare(b.name);
}
