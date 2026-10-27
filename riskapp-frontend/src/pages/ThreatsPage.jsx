// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react';
import { useAuth }                        from '../context/AuthContext';
import { useSearchParams }                from 'react-router-dom';
import { getThreats, getThreat, createThreat, updateThreat, archiveThreat } from '../api';
import { Shell }                          from '../components/Shell';
import { ThreatSummaryCard }              from '../components/ThreatSummaryCard';
import { RatingChip }                     from '../components/RatingChip';
import { useViewMode }                    from '../hooks/useViewMode';
import styles from './ThreatsPage.module.css';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';

const CAN_WRITE = new Set(['ciso', 'risk_analyst', 'security_consultant', 'admin']);

const CATEGORIES = [
  { value: 'accidental',    label: 'Accidental' },
  { value: 'deliberate',    label: 'Deliberate' },
  { value: 'environmental', label: 'Environmental' },
];

const SOURCES = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'natural',  label: 'Natural' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

function emptyForm() {
  return {
    name: '',
    description: '',
    threat_category: 'deliberate',
    source: 'external',
    reference_code: '',
    probability_c: 3,
    probability_i: 3,
    probability_a: 3,
    default_baseline_probability: '',
    probability_notes: '',
  };
}

// ── Threat form modal (used for both create and edit) ───────────────────────

function ProbModeToggle({ mode, onChange }) {
  return (
    <span className={styles.probModeToggle}>
      <button type="button"
        className={`${styles.probModeBtn} ${mode === '1d' ? styles.probModeBtnActive : ''}`}
        onClick={() => onChange('1d')}>1d</button>
      <button type="button"
        className={`${styles.probModeBtn} ${mode === '3d' ? styles.probModeBtnActive : ''}`}
        onClick={() => onChange('3d')}>3d</button>
    </span>
  );
}

