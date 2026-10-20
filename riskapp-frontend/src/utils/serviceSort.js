// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Shared ordering rule for business-service lists. Used in both the
// ServicesWidget (top-5 preview) and the full BusinessServicesPage so that
// clicking a row in the widget finds the same item in the same position on
// the list.
//
// Rule: highest max risk score first (1–25), then highest mean effective CIA as
// tiebreaker, then name. max_risk_score rolls up service → linked assets →
// systems → risks (backend-computed).

function riskRank(service) {
  return service.max_risk_score ?? 0;
}

function meanEffectiveCia(service) {
  const vals = [service.effective_c, service.effective_i, service.effective_a]
    .filter(v => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export function byMaxRiskThenMeanEffectiveCiaThenName(a, b) {
  const dr = riskRank(b) - riskRank(a);
  if (dr !== 0) return dr;
  const dc = meanEffectiveCia(b) - meanEffectiveCia(a);
  if (dc !== 0) return dc;
  return a.name.localeCompare(b.name);
}
