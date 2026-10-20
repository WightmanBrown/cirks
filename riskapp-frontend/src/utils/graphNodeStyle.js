// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Node colours, shapes, Cytoscape stylesheet and detail-route map for the
// walkable knowledge graph (components/WalkableGraph.jsx). Component subtype
// colours are reused from the canonical PPITF palette so a node reads the same
// here as on the component pages.

import { COMPONENT_COLORS } from './componentColors';

// Per logical node-type colour (component subtypes handled separately below).
export const TYPE_COLORS = {
  service:  { bg: '#c084fc', border: '#9333ea', text: '#0c1117' },
  asset:    { bg: '#2dd4bf', border: '#0d9488', text: '#0c1117' },
  system:   { bg: '#1e293b', border: '#475569', text: '#cbd5e1' },
  risk:     { bg: '#f59e0b', border: '#d97706', text: '#0c1117' },
  threat:   { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
  action:   { bg: '#60a5fa', border: '#2563eb', text: '#0c1117' },
  control:  { bg: '#4f7cff', border: '#2a5ae8', text: '#ffffff' },
  overflow: { bg: '#334155', border: '#475569', text: '#94a3b8' },
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

export const LEGEND_ITEMS = [
  { key: 'system',  color: TYPE_COLORS.system },
  { key: 'service', color: TYPE_COLORS.service },
  { key: 'asset',   color: TYPE_COLORS.asset },
  { key: 'risk',    color: TYPE_COLORS.risk },
  { key: 'threat',  color: TYPE_COLORS.threat },
  { key: 'action',  color: TYPE_COLORS.action },
  { key: 'control', color: TYPE_COLORS.control },
  { key: 'component', color: COMPONENT_COLORS.technology },
].map((i) => ({ ...i, label: TYPE_LABELS[i.key] }));

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

  return [
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
        'background-color': '#334155',
        'border-color': '#475569',
        color: '#f1f5f9',
      },
    },
    ...typeStyles,
    ...subtypeStyles,
    { selector: 'node[type="system"]',  style: { shape: 'diamond', width: 110, height: 110, 'font-weight': 'bold', 'border-width': 3 } },
    { selector: 'node[type="risk"]',    style: { shape: 'hexagon', width: 104, height: 84, 'font-weight': 'bold', 'border-width': 3 } },
    { selector: 'node[type="threat"]',  style: { shape: 'ellipse', width: 140, height: 52 } },
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
        color: '#94a3b8',
        'text-background-color': '#0c1117',
        'text-background-opacity': 0.8,
        'text-background-padding': 2,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#475569',
        'line-color': '#334155',
        width: 1.5,
        'arrow-scale': 0.9,
      },
    },
    { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#f8fafc' } },
  ];
}
