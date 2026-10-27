// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Colours live in styles/globals.css as CSS custom properties. The DOM can use
// them directly (`style={{ background: 'var(--ppitf-people)' }}`); a canvas
// library such as Cytoscape cannot, so it asks for the current value here when
// it draws. Reading at draw time means a change of theme reaches the graph on
// its next render.

// 'var(--name)' or '--name' → the colour the page currently gives it. Any other
// string is returned unchanged. Outside a browser (tests) a name with no value
// comes back as-is.
export function resolveColour(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*$/i) || value.match(/^\s*(--[a-z0-9-]+)\s*$/i);
  if (!m || typeof document === 'undefined') return value;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || value;
}

// Resolve every colour-like property of a Cytoscape style object.
export function resolveStyle(style) {
  const out = {};
  for (const [k, v] of Object.entries(style)) {
    out[k] = /color/.test(k) ? resolveColour(v) : v;
  }
  return out;
}

// Resolve the colours in a whole Cytoscape stylesheet ([{ selector, style }]).
export function resolveSheet(sheet) {
  return sheet.map((rule) => ({ ...rule, style: resolveStyle(rule.style) }));
}
