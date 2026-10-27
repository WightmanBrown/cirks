// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSystems, getSystem } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { AssignedPerson } from '../components/AssignedPerson';
import { BackButton } from '../components/BackButton';
import { CiaBadge } from '../components/CiaBadge';
import { RatingChip } from '../components/RatingChip';
import { SortableTh } from '../components/SortableTh';
import { HelpDot } from '../components/HelpDot';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { SystemSummaryCard } from '../components/SystemSummaryCard';
import { byMaxRiskDescThenName } from '../utils/systemSort';
import { scoreLevel } from '../utils/riskColors';
import { maxCia } from '../utils/cia';
import { useViewMode } from '../hooks/useViewMode';
import { useTableSort } from '../hooks/useTableSort';
import { useSelectedRow } from '../hooks/useSelectedRow';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import styles from './SystemsPage.module.css';

// Column key → value accessor, for interactive header sorting (see useTableSort).
const SYSTEM_ACCESSORS = {
  name:   (s) => s.name,
  dept:   (s) => s.department_name,
  iao:    (s) => s.owner_name,
  iam:    (s) => s.managed_by_name,
  c:      (s) => s.impact_c,
  i:      (s) => s.impact_i,
  a:      (s) => s.impact_a,
  impact: (s) => maxCia(s.impact_c, s.impact_i, s.impact_a),
  risk:   (s) => s.max_risk_score,
};

const CAN_CREATE  = new Set(['ciso', 'admin', 'risk_analyst', 'security_consultant', 'information_asset_manager']);
const DEPT_SCOPED = new Set(['information_asset_owner', 'information_asset_manager']);
const RISK_CLASS  = { critical: styles.riskCritical, high: styles.riskHigh, medium: styles.riskMedium, low: styles.riskLow };
function RiskPill({ level }) {
  if (!level) return <span className={styles.riskNone}>—</span>;
  return <span className={`${styles.riskPill} ${RISK_CLASS[level] ?? ''}`}>{level}</span>;
}


export function SystemsPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [systems, setSystems]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [detailCache, setDetailCache] = useState({});

  const { selectedId, toggleSelect, summaryRowRef } = useSelectedRow(loading);

  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const canCreate   = CAN_CREATE.has(user?.role);
  const isDeptScoped = DEPT_SCOPED.has(user?.role);

  // Lazy-fetch detail (information assets, top risk) when a row is expanded.
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return;
    let cancelled = false;
    getSystem(selectedId)
      .then(d => {
        if (!cancelled) setDetailCache(prev => ({ ...prev, [selectedId]: d }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, detailCache]);

  useEffect(() => {
    // Creating a system is its own guided page now (/systems/new), so the list
    // no longer needs departments or people.
    getSystems()
      .then(setSystems)
      .catch(err => setError(err.response?.data?.error || 'Failed to load systems'))
      .finally(() => setLoading(false));
  }, []);

  // Shared with Assets / Services / Exceptions — see utils/departmentScope.
  const scopeCtl = useDepartmentScope({
    rows: systems,
    userDeptId: user?.department_id,
    defaultToOwnDept: isDeptScoped,
    // v155: the systems that exist to protect other systems.
    facets: [{ key: 'security', label: 'Security systems', test: (s) => s.is_security_system }],
  });

  const filtered = useMemo(
    () => scopeCtl.filtered.filter(s =>
      !search || s.name.toLowerCase().includes(search.toLowerCase())),
    [scopeCtl.filtered, search]);

  const { sorted, sortKey, sortDir, toggleSort, clearSort } =
    useTableSort(filtered, { accessors: SYSTEM_ACCESSORS, defaultCompare: byMaxRiskDescThenName });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  // C/I/A columns are hidden in business mode — drop such a sort back to default.
  useEffect(() => {
    if (!isExpert && ['c', 'i', 'a'].includes(sortKey)) clearSort();
  }, [isExpert, sortKey, clearSort]);

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Systems <HelpDot k="systems.title" placement="bottom" /></h1>
            {!loading && (
              <span className={styles.subtitle}>
                {sorted.length} system{sorted.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {canCreate && (
            <button className={styles.btnPrimary} onClick={() => navigate('/systems/new')}>
              + New System
            </button>
          )}
        </div>

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            placeholder="Search systems…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className={styles.filters}>
            <DepartmentScopeFilter {...scopeCtl} />
          </div>
          <div className={styles.viewModeSlot}>
            <ViewModeToggle {...viewMode} />
          </div>
        </div>

        {loading && <p className={styles.muted}>Loading…</p>}
        {error   && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && (
          sorted.length === 0
            ? <p className={styles.muted}>No systems found.</p>
            : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <SortableTh column="name" {...sortProps} helpKey="col.name">Name</SortableTh>
                      <SortableTh column="dept" {...sortProps} helpKey="col.department">Department</SortableTh>
                      <SortableTh column="iao" className={styles.colOptional} {...sortProps} helpKey="architecture.col.owner_iao">Owner (IAO)</SortableTh>
                      <SortableTh column="iam" className={styles.colOptional} {...sortProps} helpKey="architecture.col.manager_iam">Manager (IAM)</SortableTh>
                      {isExpert
                        ? <>
                            <SortableTh column="c" {...sortProps} helpKey="col.confidentiality">C</SortableTh>
                            <SortableTh column="i" {...sortProps} helpKey="col.integrity">I</SortableTh>
                            <SortableTh column="a" {...sortProps} helpKey="col.availability">A</SortableTh>
                          </>
                        : <SortableTh column="impact" {...sortProps} helpKey="col.impact">Impact</SortableTh>}
                      <SortableTh column="risk" {...sortProps} helpKey="systems.col.risk">Risk</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(s => {
                      const isSelected = selectedId === s.id;
                      const colCount   = 9 - (isExpert ? 0 : 2);
                      return (
                        <React.Fragment key={s.id}>
                          <tr
                            className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                            onClick={() => toggleSelect(s.id)}
                          >
                            <td className={styles.nameCell}>
                              {s.name}
                              {s.is_shared && <span className={styles.sharedBadge}>shared</span>}
                              {s.is_security_system && <span className={styles.sharedBadge}>security system</span>}
                              {s.impact_changed_in_cycle && (
                                <span className={styles.changeWarn}>impact changed</span>
                              )}
                            </td>
                            <td className={styles.deptCell}>{s.department_name || '—'}</td>
                            <td className={styles.colOptional}><AssignedPerson name={s.owner_name} personDepartment={s.owner_department_name} ownerDepartment={s.department_name} /></td>
                            <td className={styles.colOptional}><AssignedPerson name={s.managed_by_name} personDepartment={s.manager_department_name} ownerDepartment={s.department_name} /></td>
                            {isExpert ? (
                              <>
                                <td><CiaBadge value={s.impact_c} /></td>
                                <td><CiaBadge value={s.impact_i} /></td>
                                <td><CiaBadge value={s.impact_a} /></td>
                              </>
                            ) : (
                              <td><RatingChip value={maxCia(s.impact_c, s.impact_i, s.impact_a)} scale="impact" variant="word" /></td>
                            )}
                            <td><RiskPill level={s.max_risk_score != null ? scoreLevel(s.max_risk_score) : null} /></td>
                          </tr>
                          {isSelected && (
                            <tr className={styles.summaryRow} ref={summaryRowRef}>
                              <td colSpan={colCount} className={styles.summaryCell}>
                                <SystemSummaryCard
                                  system={{ ...s, ...(detailCache[s.id] || {}) }}
                                  openHref={`/systems/${s.id}`}
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
              </div>
            )
        )}

      </div>
    </Shell>
  );
}
