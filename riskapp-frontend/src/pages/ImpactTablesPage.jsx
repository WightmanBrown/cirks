// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, Fragment, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getImpactTables,
  createImpactTable,
  getImpactTable,
  publishImpactTable,
  setImpactTableMandatory,
  unpublishImpactTable,
  deleteImpactTable,
  getDepartments,
} from '../api';
import { useAuth }           from '../context/AuthContext';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import { CROSS_DEPT_ROLES }  from '../utils/departmentScope';

// An impact table's own scope (organisation-wide vs department-level) is a
// different axis from which department OWNS it, so the two survive as facets
// alongside All / My Dept rather than being merged into one meaning.
const TABLE_SCOPE_FACETS = [
  { key: 'organisation', label: 'Organisation', test: t => t.scope === 'organisation' },
  { key: 'department',   label: 'Department',   test: t => t.scope === 'department'   },
];
import { Shell }             from '../components/Shell';
import { ImpactTableEditor } from '../components/ImpactTableEditor';
import { ViewModeToggle }    from '../components/ViewModeToggle';
import { useViewMode }       from '../hooks/useViewMode';
import { ImpactTableSummaryCard } from '../components/ImpactTableSummaryCard';
import styles from './ImpactTablesPage.module.css';
import { BackButton }      from '../components/BackButton';
import { ReadOnlyBadge }  from '../components/ReadOnlyBadge';
import { HelpDot }        from '../components/HelpDot';

const CAN_EDIT = new Set(['ciso', 'admin', 'risk_analyst', 'information_asset_manager']);
const CAN_ORG  = new Set(['ciso', 'siro', 'admin']);

