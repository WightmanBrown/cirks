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

const ROW_H  = 8;
const MARGIN = 16;

// The narrowest a widget may be (owner, 2026-11-18: squeezed below a certain
// width the content "looks terrible"). The dashboard shows as many columns as fit
// at this width, at most three: two on a laptop, three on a wide monitor, one on a
// narrow window. "Customise layout" shows each widget's width, to tune it by.
export const MIN_WIDGET_W = 480;
const MAX_COLUMNS = 3;

// The dashboard width at which N widgets of MIN_WIDGET_W fit side by side. With
// react-grid-layout's padding (= MARGIN) a widget N to a row is
// (width - (N + 1) * MARGIN) / N wide.
const widthFor = (n) => n * MIN_WIDGET_W + (n + 1) * MARGIN;

// Breakpoints named by the columns they show. Every one is 12 grid units wide, so a
// widget is 12 / columns units (one is a single unit: always the full width).
const GRID = {
  three: { cols: 12, w: 4, columns: 3 },
  two:   { cols: 12, w: 6, columns: 2 },
  one:   { cols: 1,  w: 1, columns: 1 },
};
const BREAKPOINTS = { three: widthFor(MAX_COLUMNS), two: widthFor(2), one: 0 };
const COLS = Object.fromEntries(Object.entries(GRID).map(([bp, g]) => [bp, g.cols]));

// Per-widget width overrides (key → { bp: w }). Anything not listed uses the GRID default.
const WIDGET_W = {
  heatmap: { three: 8 },  // two 5×5 grids side by side need room to breathe
};

// The columns showing, and how wide a widget of `w` units is, at a dashboard width.
export function gridAt(width) {
  const bp = width >= BREAKPOINTS.three ? 'three' : width >= BREAKPOINTS.two ? 'two' : 'one';
  const { cols, columns } = GRID[bp];
  const colWidth = (width - MARGIN * (cols - 1) - 2 * MARGIN) / cols;
  return { bp, columns, widthOf: (w) => Math.round(w * colWidth + (w - 1) * MARGIN) };
}

// Convert a measured pixel height into grid row units, inverting RGL's
// pixel formula  px = h*ROW_H + (h-1)*MARGIN.
function pxToUnits(px) {
  if (!px) return 6; // placeholder until first measure
  return Math.max(2, Math.ceil((px + MARGIN) / (ROW_H + MARGIN)));
}

// Build the role default positions (no height — that's injected later).
// Uses a cursor packer so variable-width widgets (WIDGET_W overrides) wrap
// correctly instead of overflowing or misaligning.
export function defaultPositions(keys) {
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
// The width is a design constraint (resizing is off) and always wins over the
// saved w. A layout saved before the minimum width (breakpoints lg/md/sm/xs,
// four to a row) keeps the user's ORDER, repacked into the new columns.
export function mergePositions(keys, saved) {
  const defaults = defaultPositions(keys);
  if (!saved) return defaults;
  if (!Object.keys(GRID).some(bp => saved[bp])) {
    const old = saved.lg || saved.md || saved.sm || saved.xs;
    if (!old) return defaults;
    const rank = Object.fromEntries([...old].sort((a, b) => a.y - b.y || a.x - b.x).map((it, n) => [it.i, n]));
    const order = [...keys].sort((a, b) => (rank[a] ?? Infinity) - (rank[b] ?? Infinity));
    return defaultPositions(order);
  }
  const out = {};
  for (const bp of Object.keys(defaults)) {
    const byKey = Object.fromEntries((saved[bp] || []).map(it => [it.i, it]));
    out[bp] = defaults[bp].map(d => {
      const s = byKey[d.i];
      if (!s) return d;
      // Use saved x/y (user's chosen position), but enforce the design width.
      return { i: d.i, x: s.x, y: s.y, w: d.w };
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
        const merged = mergePositions(keys, saved);
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
  const grid = gridAt(width);

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
            <span className={styles.editHint}>
              Drag widgets to rearrange · {grid.columns} column{grid.columns === 1 ? '' : 's'} at this width ·
              widgets {grid.widthOf(GRID[grid.bp].w)} px wide (never narrower than {MIN_WIDGET_W} px)
            </span>
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
              {editMode && (
                <span className={styles.widthBadge}>
                  {grid.widthOf(WIDGET_W[w.key]?.[grid.bp] ?? GRID[grid.bp].w)} px
                </span>
              )}
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
