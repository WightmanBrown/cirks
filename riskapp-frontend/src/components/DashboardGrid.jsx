// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * DashboardGrid.jsx
 *
 * Draggable, self-packing widget grid for the dashboard.
 *
 * Design (phase 1 — reorder + packing; resize deferred):
 *   - react-grid-layout in responsive mode with vertical compaction, so
 *     widgets pack upward and fill gaps (the static CSS grid used to stretch
 *     every widget in a row to the tallest one's height — that was the source
 *     of the wasted empty space).
 *   - Widget HEIGHT is auto-fit to content via ResizeObserver. We never let the
 *     user set height (resize is off), so a light widget gets a short box and a
 *     content-heavy one grows. Height is therefore derived, not persisted.
 *   - Only POSITION/ORDER (x/y/w per breakpoint) is persisted, to
 *     users.dashboard_layout. NULL there = use the role default.
 *   - Dragging is gated behind an explicit "Customise layout" edit mode so the
 *     default experience stays calm for non-expert users. Save / Reset / Done.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { ResponsiveGridLayout, useContainerWidth }  from 'react-grid-layout';
import { getDashboardLayout, putDashboardLayout }    from '../api';

import 'react-grid-layout/css/styles.css';
import styles from './DashboardGrid.module.css';

// Column count + default widget width per breakpoint.
const GRID = {
  lg: { cols: 12, w: 3 },   // 4 widgets per row
  md: { cols: 8,  w: 4 },   // 2 per row
  sm: { cols: 4,  w: 4 },   // 1 per row
  xs: { cols: 1,  w: 1 },   // 1 per row
};

// Per-widget width overrides (key → { bp: w }). Anything not listed uses GRID default.
// At sm/xs every widget spans full width regardless of this map.
const WIDGET_W = {
  heatmap: { lg: 6, md: 8 },  // two 5×5 grids side-by-side need room to breathe
};
const BREAKPOINTS = { lg: 1100, md: 800, sm: 500, xs: 0 };
const COLS        = { lg: 12, md: 8, sm: 4, xs: 1 };
const ROW_H  = 8;
const MARGIN = 16;

// Convert a measured pixel height into grid row units, inverting RGL's
// pixel formula  px = h*ROW_H + (h-1)*MARGIN.
function pxToUnits(px) {
  if (!px) return 6; // placeholder until first measure
  return Math.max(2, Math.ceil((px + MARGIN) / (ROW_H + MARGIN)));
}

// Build the role default positions (no height — that's injected later).
// Uses a cursor packer so variable-width widgets (WIDGET_W overrides) wrap
// correctly instead of overflowing or misaligning.
function defaultPositions(keys) {
  const out = {};
  for (const bp of Object.keys(GRID)) {
    const { cols, w: defaultW } = GRID[bp];
    const items = [];
    let cursorX = 0;
    let cursorY = 0;
    for (const k of keys) {
      const w = Math.min(WIDGET_W[k]?.[bp] ?? defaultW, cols);
      if (cursorX + w > cols) { cursorX = 0; cursorY++; }
      items.push({ i: k, x: cursorX, y: cursorY, w });
      cursorX += w;
    }
    out[bp] = items;
  }
  return out;
}

// Merge a saved layout (positions only) onto the role defaults, so widgets
// added since the user last saved still appear, and stale keys are dropped.
// Width from WIDGET_W is a design constraint and always wins over the saved w.
function mergePositions(defaults, saved) {
  if (!saved) return defaults;
  const out = {};
  for (const bp of Object.keys(defaults)) {
    const byKey = Object.fromEntries((saved[bp] || []).map(it => [it.i, it]));
    out[bp] = defaults[bp].map(d => {
      const s = byKey[d.i];
      if (!s) return d;
      // Use saved x/y (user's chosen position), but enforce the design width.
      const w = WIDGET_W[d.i]?.[bp] ?? s.w;
      return { i: d.i, x: s.x, y: s.y, w };
    });
  }
  return out;
}

// Strip the derived height before persisting / comparing.
function stripH(layouts) {
  const out = {};
  for (const bp of Object.keys(layouts)) {
    out[bp] = layouts[bp].map(({ i, x, y, w }) => ({ i, x, y, w }));
  }
  return out;
}

// Inject the derived height into positions for rendering.
function withH(positions, heights) {
  const out = {};
  for (const bp of Object.keys(positions)) {
    out[bp] = positions[bp].map(it => ({ ...it, h: pxToUnits(heights[it.i]) }));
  }
  return out;
}

