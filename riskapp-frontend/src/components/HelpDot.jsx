// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/HelpDot.jsx
 *
 * A small ⓘ affordance that reveals author-written help for a UI element, keyed by
 * a stable string (e.g. "col.probability"). Instrumenting an
 * element is one line:
 *
 *   <th>Probability <HelpDot k="col.probability" /></th>
 *
 * Read mode: the dot renders only when help text exists for the key. It opens on
 * hover, focus, or click; closes on Escape or blur. Wired with aria-describedby so
 * screen readers announce the text (hover-only tooltips fail WCAG / break on touch).
 *
 * Edit mode (admins): the dot always renders (even with no text), outlined; clicking
 * opens an inline editor (title / body / placement side) that PUTs the text back.
 *
 * Positioning is anchored to this element — `placement` (top|bottom|left|right) picks
 * the side; there are no free coordinates, so help can't drift onto the wrong thing.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHelp } from '../context/HelpContext';
import { HELP_DEFAULTS } from '../help/defaults';
import styles from './HelpDot.module.css';

const PLACEMENTS = ['top', 'bottom', 'left', 'right'];
const GAP = 6;     // between the dot and the popover
const MARGIN = 8;  // kept clear of the window edge

// Where the popover goes: on the chosen side of the dot, flipped to the opposite
// side when there is no room, then slid along to stay inside the window. Fixed to
// the window (and rendered into <body>) so a scrolling table or a card with
// overflow hidden cannot cut it off.
export function placePopover(anchor, pop, side, view) {
  const room = {
    top: anchor.top - GAP - MARGIN >= pop.height,
    bottom: view.height - anchor.bottom - GAP - MARGIN >= pop.height,
    left: anchor.left - GAP - MARGIN >= pop.width,
    right: view.width - anchor.right - GAP - MARGIN >= pop.width,
  };
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const s = room[side] || !room[opposite[side]] ? side : opposite[side];
  const cx = anchor.left + anchor.width / 2 - pop.width / 2;
  const cy = anchor.top + anchor.height / 2 - pop.height / 2;
  let left, top;
  if (s === 'top')    { left = cx; top = anchor.top - GAP - pop.height; }
  if (s === 'bottom') { left = cx; top = anchor.bottom + GAP; }
  if (s === 'left')   { left = anchor.left - GAP - pop.width; top = cy; }
  if (s === 'right')  { left = anchor.right + GAP; top = cy; }
  const clamp = (v, max) => Math.max(MARGIN, Math.min(v, max - MARGIN));
  return {
    left: clamp(left, view.width - pop.width),
    top: clamp(top, view.height - pop.height),
  };
}

