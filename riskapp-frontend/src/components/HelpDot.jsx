// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/HelpDot.jsx
 *
 * A small ⓘ affordance that reveals author-written help for a UI element, keyed by
 * a stable string (e.g. "risk.detail.residual_probability"). Instrumenting an
 * element is one line:
 *
 *   <label>Residual probability <HelpDot k="risk.detail.residual_probability" /></label>
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
import { useEffect, useId, useRef, useState } from 'react';
import { useHelp } from '../context/HelpContext';
import styles from './HelpDot.module.css';

const PLACEMENTS = ['top', 'bottom', 'left', 'right'];

export function HelpDot({ k, placement: placementProp = 'top', label, fallback = null, className = '' }) {
  const { help, editMode, canEditHelp, saveHelp, ensureKey } = useHelp();
  const dbEntry = help(k);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef(null);
  const popId   = useId();

  // In edit mode, register the key so the coverage view can list it even unwritten.
  useEffect(() => {
    if (editMode && k) ensureKey(k, placementProp);
  }, [editMode, k, placementProp, ensureKey]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setEditing(false); } };
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setEditing(false); } };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  // What we actually show: a DB entry overrides the code-level fallback (e.g. an
  // InfoTip glossary definition). The dot is editable only when there's a key and
  // the user can edit; ad-hoc fallback-only tips (no key) stay read-only.
  const display  = dbEntry || fallback || null;
  const editable = editMode && canEditHelp && !!k;

  // Nothing to show and nothing to author → render nothing.
  if (!display && !editable) return null;

  const placement = dbEntry?.placement || placementProp || 'top';
  const aria = label || display?.title || `Help: ${k || ''}`;
  // "Empty" = no customised DB text yet (a bare fallback still reads as uncustomised).
  const uncustomised = !dbEntry;

  return (
    <span className={`${styles.wrap} ${className}`} ref={wrapRef}>
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

      {open && (
        <span
          id={popId}
          role={editing ? undefined : 'tooltip'}
          className={`${styles.pop} ${styles[`pop_${placement}`]}`}
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
        </span>
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
