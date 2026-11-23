// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPE_SHAPES, LEGEND_ITEMS } from './graphNodeStyle';

// Owner, 2026-11-18: on the graph, information assets and components were too
// close in colour to tell apart. The graph draws both its own node types and the
// component types (PPITF), so none of its colours may sit near a component's.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'globals.css'), 'utf8');
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`no --${name}`);
  return m[1];
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

const GRAPH = ['graph-service', 'graph-asset', 'graph-risk', 'graph-threat', 'graph-action'];
const COMPONENTS = ['ppitf-people', 'ppitf-process', 'ppitf-information', 'ppitf-technology', 'ppitf-facility', 'ppitf-control'];

test('no graph node colour is close to a component colour, or to another graph colour', () => {
  for (const g of GRAPH) {
    for (const c of COMPONENTS) expect([g, c, distance(token(g), token(c)) > 80]).toEqual([g, c, true]);
    for (const h of GRAPH.filter((x) => x !== g)) expect([g, h, distance(token(g), token(h)) > 80]).toEqual([g, h, true]);
  }
});

test('every node type has its own shape, and the legend shows each component type', () => {
  const { component, ...others } = TYPE_SHAPES;
  expect(new Set(Object.values(others)).size).toBe(Object.keys(others).length);
  expect(Object.values(others)).not.toContain(component);
  expect(LEGEND_ITEMS.map((i) => i.label)).toEqual(expect.arrayContaining(['Information Asset', 'Component: Technology', 'Component: People']));
});
