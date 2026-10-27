// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { createControl } from '../api';
import styles from './AddControlModal.module.css';
import { Modal } from './Modal';
import { HelpDot } from './HelpDot';

// A control is CIRKS-native and belongs to no single standard (v87). This form
// used to offer a framework, reference and function; the server has ignored all
// three since v87. A control reaches a standard through its mappings instead
// (Setup → Objectives & standards → Import mappings).
const CONTROL_TYPES = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'detective',  label: 'Detective' },
  { value: 'corrective', label: 'Corrective' },
  { value: 'deterrent',  label: 'Deterrent' },
];

export function AddControlModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title:              '',
    reference_code:     '',
    description:        '',
    control_type:       '',
    is_baseline:        false,
  });
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.control_type) {
      setError('Control type is required.');
      return;
    }

    setBusy(true);
    try {
      const body = {
        title:        form.title.trim(),
        control_type: form.control_type,
        is_baseline:  form.is_baseline,
      };
      if (form.description.trim())    body.description    = form.description.trim();
      if (form.reference_code.trim()) body.reference_code = form.reference_code.trim();

      const { control } = await createControl(body);
      onSuccess(control);
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.error || 'Failed to create control.';
      setError(status === 409 ? msg : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Add control objective" onClose={onClose} busy={busy}>
      <div className={styles.modal}>

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.modalLabel}>ADD CONTROL OBJECTIVE</span>
            <h2 className={styles.modalTitle}>New catalogue entry <HelpDot k="add_control.title" placement="bottom" /></h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ac-title">
              Title <span className={styles.required}>*</span>
            </label>
            <input
              id="ac-title"
              className={styles.input}
              type="text"
              placeholder="The job to be done, e.g. Administrative access requires multi-factor authentication"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          {/* Reference — the objective's own, used when it is mapped to no standard */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ac-ref">
              Reference <span className={styles.hint}> (optional — your own, e.g. ORG-AC-01)</span>
            </label>
            <input
              id="ac-ref"
              className={styles.input}
              type="text"
              maxLength={100}
              placeholder="e.g. ORG-AC-01"
              value={form.reference_code}
              onChange={(e) => set('reference_code', e.target.value)}
              disabled={busy}
            />
          </div>

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ac-description">Description</label>
            <textarea
              id="ac-description"
              className={styles.textarea}
              placeholder="What does this objective ask for, and why?"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              disabled={busy}
            />
          </div>

          {/* Type */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ac-type">
                Control Type <span className={styles.required}>*</span>
              </label>
              <select
                id="ac-type"
                className={styles.select}
                value={form.control_type}
                onChange={(e) => set('control_type', e.target.value)}
                disabled={busy}
              >
                <option value="">— select —</option>
                {CONTROL_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Applicability */}
          <div className={styles.field}>
            <span className={styles.label}>Applicability</span>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="applicability"
                  value="specific"
                  checked={!form.is_baseline}
                  onChange={() => set('is_baseline', false)}
                  disabled={busy}
                />
                <span>Specific</span>
                <span className={styles.radioHint}>Risk-specific supplementary control</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="applicability"
                  value="baseline"
                  checked={form.is_baseline}
                  onChange={() => set('is_baseline', true)}
                  disabled={busy}
                />
                <span>Baseline</span>
                <span className={styles.radioHint}>Mandatory minimum — applies to all systems</span>
              </label>
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={busy}>
              {busy ? 'Saving…' : 'Add to catalogue'}
            </button>
          </div>

        </form>
      </div>
    </Modal>
  );
}
