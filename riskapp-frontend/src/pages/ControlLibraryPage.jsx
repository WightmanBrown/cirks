// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getControls, importControls, getStandards } from '../api';
import { OBJECTIVE_STATUSES } from '../utils/objectiveStatus';
import { useAuth }            from '../context/AuthContext';
import { Shell }              from '../components/Shell';
import { AddControlModal }    from '../components/AddControlModal';
import { FrameworkRef, TypePill, StatusPill, EffectivenessDots, ApplicabilityBadge } from '../components/ControlBadges';
import styles                 from './ControlLibraryPage.module.css';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import { Th } from '../components/Th';
import { HelpDot } from '../components/HelpDot';

// Controls are native; the framework filter means "mapped to this standard". The
// chips come from the standards registry — any standard with mappings — so one
// loaded later can be filtered on. The short labels are kept for the familiar three.
const TYPES      = ['preventive', 'detective', 'corrective', 'deterrent'];

const FRAMEWORK_LABELS = {
  iso27001: 'ISO',
  cis_v8:   'CIS',
  nist_csf: 'NIST',
  custom:   'Custom',
};

export function ControlLibraryPage() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [controls,         setControls]         = useState([]);
  const [summary,          setSummary]          = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');
  // Filters live in the URL so the filtered list has a real address — drilling into
  // a control and coming back (or sharing the link) restores the same filtered view.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter    = searchParams.get('status')    || '';
  const frameworkFilter = searchParams.get('framework') || '';
  const typeFilter      = searchParams.get('type')      || '';
  const setFilterParam = useCallback((key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [showAddModal,     setShowAddModal]     = useState(false);
  const [importing,        setImporting]        = useState(false);
  const [importResult,     setImportResult]     = useState(null);

  const fetchControls = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters = {};
      if (statusFilter)    filters.status    = statusFilter;
      if (frameworkFilter) filters.framework = frameworkFilter;
      if (typeFilter)      filters.type      = typeFilter;
      const data = await getControls(filters);
      setControls(data.controls);
      setSummary(data.summary);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load controls.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, frameworkFilter, typeFilter]);

  useEffect(() => { fetchControls(); }, [fetchControls]);

  const [frameworks, setFrameworks] = useState([]);
  useEffect(() => {
    getStandards()
      .then(d => setFrameworks((d.standards || []).filter(s => (s.mapped_count ?? 0) > 0)))
      .catch(() => setFrameworks([]));
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportResult(null);
    setImporting(true);
    try {
      const result = await importControls(file);
      setImportResult({ ok: true, ...result });
      fetchControls();
    } catch (err) {
      setImportResult({
        ok: false,
        message: err.response?.data?.error || 'Import failed.',
        errors: err.response?.data?.errors || [],
      });
    } finally {
      setImporting(false);
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    fetchControls();
  }

  function toggleFramework(f) {
    setFilterParam('framework', frameworkFilter === f ? '' : f);
  }

  function toggleType(t) {
    setFilterParam('type', typeFilter === t ? '' : t);
  }

  // Derived statuses (v124) — the same words as every badge.
  const STATUS_TABS = [
    { value: '', label: 'All' },
    ...OBJECTIVE_STATUSES.map(s => ({ value: s.value, label: s.label })),
  ];

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Control Library<HelpDot k="controls.library" placement="bottom" label="About the control library" /></h1>
            <p className={styles.pageDesc}>
              The control objectives your organisation may adopt — the ideal set. Tick one applicable in the Statement of Applicability to adopt it, then build and rate the control that meets it.
            </p>
          </div>
          <div className={styles.headerActions}>
            {user?.role === 'admin' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  className={styles.importBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? '⟳ Importing…' : '↑ Import CSV'}
                </button>
              </>
            )}
            {['risk_analyst', 'ciso', 'admin'].includes(user?.role) && (
              <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
                + Add control objective
              </button>
            )}
            <button className={styles.refreshBtn} onClick={fetchControls} disabled={loading}>
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Import result banner */}
        {importResult && (
          <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} />
        )}

        {/* Stats */}
        {summary && (
          <div className={styles.statsRow}>
            <Stat label="Total"        value={summary.total}        color="var(--text-secondary)" />
            <Stat label="Adopted"        value={summary.adopted}        color="var(--green)" />
            <Stat label="Not assessed"   value={summary.not_assessed}   color="var(--amber)" />
            <Stat label="Not decided"    value={summary.not_decided}    color="var(--text-muted)" />
            <Stat label="Not applicable" value={summary.not_applicable} color="var(--text-muted)" />
          </div>
        )}

        {/* Status filter tabs */}
        <div className={styles.filterRow}>
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value || 'all'}
              className={`${styles.filterTab} ${statusFilter === value ? styles.filterActive : ''}`}
              onClick={() => setFilterParam('status', value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Secondary filters */}
        <div className={styles.chipRow}>
          <span className={styles.chipGroupLabel}>Source</span>
          {[...frameworks, { code: 'custom', name: 'Custom — your own, mapped to no standard' }].map(({ code, name }) => (
            <button
              key={code}
              className={`${styles.chip} ${frameworkFilter === code ? styles.chipActive : ''}`}
              onClick={() => toggleFramework(code)}
              title={name}
            >
              {FRAMEWORK_LABELS[code] ?? name}
            </button>
          ))}
          <span className={styles.chipDivider} />
          <span className={styles.chipGroupLabel}>Type</span>
          {TYPES.map((t) => (
            <button
              key={t}
              className={`${styles.chip} ${typeFilter === t ? styles.chipActive : ''}`}
              onClick={() => toggleType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            ⚠ {error}
            <button onClick={fetchControls} className={styles.retryBtn}>Retry</button>
          </div>
        )}

        {/* Table */}
        {!error && (
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyState}>
                <Spinner />
                <span>Loading control objectives…</span>
              </div>
            ) : controls.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✓</span>
                <span>No control objectives match this filter.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <Th>Ref</Th>
                    <Th>Title</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Effectiveness<HelpDot k="controls.effectiveness" placement="top" label="About control effectiveness" /></Th>
                    <Th>Applicability</Th>
                  </tr>
                </thead>
                <tbody>
                  {controls.map((control) => (
                    <ControlRow key={control.id} control={control} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddControlModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}
    </Shell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ImportResultBanner({ result, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  if (result.ok) {
    return (
      <div className={styles.importSuccess}>
        <span>
          Imported <strong>{result.imported}</strong> control objective{result.imported !== 1 ? 's' : ''}.
          {result.skipped > 0 && ` ${result.skipped} already existed and were skipped.`}
          {result.errors.length > 0 && ` ${result.errors.length} row${result.errors.length !== 1 ? 's' : ''} had errors.`}
        </span>
        {result.errors.length > 0 && (
          <button className={styles.expandBtn} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide errors' : 'Show errors'}
          </button>
        )}
        <button className={styles.dismissBtn} onClick={onDismiss}>✕</button>
        {expanded && (
          <div className={styles.importErrors}>
            {result.errors.map((e, i) => (
              <div key={i} className={styles.importErrorRow}>
                <span className={styles.importErrorRow}>Row {e.row}:</span> {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.importFailure}>
      <span>{result.message}</span>
      <button className={styles.dismissBtn} onClick={onDismiss}>✕</button>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue} style={{ color }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function ControlRow({ control }) {
  const navigate = useNavigate();
  function handleClick() { navigate(`/controls/${control.id}`); }

  return (
    <tr
      className={styles.row}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <td className={styles.td}>
        <FrameworkRef framework={control.framework} frameworkRef={control.framework_ref} label={control.framework_label} />
      </td>
      <td className={`${styles.td} ${styles.tdTitle}`}>
        {control.title}
      </td>
      <td className={styles.td}>
        <TypePill type={control.control_type} />
      </td>
      <td className={styles.td}>
        <StatusPill status={control.status} />
      </td>
      <td className={styles.td}>
        <EffectivenessDots value={control.effectiveness} />
      </td>
      <td className={styles.td}>
        <ApplicabilityBadge isBaseline={control.is_baseline} />
      </td>
    </tr>
  );
}

