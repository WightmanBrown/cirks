// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { getRiskGraph } from '../api';
import { COMPONENT_COLORS } from '../utils/componentColors';
import { scoreLevel } from '../utils/riskColors';
import { resolveColour, resolveSheet } from '../utils/themeColours';
import { Spinner } from './Spinner';
import styles from './RiskGraph.module.css';

// Node colour palette — extends PPITF component colours
const NODE_COLORS = {
  ...COMPONENT_COLORS,
  risk:           { bg: 'var(--graph-risk)',   border: 'var(--graph-risk-edge)',   text: 'var(--ppitf-text-dark)' },
  threat:         { bg: 'var(--graph-threat)', border: 'var(--graph-threat-edge)', text: 'var(--ppitf-text-dark)' },
  asset:          { bg: 'var(--graph-asset)',  border: 'var(--graph-asset-edge)',  text: 'var(--ppitf-text-dark)' },
  asset_overflow: { bg: 'var(--graph-node)',   border: 'var(--graph-node-edge)',   text: 'var(--graph-quiet-text)' },
  control:        COMPONENT_COLORS.control,
};

// Risk score → border accent (matches score band colours)
const SCORE_BORDER = {
  low:          'var(--band-low-fg)',
  medium:       'var(--band-medium-fg)',
  high:         'var(--band-high-fg)',
  critical:     'var(--band-critical-fg)',
  catastrophic: 'var(--band-catastrophic-edge)',
};

function buildStylesheet() {
  const nodeStyles = Object.entries(NODE_COLORS).map(([type, c]) => ({
    selector: `node[type="${type}"]`,
    style: {
      'background-color': c.bg,
      'border-color':     c.border,
      'color':            c.text,
    },
  }));

  return resolveSheet([
    {
      selector: 'node',
      style: {
        'label':          'data(label)',
        'text-valign':    'center',
        'text-halign':    'center',
        'font-size':      11,
        'font-family':    'var(--font-mono, monospace)',
        'border-width':   2,
        'width':          120,
        'height':         44,
        'shape':          'roundrectangle',
        'text-wrap':      'wrap',
        'text-max-width': 110,
        'padding':        8,
      },
    },
    ...nodeStyles,

    // System — large diamond at centre
    {
      selector: 'node[type="system"]',
      style: {
        'shape':       'diamond',
        'width':       110,
        'height':      110,
        'font-size':   12,
        'font-weight': 'bold',
        'border-width': 3,
      },
    },

    // Risk — hexagon; border colour driven by score band
    {
      selector: 'node[type="risk"]',
      style: {
        'shape':       'hexagon',
        'width':       100,
        'height':      80,
        'font-size':   11,
        'font-weight': 'bold',
        'border-width': 3,
      },
    },

    // Threat — ellipse
    {
      selector: 'node[type="threat"]',
      style: {
        'shape':  'ellipse',
        'width':  140,
        'height': 50,
      },
    },

    // Asset — default roundrectangle (inherit)
    {
      selector: 'node[type="asset_overflow"]',
      style: {
        'shape':    'roundrectangle',
        'font-size': 10,
        'opacity':  0.6,
      },
    },

    // Control
    {
      selector: 'node[type="control"]',
      style: {
        'shape':       'roundrectangle',
        'width':       140,
        'height':      44,
        'font-size':   10,
        'border-width': 2,
      },
    },

    {
      selector: 'edge',
      style: {
        'label':                   'data(label)',
        'font-size':               9,
        'font-family':             'var(--font-mono, monospace)',
        'color':                   'var(--graph-quiet-text)',
        'text-background-color':   'var(--graph-label-bg)',
        'text-background-opacity': 0.8,
        'text-background-padding': 2,
        'curve-style':             'bezier',
        'target-arrow-shape':      'triangle',
        'target-arrow-color':      'var(--graph-arrow)',
        'line-color':              'var(--graph-line)',
        'width':                   1.5,
        'arrow-scale':             0.9,
      },
    },

    // Asset → system edges: teal
    {
      selector: 'edge[type="asset_of"]',
      style: {
        'line-color':         'var(--graph-asset)',
        'target-arrow-color': 'var(--graph-asset)',
        'width':              1.5,
      },
    },

    // Control → risk edges: blue
    {
      selector: 'edge[type="mitigates"]',
      style: {
        'line-color':         'var(--ppitf-control)',
        'target-arrow-color': 'var(--ppitf-control)',
        'line-style':         'dashed',
        'line-dash-pattern':  [5, 3],
        'width':              2,
      },
    },

    // System → risk edge: amber
    {
      selector: 'edge[type="has_risk"]',
      style: {
        'line-color':         'var(--graph-risk)',
        'target-arrow-color': 'var(--graph-risk)',
        'width':              2,
      },
    },

    // Risk → threat edge: red
    {
      selector: 'edge[type="from_threat"]',
      style: {
        'line-color':         'var(--graph-threat)',
        'target-arrow-color': 'var(--graph-threat)',
        'width':              1.5,
      },
    },

    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': 'var(--graph-selected)',
      },
    },
  ]);
}