function ThreatFormModal({ initial, onClose, onSaved, canWrite, threatId }) {
  const isEdit = !!threatId;
  const [form, setForm]       = useState(initial);
  const [saving, setSaving]   = useState(false);
  const [archiving, setArch]  = useState(false);
  const [error, setError]     = useState('');
  const [detail, setDetail]   = useState(null);  // full read for edit mode
  const [probMode, setProbMode] = useState('1d');

  useEffect(() => {
    if (!isEdit) return;
    getThreat(threatId).then(d => {
      setDetail(d);
      setForm({
        name: d.name || '',
        description: d.description || '',
        threat_category: d.threat_category,
        source: d.source,
        reference_code: d.reference_code || '',
        probability_c: d.probability_c,
        probability_i: d.probability_i,
        probability_a: d.probability_a,
        default_baseline_probability: d.default_baseline_probability ?? '',
        probability_notes: d.probability_notes || '',
      });
    }).catch(err => setError(err.response?.data?.error || 'Could not load threat.'));
  }, [isEdit, threatId]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        ...form,
        default_baseline_probability:
          form.default_baseline_probability === '' ? null : parseInt(form.default_baseline_probability),
      };
      if (isEdit) {
        await updateThreat(threatId, body);
      } else {
        await createThreat(body);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm(`Archive "${form.name}"? It will no longer appear in the catalogue.`)) return;
    setArch(true); setError('');
    try {
      await archiveThreat(threatId);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Archive failed.');
      setArch(false);
    }
  }

  const usage = detail?.usage_count ?? 0;
  const disabled = saving || archiving || !canWrite;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalLabel}>
            {isEdit ? 'EDIT THREAT' : 'NEW THREAT'}
            {isEdit ? <> <HelpDot k="threats.form_edit" placement="bottom" /></> : <> <HelpDot k="threats.form_new" placement="bottom" /></>}
          </span>
          <button className={styles.closeBtn} onClick={onClose} disabled={saving || archiving}>✕</button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Name <span className={styles.req}>*</span></label>
            <input className={styles.input}
              value={form.name} onChange={e => set('name', e.target.value)}
              disabled={disabled} autoFocus={!isEdit}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Description</label>
            <textarea className={styles.textarea} rows={3}
              value={form.description} onChange={e => set('description', e.target.value)}
              disabled={disabled} placeholder="What is the threat and how does it typically manifest?"
            />
          </div>

          <div className={styles.row2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Category <span className={styles.req}>*</span></label>
              <select className={styles.select}
                value={form.threat_category} onChange={e => set('threat_category', e.target.value)}
                disabled={disabled}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Source <span className={styles.req}>*</span></label>
              <select className={styles.select}
                value={form.source} onChange={e => set('source', e.target.value)}
                disabled={disabled}
              >
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              Reference code
              <span className={styles.fieldHint}> (e.g. ISO 27005 ref, internal code)</span>
            </label>
            <input className={styles.input}
              value={form.reference_code} onChange={e => set('reference_code', e.target.value)}
              disabled={disabled} placeholder="ISO27005-T1.1"
            />
          </div>

          <fieldset className={styles.fieldset}>
            <legend
              className={styles.legend}
              title="Probability hints are informed guesses intended to help at the point where risks are authored by pre-populating the risk probability levels."
            >
              <span className={styles.legendInner}>
                Probability hint <span className={styles.fieldHint}>ⓘ</span>
                <ProbModeToggle mode={probMode} onChange={setProbMode} />
              </span>
            </legend>
            <p className={styles.fieldHint}>
              Informed guess at this threat's typical probability. Used only to pre-populate the risk authoring modal — actual probability lives on each risk and is set by the analyst per (system, threat).
            </p>
            {probMode === '1d' ? (
              <div className={styles.probCell1d}>
                <input type="range" min="1" max="5" step="1"
                  className={styles.probSlider}
                  value={Math.max(form.probability_c, form.probability_i, form.probability_a)}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    set('probability_c', v); set('probability_i', v); set('probability_a', v);
                  }}
                  disabled={disabled}
                />
                <span className={styles.probVal}>
                  {Math.max(form.probability_c, form.probability_i, form.probability_a)}
                </span>
              </div>
            ) : (
              <div className={styles.probRow}>
                {['c','i','a'].map(dim => {
                  const key = `probability_${dim}`;
                  const label = dim === 'c' ? 'Conf' : dim === 'i' ? 'Integ' : 'Avail';
                  return (
                    <div key={dim} className={styles.probCell}>
                      <span className={styles.probDim}>{label}</span>
                      <input type="range" min="1" max="5" step="1"
                        className={styles.probSlider}
                        value={form[key]}
                        onChange={e => set(key, parseInt(e.target.value))}
                        disabled={disabled}
                      />
                      <span className={styles.probVal}>{form[key]}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className={styles.row2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Default baseline probability
                <span className={styles.fieldHint}> (optional, 1–5)</span>
              </label>
              <input className={styles.input} type="number" min="1" max="5"
                value={form.default_baseline_probability}
                onChange={e => set('default_baseline_probability', e.target.value)}
                disabled={disabled} placeholder="—"
              />
            </div>
            <div className={styles.fieldGroup} />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Probability notes</label>
            <textarea className={styles.textarea} rows={2}
              value={form.probability_notes} onChange={e => set('probability_notes', e.target.value)}
              disabled={disabled} placeholder="Why these baselines? Any data source?"
            />
          </div>

          {isEdit && detail && (
            <div className={styles.metaBox}>
              {detail.probability_set_at && (
                <p className={styles.metaLine}>
                  Probabilities last set {new Date(detail.probability_set_at).toLocaleString('en-GB')}
                  {detail.probability_set_by_name ? ` by ${detail.probability_set_by_name}` : ''}.
                </p>
              )}
              <p className={styles.metaLine}>
                Used by <strong>{usage}</strong> active risk{usage !== 1 ? 's' : ''}.
                {usage > 0 && ' Archive blocked until those risks are archived.'}
              </p>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            {isEdit && canWrite && (
              <button type="button"
                className={styles.btnArchive}
                onClick={handleArchive}
                disabled={disabled || usage > 0}
                title={usage > 0 ? `Archive blocked: ${usage} risk(s) reference this threat` : ''}
              >
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            )}
            <div className={styles.actionsRight}>
              <button type="button" className={styles.btnCancel} onClick={onClose} disabled={saving || archiving}>
                Cancel
              </button>
              {canWrite && (
                <button type="submit" className={styles.btnSubmit} disabled={disabled}>
                  {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create Threat')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function ThreatsPage() {
  const { user } = useAuth();
  const canWrite = CAN_WRITE.has(user?.role);

  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected');
  const summaryRowRef = useRef(null);

  const [threats,        setThreats]       = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [error,          setError]         = useState('');
  const [search,         setSearch]        = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [creating,       setCreating]      = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);

  function toggleSelect(id) {
    if (selectedId === id) {
      setSelectedDetail(null);
      searchParams.delete('selected');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSelectedDetail(null);
      searchParams.set('selected', id);
      setSearchParams(searchParams, { replace: true });
    }
  }

  useEffect(() => {
    if (!selectedId || loading) return;
    if (summaryRowRef.current) {
      summaryRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    getThreat(selectedId).then(setSelectedDetail).catch(() => {});
  }, [selectedId, loading]);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getThreats()
      .then(setThreats)
      .catch(err => setError(err.response?.data?.error || 'Could not load threats.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = threats;
    if (categoryFilter) list = list.filter(t => t.threat_category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.reference_code || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [threats, search, categoryFilter]);

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Threat Catalogue <HelpDot k="threats.title" placement="bottom" /></h1>
            {!loading && (
              <span className={styles.subtitle}>
                {filtered.length} threat{filtered.length !== 1 ? 's' : ''}
                {(search || categoryFilter) && threats.length !== filtered.length && ` (of ${threats.length})`}
              </span>
            )}
          </div>
          {canWrite && (
            <button className={styles.btnPrimary} onClick={() => setCreating(true)}>
              + New Threat
            </button>
          )}
        </div>

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            placeholder="Search by name, description, reference code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className={styles.categoryChips}>
            <button
              className={`${styles.chip} ${categoryFilter === '' ? styles.chipActive : ''}`}
              onClick={() => setCategoryFilter('')}
            >All</button>
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                className={`${styles.chip} ${categoryFilter === c.value ? styles.chipActive : ''}`}
                onClick={() => setCategoryFilter(c.value)}
              >{c.label}</button>
            ))}
          </div>
        </div>

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && (
          filtered.length === 0
            ? <p className={styles.empty}>No threats match.</p>
            : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Name <HelpDot k="threats.col.name" placement="bottom" /></th>
                      <th className={styles.th}>Category <HelpDot k="threats.col.category" placement="bottom" /></th>
                      <th className={styles.th}>Source <HelpDot k="threats.col.source" placement="bottom" /></th>
                      <th className={styles.th}>Ref code <HelpDot k="threats.col.ref_code" placement="bottom" /></th>
                      <th className={styles.th} title="Probability hint">Probability <HelpDot k="threats.col.probability" placement="bottom" /></th>
                      <th className={styles.th}>Active risks <HelpDot k="threats.col.active_risks" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => {
                      const isSelected = selectedId === t.id;
                      const prob1d = Math.max(t.probability_c, t.probability_i, t.probability_a);
                      return (
                        <Fragment key={t.id}>
                          <tr
                            className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                            onClick={() => toggleSelect(t.id)}
                          >
                            <td className={styles.tdName}>
                              <span className={styles.threatName}>{t.name}</span>
                              {t.description && (
                                <span className={styles.threatDesc}>{t.description}</span>
                              )}
                            </td>
                            <td className={styles.tdMeta}>
                              <span className={`${styles.catBadge} ${styles[`cat_${t.threat_category}`] || ''}`}>
                                {CATEGORY_LABEL[t.threat_category] || t.threat_category}
                              </span>
                            </td>
                            <td className={styles.tdMeta}>
                              <span className={styles.sourceChip}>{t.source}</span>
                            </td>
                            <td className={styles.tdCode}>
                              {t.reference_code
                                ? <span className={styles.refCode}>{t.reference_code}</span>
                                : <span className={styles.muted}>—</span>}
                            </td>
                            <td className={styles.tdProb}>
                              {isExpert ? (
                                <div className={styles.probGroup}>
                                  <RatingChip value={t.probability_c} scale="probability" variant="number" />
                                  <RatingChip value={t.probability_i} scale="probability" variant="number" />
                                  <RatingChip value={t.probability_a} scale="probability" variant="number" />
                                </div>
                              ) : (
                                <RatingChip value={prob1d} scale="probability" />
                              )}
                            </td>
                            <td className={styles.tdUsage}>
                              <span className={styles.usageBadge}>
                                {t.usage_count} risk{t.usage_count !== 1 ? 's' : ''}
                              </span>
                            </td>
                          </tr>
                          {isSelected && (
                            <tr className={styles.summaryRow} ref={summaryRowRef}>
                              <td colSpan={6} className={styles.summaryCell}>
                                <ThreatSummaryCard
                                  threat={selectedDetail || t}
                                  openHref={`/threats/${t.id}`}
                                  isExpert={isExpert}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        )}

        {creating && (
          <ThreatFormModal
            initial={emptyForm()}
            canWrite={canWrite}
            onClose={() => setCreating(false)}
            onSaved={() => { setCreating(false); load(); }}
          />
        )}
      </div>
    </Shell>
  );
}