export function HelpDot({ k, placement: placementProp = 'top', label, fallback: fallbackProp = null, className = '' }) {
  const { help, editMode, canEditHelp, saveHelp, ensureKey, drafts } = useHelp();
  // The draft text shipped in help/defaults stands in until an admin writes their own.
  const fallback = fallbackProp || (drafts && k ? HELP_DEFAULTS[k] : null) || null;
  const dbEntry = help(k);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef(null);
  const popRef  = useRef(null);
  const placementRef = useRef('top');
  const [pos, setPos] = useState(null);
  const popId   = useId();

  // In edit mode, register the key so the coverage view can list it even unwritten.
  useEffect(() => {
    if (editMode && k) ensureKey(k, placementProp);
  }, [editMode, k, placementProp, ensureKey]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setEditing(false); } };
    const onClick = (e) => {
      const inside = wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target);
      if (!inside) { setOpen(false); setEditing(false); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  // Measure and place the popover once it is in the page, and keep it with the
  // dot while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const btn = wrapRef.current?.querySelector('button');
      if (!btn || !popRef.current) return;
      setPos(placePopover(
        btn.getBoundingClientRect(),
        popRef.current.getBoundingClientRect(),
        placementRef.current,
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, editing]);

  // What we actually show: a DB entry overrides the code-level fallback (e.g. an
  // InfoTip glossary definition). The dot is editable only when there's a key and
  // the user can edit; ad-hoc fallback-only tips (no key) stay read-only.
  const display  = dbEntry || fallback || null;
  const editable = editMode && canEditHelp && !!k;

  // Nothing to show and nothing to author → render nothing.
  if (!display && !editable) return null;

  const placement = dbEntry?.placement || placementProp || 'top';
  placementRef.current = PLACEMENTS.includes(placement) ? placement : 'top';
  // "About …" so the dot is not announced with the same name as the heading or
  // sort button it sits beside.
  const aria = label || (display?.title ? `About ${display.title}` : `Help: ${k || ''}`);
  // "Empty" = no customised DB text yet (a bare fallback still reads as uncustomised).
  const uncustomised = !dbEntry;

  return (
    <span
      // Marks a header cell that carries help, so globals.css can keep it on one
      // line: a browser may always break before a button, which left the dot on
      // a line of its own in narrow column headers.
      data-help-dot=""
      className={`${styles.wrap} ${className}`}
      ref={wrapRef}
      // A dot often sits inside something clickable (a sortable column header, a
      // collapsible card's title): opening help must not also sort or collapse it.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    >
      <button
        type="button"
        className={`${styles.dot} ${editable ? styles.dotEdit : ''} ${editable && uncustomised ? styles.dotEmpty : ''}`}
        aria-label={aria}
        aria-describedby={open && display ? popId : undefined}
        aria-expanded={open}
        onMouseEnter={() => !editing && setOpen(true)}
        onMouseLeave={() => !editing && setOpen(false)}
        onFocus={() => !editing && setOpen(true)}
        onBlur={(e) => { if (!editing && wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) setOpen(false); }}
        onClick={() => {
          if (editable) { setEditing(true); setOpen(true); }
          else setOpen(o => !o);
        }}
      >
        i
      </button>

      {open && createPortal(
        <span
          id={popId}
          ref={popRef}
          role={editing ? undefined : 'tooltip'}
          className={styles.pop}
          // Hidden for the first frame, until it has been measured and placed.
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          {editing
            ? <HelpEditor k={k} entry={dbEntry} fallback={fallback} placement={placement} onSave={saveHelp} onClose={() => { setEditing(false); setOpen(false); }} />
            : (
              <>
                {display?.title && <span className={styles.popTitle}>{display.title}</span>}
                <span className={styles.popBody}>{display?.body}</span>
                {dbEntry?.is_fallback && <span className={styles.fallback}>shown in default language</span>}
              </>
            )}
        </span>,
        document.body,
      )}
    </span>
  );
}

function HelpEditor({ k, entry, fallback, placement, onSave, onClose }) {
  // Pre-fill from the saved DB text, else the code-level fallback (e.g. a glossary
  // definition) so an admin adopts-and-tweaks rather than retyping from scratch.
  const [title, setTitle]   = useState(entry?.title ?? fallback?.title ?? '');
  const [body,  setBody]    = useState(entry?.body  ?? fallback?.body  ?? '');
  const [side,  setSide]    = useState(placement || 'top');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  const submit = async (clear = false) => {
    setSaving(true); setErr(null);
    try {
      await onSave(k, { title: title || null, body: clear ? '' : body, placement: side });
      onClose();
    } catch {
      setErr('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className={styles.editor} onMouseDown={(e) => e.stopPropagation()}>
      <span className={styles.editorKey}>{k}</span>
      <input
        className={styles.editorInput}
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className={styles.editorTextarea}
        placeholder="Help text shown to users…"
        rows={4}
        value={body}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
      />
      <span className={styles.editorRow}>
        <label className={styles.editorSideLabel}>
          Side
          <select className={styles.editorSelect} value={side} onChange={(e) => setSide(e.target.value)}>
            {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <span className={styles.editorBtns}>
          {entry && (
            <button type="button" className={styles.editorClear} disabled={saving} onClick={() => submit(true)}>
              Clear
            </button>
          )}
          <button type="button" className={styles.editorCancel} disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.editorSave} disabled={saving || !body.trim()} onClick={() => submit(false)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </span>
      </span>
      {err && <span className={styles.editorErr}>{err}</span>}
    </span>
  );
}