export function RiskGraph({ riskId, riskScore, refreshKey }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [empty,   setEmpty]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshKey;

    async function load() {
      setLoading(true);
      setError(null);
      setEmpty(false);

      try {
        const { nodes, edges } = await getRiskGraph(riskId);

        if (cancelled) return;

        if (nodes.length <= 1) {
          setEmpty(true);
          setLoading(false);
          return;
        }

        setLoading(false);

        requestAnimationFrame(() => {
          if (cancelled || !containerRef.current) return;

          cyRef.current?.destroy();

          const cy = cytoscape({
            container: containerRef.current,
            elements:  { nodes, edges },
            style:     buildStylesheet(),
            layout: {
              name:              'cose',
              animate:           true,
              animationDuration: 600,
              nodeRepulsion:     () => 10000,
              idealEdgeLength:   () => 140,
              edgeElasticity:    () => 100,
              gravity:           0.5,
              numIter:           1000,
              fit:               true,
              padding:           40,
            },
            minZoom: 0.25,
            maxZoom: 3,
          });

          // Pin system node at centre after layout
          cy.ready(() => {
            const sysNode = cy.$('node[type="system"]');
            if (sysNode.length) {
              cy.layout({
                name:    'cose',
                animate: false,
                fit:     true,
                padding: 40,
              }).run();
            }
          });

          // Score-based border on risk node
          if (riskScore != null) {
            const level = scoreLevel(riskScore);
            const border = resolveColour(SCORE_BORDER[level]);
            if (border) {
              cy.$('node[type="risk"]').style({ 'border-color': border, 'border-width': 4 });
            }
          }

          cyRef.current = cy;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load graph.');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [riskId, riskScore, refreshKey]);

  function handleFit() {
    cyRef.current?.fit(undefined, 40);
  }

  return (
    <div className={styles.wrapper}>
      {loading && (
        <div className={styles.overlay}>
          <Spinner tone="muted" />
          <span>Building graph…</span>
        </div>
      )}
      {error && (
        <div className={styles.overlay}>
          <span className={styles.errorMsg}>⚠ {error}</span>
        </div>
      )}
      {empty && (
        <div className={styles.overlay}>
          <span className={styles.emptyMsg}>No graph data available for this risk.</span>
        </div>
      )}
      {!loading && !error && !empty && (
        <button className={styles.fitBtn} onClick={handleFit} title="Fit to view">⊡</button>
      )}
      <div
        ref={containerRef}
        className={styles.canvas}
        style={{ visibility: loading || error || empty ? 'hidden' : 'visible' }}
      />
      {!loading && !error && !empty && <Legend />}
    </div>
  );
}

function Legend() {
  const items = [
    { type: 'system',  label: 'System'    },
    { type: 'risk',    label: 'Risk'      },
    { type: 'threat',  label: 'Threat'    },
    { type: 'asset',   label: 'Asset'     },
    { type: 'control', label: 'Control'   },
    { type: 'people',      label: 'People'      },
    { type: 'process',     label: 'Process'     },
    { type: 'technology',  label: 'Technology'  },
    { type: 'facility',    label: 'Facility'    },
  ];

  return (
    <div className={styles.legend}>
      {items.map(({ type, label }) => (
        <div key={type} className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{
              background:  NODE_COLORS[type]?.bg,
              border:      `2px solid ${NODE_COLORS[type]?.border}`,
            }}
          />
          <span className={styles.legendLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}
