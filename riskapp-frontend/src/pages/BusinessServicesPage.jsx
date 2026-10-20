// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBusinessServices, getBusinessService, createBusinessService, deleteBusinessService } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { AssignedPerson } from '../components/AssignedPerson';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { CiaBadge } from '../components/CiaBadge';
import { RatingChip } from '../components/RatingChip';
import { SortableTh } from '../components/SortableTh';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { ServiceSummaryCard } from '../components/ServiceSummaryCard';
import { useSelectedRow } from '../hooks/useSelectedRow';
import { useTableSort } from '../hooks/useTableSort';
import { byMaxRiskThenMeanEffectiveCiaThenName } from '../utils/serviceSort';
import { scoreLevel } from '../utils/riskColors';
import { maxCia } from '../utils/cia';
import { useViewMode } from '../hooks/useViewMode';
import { HelpDot } from '../components/HelpDot';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import { CROSS_DEPT_ROLES } from '../utils/departmentScope';
import styles from './BusinessServicesPage.module.css';

// Adoption is a services-only concept — a department using another department's
// service — and is orthogonal to which department OWNS it. Conflating the two is
// exactly what broke the old "My Dept" button, so it stays a separate facet.
const ADOPTED_FACET = [{ key: 'adopted', label: 'Adopted', test: s => Boolean(s.adopted) }];

// Column key → value accessor, for interactive header sorting (see useTableSort).
const SERVICE_ACCESSORS = {
  name:   (s) => s.name,
  dept:   (s) => s.department_name,
  iao:    (s) => s.iao_name,
  iam:    (s) => s.iam_name,
  c:      (s) => s.effective_c,
  i:      (s) => s.effective_i,
  a:      (s) => s.effective_a,
  impact: (s) => maxCia(s.effective_c, s.effective_i, s.effective_a),
  risk:   (s) => s.max_risk_score,
};

const RISK_CLASS = { critical: styles.riskCritical, high: styles.riskHigh, medium: styles.riskMedium, low: styles.riskLow };
function RiskPill({ level }) {
  if (!level) return <span className={styles.riskNone}>—</span>;
  return <span className={`${styles.riskPill} ${RISK_CLASS[level] ?? ''}`}>{level}</span>;
}

