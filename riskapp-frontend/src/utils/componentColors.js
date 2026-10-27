// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Canonical PPITF component colour palette, as CSS colour names (styles/globals.css).
// Used by: RiskGraph and the walkable graph (resolved through utils/themeColours),
// ComponentPill, and the component pages. A DOM style can use these directly.

const ppitf = (type, text) => ({
  bg:     `var(--ppitf-${type})`,
  border: `var(--ppitf-${type}-edge)`,
  text:   `var(--ppitf-text-${text})`,
});

export const COMPONENT_COLORS = {
  people:      ppitf('people', 'dark'),
  process:     ppitf('process', 'dark'),
  information: ppitf('information', 'dark'),
  technology:  ppitf('technology', 'dark'),
  facility:    ppitf('facility', 'dark'),
  control:     ppitf('control', 'dark'),
  system:      { bg: 'var(--ppitf-system)', border: 'var(--ppitf-system-edge)', text: 'var(--graph-quiet-text)' },
};

export const COMPONENT_COLORS_FALLBACK = { bg: 'var(--graph-node)', border: 'var(--graph-node-edge)', text: 'var(--graph-node-text)' };

export function getComponentColor(type) {
  return COMPONENT_COLORS[type] ?? COMPONENT_COLORS_FALLBACK;
}
