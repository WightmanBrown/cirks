// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { saveRowCiaAnalysis } from '../api';
import styles from './RowCiaAnalysisModal.module.css';

const DIM_LABELS = {
  c: { short: 'C', label: 'Confidentiality', help: 'Does a failure of this impact category affect the confidentiality of information?' },
  i: { short: 'I', label: 'Integrity',       help: 'Does a failure of this impact category affect the integrity of information?' },
  a: { short: 'A', label: 'Availability',    help: 'Does a failure of this impact category affect the availability of information?' },
};

function isStale(row) {
  if (!row.levels_updated_at) return false;
  const dims = Object.values(row.cia_analysis || {});
  if (!dims.length) return false;
  return dims.some(d => d.analysed_at && new Date(row.levels_updated_at) > new Date(d.analysed_at));
}

export function RowCiaAnalysisModal({ tableId, row, onSaved, onClose }) {
  const existing = row.cia_analysis || {};

  const [form, setForm] = useState({
    c: { applies: existing.c?.applies ?? true,  statement: existing.c?.statement ?? '' },
    i: { applies: existing.i?.applies ?? true,  statement: existing.i?.statement ?? '' },
    a: { applies: existing.a?.applies ?? true,  statement: existing.a?.statement ?? '' },
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function setDim(dim, field, value) {
    setForm(f => ({ ...f, [dim]: { ...f[dim], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {};
      for (const dim of ['c', 'i', 'a']) {
        payload[dim] = {
          applies:   form[dim].applies,
          statement: form[dim].statement || null,
        };
      }
      await saveRowCiaAnalysis(tableId, row.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const stale = isStale(row);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.rowLabel}>
              <span className={styles.cat}>{row.category_name}</span>
              <span className={styles.sep}>›</span>
              <span className={styles.subcat}>{row.subcategory_name}</span>
            </div>
            {stale && (
              <span className={styles.staleBadge} title="BIL descriptions changed since last analysis">
                ⚠ Stale — review required
              </span>
            )}
            {!stale && Object.keys(existing).length === 0 && (
              <span className={styles.pendingBadge}>Pending first analysis</span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className={styles.intro}>
          For each CIA dimension, indicate whether a failure of this impact category constitutes
          a risk in that dimension, and record your reasoning.
        </p>

        <div className={styles.dims}>
          {['c', 'i', 'a'].map(dim => (
            <div key={dim} className={`${styles.dimCard} ${form[dim].applies ? styles.dimCardOn : styles.dimCardOff}`}>
              <div className={styles.dimHeader}>
                <div className={styles.dimBadge}>{DIM_LABELS[dim].short}</div>
                <div className={styles.dimInfo}>
                  <span className={styles.dimLabel}>{DIM_LABELS[dim].label}</span>
                  <span className={styles.dimHelp}>{DIM_LABELS[dim].help}</span>
                </div>
                <label className={styles.dimToggle}>
                  <input
                    type="checkbox"
                    checked={form[dim].applies}
                    onChange={e => setDim(dim, 'applies', e.target.checked)}
                  />
                  <span className={form[dim].applies ? styles.appliesOn : styles.appliesOff}>
                    {form[dim].applies ? 'Applies' : 'Does not apply'}
                  </span>
                </label>
              </div>
              {form[dim].applies && (
                <textarea
                  className={styles.statement}
                  rows={3}
                  placeholder={`Explain how a failure in this category affects ${DIM_LABELS[dim].label.toLowerCase()}…`}
                  value={form[dim].statement}
                  onChange={e => setDim(dim, 'statement', e.target.value)}
                />
              )}
              {!form[dim].applies && (
                <textarea
                  className={`${styles.statement} ${styles.statementDisabled}`}
                  rows={2}
                  placeholder="Optionally record why this dimension does not apply…"
                  value={form[dim].statement}
                  onChange={e => setDim(dim, 'statement', e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}
