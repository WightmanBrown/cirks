// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Node colours, shapes, Cytoscape stylesheet and detail-route map for the
// walkable knowledge graph (components/WalkableGraph.jsx). Component subtype
// colours are reused from the canonical PPITF palette so a node reads the same
// here as on the component pages.

import { COMPONENT_COLORS } from './componentColors';
import { resolveSheet } from './themeColours';

// Per logical node-type colour (component subtypes handled separately below).
export const TYPE_COLORS = {
  service:  { bg: 'var(--graph-service)', border: 'var(--graph-service-edge)', text: 'var(--ppitf-text-dark)' },
  asset:    { bg: 'var(--graph-asset)',   border: 'var(--graph-asset-edge)',   text: 'var(--ppitf-text-dark)' },
  system:   { bg: 'var(--graph-system)',  border: 'var(--graph-node-edge)',    text: 'var(--graph-system-text)' },
  risk:     { bg: 'var(--graph-risk)',    border: 'var(--graph-risk-edge)',    text: 'var(--ppitf-text-dark)' },
  threat:   { bg: 'var(--graph-threat)',  border: 'var(--graph-threat-edge)',  text: 'var(--ppitf-text-dark)' },
  action:   { bg: 'var(--graph-action)',  border: 'var(--graph-action-edge)',  text: 'var(--ppitf-text-dark)' },
  control:  COMPONENT_COLORS.control,
  overflow: { bg: 'var(--graph-node)',    border: 'var(--graph-node-edge)',    text: 'var(--graph-quiet-text)' },
};

// type → detail page path (null = no detail page; component → component detail).
export const DETAIL_PATH = {
  service:   (id) => `/services/${id}`,
  asset:     (id) => `/assets/${id}`,
  system:    (id) => `/systems/${id}`,
  component: (id) => `/components/${id}`,
  risk:      (id) => `/risks/${id}`,
  action:    (id) => `/actions/${id}`,
  threat:    (id) => `/threats/${id}`,
  control:   (id) => `/controls/${id}`,
  overflow:  () => null,
};

export const TYPE_LABELS = {
  service: 'Business Service',
  asset: 'Information Asset',
  system: 'System',
  component: 'Component',
  risk: 'Risk',
  action: 'Security Action',
  threat: 'Threat',
  control: 'Control',
  overflow: 'More…',
};

// Each node type has its own SHAPE as well as its colour, so colour is never the
// only signal (owner, 2026-11-18: assets and components were too close to tell
// apart). Components keep the rounded rectangle and are told apart by their
// PPITF colour; nothing else uses that shape.
export const TYPE_SHAPES = {
  system: 'diamond', service: 'cut-rectangle', asset: 'barrel', risk: 'hexagon',
  threat: 'ellipse', action: 'round-tag', control: 'octagon', component: 'roundrectangle',
};

const COMPONENT_LEGEND = [
  ['people', 'People'], ['process', 'Process'], ['information', 'Policies & documents'],
  ['technology', 'Technology'], ['facility', 'Facility'],
];

export const LEGEND_ITEMS = [
  ...['system', 'service', 'asset', 'risk', 'threat', 'action', 'control']
    .map((key) => ({ key, color: TYPE_COLORS[key], shape: TYPE_SHAPES[key], label: TYPE_LABELS[key] })),
  ...COMPONENT_LEGEND.map(([sub, label]) => ({
    key: `component-${sub}`, color: COMPONENT_COLORS[sub], shape: TYPE_SHAPES.component, label: `Component: ${label}`,
  })),
];

export function buildStylesheet() {
  const typeStyles = Object.entries(TYPE_COLORS).map(([type, c]) => ({
    selector: `node[type="${type}"]`,
    style: { 'background-color': c.bg, 'border-color': c.border, color: c.text },
  }));
  // Component nodes coloured by subtype (people/process/technology/facility/…)
  const subtypeStyles = Object.entries(COMPONENT_COLORS).map(([sub, c]) => ({
    selector: `node[subtype="${sub}"]`,
    style: { 'background-color': c.bg, 'border-color': c.border, color: c.text },
  }));

  return resolveSheet([
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 11,
        'font-family': 'var(--font-mono, monospace)',
        'border-width': 2,
        width: 120,
        height: 44,
        shape: 'roundrectangle',
        'text-wrap': 'wrap',
        'text-max-width': 110,
        padding: 8,
        'background-color': 'var(--graph-node)',
        'border-color': 'var(--graph-node-edge)',
        color: 'var(--graph-node-text)',
      },
    },
    ...typeStyles,
    ...subtypeStyles,
    { selector: 'node[type="system"]',  style: { shape: TYPE_SHAPES.system, width: 110, height: 110, 'font-weight': 'bold', 'border-width': 3 } },
    { selector: 'node[type="risk"]',    style: { shape: TYPE_SHAPES.risk, width: 104, height: 84, 'font-weight': 'bold', 'border-width': 3 } },
    { selector: 'node[type="threat"]',  style: { shape: TYPE_SHAPES.threat, width: 140, height: 52 } },
    { selector: 'node[type="service"]', style: { shape: TYPE_SHAPES.service, width: 130 } },
    { selector: 'node[type="asset"]',   style: { shape: TYPE_SHAPES.asset, width: 124, height: 50 } },
    { selector: 'node[type="action"]',  style: { shape: TYPE_SHAPES.action, width: 130 } },
    { selector: 'node[type="control"]', style: { shape: TYPE_SHAPES.control, width: 124, height: 52 } },
    { selector: 'node[type="overflow"]', style: { shape: 'roundrectangle', 'font-size': 10, opacity: 0.7, 'border-style': 'dotted' } },
    // still-walkable (unexpanded) nodes get a dashed border as an "expand me" cue
    { selector: 'node.walkable', style: { 'border-style': 'dashed' } },
    { selector: 'node.expanded', style: { 'border-style': 'solid' } },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        'font-size': 9,
        'font-family': 'var(--font-mono, monospace)',
        color: 'var(--graph-quiet-text)',
        'text-background-color': 'var(--graph-label-bg)',
        'text-background-opacity': 0.8,
        'text-background-padding': 2,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'var(--graph-arrow)',
        'line-color': 'var(--graph-line)',
        width: 1.5,
        'arrow-scale': 0.9,
      },
    },
    { selector: 'node:selected', style: { 'border-width': 4, 'border-color': 'var(--graph-selected)' } },
  ]);
}