const DIM_LABELS = { c: 'Confidentiality', i: 'Integrity', a: 'Availability' };

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Table detail ──────────────────────────────────────────────────────────────
// Exported so ImpactTableDetailPage can embed it in a standalone Shell page.
export function TableDetail({ tableId, canEdit, canOrg, onChanged, onDeleted }) {
  // Ask the capability resolver, not a hardcoded role list. The RBAC matrix is
  // admin-editable (PUT /admin/rbac/role-permissions/:role), so a role set baked
  // into the frontend drifts from it the moment anyone edits a grant — which is
  // exactly how "Make mandatory" came to be offered to a CISO who would get 403.
  const { hasCapability } = useAuth();
  const { mode: viewMode, isExpert, canUseExpert, setMode: setViewMode,
          saveDefault, isDirty } = useViewMode();
  const [detail,      setDetail]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [editMode,    setEditMode]    = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await getImpactTable(tableId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load table');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEditMode(false); setActionError(''); }, [tableId]);

  async function handlePublish() {
    setActionError('');
    try {
      await publishImpactTable(tableId);
      await load();
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Publish failed');
    }
  }

  async function handleUnpublish() {
    setActionError('');
    try {
      await unpublishImpactTable(tableId);
      await load();
      onChanged();
      // Drop straight into edit mode: unpublishing is only ever done in order
      // to change something, so making the user press Edit next is a wasted step.
      setEditMode(true);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Unpublish failed');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setActionError('');
    try {
      const result = await deleteImpactTable(tableId);
      onDeleted(result.ratings_removed);
    } catch (err) {
      setDeleting(false);
      setConfirmDel(false);
      setActionError(err.response?.data?.error || 'Delete failed');
    }
  }

  async function handleToggleMandatory() {
    setActionError('');
    try {
      await setImpactTableMandatory(tableId, !detail.mandatory);
      await load();
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Update failed');
    }
  }

  if (loading) return <div className={styles.detailLoading}>Loading…</div>;
  if (error)   return (
    <div className={styles.detailError}>
      {error}
      <button className={styles.retryBtn} onClick={load}>Retry</button>
    </div>
  );
  if (!detail) return null;

  const published         = !!detail.published_at;
  const isOrgTable        = detail.scope === 'organisation';
  const showExpert        = isExpert;
  const effectiveCanEdit  = canEdit && (!isOrgTable || canOrg);
  // A published table's levels are frozen server-side — offering Edit on one
  // would open the editor and then fail on save with a 409. Unpublish is the
  // documented way through, and it carries the same authority as Publish.
  const canEditLevels     = effectiveCanEdit && !published;
  const canPublish        = effectiveCanEdit && !published;
  const canUnpublish      = effectiveCanEdit && published && !detail.mandatory;
  const canMandatory      = hasCapability('bil.mandatory') && published && isOrgTable;

  // Build lookup maps
  const bilMap = {};
  (detail.bil_levels || []).forEach(l => { bilMap[l.level] = l.statement || ''; });

  // ciaMap[level][dim] = statement
  const ciaMap = {};
  (detail.cia_levels || []).forEach(l => {
    if (!ciaMap[l.level]) ciaMap[l.level] = {};
    ciaMap[l.level][l.dimension] = l.statement || '';
  });

  const hasBil = [1, 2, 3, 4, 5].some(lvl => bilMap[lvl]?.trim());
  const hasCia = detail.cia_levels?.some(l => l.statement?.trim());

  return (
    <div className={styles.detail}>

      <div className={styles.detailHeader}>
        <div className={styles.detailTitleBlock}>
          <h2 className={styles.detailTitle}>{detail.name} <HelpDot k="impact_tables.detail" placement="bottom" /></h2>
          <div className={styles.detailMeta}>
            <span className={styles.scopeChip}>
              {isOrgTable ? 'Cross organisation' : (detail.department_name || 'Department')}
            </span>
            {published
              ? <span className={styles.publishedChip}>Published {fmtDate(detail.published_at)}</span>
              : <span className={styles.draftChip}>Draft</span>
            }
            {detail.mandatory && <span className={styles.mandatoryChip}>Mandatory</span>}
          </div>
          {detail.description && (
            <p className={styles.detailDescription}>{detail.description}</p>
          )}
        </div>

        <div className={styles.detailActions}>
          {canUseExpert && (
            <ViewModeToggle
              mode={viewMode}
              setMode={setViewMode}
              canUseExpert={canUseExpert}
              isDirty={isDirty}
              saveDefault={saveDefault}
            />
          )}
          {canEditLevels && (
            <button
              className={editMode ? styles.btnEditActive : styles.btnSecondary}
              onClick={() => setEditMode(m => !m)}
            >
              {editMode ? 'Done editing' : 'Edit'}
            </button>
          )}
          {canPublish && (
            <button className={styles.btnPublish} onClick={handlePublish}>Publish</button>
          )}
          {canUnpublish && (
            <button
              className={styles.btnSecondary}
              onClick={handleUnpublish}
              title="Take this scale out of service so its levels can be changed. Assets rated against it are re-derived."
            >
              Unpublish to edit
            </button>
          )}
          {effectiveCanEdit && published && detail.mandatory && (
            <span className={styles.muted}>
              Mandatory tables cannot be unpublished — make it voluntary first to change its levels.
            </span>
          )}
          {canMandatory && (
            <button
              className={detail.mandatory ? styles.btnSecondary : styles.btnMandatory}
              onClick={handleToggleMandatory}
            >
              {detail.mandatory ? 'Make voluntary' : 'Make mandatory'}
            </button>
          )}
          {effectiveCanEdit && !detail.mandatory && (
            confirmDel ? (
              <span className={styles.confirmDel}>
                {detail.rating_count > 0
                  ? `Remove ${detail.rating_count} service rating${detail.rating_count !== 1 ? 's' : ''} and delete?`
                  : 'Delete this table?'
                }
                <button className={styles.btnDelConfirm} onClick={handleDelete} disabled={deleting}>
                  {deleting ? '…' : 'Yes, delete'}
                </button>
                <button className={styles.btnDelCancel} onClick={() => setConfirmDel(false)}>Cancel</button>
              </span>
            ) : (
              <button className={styles.btnDelete} onClick={() => setConfirmDel(true)}>Delete</button>
            )
          )}
        </div>
      </div>

      {actionError && (
        <div className={styles.actionError}>
          {actionError}
          <button className={styles.dismissBtn} onClick={() => setActionError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      {editMode ? (
        <div className={styles.editorWrap}>
          <ImpactTableEditor
            impactTable={detail}
            isExpert={isExpert}
            onSaved={() => { load(); onChanged(); }}
          />
        </div>
      ) : (
        <div className={styles.viewBody}>

          {/* 1dBIL grid */}
          <div className={styles.viewSection}>
            <div className={styles.viewSectionLabel}>1dBIL — Business impact level<HelpDot k="impact_tables.bil" placement="top" label="About business impact levels (BIL)" /></div>
            {hasBil ? (
              <div className={styles.bilGrid}>
                {[1, 2, 3, 4, 5].map(lvl => (
                  <div key={lvl} className={styles.bilCell}>
                    <div className={styles.bilCellLabel}>BIL {lvl}</div>
                    <div className={styles.bilCellText}>
                      {bilMap[lvl] ? bilMap[lvl] : <span className={styles.bilCellEmpty}>Not defined</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.viewEmpty}>
                No BIL descriptions yet.{effectiveCanEdit && <> Use <strong>Edit</strong> to add them.</>}
              </div>
            )}
          </div>

          {/* 3dBIL CIA grid — expert view only */}
          {showExpert && (
            <div className={styles.viewSection}>
              <div className={styles.viewSectionLabel}>3dBIL — CIA implications per level<HelpDot k="impact_tables.cia" placement="top" /></div>
              {hasCia ? (
                <div className={styles.ciaTable}>
                  <div className={styles.ciaTableHead}>
                    <div className={styles.ciaTableDimCell} />
                    {[1, 2, 3, 4, 5].map(lvl => (
                      <div key={lvl} className={styles.ciaTableLevelCell}>BIL {lvl}</div>
                    ))}
                  </div>
                  {['c', 'i', 'a'].map(dim => (
                    <div key={dim} className={styles.ciaTableRow}>
                      <div className={styles.ciaTableDimCell}>
                        <span className={styles.ciaTableDimLabel}>{dim.toUpperCase()}</span>
                        <span className={styles.ciaTableDimFull}>{DIM_LABELS[dim]}</span>
                      </div>
                      {[1, 2, 3, 4, 5].map(lvl => {
                        const stmt = ciaMap[lvl]?.[dim];
                        return (
                          <div key={lvl} className={styles.ciaTableCell}>
                            {stmt
                              ? <span className={styles.ciaStmt}>{stmt}</span>
                              : <span className={styles.ciaEmpty}>—</span>
                            }
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.viewEmpty}>
                  No CIA implications defined yet.{effectiveCanEdit && <> Use <strong>Edit</strong> to add them.</>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ImpactTablesPage() {
  const { user } = useAuth();
  const canEdit  = CAN_EDIT.has(user?.role);
  const canOrg   = CAN_ORG.has(user?.role);

  // Scope filter is URL-driven so callers (e.g. the SIRO impact-table widgets)
  // can deep-link to the org-only view via ?scope=organisation.
  const [searchParams, setSearchParams] = useSearchParams();

  const [tables,      setTables]      = useState([]);
  const [depts,       setDepts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [selectedId,  setSelectedId]  = useState(null);
  const summaryRowRef = useRef(null);
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newScope,    setNewScope]    = useState('organisation');
  const [newDeptId,   setNewDeptId]   = useState('');
  const [createBusy,  setCreateBusy]  = useState(false);
  const [createError, setCreateError] = useState('');

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTables(await getImpactTables());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load impact tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  useEffect(() => {
    if (canEdit) getDepartments().then(setDepts).catch(() => {});
  }, [canEdit]);

  useEffect(() => {
    setNewScope(canOrg ? 'organisation' : 'department');
  }, [canOrg]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (newScope === 'department' && !newDeptId) {
      setCreateError('Select a department');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      const body = { name: newName.trim(), scope: newScope };
      if (newScope === 'department') body.department_id = newDeptId;
      const created = await createImpactTable(body);
      setNewName('');
      setNewDeptId('');
      setCreating(false);
      await loadTables();
      setSelectedId(created.id);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  function cancelCreate() {
    setCreating(false);
    setNewName('');
    setNewDeptId('');
    setCreateError('');
  }

  // Seeded from the URL so ?scope=organisation deep links land correctly, and
  // written back on change so the view stays linkable.
  const scopeCtl = useDepartmentScope({
    rows: tables,
    userDeptId: user?.department_id,
    facets: TABLE_SCOPE_FACETS,
    defaultToOwnDept: !CROSS_DEPT_ROLES.has(user?.role),
    initialScope: searchParams.get('scope') || undefined,
    // Organisation-scope tables apply to every department — the API says the
    // same (scope='organisation' OR department_id = caller's). Excluding them
    // from "My Dept" would hide the mandatory tables assets are rated against.
    alwaysInScope: t => t.scope === 'organisation',
  });

  function setScope(s) {
    scopeCtl.setScope(s);
    if (s === 'all') searchParams.delete('scope');
    else             searchParams.set('scope', s);
    setSearchParams(searchParams, { replace: true });
  }

  const visible = scopeCtl.filtered;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Impact Tables<HelpDot k="impact_tables.overview" placement="bottom" label="About impact tables" /></h1>
            {!loading && (
              <span className={styles.subtitle}>
                {visible.length} table{visible.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            {!canEdit && <ReadOnlyBadge reason="Your role has view-only access to impact tables." />}
            {canEdit && (
              <button
                className={creating ? styles.btnSecondary : styles.btnPrimary}
                onClick={() => (creating ? cancelCreate() : setCreating(true))}
              >
                {creating ? 'Cancel' : '+ New Table'}
              </button>
            )}
          </div>
        </div>

        <div className={styles.scopeTabs}>
          <DepartmentScopeFilter {...scopeCtl} setScope={setScope} showShared={false} />
        </div>

        {creating && (
          <form className={styles.createForm} onSubmit={handleCreate}>
            <input
              className={styles.createInput}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Table name"
              autoFocus
            />
            {canOrg && (
              <select
                className={styles.createSelect}
                value={newScope}
                onChange={e => { setNewScope(e.target.value); setNewDeptId(''); }}
              >
                <option value="organisation">Cross organisation</option>
                <option value="department">Department</option>
              </select>
            )}
            {newScope === 'department' && (
              <select
                className={styles.createSelect}
                value={newDeptId}
                onChange={e => setNewDeptId(e.target.value)}
              >
                <option value="">— select department —</option>
                {depts.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            {createError && <p className={styles.createError}>{createError}</p>}
            <div className={styles.createActions}>
              <button type="button" className={styles.btnTiny} onClick={cancelCreate}>Cancel</button>
              <button type="submit" className={styles.btnTinyPrimary} disabled={!newName.trim() || createBusy}>
                {createBusy ? '…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {loading && <p className={styles.muted}>Loading…</p>}
        {error   && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && visible.length === 0 && (
          <p className={styles.muted}>
            {tables.length === 0
              ? (canEdit ? 'No tables yet — use + New Table to create one.' : 'No impact tables available.')
              : 'No tables match this scope filter.'}
          </p>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name <HelpDot k="col.name" placement="bottom" /></th>
                  <th className={styles.th}>Scope <HelpDot k="impact_tables.col.scope" placement="bottom" /></th>
                  <th className={styles.th}>Department <HelpDot k="impact_tables.col.department" placement="bottom" /></th>
                  <th className={styles.th}>Status <HelpDot k="impact_tables.col.status" placement="bottom" /></th>
                  <th className={styles.th}>Attributes <HelpDot k="impact_tables.col.attributes" placement="bottom" /></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(t => {
                  const isSelected = selectedId === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr
                        className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                        onClick={() => setSelectedId(isSelected ? null : t.id)}
                      >
                        <td className={styles.tdName}>{t.name}</td>
                        <td className={styles.tdScope}>
                          <span className={styles.scopeBadge}>
                            {t.scope === 'organisation' ? 'Organisation' : 'Department'}
                          </span>
                        </td>
                        <td className={styles.tdScope}>
                          {/* Every table has an owning department at either scope
                              (v102). Scope says how far it reaches; this says who
                              is accountable. "Unassigned" should be unreachable —
                              department_id is NOT NULL — so it is styled as the
                              fault it would be rather than a quiet dash. */}
                          {t.department_name
                            ? <span className={styles.deptLabel}>{t.department_name}</span>
                            : <span className={styles.deptMissing}>Unassigned</span>}
                        </td>
                        <td className={styles.tdStatus}>
                          {t.published_at
                            ? <span className={styles.badgePublished}>Published</span>
                            : <span className={styles.badgeDraft}>Draft</span>
                          }
                        </td>
                        <td className={styles.tdAttrs}>
                          {t.mandatory && <span className={styles.badgeMandatory}>Mandatory</span>}
                        </td>
                      </tr>
                      {isSelected && (
                        <tr className={styles.summaryRow} ref={summaryRowRef}>
                          <td colSpan={5} className={styles.summaryCell}>
                            <ImpactTableSummaryCard
                              table={t}
                              openHref={`/impact-tables/${t.id}`}
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
        )}

      </div>
    </Shell>
  );
}
