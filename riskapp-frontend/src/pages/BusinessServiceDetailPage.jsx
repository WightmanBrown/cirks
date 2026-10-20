// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getBusinessService,
  getDepartments,
  getUsers,
  updateBusinessService,
  transferService,
  getServiceAvailableSystems,
  linkServiceSystem,
  unlinkServiceSystem,
  deleteBusinessService,
} from '../api';
import { Shell } from '../components/Shell';
import { personLabel } from '../utils/roles';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { ServiceSummaryCard } from '../components/ServiceSummaryCard';
import { RiskPathTree } from '../components/RiskPathTree';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { useViewMode } from '../hooks/useViewMode';
import { RatingChip } from '../components/RatingChip';
import { CiaBadge } from '../components/CiaBadge';
// No department scope filter on the systems picker, deliberately. The asset
// picker had one because impact is about YOUR stake; a service legitimately
// depends on other departments' systems — the same "(my) assets, (any) systems"
// asymmetry the requirements encode. The stake grouping does the organising here.
import { seatCanWrite } from '../utils/seatScope';
import styles from './BusinessServiceDetailPage.module.css';

// ---- Systems tab (v104) ---------------------------------------------------
// A business service is composed of SYSTEMS. Its information assets are no
// longer linked here — they are DERIVED from those systems (the assets this
// service's department holds in them) and shown read-only below, because that
// is the honest answer to "what information does this service touch?".
// See docs/business-service-model.md.

