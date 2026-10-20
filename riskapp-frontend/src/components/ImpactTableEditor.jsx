// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import {
  updateImpactTable,
  updateImpactTableBilLevels,
  updateImpactTableCiaLevels,
  getBilReference,
} from '../api';
import styles from './ImpactTableEditor.module.css';

const DIM_LABELS = { c: 'Confidentiality', i: 'Integrity', a: 'Availability' };

export function ImpactTableEditor({ impactTable, onSaved, isExpert = false }) {

  const [name,        setName]        = useState(() => impactTable?.name || '');
  const [description, setDescription] = useState(() => impactTable?.description || '');
  const [bilDraft,    setBilDraft]    = useState(() => {
    const bil = {};
    (impactTable?.bil_levels || []).forEach(l => { bil[l.level] = l.statement || ''; });
    return bil;
  });
  const [ciaDraft,    setCiaDraft]    = useState(() => {
    const cia = {};
    (impactTable?.cia_levels || []).forEach(l => { cia[`${l.level}_${l.dimension}`] = l.statement || ''; });
    return cia;
  });
  const [bilRef,      setBilRef]      = useState([]);
  const [adoptPicker, setAdoptPicker] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState('');

  // Reset all draft state when the table reloads (e.g. after a successful save)
  useEffect(() => {
    if (!impactTable) return;
    setName(impactTable.name || '');
    setDescription(impactTable.description || '');

    const bil = {};
    (impactTable.bil_levels || []).forEach(l => { bil[l.level] = l.statement || ''; });
    setBilDraft(bil);

    const cia = {};
    (impactTable.cia_levels || []).forEach(l => { cia[`${l.level}_${l.dimension}`] = l.statement || ''; });
    setCiaDraft(cia);
  }, [impactTable]);

  useEffect(() => {
    getBilReference().then(setBilRef).catch(() => {});
  }, []);

  function adoptIS1(subcatId) {
    const updates = {};
    for (const cat of (bilRef || [])) {
      const sc = cat.subcategories?.find(s => s.id === subcatId);
      if (sc) {
        sc.levels?.forEach(l => { if (l.description) updates[l.level] = l.description; });
        break;
      }
    }
    setBilDraft(d => ({ ...d, ...updates }));
    setAdoptPicker(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Save name/description if changed
      if (name !== impactTable.name || description !== (impactTable.description || '')) {
        await updateImpactTable(impactTable.id, { name, description });
      }

      // Save all 5 BIL levels
      const bilLevels = [1, 2, 3, 4, 5].map(lvl => ({
        level:     lvl,
        statement: bilDraft[lvl] || null,
      }));
      await updateImpactTableBilLevels(impactTable.id, bilLevels);

      // Save all 15 CIA levels (expert only)
      if (isExpert) {
        const ciaLevels = [];
        for (let lvl = 1; lvl <= 5; lvl++) {
          for (const dim of ['c', 'i', 'a']) {
            ciaLevels.push({
              level:     lvl,
              dimension: dim,
              statement: ciaDraft[`${lvl}_${dim}`] || null,
            });
          }
        }
        await updateImpactTableCiaLevels(impactTable.id, ciaLevels);
      }

      setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const bilFilled = [1, 2, 3, 4, 5].filter(l => bilDraft[l]?.trim()).length;

  return (
    <div className={styles.tableEditor}>

      {/* Name + description */}
      <div className={styles.metaBlock}>
        <label className={styles.fieldLabel}>Table name</label>
        <input
          className={styles.nameInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Impact dimension name"
        />
        <label className={styles.fieldLabel}>Description <span className={styles.optional}>(optional)</span></label>
        <textarea
          className={styles.descInput}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What does this impact dimension measure?"
        />
      </div>

      {/* 1dBIL section */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>1dBIL — Business impact level descriptions</span>
        <span className={styles.sectionFill}>{bilFilled}/5 defined</span>
        <button
          type="button"
          className={adoptPicker ? `${styles.adoptBtn} ${styles.adoptBtnActive}` : styles.adoptBtn}
          onClick={() => setAdoptPicker(p => !p)}
        >
          Adopt example text
        </button>
      </div>

      {adoptPicker && (
        <div className={styles.adoptPicker}>
          <span className={styles.adoptPickerLabel}>Adopt BIL 1–5 from IS1 reference:</span>
          <select
            className={styles.adoptPickerSelect}
            defaultValue=""
            onChange={e => e.target.value && adoptIS1(parseInt(e.target.value, 10))}
          >
            <option value="">— select a reference sub-category —</option>
            {(bilRef || []).map(cat => (
              <optgroup key={cat.id} label={cat.name}>
                {(cat.subcategories || []).map(sc => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <div className={styles.levelGrid}>
        {[1, 2, 3, 4, 5].map(lvl => (
          <div key={lvl} className={styles.levelCell}>
            <label className={styles.levelLabel}>BIL {lvl}</label>
            <textarea
              className={styles.levelInput}
              rows={4}
              placeholder={`Describe level ${lvl} business impact…`}
              value={bilDraft[lvl] || ''}
              onChange={e => setBilDraft(d => ({ ...d, [lvl]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {/* 3dBIL section — expert only */}
      {isExpert && (
        <>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>3dBIL — CIA implications per level</span>
            <span className={styles.sectionHint}>
              Describe the CIA implication at each BIL level. Leave blank if a dimension is not affected.
            </span>
            <button
              type="button"
              className={styles.adoptBtn}
              title="Copy each 1dBIL statement into all three CIA rows for that level"
              onClick={() => {
                const updates = {};
                for (let lvl = 1; lvl <= 5; lvl++) {
                  const stmt = bilDraft[lvl] || '';
                  for (const dim of ['c', 'i', 'a']) {
                    updates[`${lvl}_${dim}`] = stmt;
                  }
                }
                setCiaDraft(d => ({ ...d, ...updates }));
              }}
            >
              Fill from 1dBIL
            </button>
          </div>

          <div className={styles.ciaGrid}>
            <div className={styles.ciaGridHead}>
              <div className={styles.ciaGridDimCell} />
              {[1, 2, 3, 4, 5].map(lvl => (
                <div key={lvl} className={styles.ciaGridLevelCell}>BIL {lvl}</div>
              ))}
            </div>
            {['c', 'i', 'a'].map(dim => (
              <div key={dim} className={styles.ciaGridRow}>
                <div className={styles.ciaGridDimCell}>
                  <span className={styles.ciaGridDimLabel}>{dim.toUpperCase()}</span>
                  <span className={styles.ciaGridDimFull}>{DIM_LABELS[dim]}</span>
                </div>
                {[1, 2, 3, 4, 5].map(lvl => (
                  <div key={lvl} className={styles.ciaGridCell}>
                    <textarea
                      className={styles.ciaLevelInput}
                      rows={3}
                      placeholder={`${DIM_LABELS[dim]} at BIL ${lvl}…`}
                      value={ciaDraft[`${lvl}_${dim}`] || ''}
                      onChange={e => setCiaDraft(d => ({ ...d, [`${lvl}_${dim}`]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.saveBar}>
        {saved && <span className={styles.savedMsg}>Saved</span>}
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