export function DashboardGrid({ widgets }) {
  const keys = widgets.map(w => w.key);
  const keysSig = keys.join('|'); // stable dependency for effects

  const { width, containerRef } = useContainerWidth({ initialWidth: 1280 });

  const [positions, setPositions] = useState(() => defaultPositions(keys));
  const [heights,   setHeights]   = useState({});
  const [measured,  setMeasured]  = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [dirty,     setDirty]     = useState(false);
  const [saving,    setSaving]    = useState(false);

  // Baseline to revert to on "Done" without saving.
  const baselineRef = useRef(null);
  // Refs to each widget's measuring wrapper.
  const measureRefs = useRef({});

  // ── Load saved layout once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getDashboardLayout()
      .then(saved => {
        if (cancelled) return;
        const merged = mergePositions(defaultPositions(keys), saved);
        setPositions(merged);
        baselineRef.current = merged;
      })
      .catch(() => {
        if (!cancelled) baselineRef.current = defaultPositions(keys);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig]);

  // ── Measure widget heights (auto-fit) ───────────────────────────────────
  // useLayoutEffect (not useEffect) so the FIRST measure runs synchronously,
  // before the browser paints: React flushes the resulting setHeights in the
  // same commit, so the grid paints at real heights once instead of snapping
  // from the placeholder (h=6) the first painted frame would otherwise show.
  // The ResizeObserver then handles later content-driven changes, batched per
  // animation frame so simultaneous widget resizes coalesce into one re-render.
  useLayoutEffect(() => {
    const readAll = () => {
      const out = {};
      for (const [k, el] of Object.entries(measureRefs.current)) {
        if (el) out[k] = el.offsetHeight;
      }
      return out;
    };

    const commit = (snapshot) => {
      setHeights(prev => {
        let changed = false;
        for (const [k, v] of Object.entries(snapshot)) {
          if (prev[k] !== v) changed = true;
        }
        return changed ? { ...prev, ...snapshot } : prev;
      });
    };

    // Synchronous first pass — paints correct heights on the first frame.
    commit(readAll());
    setMeasured(true);

    let frameId = null;
    const pending = {};
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const key = entry.target.dataset.widgetKey;
        if (key) pending[key] = entry.target.offsetHeight;
      }
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => commit({ ...pending }));
    });

    for (const el of Object.values(measureRefs.current)) {
      if (el) ro.observe(el);
    }
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  }, [keysSig]);

  const renderLayouts = withH(positions, heights);

  // Only capture position changes from user drags. Height-driven RGL recompacts
  // don't need to feed back into positions — they stabilise on their own and
  // feeding them back just adds extra renders.
  const onLayoutChange = useCallback((_current, allLayouts) => {
    if (editMode) setPositions(stripH(allLayouts));
  }, [editMode]);

  const onDragStop = useCallback(() => {
    if (editMode) setDirty(true);
  }, [editMode]);

  // ── Edit-mode controls ──────────────────────────────────────────────────
  const startEdit = () => { baselineRef.current = positions; setEditMode(true); };

  const cancelEdit = () => {
    if (baselineRef.current) setPositions(baselineRef.current);
    setDirty(false);
    setEditMode(false);
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      await putDashboardLayout(stripH(positions));
      baselineRef.current = positions;
      setDirty(false);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    const def = defaultPositions(keys);
    setSaving(true);
    try {
      await putDashboardLayout(null);
      setPositions(def);
      baselineRef.current = def;
      setDirty(false);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrap}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        {!editMode ? (
          <button className={styles.editBtn} onClick={startEdit}>
            Customise layout
          </button>
        ) : (
          <div className={styles.editControls}>
            <span className={styles.editHint}>Drag widgets to rearrange</span>
            <button
              className={styles.ghostBtn}
              onClick={resetToDefault}
              disabled={saving}
            >
              Reset to default
            </button>
            <button className={styles.ghostBtn} onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
            <button
              className={styles.primaryBtn}
              onClick={saveLayout}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {/* Hidden at opacity:0 (not visibility:hidden — that zeros offsetHeight)
          until the synchronous first-pass measurement lands. The .grid class
          provides a 120ms ease transition so reveal is a fade, not a snap. */}
      <div
        ref={containerRef}
        className={`${styles.grid}${editMode ? ` ${styles.editing}` : ''}`}
        style={measured ? undefined : { opacity: 0, pointerEvents: 'none' }}
      >
        <ResponsiveGridLayout
          width={width}
          layouts={renderLayouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_H}
          margin={[MARGIN, MARGIN]}
          compactType="vertical"
          isDraggable={editMode}
          isResizable={false}
          onLayoutChange={onLayoutChange}
          onDragStop={onDragStop}
          useCSSTransforms
        >
          {widgets.map(w => (
            <div key={w.key} className={styles.item}>
              <div
                className={styles.measure}
                data-widget-key={w.key}
                ref={el => { measureRefs.current[w.key] = el; }}
              >
                {w}
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
    </div>
  );
}