function ServiceSystemsTab({ service, canEdit, isExpert, onRefresh }) {
  const navigate = useNavigate();
  const [available, setAvailable] = useState([]);
  const [search,    setSearch]    = useState('');
  const [linkError, setLinkError] = useState('');
  const [loading,   setLoading]   = useState(false);

  const loadAvailable = useCallback(async () => {
    setLoading(true);
    try {
      setAvailable(await getServiceAvailableSystems(service.id));
    } catch { /* silent */ } finally { setLoading(false); }
  }, [service.id]);

  useEffect(() => { if (canEdit) loadAvailable(); }, [canEdit, loadAvailable]);

  async function handleLink(systemId) {
    setLinkError('');
    try {
      await linkServiceSystem(service.id, systemId);
      onRefresh(); loadAvailable();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to link system');
    }
  }

  async function handleUnlink(systemId) {
    setLinkError('');
    try {
      await unlinkServiceSystem(service.id, systemId);
      onRefresh(); loadAvailable();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to unlink system');
    }
  }

  const linked  = service.linked_systems || [];
  const derived = service.linked_information_assets || [];

  const matches = a => search.length < 1 || a.name.toLowerCase().includes(search.toLowerCase());
  // The grouping IS the linking discipline: what a choice actually does, rather
  // than who owns the system. Systems bearing this department's information lead,
  // because that is where the real answer usually is.
  const bearing  = available.filter(s => matches(s) && s.own_asset_count > 0);
  const dependOn = available.filter(s => matches(s) && !s.own_asset_count);

  function PickerRows({ rows, showStake }) {
    return rows.map(sys => (
      <tr key={sys.id} className={styles.iaRow}>
        <td className={styles.iaName}>
          {sys.name}
          {sys.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
        </td>
        <td className={styles.iaDept}>{sys.department_name || '—'}</td>
        <td className={styles.iaDept}>
          {showStake
            ? <span className={styles.stakeYes}>
                {sys.own_asset_count} of your asset{sys.own_asset_count === 1 ? '' : 's'}
                {sys.own_max_bil ? ` · max BIL ${sys.own_max_bil}` : ''}
              </span>
            : <span className={styles.stakeNone}>you hold nothing here</span>}
        </td>
        <td>
          {sys.max_risk_score
            ? <RatingChip value={sys.max_risk_score} scale="risk" variant={isExpert ? 'number' : 'word'} />
            : <span className={styles.unset}>—</span>}
        </td>
        <td>
          <button className={styles.linkBtn} onClick={() => handleLink(sys.id)}>Link</button>
        </td>
      </tr>
    ));
  }

  return (
    <div className={styles.impactTableTab}>
      {linkError && <p className={styles.error}>{linkError}</p>}

      <div className={styles.tableAssignSection}>
        <div className={styles.tableAssignTitleRow}>
          <h3 className={styles.tableAssignTitle}>Systems delivering this service</h3>
        </div>

        {linked.length === 0
          ? <p className={styles.emptyHint}>
              No systems linked yet. A business service is composed of the systems that
              deliver it — link them below and its impact and risk follow from them.
            </p>
          : (
            <div className={styles.iaTableWrap}>
              <table className={styles.iaTable}>
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Department</th>
                    <th>Your stake</th>
                    <th>Worst risk</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {linked.map(sys => (
                    <tr key={sys.id} className={styles.iaRow}
                        onClick={() => navigate(`/systems/${sys.id}`)}>
                      <td className={styles.iaName}>
                        {sys.name}
                        {sys.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
                      </td>
                      <td className={styles.iaDept}>{sys.department_name || '—'}</td>
                      <td className={styles.iaDept}>
                        {sys.own_asset_count > 0
                          ? <span className={styles.stakeYes}>
                              {sys.own_asset_count} asset{sys.own_asset_count === 1 ? '' : 's'}
                              {sys.own_max_bil ? ` · max BIL ${sys.own_max_bil}` : ''}
                            </span>
                          : <span className={styles.stakeNone}>dependency only</span>}
                      </td>
                      <td>
                        {sys.max_risk_score
                          ? <RatingChip value={sys.max_risk_score} scale="risk" variant={isExpert ? 'number' : 'word'} />
                          : <span className={styles.unset}>—</span>}
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            className={styles.unlinkBtn}
                            onClick={e => { e.stopPropagation(); handleUnlink(sys.id); }}
                          >Unlink</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        {canEdit && (
          <div style={{ marginTop: 20 }}>
            <div className={styles.tableAssignTitleRow} style={{ marginBottom: 10 }}>
              <h4 className={styles.tableAssignTitle}>Link a system</h4>
            </div>
            <div className={styles.pickerFilterBar}>
              <input
                className={styles.createTableInput}
                placeholder="Filter available systems…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {loading && <p className={styles.emptyHint}>Loading…</p>}

            {!loading && bearing.length === 0 && dependOn.length === 0 && (
              <p className={styles.emptyHint}>
                No available systems{search ? ' matching that search' : ''}.
              </p>
            )}

            {!loading && bearing.length === 0 && dependOn.length > 0 && !search && (
              // The empty case the design note calls out: nothing to anchor a
              // stake on, so the exposure figure would be meaningless.
              <p className={styles.pickerHint}>
                Your department holds no rated information in any of these systems.
                Rate your information assets first — without a stake, this service
                has no impact to report.
              </p>
            )}

            {!loading && (bearing.length > 0 || dependOn.length > 0) && (
              <div className={styles.iaTableWrap}>
                <table className={styles.iaTable}>
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Department</th>
                      <th>Your stake</th>
                      <th>Worst risk</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bearing.length > 0 && (
                      <tr className={styles.pickerGroupRow}>
                        <td colSpan={5}>
                          Systems holding your information — contribute <strong>impact and probability</strong>
                        </td>
                      </tr>
                    )}
                    <PickerRows rows={bearing} showStake />
                    {dependOn.length > 0 && (
                      <tr className={styles.pickerGroupRow}>
                        <td colSpan={5}>
                          Systems you would depend on — contribute <strong>probability only</strong>
                        </td>
                      </tr>
                    )}
                    <PickerRows rows={dependOn} showStake={false} />
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Derived, read-only: the information this service touches, computed from
          its systems rather than curated. */}
      <div className={styles.tableAssignSection} style={{ marginTop: 24 }}>
        <div className={styles.tableAssignTitleRow}>
          <h3 className={styles.tableAssignTitle}>Information this service touches</h3>
        </div>
        <p className={styles.emptyHint} style={{ marginTop: 0 }}>
          Derived from the systems above — your department&apos;s information in them.
          This is what the service&apos;s impact is calculated from.
        </p>
        {derived.length === 0
          ? <p className={styles.emptyHint}>None yet.</p>
          : (
            <div className={styles.iaTableWrap}>
              <table className={styles.iaTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    {isExpert ? (<><th>C</th><th>I</th><th>A</th></>) : (<th>Max impact</th>)}
                  </tr>
                </thead>
                <tbody>
                  {derived.map(ia => (
                    <tr key={ia.id} className={styles.iaRow}
                        onClick={() => navigate(`/assets/${ia.id}`)}>
                      <td className={styles.iaName}>
                        {ia.name}
                        {ia.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
                      </td>
                      <td className={styles.iaDept}>{ia.department_name || '—'}</td>
                      {isExpert ? (
                        <>
                          <td>{ia.confidentiality ? <CiaBadge value={ia.confidentiality} /> : <span className={styles.unset}>—</span>}</td>
                          <td>{ia.integrity      ? <CiaBadge value={ia.integrity}      /> : <span className={styles.unset}>—</span>}</td>
                          <td>{ia.availability   ? <CiaBadge value={ia.availability}   /> : <span className={styles.unset}>—</span>}</td>
                        </>
                      ) : (
                        <td>
                          <RatingChip value={Math.max(ia.confidentiality ?? 0, ia.integrity ?? 0, ia.availability ?? 0) || null} scale="impact" variant="word" />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treatment — questions 4, 5 and 6 of the six a service owner asks: is
// anything planned, is anything NOT being dealt with, and how is it going.
// Untreated risks lead, because a register answers that question by omission
// and omission is exactly what gets missed.

export function ServiceTreatmentTab({ service, isExpert }) {
  const actions   = service.security_actions || [];
  const untreated = service.untreated_risks  || [];

  const DONE    = ['completed', 'verified', 'cancelled', 'rejected'];
  const open    = actions.filter(a => !DONE.includes(a.status));
  const overdue = actions.filter(a => a.overdue);

  return (
    <div className={styles.treatmentTab}>
      <div className={styles.treatmentStats}>
        <div className={styles.treatStat}>
          <span className={styles.treatStatNum}>{open.length}</span>
          <span className={styles.treatStatLabel}>action{open.length === 1 ? '' : 's'} in flight</span>
        </div>
        <div className={overdue.length ? styles.treatStatBad : styles.treatStat}>
          <span className={styles.treatStatNum}>{overdue.length}</span>
          <span className={styles.treatStatLabel}>past target date</span>
        </div>
        <div className={untreated.length ? styles.treatStatBad : styles.treatStat}>
          <span className={styles.treatStatNum}>{untreated.length}</span>
          <span className={styles.treatStatLabel}>risk{untreated.length === 1 ? '' : 's'} with nothing planned</span>
        </div>
      </div>

      <section className={styles.treatSection}>
        <h3 className={styles.treatHeading}>Risks with nothing planned</h3>
        {untreated.length === 0 ? (
          <p className={styles.treatEmpty}>
            Every risk on this service&rsquo;s systems has an action against it.
          </p>
        ) : (
          <>
            <p className={styles.treatHint}>
              Nothing is currently proposed, planned or in progress against these. A completed
              action does not count &mdash; if the risk is still here, it is still untreated.
            </p>
            <table className={styles.treatTable}>
              <thead>
                <tr><th>Threat</th><th>System</th><th className={styles.numCol}>Risk</th></tr>
              </thead>
              <tbody>
                {untreated.map(u => (
                  <tr key={u.risk_id}>
                    <td>{u.threat_name}</td>
                    <td>
                      <Link to={`/systems/${u.system_id}`} className={styles.treatLink}>{u.system_name}</Link>
                    </td>
                    <td className={styles.numCol}>
                      <RatingChip value={u.risk_score} scale="risk"
                                  variant={isExpert ? 'number' : 'word'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className={styles.treatSection}>
        <h3 className={styles.treatHeading}>Security actions</h3>
        {actions.length === 0 ? (
          <p className={styles.treatEmpty}>No security actions touch this service&rsquo;s systems.</p>
        ) : (
          <table className={styles.treatTable}>
            <thead>
              <tr><th>Action</th><th>Owner</th><th>Status</th><th>Progress</th><th>Target</th></tr>
            </thead>
            <tbody>
              {actions.map(a => {
                const pct = a.items_total ? Math.round((a.items_completed / a.items_total) * 100) : 0;
                return (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{a.owner_name || <span className={styles.muted}>&mdash;</span>}</td>
                    <td><span className={styles.statusPill}>{a.status.replace(/_/g, ' ')}</span></td>
                    <td>
                      {a.items_total ? (
                        <span className={styles.progressWrap}
                              title={`${a.items_completed} of ${a.items_total} items complete`}>
                          <span className={styles.progressBar}>
                            <span className={styles.progressFill} style={{ width: `${pct}%` }} />
                          </span>
                          <span className={styles.progressText}>{a.items_completed}/{a.items_total}</span>
                        </span>
                      ) : <span className={styles.muted}>no items</span>}
                    </td>
                    <td className={a.overdue ? styles.overdue : undefined}>
                      {a.target_date
                        ? new Date(a.target_date).toLocaleDateString('en-GB')
                        : <span className={styles.muted}>&mdash;</span>}
                      {a.overdue && ' (overdue)'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}


// ---- Main page ----------------------------------------------------------

export function BusinessServiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, departmentIsolation, hasCapability } = useAuth();
  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const [service,      setService]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState('overview');

  const [editing,      setEditing]      = useState(false);
  const [editDraft,    setEditDraft]    = useState({});
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState('');
  const [users,        setUsers]        = useState([]);

  const [transferring,     setTransferring]     = useState(false);
  const [departments,      setDepartments]      = useState([]);
  const [transferDeptId,   setTransferDeptId]   = useState('');
  const [transferSaving,   setTransferSaving]   = useState(false);
  const [transferError,    setTransferError]    = useState('');
  const [transferResult,   setTransferResult]   = useState(null);

  const canEdit       = ['ciso', 'risk_analyst', 'admin', 'security_consultant', 'information_asset_manager'].includes(user?.role)
    && seatCanWrite(user, departmentIsolation, service?.department_id);
  const canTransfer   = ['ciso', 'admin'].includes(user?.role);
  // Mirrors the API exactly (routes/services/index.js): the capability, PLUS the
  // owning-department check the route applies on top of it. Gating on the
  // capability alone would offer a button that 403s for a CISO looking at
  // another department's service.
  const ownsService   = user?.department_id
    && user.department_id === (service?.owner_department_id || service?.department_id);
  const canDelete     = hasCapability('services.delete')
    && (ownsService || ['admin', 'security_consultant'].includes(user?.role));

  function openEdit() {
    setEditDraft({
      name:               service.name,
      description:        service.description || '',
      is_shared:          service.is_shared,
      managed_by_user_id: service.managed_by_id || '',
    });
    setEditError('');
    setEditing(true);
  }

  async function handleEditSave() {
    if (!editDraft.name?.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await updateBusinessService(id, {
        name:               editDraft.name.trim(),
        description:        editDraft.description.trim() || null,
        is_shared:          editDraft.is_shared,
        managed_by_user_id: editDraft.managed_by_user_id || null,
      });
      setService(prev => ({ ...prev, ...updated }));
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setEditSaving(false);
    }
  }

  function openTransfer() {
    setTransferDeptId('');
    setTransferError('');
    setTransferResult(null);
    if (departments.length === 0) getDepartments().then(setDepartments);
    setTransferring(true);
  }

  async function handleTransferConfirm() {
    if (!transferDeptId) { setTransferError('Select a department.'); return; }
    setTransferSaving(true);
    setTransferError('');
    try {
      const result = await transferService(id, transferDeptId);
      setTransferResult(result);
      setService(prev => ({
        ...prev,
        department_id:         result.to_department.id,
        department_name:       result.to_department.name,
        owner_department_id:   result.to_department.id,
        owner_department_name: result.to_department.name,
        // A transfer no longer strips impact tables (v99) — they follow the
        // service's assets, which move with it.
      }));
    } catch (err) {
      setTransferError(err.response?.data?.error || 'Transfer failed.');
    } finally {
      setTransferSaving(false);
    }
  }

  const fetchAll = useCallback(async () => {
    const [svc, allUsers] = await Promise.all([
      getBusinessService(id),
      canEdit ? getUsers() : Promise.resolve([]),
    ]);
    setService(svc);
    setUsers(allUsers || []);
  }, [id, canEdit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { await fetchAll(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to load service'); }
    finally { setLoading(false); }
  }, [fetchAll]);

  useEffect(() => { load(); }, [load]);

  // Linking, unlinking and create-and-link were removed in v99 — the tab is a
  // derived summary now, so there is nothing on it to submit.

  const [deleteError, setDeleteError] = useState('');

  async function handleDelete() {
    // Hard delete, not a deactivate — services have no retire flow and the
    // cascades are clean (business_service_systems, adoptions, process links all
    // ON DELETE CASCADE). Naming what goes with it matters: the linked systems
    // are the work someone may have just done, and they are not recoverable.
    const linked = (service.linked_systems || []).length;
    const detail = linked
      ? `\n\nIts ${linked} system link${linked === 1 ? '' : 's'} will go with it. The systems themselves are not deleted.`
      : '';
    if (!window.confirm(`Delete "${service.name}"? This cannot be undone.${detail}`)) return;
    setDeleteError('');
    try {
      await deleteBusinessService(id);
      navigate('/services');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete this service.');
    }
  }

  if (loading) return <Shell><div className={styles.page}><p className={styles.loading}>Loading…</p></div></Shell>;
  if (error)   return <Shell><div className={styles.page}><p className={styles.error}>{error}</p></div></Shell>;
  if (!service) return null;

  const hasLinked = (service.impact_tables || []).length > 0;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <BackButton fallback="/services" />
          {!canEdit && !canTransfer && <ReadOnlyBadge reason="Your role has view-only access to business services." />}
          <span className={styles.viewModeSlot}><ViewModeToggle {...viewMode} /></span>
        </div>

        <ServiceSummaryCard service={service} isExpert={isExpert} showRiskPath={false} />

        {/* groupBy="system": under v104 a service reaches risks through its
            SYSTEMS, so System | Threat | Risk is the honest tree. The asset
            grouping was a leftover from the model where the path ran through
            assets — and a dependency system has no asset of yours to group by. */}
        {service.risk_paths && service.risk_paths.length > 0 && (
          <RiskPathTree paths={service.risk_paths} title="Risks to this service" groupBy="system" collapsed isExpert={isExpert} />
        )}

        {deleteError && <p className={styles.error}>{deleteError}</p>}

        {(canEdit || canTransfer || canDelete) && !editing && !transferring && (
          <div className={styles.headerActions}>
            {canEdit && (
              <button className={styles.btnSecondary} onClick={openEdit}>Edit</button>
            )}
            {canDelete && (
              <button className={styles.btnDanger} onClick={handleDelete}>Delete service</button>
            )}
            {canTransfer && (
              <button className={styles.btnSecondary} onClick={openTransfer}>Transfer department</button>
            )}
          </div>
        )}

        {editing && (
          <div className={styles.editForm}>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>Name</label>
              <input
                className={styles.editInput}
                value={editDraft.name}
                onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>Description</label>
              <textarea
                className={styles.editTextarea}
                rows={2}
                value={editDraft.description}
                onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>Manager (IAM)</label>
              <select
                className={styles.editInput}
                value={editDraft.managed_by_user_id}
                onChange={e => setEditDraft(d => ({ ...d, managed_by_user_id: e.target.value }))}
              >
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
              </select>
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>
                <input
                  type="checkbox"
                  checked={editDraft.is_shared}
                  onChange={e => setEditDraft(d => ({ ...d, is_shared: e.target.checked }))}
                />{' '}Shared service
              </label>
            </div>
            {editError && <p className={styles.editError}>{editError}</p>}
            <div className={styles.editActions}>
              <button className={styles.btnPrimary} onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.btnSecondary} onClick={() => setEditing(false)} disabled={editSaving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {transferring && (
          <div className={styles.transferPanel}>
            <h3 className={styles.transferTitle}>Transfer to another department</h3>
            {transferResult ? (
              <div className={styles.transferSuccess}>
                <p className={styles.transferSuccessMsg}>
                  Transferred from <strong>{transferResult.from_department.name}</strong> to <strong>{transferResult.to_department.name}</strong>.
                </p>
                {transferResult.removed_tables.length > 0 && (
                  <div className={styles.transferImpact}>
                    <span className={styles.transferImpactLabel}>Impact table links removed:</span>
                    <ul className={styles.transferList}>
                      {transferResult.removed_tables.map(t => <li key={t.id}>{t.name}</li>)}
                    </ul>
                  </div>
                )}
                {transferResult.kept_tables.length > 0 && (
                  <div className={styles.transferImpact}>
                    <span className={styles.transferImpactLabel}>Kept (org-wide):</span>
                    <ul className={styles.transferList}>
                      {transferResult.kept_tables.map(t => <li key={t.id}>{t.name}</li>)}
                    </ul>
                  </div>
                )}
                {transferResult.adoptions_affected.length > 0 && (
                  <div className={styles.transferImpact}>
                    <span className={styles.transferImpactLabel}>Adoption records retained:</span>
                    <ul className={styles.transferList}>
                      {transferResult.adoptions_affected.map((a, i) => <li key={i}>{a.department_name}</li>)}
                    </ul>
                  </div>
                )}
                <button className={styles.btnSecondary} onClick={() => setTransferring(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className={styles.transferRow}>
                  <span className={styles.transferFrom}>{service.department_name}</span>
                  <span className={styles.transferArrow}>→</span>
                  <select
                    className={styles.editSelect}
                    value={transferDeptId}
                    onChange={e => setTransferDeptId(e.target.value)}
                  >
                    <option value="">Select new department…</option>
                    {departments.filter(d => d.id !== service.department_id).map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {transferDeptId && (() => {
                  const toRemove = (service.impact_tables || []).filter(
                    t => t.scope === 'department' && !t.mandatory && t.department_id === service.department_id
                  );
                  const toKeep = (service.impact_tables || []).filter(
                    t => t.scope !== 'department' || t.mandatory || t.department_id !== service.department_id
                  );
                  return (
                    <div className={styles.transferPreview}>
                      {toRemove.length > 0 ? (
                        <div className={styles.transferWarning}>
                          <strong>These department-scoped impact table links will be removed:</strong>
                          <ul className={styles.transferList}>
                            {toRemove.map(t => <li key={t.id}>{t.name}</li>)}
                          </ul>
                        </div>
                      ) : (
                        <p className={styles.transferClean}>No impact table links will be removed.</p>
                      )}
                      {toKeep.length > 0 && (
                        <p className={styles.transferClean}>
                          {toKeep.length} org-wide table{toKeep.length !== 1 ? 's' : ''} will be kept.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {transferError && <p className={styles.editError}>{transferError}</p>}
                <div className={styles.editActions}>
                  <button
                    className={styles.btnDanger}
                    onClick={handleTransferConfirm}
                    disabled={transferSaving || !transferDeptId}
                  >
                    {transferSaving ? 'Transferring…' : 'Confirm transfer'}
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setTransferring(false)} disabled={transferSaving}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.tabs}>
          {[
            { key: 'overview',    label: 'Overview' },
            { key: 'impactTable', label: 'Impact Tables',             warn: !hasLinked },
            { key: 'systems',     label: 'Systems', count: (service.linked_systems || []).length },
            { key: 'treatment',   label: 'Treatment',
              warn:  (service.untreated_risks  || []).length > 0,
              count: (service.security_actions || []).length },
          ].map(tab => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.warn  && <span className={styles.tabWarn}> !</span>}
              {tab.count !== undefined && (
                <span className={styles.tabCount}> {tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ---- Overview tab ---- */}
        {activeTab === 'overview' && (
          <div className={styles.overview}>
            {/* A plain table, not a grid of cards. These are three facts about
                the service, and three facts read better as rows than as tiles
                sized for numbers they do not contain.

                The per-dimension C/I/A (3dBIL) cards are deliberately gone: the
                service is never rated directly — its impact is derived from the
                assets in its systems — and the summary card above already shows
                that derivation, with its contribution breakdown in expert view.
                Repeating C/I/A here added three tiles and no information. */}
            <table className={styles.factTable}>
              <tbody>
                <tr>
                  <th scope="row">Owner department</th>
                  <td>{service.owner_department_name || service.department_name || <span className={styles.unset}>—</span>}</td>
                </tr>
                <tr>
                  <th scope="row">Impact tables</th>
                  <td>
                    {hasLinked
                      ? <>
                          {(service.impact_tables || []).length} via its information assets
                          {' · '}
                          <button type="button" className={styles.inlineLink}
                                  onClick={() => setActiveTab('impactTable')}>see them</button>
                        </>
                      : <span className={styles.unset}>Its information assets are not rated yet</span>}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Impact source</th>
                  <td>
                    {service.cia_source === 'assets'
                      ? 'Derived from the information assets in this service\u2019s systems'
                      : <span className={styles.unset}>No rated information assets</span>}
                  </td>
                </tr>
              </tbody>
            </table>

            {!hasLinked && canEdit && (
              <div className={styles.noTableBanner}>
                <strong>Nothing rated yet.</strong>
                <p>
                  A service is not rated directly. Link the systems that deliver it, then
                  rate the information assets they hold — its impact follows from those.
                </p>
                <button className={styles.btnPrimary} onClick={() => setActiveTab('systems')}>
                  Link systems &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- Linked Information Assets tab ---- */}
        {activeTab === 'systems' && (
          <ServiceSystemsTab
            service={service}
            canEdit={canEdit}
            isExpert={isExpert}
            onRefresh={fetchAll}
          />
        )}

        {/* ---- Treatment tab — questions 4, 5, 6 ---- */}
        {activeTab === 'treatment' && (
          <ServiceTreatmentTab service={service} isExpert={isExpert} />
        )}

        {/* ---- Impact Tables tab — derived, read-only ---- */}
        {activeTab === 'impactTable' && (
          <div className={styles.impactTableTab}>
            <div className={styles.tableAssignSection}>
              <div className={styles.tableAssignTitleRow}>
                <h3 className={styles.tableAssignTitle}>Impact Tables</h3>
                <Link to="/impact-tables" className={styles.impactTablesLink}>
                  Edit table definitions →
                </Link>
              </div>

              <p className={styles.emptyHint}>
                A service is not rated directly — its impact is the highest rating of the
                information assets it uses. These are the tables those assets are rated
                against. To change what appears here, rate the assets.
              </p>

              {!hasLinked ? (
                <p className={styles.emptyHint}>
                  None of this service&apos;s information assets have been rated against an
                  impact table yet.
                </p>
              ) : (
                /* The same columns as the impact-tables list page, so a table
                   reads identically wherever it appears — with one extra column
                   that only makes sense here: which of this service's assets
                   bring the table in, and at what level. That is the answer to
                   "why is this table listed against my service?". */
                <div className={styles.itTableWrap}>
                  <table className={styles.itTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Scope</th>
                        <th>Department</th>
                        <th>BIL levels</th>
                        <th>Brought in by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(service.impact_tables || []).map(t => {
                        const bilFilled = (t.bil_levels || []).filter(l => l.statement?.trim()).length;
                        const raters = t.rated_by_assets || [];
                        return (
                          <tr key={t.id} className={styles.itRow}>
                            <td className={styles.itName}>
                              <Link to={`/impact-tables?selected=${t.id}`} className={styles.itLink}>{t.name}</Link>
                              {t.mandatory && <span className={styles.mandatoryBadge}>Mandatory</span>}
                            </td>
                            <td>
                              <span className={styles.scopeBadge}>
                                {t.scope === 'organisation' ? 'Organisation' : 'Department'}
                              </span>
                            </td>
                            <td className={styles.itMuted}>
                              {t.department_name || <span className={styles.unset}>Unassigned</span>}
                            </td>
                            <td className={styles.itMuted}>{bilFilled}/5</td>
                            <td className={styles.itMuted}>
                              {raters.length === 0
                                ? <span className={styles.unset}>&mdash;</span>
                                : raters.map(r => `${r.asset_name} (${r.rated_level ?? '—'})`).join(', ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
