// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Canonical PPITF component colour palette.
// Used by: RiskGraph (Cytoscape nodes), ComponentPill, ComponentFormModal.
// These match the graph node colours exactly — list views use the same values.

export const COMPONENT_COLORS = {
  people:      { bg: '#38bdf8', border: '#0ea5e9', text: '#0c1117' },
  process:     { bg: '#f59e0b', border: '#d97706', text: '#0c1117' },
  information: { bg: '#a78bfa', border: '#7c3aed', text: '#ffffff' },
  technology:  { bg: '#34d399', border: '#059669', text: '#0c1117' },
  facility:    { bg: '#94a3b8', border: '#64748b', text: '#0c1117' },
  control:     { bg: '#4f7cff', border: '#2a5ae8', text: '#ffffff' },
  system:      { bg: '#1e293b', border: '#334155', text: '#94a3b8' },
};

export const COMPONENT_COLORS_FALLBACK = { bg: '#334155', border: '#475569', text: '#f1f5f9' };

export function getComponentColor(type) {
  return COMPONENT_COLORS[type] ?? COMPONENT_COLORS_FALLBACK;
}
