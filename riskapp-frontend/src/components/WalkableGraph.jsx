// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import { getGraphNeighbors } from '../api';
import { buildStylesheet, DETAIL_PATH, TYPE_LABELS, LEGEND_ITEMS } from '../utils/graphNodeStyle';
import { Spinner } from './Spinner';
import styles from './WalkableGraph.module.css';

const COSE = {
  name: 'cose',
  animate: true,
  animationDuration: 400,
  randomize: false, // keep already-placed nodes roughly where they are (stable walk)
  fit: true,
  padding: 40,
  nodeRepulsion: () => 9000,
  idealEdgeLength: () => 130,
  edgeElasticity: () => 100,
  gravity: 0.4,
  numIter: 700,
};

// Mark every unexpanded, non-overflow node as "walkable" (dashed = expand me).
function markWalkable(cy, expanded) {
  cy.nodes().forEach((n) => {
    const t = n.data('type');
    if (t === 'overflow') return;
    if (expanded.has(n.id())) { n.removeClass('walkable').addClass('expanded'); }
    else { n.removeClass('expanded').addClass('walkable'); }
  });
}

export function WalkableGraph({ rootType, rootId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const expandedRef = useRef(new Set());
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [expandingId, setExpandingId] = useState(null);

  const expandNode = useCallback(async (node) => {
    const cy = cyRef.current;
    if (!cy) return;
    const { id, type, rawId } = node.data();
    if (type === 'overflow' || expandedRef.current.has(id)) return;

    setExpandingId(id);
    try {
      const { nodes, edges } = await getGraphNeighbors(type, rawId);
      const pos = node.position();
      const additions = [];
      for (const n of nodes) {
        if (cy.getElementById(n.data.id).empty()) {
          additions.push({
            group: 'nodes',
            data: n.data,
            position: { x: pos.x + (Math.random() * 160 - 80), y: pos.y + (Math.random() * 160 - 80) },
          });
        }
      }
      for (const e of edges) {
        if (cy.getElementById(e.data.id).empty()) additions.push({ group: 'edges', data: e.data });
      }
      cy.add(additions); // nodes precede edges in the array, so endpoints exist
      expandedRef.current.add(id);
      markWalkable(cy, expandedRef.current);
      cy.layout(COSE).run();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to expand node.');
    } finally {
      setExpandingId(null);
    }
  }, []);

  // Initial load: seed node + first hop
  useEffect(() => {
    let cancelled = false;
    expandedRef.current = new Set();
    setLoading(true);
    setError(null);
    setSelected(null);

    (async () => {
      try {
        const { nodes, edges } = await getGraphNeighbors(rootType, rootId);
        if (cancelled) return;
        setLoading(false);

        requestAnimationFrame(() => {
          if (cancelled || !containerRef.current) return;
          cyRef.current?.destroy();

          const cy = cytoscape({
            container: containerRef.current,
            elements: { nodes, edges },
            style: buildStylesheet(),
            layout: COSE,
            minZoom: 0.2,
            maxZoom: 3,
          });

          const seedId = `${rootType}-${rootId}`;
          expandedRef.current.add(seedId); // the seed's neighbours are already loaded
          markWalkable(cy, expandedRef.current);

          cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            setSelected(node.data());
            expandNode(node);
          });
          cy.on('tap', (evt) => { if (evt.target === cy) setSelected(null); });

          // auto-select the seed so the side panel is populated
          const seed = cy.getElementById(seedId);
          if (!seed.empty()) setSelected(seed.data());

          cyRef.current = cy;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load graph.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [rootType, rootId, expandNode]);

  const handleFit = () => cyRef.current?.fit(undefined, 40);

  const selExpandable = selected && selected.type !== 'overflow' && !expandedRef.current.has(selected.id);
  const detailPath = selected && DETAIL_PATH[selected.type] ? DETAIL_PATH[selected.type](selected.rawId) : null;

  return (
    <div className={styles.layout}>
      <div className={styles.graphPane}>
        {loading && (
          <div className={styles.overlay}><Spinner tone="muted" /><span>Building graph…</span></div>
        )}
        {error && <div className={styles.overlay}><span className={styles.errorMsg}>⚠ {error}</span></div>}
        {!loading && !error && (
          <button className={styles.fitBtn} onClick={handleFit} title="Fit to view">⊡</button>
        )}
        <div
          ref={containerRef}
          className={styles.canvas}
          style={{ visibility: loading || error ? 'hidden' : 'visible' }}
        />
        {!loading && !error && (
          <div className={styles.legend}>
            {LEGEND_ITEMS.map(({ key, label, color }) => (
              <div key={key} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: color.bg, border: `2px solid ${color.border}` }} />
                <span className={styles.legendLabel}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className={styles.panel}>
        {!selected ? (
          <p className={styles.panelHint}>Click a node to see its details and walk one hop further.</p>
        ) : (
          <>
            <span className={styles.panelType}>{TYPE_LABELS[selected.type] || selected.type}</span>
            <h3 className={styles.panelName}>{selected.label}</h3>
            <dl className={styles.panelMeta}>
              {selected.risk_score != null && (<><dt>Risk score</dt><dd>{selected.risk_score}</dd></>)}
              {selected.maturity != null && (<><dt>Maturity</dt><dd>{selected.maturity}</dd></>)}
              {selected.status && (<><dt>Status</dt><dd>{selected.status}</dd></>)}
              {selected.subtype && (<><dt>Kind</dt><dd>{selected.subtype}</dd></>)}
            </dl>
            <div className={styles.panelActions}>
              {selExpandable && (
                <button
                  className={styles.expandBtn}
                  disabled={expandingId === selected.id}
                  onClick={() => expandNode(cyRef.current.getElementById(selected.id))}
                >
                  {expandingId === selected.id ? 'Expanding…' : 'Expand ↘'}
                </button>
              )}
              {!selExpandable && selected.type !== 'overflow' && (
                <span className={styles.expandedTag}>Expanded</span>
              )}
              {detailPath && (
                <button className={styles.detailBtn} onClick={() => navigate(detailPath)}>Open detail ↗</button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