function AddServiceModal({ onClose, onCreated }) {
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [isShared, setIsShared]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const svc = await createBusinessService({ name: name.trim(), description: description.trim() || undefined, is_shared: isShared });
      onCreated(svc);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create service');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2>New Business Service</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </label>
          <label>
            Description
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} />
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
            Shared service (visible to other departments for adoption)
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={styles.btnPrimary}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BusinessServicesPage() {
  const { user, hasCapability } = useAuth();
  const navigate = useNavigate();
  const [services, setServices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [detailCache, setDetailCache] = useState({});

  const { selectedId, toggleSelect, summaryRowRef } = useSelectedRow(loading);

  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const canEdit    = ['ciso', 'risk_analyst', 'admin', 'security_consultant', 'information_asset_manager'].includes(user?.role);

  // Deleting is NOT canEdit: an IAM may edit services but does not hold
  // services.delete. Mirrors the API exactly (routes/services/index.js) — the
  // capability, PLUS the owning-department rule the route applies on top of it —
  // so a checkbox never offers something the server will refuse.
  const canDeleteAny = hasCapability('services.delete');
  const canDeleteService = useCallback((svc) => {
    if (!canDeleteAny) return false;
    if (['admin', 'security_consultant'].includes(user?.role)) return true;
    return !!user?.department_id
      && user.department_id === (svc.owner_department_id || svc.department_id);
  }, [canDeleteAny, user?.role, user?.department_id]);

  // Pruning a register means deleting many, so selection is multi: one review
  // point for thirty deletions rather than thirty confirmations, which nobody
  // reads by the fifth.
  const [selectedForDelete, setSelectedForDelete] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const toggleForDelete = useCallback((id) => {
    setSelectedForDelete(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  async function handleBulkDelete(rows) {
    const names = rows.map(r => r.name);
    const preview = names.slice(0, 8).join('\n  • ');
    const more = names.length > 8 ? `\n  …and ${names.length - 8} more` : '';
    if (!window.confirm(
      `Delete ${rows.length} service${rows.length === 1 ? '' : 's'}? This cannot be undone.\n\n  • ${preview}${more}\n\n` +
      `Their system links go too; the systems themselves are not deleted.`
    )) return;

    setDeleting(true);
    setDeleteError('');
    const failed = [];
    // Sequential, not Promise.all: thirty parallel deletes give thirty
    // simultaneous errors and no way to tell which row each belonged to.
    for (const row of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop -- deliberate, see above
        await deleteBusinessService(row.id);
        setSelectedForDelete(sel => { const n = new Set(sel); n.delete(row.id); return n; });
      } catch (err) {
        failed.push(`${row.name} (${err?.response?.data?.error || 'failed'})`);
      }
    }
    setDeleting(false);
    // Say what did NOT happen. A silent partial success is how a register ends
    // up disagreeing with what someone believes they deleted.
    if (failed.length) {
      setDeleteError(`${failed.length} of ${rows.length} could not be deleted: ${failed.join('; ')}`);
    }
    await load();
  }
  const isCrossDept = CROSS_DEPT_ROLES.has(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBusinessServices();
      setServices(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lazy-fetch detail (linked information assets, impact tables) when a row
  // is expanded — same pattern as systems.
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return;
    let cancelled = false;
    getBusinessService(selectedId)
      .then(d => {
        if (!cancelled) setDetailCache(prev => ({ ...prev, [selectedId]: d }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, detailCache]);

  const scopeCtl = useDepartmentScope({
    rows: services,
    userDeptId: user?.department_id,
    facets: ADOPTED_FACET,
    defaultToOwnDept: !isCrossDept,
  });

  const filtered = scopeCtl.filtered;

  const { sorted, sortKey, sortDir, toggleSort, clearSort } =
    useTableSort(filtered, { accessors: SERVICE_ACCESSORS, defaultCompare: byMaxRiskThenMeanEffectiveCiaThenName });

  // Only what this user could actually delete — select-all must not stage
  // rows the server will refuse.
  const deletableRows = sorted.filter(canDeleteService);
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  // C/I/A columns are hidden in business mode — drop such a sort back to default.
  useEffect(() => {
    if (!isExpert && ['c', 'i', 'a'].includes(sortKey)) clearSort();
  }, [isExpert, sortKey, clearSort]);

  function handleCreated(svc) {
    setShowAdd(false);
    navigate(`/services/${svc.id}`);
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1>Business Services<HelpDot k="pages.business_services" placement="bottom" label="About business services" /> {!canEdit && <ReadOnlyBadge reason="Your role has view-only access to business services." />}</h1>
            <p className={styles.subtitle}>
              {services.length} service{services.length !== 1 ? 's' : ''}
              {/* Counts services whose information assets carry no impact rating,
                  so the service has no derived impact. Previously this counted a
                  stored impact-table link that fed no score and was auto-attached
                  to every service, so it flagged work that changed nothing. */}
              {services.filter(s => !s.has_impact_tables).length > 0 &&
                <span className={styles.warning}>
                  {' '}· {services.filter(s => !s.has_impact_tables).length} with unrated assets
                </span>
              }
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => navigate('/services/shared')}>
              Shared Services Directory
            </button>
            {canEdit && (
              <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
                + New Service
              </button>
            )}
          </div>
        </div>

        <div className={styles.filters}>
          <DepartmentScopeFilter {...scopeCtl} />
          <div className={styles.viewModeSlot}>
            <ViewModeToggle {...viewMode} />
          </div>
        </div>

        {loading && <p className={styles.loading}>Loading…</p>}
        {error   && <p className={styles.error}>{error}</p>}

        {!loading && !error && sorted.length === 0 && (
          <div className={styles.empty}>
            <p>No services found.</p>
            {canEdit && scopeCtl.scope !== 'adopted' && (
              <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
                Create your first service
              </button>
            )}
          </div>
        )}

        {deleteError && <div className={styles.deleteError} role="alert">{deleteError}</div>}

        {selectedForDelete.size > 0 && (
          <div className={styles.selectionBar}>
            <span>
              <strong>{selectedForDelete.size}</strong> selected
            </span>
            <button type="button" className={styles.btnDangerSm}
                    disabled={deleting}
                    onClick={() => handleBulkDelete(sorted.filter(r => selectedForDelete.has(r.id)))}>
              {deleting ? 'Deleting…' : `Delete ${selectedForDelete.size} service${selectedForDelete.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" className={styles.btnPlain} disabled={deleting}
                    onClick={() => setSelectedForDelete(new Set())}>
              Clear selection
            </button>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                {canDeleteAny && (
                  <th className={styles.selectCell}>
                    {/* Select-all covers only rows this user may actually delete, so it
                        can never stage something the server will refuse. */}
                    <input
                      type="checkbox"
                      aria-label="Select all deletable services"
                      checked={deletableRows.length > 0 && selectedForDelete.size === deletableRows.length}
                      ref={el => { if (el) el.indeterminate = selectedForDelete.size > 0 && selectedForDelete.size < deletableRows.length; }}
                      onChange={e => setSelectedForDelete(e.target.checked ? new Set(deletableRows.map(r => r.id)) : new Set())}
                    />
                  </th>
                )}
                <SortableTh column="name" {...sortProps}>Service</SortableTh>
                <SortableTh column="dept" {...sortProps}>Department</SortableTh>
                <SortableTh column="iao" {...sortProps}>Owner (IAO)</SortableTh>
                <SortableTh column="iam" {...sortProps}>Manager (IAM)</SortableTh>
                {isExpert
                  ? <>
                      <SortableTh column="c" {...sortProps}>C</SortableTh>
                      <SortableTh column="i" {...sortProps}>I</SortableTh>
                      <SortableTh column="a" {...sortProps}>A</SortableTh>
                    </>
                  : <SortableTh column="impact" {...sortProps}>Impact</SortableTh>}
                <SortableTh column="risk" {...sortProps}>Risk</SortableTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map(svc => {
                const isSelected = selectedId === svc.id;
                const colCount   = (isExpert ? 8 : 6) + (canDeleteAny ? 1 : 0);
                return (
                  <React.Fragment key={svc.id}>
                    <tr
                      onClick={() => toggleSelect(svc.id)}
                      className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                    >
                      {canDeleteAny && (
                        <td className={styles.selectCell} onClick={e => e.stopPropagation()}>
                          {canDeleteService(svc) ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${svc.name} for deletion`}
                              checked={selectedForDelete.has(svc.id)}
                              onChange={() => toggleForDelete(svc.id)}
                            />
                          ) : (
                            // Not blank: the column would look broken rather than
                            // deliberately unavailable.
                            <span className={styles.selectNa} title="Only the owning department can delete this service">—</span>
                          )}
                        </td>
                      )}
                      <td className={styles.nameCell}>
                        {svc.name}
                        {svc.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
                        {svc.adopted  && <span className={styles.adoptedBadge}>ADOPTED</span>}
                      </td>
                      <td className={styles.deptCell}>{svc.department_name || '—'}</td>
                      <td className={styles.deptCell}>{svc.iao_name || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.deptCell}><AssignedPerson name={svc.managed_by_name} personDepartment={svc.manager_department_name} ownerDepartment={svc.department_name} /></td>
                      {isExpert ? (
                        <>
                          <td><CiaBadge value={svc.effective_c} /></td>
                          <td><CiaBadge value={svc.effective_i} /></td>
                          <td><CiaBadge value={svc.effective_a} /></td>
                        </>
                      ) : (
                        <td><RatingChip value={maxCia(svc.effective_c, svc.effective_i, svc.effective_a)} scale="impact" variant="word" /></td>
                      )}
                      <td><RiskPill level={svc.max_risk_score != null ? scoreLevel(svc.max_risk_score) : null} /></td>
                    </tr>
                    {isSelected && (
                      <tr className={styles.summaryRow} ref={summaryRowRef}>
                        <td colSpan={colCount} className={styles.summaryCell}>
                          <ServiceSummaryCard
                            service={{ ...svc, ...(detailCache[svc.id] || {}) }}
                            openHref={`/services/${svc.id}`}
                            isExpert={isExpert}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {showAdd && <AddServiceModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      </div>
    </Shell>
  );
}
