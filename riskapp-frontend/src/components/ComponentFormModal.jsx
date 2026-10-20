// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useRef } from 'react';
import { createControlComponent, updateControlComponent, searchComponents } from '../api';
import { getComponentColor } from '../utils/componentColors';
import styles from './ComponentFormModal.module.css';
import { Modal } from './Modal';
import { componentTypeLabel, componentTypeShort, componentStatusOptions } from '../utils/componentTypes';

const TYPES    = ['people', 'process', 'information', 'technology', 'facility'];

const STATUS_COLORS = {
  operational:    '#34d399',
  degraded:       '#f59e0b',
  planned:        '#94a3b8',
  decommissioned: '#ef4444',
  unknown:        '#475569',
};

export function ComponentFormModal({ controlId, component, onClose, onSaved }) {
  const isEdit = Boolean(component);

  // ── Search state (create mode only) ────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [linkingId,     setLinkingId]     = useState(null);
  const [linkRole,      setLinkRole]      = useState('');
  const searchTimer = useRef(null);

  // ── Create/edit form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    name:           component?.name           ?? '',
    component_type: component?.component_type ?? 'technology',
    status:         component?.status         ?? 'unknown',
    description:    component?.description    ?? '',
    notes:          component?.notes          ?? '',
    role:           component?.role           ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // ── Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isEdit) return;
    clearTimeout(searchTimer.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { components } = await searchComponents(searchQuery.trim());
        setSearchResults(components);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, isEdit]);

  async function handleLink(existingComponent) {
    setLinkingId(existingComponent.id);
    setError('');
    try {
      const result = await createControlComponent(controlId, {
        existing_component_id: existingComponent.id,
        role: linkRole.trim() || undefined,
      });
      onSaved(result.component);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to link component.');
      setLinkingId(null);
    }
  }

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name:        form.name.trim(),
        status:      form.status,
        description: form.description.trim() || undefined,
        notes:       form.notes.trim()       || undefined,
        role:        form.role.trim()        || undefined,
        ...(!isEdit && { component_type: form.component_type }),
      };
      const result = isEdit
        ? await updateControlComponent(controlId, component.id, body)
        : await createControlComponent(controlId, body);
      onSaved(result.component);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
      setSaving(false);
    }
  }

  return (
    <Modal label={isEdit ? 'Edit component' : 'Add component'} onClose={onClose} busy={saving}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEdit ? 'Edit Component' : 'Add Component'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Search (create mode only) ── */}
        {!isEdit && (
          <div className={styles.searchSection}>
            <div className={styles.searchRow}>
              <span className={styles.searchIcon}>⌕</span>
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search existing components…"
                autoFocus
              />
              {searching && <span className={styles.searchSpinner} />}
            </div>

            {searchResults.length > 0 && (
              <>
                <div className={styles.resultsList}>
                  {searchResults.map((c) => (
                    <div key={c.id} className={styles.resultRow}>
                      <div className={styles.resultMeta}>
                        <span
                          className={styles.typeBadge}
                          style={{
                            background: getComponentColor(c.component_type).bg,
                            color:      getComponentColor(c.component_type).text,
                          }}
                        >
                          {componentTypeShort(c.component_type)}
                        </span>
                        <span className={styles.resultName}>{c.name}</span>
                        <span
                          className={styles.statusDot}
                          style={{ background: STATUS_COLORS[c.status] ?? '#475569' }}
                          title={c.status}
                        />
                      </div>
                      {c.description && (
                        <p className={styles.resultDesc}>{c.description}</p>
                      )}
                      <button
                        className={styles.linkBtn}
                        onClick={() => handleLink(c)}
                        disabled={linkingId === c.id}
                      >
                        {linkingId === c.id ? '…' : 'Link'}
                      </button>
                    </div>
                  ))}
                </div>

                <label className={styles.linkRoleLabel}>
                  Role in this control (applies to the linked component)
                  <input
                    className={styles.input}
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value)}
                    placeholder="e.g. platform, scanner (optional)"
                  />
                </label>
              </>
            )}

            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <p className={styles.noResults}>No existing components match — create one below.</p>
            )}

            <div className={styles.divider}>
              <span>or create new</span>
            </div>
          </div>
        )}

        {/* ── Create / edit form ── */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. CrowdStrike Falcon Sensor"
              required
              autoFocus={isEdit}
            />
          </label>

          {!isEdit && (
            <label className={styles.label}>
              Type
              <select className={styles.select} value={form.component_type} onChange={set('component_type')}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{componentTypeLabel(t)}</option>
                ))}
              </select>
            </label>
          )}

          <label className={styles.label}>
            Status
            <select className={styles.select} value={form.status} onChange={set('status')}>
              {componentStatusOptions(form.component_type).map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Role in this control
            <input
              className={styles.input}
              value={form.role}
              onChange={set('role')}
              placeholder="e.g. platform, enforcer (optional)"
            />
          </label>

          <label className={styles.label}>
            Description
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={set('description')}
              rows={3}
              placeholder="Optional"
            />
          </label>

          <label className={styles.label}>
            Notes
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Operational notes, caveats, etc. (optional)"
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create & Add'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
