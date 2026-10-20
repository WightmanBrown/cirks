'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/HelpContentPage.jsx  (/admin/help)
 *
 * Authoring overview for contextual help. Lists every help key the server knows
 * (registered as admins browse in edit mode, or already written) merged with the
 * code-level glossary terms, shows which have text / translations, and lets an
 * admin write or clear any of them in one place — the manageable counterpart to
 * editing dots in situ.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getHelpCoverage, getHelp, saveHelp } from '../api';
import { GLOSSARY } from '../utils/glossary';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import styles from './HelpContentPage.module.css';

const DEFAULT_LOCALE = 'en';
const PLACEMENTS = ['top', 'bottom', 'left', 'right', 'auto'];

// Glossary terms always appear (they have a code default even with no DB row).
const GLOSSARY_ROWS = Object.entries(GLOSSARY).map(([term, g]) => ({
  help_key: `glossary.${term}`,
  fallback: { title: g.term, body: g.definition },
}));

export function HelpContentPage() {
  const [coverage, setCoverage] = useState([]);   // [{help_key, placement, page_hint, locales[]}]
  const [dbEn, setDbEn]         = useState({});    // key -> { title, body } (written DB 'en' text)
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editingKey, setEditingKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cov, cat] = await Promise.all([getHelpCoverage(), getHelp(DEFAULT_LOCALE)]);
      setCoverage(cov.keys || []);
      setDbEn(cat.entries || {});
      setError('');
    } catch {
      setError('Could not load help content.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge server-known keys with the always-present glossary terms.
  const rows = useMemo(() => {
    const byKey = new Map();
    for (const k of coverage) {
      byKey.set(k.help_key, {
        help_key: k.help_key,
        placement: k.placement || 'top',
        locales: k.locales || [],
        fallback: null,
      });
    }
    for (const g of GLOSSARY_ROWS) {
      const existing = byKey.get(g.help_key);
      if (existing) existing.fallback = g.fallback;
      else byKey.set(g.help_key, { help_key: g.help_key, placement: 'top', locales: [], fallback: g.fallback });
    }
    return [...byKey.values()]
      .map(r => {
        const writtenEn = r.locales.includes(DEFAULT_LOCALE);
        const otherLocales = r.locales.filter(l => l !== DEFAULT_LOCALE);
        const source = writtenEn ? 'custom' : (r.fallback ? 'default' : 'unwritten');
        return { ...r, writtenEn, otherLocales, source };
      })
      .sort((a, b) => a.help_key.localeCompare(b.help_key));
  }, [coverage]);

  const stats = useMemo(() => ({
    total: rows.length,
    written: rows.filter(r => r.writtenEn).length,
    usingDefault: rows.filter(r => r.source === 'default').length,
    unwritten: rows.filter(r => r.source === 'unwritten').length,
    translated: rows.filter(r => r.otherLocales.length).length,
  }), [rows]);

  async function handleSave(key, payload) {
    await saveHelp(key, payload);
    await load();
    setEditingKey(null);
  }

  const SOURCE_LABEL = {
    custom:    { text: 'Custom',       cls: styles.srcCustom },
    default:   { text: 'Code default', cls: styles.srcDefault },
    unwritten: { text: 'Unwritten',    cls: styles.srcUnwritten },
  };

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>Help Content</h1>
        </div>
        <p className={styles.intro}>
          Every contextual-help anchor the system knows about. Keys appear here once they
          have been written, or once you visit their page with <strong>Edit help</strong> on
          (which registers them). Glossary terms always appear — they have a built-in default
          until you customise them.
        </p>

        {error && <p className={styles.errorMsg}>{error}</p>}

        {loading ? (
          <div className={styles.loading}><Spinner /><span>Loading…</span></div>
        ) : (
          <>
            <div className={styles.statsRow}>
              <Stat label="Keys" value={stats.total} />
              <Stat label="Written" value={stats.written} color="var(--green)" />
              <Stat label="Using default" value={stats.usingDefault} color="var(--text-secondary)" />
              <Stat label="Unwritten" value={stats.unwritten} color={stats.unwritten ? 'var(--amber)' : 'var(--text-muted)'} />
              <Stat label="Translated" value={stats.translated} color="var(--text-muted)" />
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Key</th>
                  <th className={styles.th}>English</th>
                  <th className={styles.th}>Other languages</th>
                  <th className={styles.th}>Source</th>
                  <th className={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const src = SOURCE_LABEL[r.source];
                  const isEditing = editingKey === r.help_key;
                  return (
                    <FragmentRow
                      key={r.help_key}
                      row={r}
                      src={src}
                      isEditing={isEditing}
                      dbEn={dbEn[r.help_key]}
                      onEdit={() => setEditingKey(isEditing ? null : r.help_key)}
                      onSave={handleSave}
                      onCancel={() => setEditingKey(null)}
                    />
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Shell>
  );
}

function FragmentRow({ row, src, isEditing, dbEn, onEdit, onSave, onCancel }) {
  return (
    <>
      <tr className={isEditing ? styles.rowActive : undefined}>
        <td className={styles.tdKey}>{row.help_key}</td>
        <td className={styles.td}>{row.writtenEn ? <span className={styles.yes}>✓</span> : <span className={styles.no}>—</span>}</td>
        <td className={styles.td}>{row.otherLocales.length ? row.otherLocales.join(', ') : <span className={styles.no}>—</span>}</td>
        <td className={styles.td}><span className={`${styles.srcChip} ${src.cls}`}>{src.text}</span></td>
        <td className={styles.tdAction}>
          <button type="button" className={styles.editBtn} onClick={onEdit}>{isEditing ? 'Close' : 'Edit'}</button>
        </td>
      </tr>
      {isEditing && (
        <tr>
          <td colSpan={5} className={styles.editorCell}>
            <RowEditor
              keyName={row.help_key}
              placement={row.placement}
              dbEn={dbEn}
              fallback={row.fallback}
              hasDb={row.writtenEn}
              onSave={onSave}
              onCancel={onCancel}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RowEditor({ keyName, placement, dbEn, fallback, hasDb, onSave, onCancel }) {
  const [title, setTitle] = useState(dbEn?.title ?? fallback?.title ?? '');
  const [body, setBody]   = useState(dbEn?.body ?? fallback?.body ?? '');
  const [side, setSide]   = useState(placement || 'top');
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState('');

  const submit = async (clear = false) => {
    setSaving(true); setErr('');
    try {
      await onSave(keyName, { title: title || null, body: clear ? '' : body, placement: side });
    } catch {
      setErr('Save failed.');
      setSaving(false);
    }
  };

  return (
    <div className={styles.editor}>
      {!hasDb && fallback && (
        <p className={styles.defaultNote}>Pre-filled from the built-in default. Save to customise; it then overrides the default until cleared.</p>
      )}
      <input
        className={styles.input}
        placeholder="Title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        className={styles.textarea}
        placeholder="Help text shown to users…"
        rows={3}
        value={body}
        onChange={e => setBody(e.target.value)}
      />
      <div className={styles.editorRow}>
        <label className={styles.sideLabel}>
          Side
          <select className={styles.select} value={side} onChange={e => setSide(e.target.value)}>
            {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <div className={styles.editorBtns}>
          {hasDb && <button type="button" className={styles.clearBtn} disabled={saving} onClick={() => submit(true)}>Clear</button>}
          <button type="button" className={styles.cancelBtn} disabled={saving} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.saveBtn} disabled={saving || !body.trim()} onClick={() => submit(false)}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {err && <p className={styles.errorMsg}>{err}</p>}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue} style={color ? { color } : undefined}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
