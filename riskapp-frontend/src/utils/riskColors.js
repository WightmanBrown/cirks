// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Shared severity colour mapping for risk / impact / probability values.
//
// Two scales:
//   * scoreLevel(v): 1–25 — risk score (probability × impact). Bands:
//     1–5 low, 6–11 medium, 12–19 high, 20–24 critical, 25 catastrophic.
//   * rawLevel(v):   1–5  — single dimension (impact or probability). A "5"
//     reads catastrophic, "4" high, "3" medium, "1–2" low. (No raw value maps
//     to "critical" — that band only occurs on the 1–25 risk score, 20–24.)
//
// "catastrophic" is the new top band (black on bright red, white border),
// reserved for a maxed-out dimension (5) or the maximum risk score (25).

import styles from './riskColors.module.css';

export function scoreLevel(value) {
  if (value == null || Number.isNaN(value)) return 'none';
  if (value >= 25) return 'catastrophic';
  if (value >= 20) return 'critical';
  if (value >= 12) return 'high';
  if (value >= 6)  return 'medium';
  return 'low';
}

export function rawLevel(value) {
  if (value == null || Number.isNaN(value)) return 'none';
  if (value >= 5) return 'catastrophic';
  if (value >= 4) return 'high';
  if (value >= 3) return 'medium';
  if (value >= 1) return 'low';
  return 'none';
}

// Map a level name to the colour class from the shared CSS module.
export function levelClass(level) {
  return styles[level] ?? '';
}

// Convenience: colour class for a 1–25 score value.
export function scoreColorClass(value) {
  return levelClass(scoreLevel(value));
}

// Convenience: colour class for a 1–5 raw value.
export function rawColorClass(value) {
  return levelClass(rawLevel(value));
}

// Class for a chip-style pill (used by score badges).
export function chipClass() {
  return styles.chip;
}

// Modifier class for word-style chips (longer labels — smaller font, no min-width).
export function chipWordClass() {
  return styles.chipWord;
}

// COBIT maturity level name (1–5) → CSS class from the blue maturity palette.
export function maturityLevel(value) {
  if (value == null || Number.isNaN(value)) return 'none';
  const i = Math.round(value);
  return i >= 1 && i <= 5 ? `maturity${i}` : 'none';
}

export function maturityColorClass(value) {
  return levelClass(maturityLevel(value));
}
