// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Shared ordering rule for information-asset lists. Used in both the
// AssetsWidget (top-5 preview) and the full InformationAssetsPage, so that
// clicking through from a widget row finds the same item in the same
// position on the full list.
//
// Rule: highest max risk score first (1–25), then highest mean CIA as
// tiebreaker, then name (case-insensitive). max_risk_score rolls up from the
// systems this asset is linked to.

function riskRank(asset) {
  return asset.max_risk_score ?? 0;
}

function meanCia(asset) {
  const vals = [asset.confidentiality, asset.integrity, asset.availability]
    .filter(v => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export function byMaxRiskThenMeanCiaThenName(a, b) {
  const dr = riskRank(b) - riskRank(a);
  if (dr !== 0) return dr;
  const dc = meanCia(b) - meanCia(a);
  if (dc !== 0) return dc;
  return a.name.localeCompare(b.name);
}
