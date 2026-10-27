// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssets } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { AssignedPerson } from '../components/AssignedPerson';
import { BackButton } from '../components/BackButton';
import { CiaBadge } from '../components/CiaBadge';
import { RatingChip } from '../components/RatingChip';
import { ratingCompleteness } from '../utils/ratingCompleteness';
import { SortableTh } from '../components/SortableTh';
import { HelpDot } from '../components/HelpDot';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { AssetSummaryCard } from '../components/AssetSummaryCard';
import { byMaxRiskThenMeanCiaThenName } from '../utils/assetSort';
import { scoreLevel } from '../utils/riskColors';
import { maxCia } from '../utils/cia';
import { useViewMode } from '../hooks/useViewMode';
import { useTableSort } from '../hooks/useTableSort';
import { useSelectedRow } from '../hooks/useSelectedRow';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import styles from './InformationAssetsPage.module.css';

// Column key → value accessor, for interactive header sorting (see useTableSort).
const ASSET_ACCESSORS = {
  name:   (a) => a.name,
  dept:   (a) => a.department_name,
  iao:    (a) => a.owner_name,
  iam:    (a) => a.managed_by_name,
  c:      (a) => a.confidentiality,
  i:      (a) => a.integrity,
  a:      (a) => a.availability,
  impact: (a) => maxCia(a.confidentiality, a.integrity, a.availability),
  risk:   (a) => a.max_risk_score,
};

const RISK_CLASS = { critical: styles.riskCritical, high: styles.riskHigh, medium: styles.riskMedium, low: styles.riskLow };
function RiskPill({ level }) {
  if (!level) return <span className={styles.riskNone}>—</span>;
  return <span className={`${styles.riskPill} ${RISK_CLASS[level] ?? ''}`}>{level}</span>;
}

const CAN_CREATE  = new Set(['ciso', 'admin', 'security_consultant', 'information_asset_manager']);
const DEPT_SCOPED = new Set(['information_asset_owner', 'information_asset_manager']);

export function InformationAssetsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assets, setAssets]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');

  const { selectedId, toggleSelect, summaryRowRef } = useSelectedRow(loading);

  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const canCreate   = CAN_CREATE.has(user?.role);
  const isDeptScoped = DEPT_SCOPED.has(user?.role);

  useEffect(() => {
    getAssets()
      .then(setAssets)
      .catch(err => setError(err.response?.data?.error || 'Failed to load assets'))
      .finally(() => setLoading(false));
  }, [canCreate]);

  // Department scoping is shared with Systems / Services / Exceptions; only the
  // free-text search is page-local, so it composes on top of the scoped rows.
  const scopeCtl = useDepartmentScope({
    rows: assets,
    userDeptId: user?.department_id,
    defaultToOwnDept: isDeptScoped,
  });

  const filtered = useMemo(
    () => scopeCtl.filtered.filter(a =>
      !search || a.name.toLowerCase().includes(search.toLowerCase())),
    [scopeCtl.filtered, search]);

  const { sorted, sortKey, sortDir, toggleSort, clearSort } =
    useTableSort(filtered, { accessors: ASSET_ACCESSORS, defaultCompare: byMaxRiskThenMeanCiaThenName });
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
            <h1 className={styles.title}>Information Assets <HelpDot k="information_assets.title" placement="bottom" /></h1>
            {!loading && (
              <span className={styles.subtitle}>
                {sorted.length} asset{sorted.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {canCreate && (
            <button className={styles.btnPrimary} onClick={() => navigate('/assets/new')}>
              + New Asset
            </button>
          )}
        </div>

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            placeholder="Search assets…"
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
            ? <p className={styles.muted}>No assets found.</p>
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
                        : <SortableTh column="impact" {...sortProps} helpKey="assets.col.impact">Impact</SortableTh>}
                      <SortableTh column="risk" {...sortProps} helpKey="assets.col.risk">Risk</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(a => {
                      const isSelected = selectedId === a.id;
                      const colCount   = 9 - (isExpert ? 0 : 2);
                      return (
                        <Fragment key={a.id}>
                          <tr
                            className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                            onClick={() => toggleSelect(a.id)}
                          >
                            <td className={styles.nameCell}>
                              {a.name}
                              {a.is_shared && <span className={styles.sharedTag}>shared</span>}
                              {/* An asset missing a mandatory impact table must not read
                                  as simply "rated": its CIA is a MAX over whatever was
                                  rated, so the omission can only understate it, and that
                                  understatement carries into every risk on its systems. */}
                              {(() => {
                                const rc = ratingCompleteness(a);
                                return rc.short
                                  ? <span className={styles.incompleteTag} title={rc.label}>{rc.short}</span>
                                  : null;
                              })()}
                            </td>
                            <td className={styles.deptCell}>{a.department_name || '—'}</td>
                            <td className={styles.colOptional}><AssignedPerson name={a.owner_name} personDepartment={a.owner_department_name} ownerDepartment={a.department_name} /></td>
                            <td className={styles.colOptional}><AssignedPerson name={a.managed_by_name} personDepartment={a.manager_department_name} ownerDepartment={a.department_name} /></td>
                            {isExpert ? (
                              <>
                                <td><CiaBadge value={a.confidentiality} /></td>
                                <td><CiaBadge value={a.integrity} /></td>
                                <td><CiaBadge value={a.availability} /></td>
                              </>
                            ) : (
                              <td><RatingChip value={maxCia(a.confidentiality, a.integrity, a.availability)} scale="impact" variant="word" /></td>
                            )}
                            <td><RiskPill level={a.max_risk_score != null ? scoreLevel(a.max_risk_score) : null} /></td>
                          </tr>
                          {isSelected && (
                            <tr className={styles.summaryRow} ref={summaryRowRef}>
                              <td colSpan={colCount} className={styles.summaryCell}>
                                <AssetSummaryCard
                                  asset={a}
                                  openHref={`/assets/${a.id}`}
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

      </div>
    </Shell>
  );
}
