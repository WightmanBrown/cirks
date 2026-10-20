// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  getAsset, createAsset, updateAsset, deactivateAsset,
  rateAsset,
  linkSystemInformationAsset,
  getSuggestedImpactTables, linkAssetImpactTables, unlinkAssetImpactTable,
  getDepartments, getUsers, getImpactTables,
} from '../api';
import { CROSS_DEPT_ROLES } from '../utils/departmentScope';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { personLabel } from '../utils/roles';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { AssetSummaryCard } from '../components/AssetSummaryCard';
import { RiskPathTree } from '../components/RiskPathTree';
import { RatingFindingBanner } from '../components/RatingFindingBanner';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { useViewMode } from '../hooks/useViewMode';
import { seatCanWrite } from '../utils/seatScope';
import styles from './InformationAssetDetailPage.module.css';

const CAN_EDIT   = new Set(['ciso', 'admin', 'security_consultant', 'information_asset_manager']);
const DIM_LABELS = { c: 'Confidentiality', i: 'Integrity', a: 'Availability' };

function initRatings(asset) {
  const init = {};
  (asset.impact_ratings || []).forEach(t => {
    init[t.id] = {
      level:     t.rating?.level     ?? null,
      c_level:   t.rating?.c_level   ?? null,
      i_level:   t.rating?.i_level   ?? null,
      a_level:   t.rating?.a_level   ?? null,
      c_dropped: t.rating?.c_dropped ?? false,
      i_dropped: t.rating?.i_dropped ?? false,
      a_dropped: t.rating?.a_dropped ?? false,
    };
  });
  return init;
}

function effectiveDim(r, dim, table) {
  if (r[`${dim}_dropped`]) return null;
  if (r[`${dim}_level`])   return r[`${dim}_level`];
  const ciaEntry = (table.cia_levels || []).find(cl => cl.level === r.level && cl.dimension === dim);
  return ciaEntry?.statement?.trim() ? r.level : null;
}

function RatingPanel({ asset, canEdit, onSaved, isExpert = false }) {
  // View mode is driven by the page-level toggle (passed in as isExpert).
  const hasRatings = (asset.impact_ratings || []).length > 0;
  const [tableRatings, setTableRatings] = useState(() => initRatings(asset));
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => { setTableRatings(initRatings(asset)); }, [asset]);

  function setLevel(tableId, lvl) {
    setTableRatings(prev => ({
      ...prev,
      [tableId]: { ...prev[tableId], level: prev[tableId].level === lvl ? null : lvl },
    }));
  }

  function setDimLevel(tableId, dim, lvl) {
    setTableRatings(prev => ({
      ...prev,
      [tableId]: {
        ...prev[tableId],
        [`${dim}_level`]: prev[tableId][`${dim}_level`] === lvl ? null : lvl,
      },
    }));
  }

  function tableWarning(table) {
    const r = tableRatings[table.id];
    if (!r?.level) return null;
    let ciaMax = null;
    for (const dim of ['c', 'i', 'a']) {
      const eff = effectiveDim(r, dim, table);
      if (eff) ciaMax = Math.max(ciaMax || 0, eff);
    }
    if (ciaMax === null) return 'All CIA dimensions are inactive — no security impact will be recorded.';
    if (ciaMax < r.level) return `Max active CIA level (BIL ${ciaMax}) is below the 1dBIL (BIL ${r.level}). Raise a CIA dimension or lower the 1dBIL.`;
    return null;
  }

  function computeMax() {
    let c = null, i = null, a = null;
    (asset.impact_ratings || []).forEach(t => {
      const r = tableRatings[t.id];
      if (!r?.level) return;
      const cv = effectiveDim(r, 'c', t); if (cv) c = Math.max(c || 0, cv);
      const iv = effectiveDim(r, 'i', t); if (iv) i = Math.max(i || 0, iv);
      const av = effectiveDim(r, 'a', t); if (av) a = Math.max(a || 0, av);
    });
    return { c, i, a };
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const ratings = Object.entries(tableRatings)
        .filter(([, r]) => r.level)
        .map(([id, r]) => ({
          impact_table_id: parseInt(id, 10),
          level:     r.level,
          c_level:   r.c_level   ?? null,
          i_level:   r.i_level   ?? null,
          a_level:   r.a_level   ?? null,
          // Dimensions are never "not applicable" — every dim floors to ≥1.
          c_dropped: false,
          i_dropped: false,
          a_dropped: false,
        }));
      await rateAsset(asset.id, ratings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!hasRatings) {
    return (
      <div className={styles.noRatings}>
        <p>No impact ratings yet.</p>
        <p className={styles.noRatingsHint}>
          Rate this asset against its linked impact tables to set its CIA impact.
          A business service&apos;s impact is derived as the maximum across the
          assets linked to it.
        </p>
      </div>
    );
  }

  const showExpert = isExpert;
  const cia = computeMax();

  return (
    <div className={styles.ratingPanel}>
      <div className={styles.ciaMaxRow}>
        {[['C','c','Confidentiality'],['I','i','Integrity'],['A','a','Availability']].map(([dim, key, label]) => (
          <div key={dim} className={styles.ciaMaxCard}>
            <div className={styles.ciaMaxLabel}>{label}</div>
            <div>
              {cia[key]
                ? <span className={`${styles.bilPill} ${styles[`bil${cia[key]}`]}`}>BIL {cia[key]}</span>
                : <span className={styles.unset}>Unrated</span>
              }
            </div>
          </div>
        ))}
      </div>

      {(asset.impact_ratings || []).map(table => {
        const bilMap = {};
        (table.bil_levels || []).forEach(l => { bilMap[l.level] = l.statement || ''; });
        const ciaMap = {};
        (table.cia_levels || []).forEach(l => {
          if (!ciaMap[l.dimension]) ciaMap[l.dimension] = {};
          ciaMap[l.dimension][l.level] = l.statement || '';
        });
        const r       = tableRatings[table.id] || {};
        const warning = showExpert ? tableWarning(table) : null;

        return (
          <div key={table.id} className={styles.ratingTableSection}>
            <div className={styles.ratingTableHeader}>
              {table.name}
              {table.scope === 'organisation'
                ? <span className={styles.scopeChipOrg}>Cross organisation</span>
                : <span className={styles.scopeChipDept}>{table.department_name}</span>
              }
            </div>
            {table.description && <p className={styles.ratingTableDesc}>{table.description}</p>}

            <div className={styles.bilSectionLabel}>
              {showExpert ? '1dBIL — Overall business impact' : '1dBIL — Select impact level'}
            </div>
            <div className={styles.bilPickerH}>
              {[1,2,3,4,5].map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  disabled={!canEdit}
                  className={r.level === lvl ? `${styles.bilBtnH} ${styles.bilBtnHActive}` : styles.bilBtnH}
                  onClick={() => setLevel(table.id, lvl)}
                >
                  <span className={styles.bilBtnHLevel}>BIL {lvl}</span>
                  {bilMap[lvl]
                    ? <span className={styles.bilBtnHStmt}>{bilMap[lvl]}</span>
                    : <span className={styles.bilBtnHEmpty}>—</span>
                  }
                </button>
              ))}
            </div>

            {showExpert && (
              <div className={styles.ciaRatingSection}>
                {['c','i','a'].map(dim => {
                  const explicit = r[`${dim}_level`] ?? null;
                  const dimStmts = ciaMap[dim] || {};
                  // Every dimension is always rated (min BIL 1). There is no
                  // "not applicable" — an unset dimension defaults to the 1dBIL
                  // level, and anything a table doesn't describe floors to 1.
                  return (
                    <div key={dim} className={styles.ciaRatingRow}>
                      <div className={styles.ciaRatingRowHead}>
                        <span className={styles.ciaDropLabel}>
                          <span className={styles.ciaDropDim}>{dim.toUpperCase()}</span>
                          <span className={styles.ciaDropFull}>{DIM_LABELS[dim]}</span>
                        </span>
                      </div>
                      <div className={styles.bilPickerH}>
                        {[1,2,3,4,5].map(lvl => {
                          const isActive = explicit !== null ? explicit === lvl : r.level === lvl;
                          return (
                            <button
                              key={lvl}
                              type="button"
                              disabled={!canEdit}
                              className={isActive ? `${styles.bilBtnH} ${styles.bilBtnHActive}` : styles.bilBtnH}
                              onClick={() => setDimLevel(table.id, dim, lvl)}
                            >
                              <span className={styles.bilBtnHLevel}>BIL {lvl}</span>
                              {dimStmts[lvl]
                                ? <span className={styles.bilBtnHStmt}>{dimStmts[lvl]}</span>
                                : <span className={styles.bilBtnHEmpty}>—</span>
                              }
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {warning && <div className={styles.ciaConsistencyWarn}>⚠ {warning}</div>}
              </div>
            )}
          </div>
        );
      })}

      {canEdit && (
        <div className={styles.ratingFooter}>
          <div className={styles.saveRow}>
            {error && <span className={styles.errorMsg}>{error}</span>}
            {saved && <span className={styles.savedMsg}>✓ Saved</span>}
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Ratings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// Lets the user choose which impact tables apply to the asset. Suggested tables
// come from the Service → assets → impact tables relationship; further tables can
// be added from the department / organisation set. Selecting a table links it
// (unrated); it then appears in the rating panel below ready to be rated.
function ImpactTablesSection({ asset, canEdit, onChanged }) {
  const [suggested, setSuggested] = useState([]);
  const [available, setAvailable] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const linked    = asset.impact_ratings || [];

  useEffect(() => {
    Promise.all([
      getSuggestedImpactTables(asset.id),
      getImpactTables(asset.department_id ? { dept_id: asset.department_id } : {}),
    ])
      .then(([sug, avail]) => { setSuggested(sug); setAvailable(avail); })
      .catch(() => {});
  }, [asset]);

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); await onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Action failed'); }
    finally { setBusy(false); }
  }

  const linkedIds = new Set(linked.map(t => t.id));
  // A mandatory table applies to EVERY asset (docs/reporting-requirements.md).
  // It was previously indistinguishable from any other table in these lists, so
  // skipping one was invisible rather than a choice — and a missing mandatory
  // table can only understate the asset's CIA, which flows into system impact
  // and every risk score on it. Required tables are therefore pulled out and
  // shown first; the rest keep their existing grouping.
  const requiredMissing = available.filter(t => t.mandatory && !linkedIds.has(t.id));
  const requiredIds     = new Set(requiredMissing.map(t => t.id));
  const sugUnlinked   = suggested.filter(t => !linkedIds.has(t.id) && !requiredIds.has(t.id));
  const sugIds        = new Set(sugUnlinked.map(t => t.id));
  const availUnlinked = available.filter(
    t => !linkedIds.has(t.id) && !sugIds.has(t.id) && !requiredIds.has(t.id));
  const unratedRequired = linked.filter(t => t.mandatory && !t.rating?.level).length;
  const scope = t => (t.scope === 'organisation' ? 'Organisation' : (t.department_name || 'Department'));

  return (
    <div className={styles.impactTablesSection}>
      <h3 className={styles.itTitle}>Impact tables</h3>
      <p className={styles.muted}>
        Information assets are rated against impact tables. Choose the tables that apply,
        then rate the asset against each one below.
      </p>

      {canEdit && requiredMissing.length > 0 && (
        <div className={`${styles.itGroup} ${styles.itGroupRequired}`}>
          <div className={styles.itGroupTitle}>
            Required — not yet applied to this asset
            <button className={styles.btnLink} disabled={busy}
              onClick={() => run(() => linkAssetImpactTables(asset.id, requiredMissing.map(t => t.id)))}>
              Add all
            </button>
          </div>
          <p className={styles.itRequiredNote}>
            These impact tables are mandatory across the organisation and apply to every
            information asset. Leaving one out can only understate this asset&rsquo;s impact,
            which carries through to the systems that hold it.
          </p>
          {requiredMissing.map(t => (
            <div key={t.id} className={styles.itRow}>
              <span className={styles.itName}>{t.name}</span>
              <span className={styles.itRequiredChip}>required</span>
              <span className={styles.itMeta}>{scope(t)}</span>
              <button className={styles.btnSecondary} disabled={busy}
                onClick={() => run(() => linkAssetImpactTables(asset.id, [t.id]))}>
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {!canEdit && requiredMissing.length > 0 && (
        <p className={styles.itRequiredNote}>
          {requiredMissing.length} mandatory impact table
          {requiredMissing.length === 1 ? ' has' : 's have'} not been applied to this asset.
        </p>
      )}

      {linked.length > 0 ? (
        <div className={styles.itGroup}>
          <div className={styles.itGroupTitle}>Applied to this asset</div>
          {unratedRequired > 0 && (
            <p className={styles.itRequiredNote}>
              {unratedRequired} required table{unratedRequired === 1 ? ' is' : 's are'} applied
              but not yet rated — the asset is not fully rated until {unratedRequired === 1 ? 'it is' : 'they are'}.
            </p>
          )}
          {linked.map(t => (
            <div key={t.id} className={styles.itRow}>
              <span className={styles.itName}>{t.name}</span>
              {t.mandatory && <span className={styles.itRequiredChip}>required</span>}
              <span className={styles.itMeta}>{scope(t)}</span>
              <span className={t.rating?.level ? styles.itRated : styles.itUnrated}>
                {t.rating?.level ? 'Rated' : 'Not yet rated'}
              </span>
              {canEdit && !t.rating?.level && !t.mandatory && (
                <button className={styles.btnUnlink} disabled={busy} onClick={() => run(() => unlinkAssetImpactTable(asset.id, t.id))}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>No impact tables applied yet.</p>
      )}

      {canEdit && sugUnlinked.length > 0 && (
        <div className={styles.itGroup}>
          <div className={styles.itGroupTitle}>
            Suggested from linked services
            <button className={styles.btnLink} disabled={busy} onClick={() => run(() => linkAssetImpactTables(asset.id, sugUnlinked.map(t => t.id)))}>
              Add all
            </button>
          </div>
          {sugUnlinked.map(t => (
            <div key={t.id} className={styles.itRow}>
              <span className={styles.itName}>{t.name}</span>
              <span className={styles.itMeta}>{scope(t)}</span>
              <button className={styles.btnSecondary} disabled={busy} onClick={() => run(() => linkAssetImpactTables(asset.id, [t.id]))}>
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {canEdit && availUnlinked.length > 0 && (
        <div className={styles.itGroup}>
          <div className={styles.itGroupTitle}>Add from your department / organisation</div>
          <select
            className={styles.select}
            value=""
            disabled={busy}
            onChange={e => { if (e.target.value) run(() => linkAssetImpactTables(asset.id, [Number(e.target.value)])); }}
          >
            <option value="">— select an impact table —</option>
            {availUnlinked.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({scope(t)})</option>
            ))}
          </select>
        </div>
      )}

      {err && <p className={styles.errorMsg}>{err}</p>}
    </div>
  );
}

export function InformationAssetDetailPage() {
  const { id }    = useParams();
  const isNew     = !id;
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSystemId   = isNew ? (searchParams.get('system')  || null) : null;
  const fromServiceId  = isNew ? (searchParams.get('service') || null) : null;
  const { user, departmentIsolation } = useAuth();
  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const [asset, setAsset]         = useState(null);
  const [departments, setDepts]   = useState([]);
  const [allUsers, setAllUsers]   = useState([]);

  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [deptId, setDeptId]     = useState('');
  const [ownerId, setOwner]     = useState('');
  const [managerId, setManager] = useState('');
  const [notes, setNotes]       = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isShared, setIsShared] = useState(false);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [saved, setSaved]       = useState(false);

  const [activeTab, setActiveTab] = useState('details');

  // Seat eligibility: dept-scoped roles edit only their own dept's assets.
  // Creating a new asset is allowed (no existing row to scope against).
  const canEdit    = CAN_EDIT.has(user?.role) && (isNew || seatCanWrite(user, departmentIsolation, asset?.department_id));
  const isCrossDept = CROSS_DEPT_ROLES.has(user?.role);

  useEffect(() => {
    if (isNew) {
      Promise.all([
        getDepartments(),
        canEdit ? getUsers() : Promise.resolve([]),
      ]).then(([d, u]) => {
        setDepts(d);
        setAllUsers(u);
      }).catch(err => {
        setError(err.response?.data?.error || 'Failed to load form');
      }).finally(() => setLoading(false));
      return;
    }
    Promise.all([
      getAsset(id),
      getDepartments(),
      canEdit ? getUsers() : Promise.resolve([]),
        // The full service list fed the retired link picker only; a service
        // composes systems in v104, so an asset's services are derived.
    ]).then(([a, d, u]) => {
      setAsset(a);
      setDepts(d);
      setAllUsers(u);
      resetForm(a);
    }).catch(err => {
      setError(err.response?.data?.error || 'Failed to load asset');
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function resetForm(a) {
    setName(a.name);
    setDesc(a.description || '');
    setDeptId(a.department_id || '');
    setOwner(a.owner_id || '');
    setManager(a.manager_id || '');
    setNotes(a.rating_notes || '');
    setIsActive(a.is_active);
    setIsShared(Boolean(a.is_shared));
  }

  async function reload() {
    const updated = await getAsset(id);
    setAsset(updated);
    resetForm(updated);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!deptId)      { setError('Department is required'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await createAsset({
        name: name.trim(),
        description: desc.trim() || null,
        department_id: deptId,
        owner_user_id: ownerId || null,
        managed_by_user_id: managerId || null,
        rating_notes: notes.trim() || null,
        is_shared: isShared,
      });
      if (fromSystemId) {
        await linkSystemInformationAsset(fromSystemId, created.id);
        navigate(`/systems/${fromSystemId}`);
      } else if (fromServiceId) {
        // v104: nothing to link — a service composes SYSTEMS, so an asset joins
        // one by being placed in a system that service uses.
        navigate(`/services/${fromServiceId}`);
      } else {
        navigate(`/assets/${created.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create asset');
      setSaving(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateAsset(id, {
        name: name.trim(),
        description: desc.trim() || null,
        department_id: deptId,
        owner_user_id: ownerId || null,
        managed_by_user_id: managerId || null,
        rating_notes: notes.trim() || null,
        is_active: isActive,
        is_shared: isShared,
      });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate "${asset.name}"? It will be hidden from lists.`)) return;
    try {
      await deactivateAsset(id);
      navigate('/assets');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate');
    }
  }



  if (loading) return <Shell><p className={styles.muted}>Loading…</p></Shell>;

  // ── Create mode (/assets/new) ──────────────────────────────────────────────
  // Capture the basics, create the asset, then continue on the detail page to
  // link services and rate against impact tables.
  if (isNew) {
    return (
      <Shell>
        <div className={styles.page}>
          <div className={styles.breadcrumb}>
            <BackButton fallback="/assets" />
          </div>
          <h1 className={styles.createTitle}>New Information Asset</h1>
          {(fromSystemId || fromServiceId)
            ? <p className={styles.muted}>
                This asset will be linked to the {fromSystemId ? 'system' : 'service'} automatically
                on creation. You can rate it against impact tables from the asset&apos;s detail page.
              </p>
            : <p className={styles.muted}>
                Create the asset below. You&apos;ll then link services and rate it against its
                impact tables on the next screen.
              </p>
          }
          <form className={styles.form} onSubmit={handleCreate}>
            <div className={styles.formGrid}>
              <label className={styles.fieldLabel}>
                Name
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} autoFocus />
              </label>
              <label className={styles.fieldLabel}>
                Department
                <select className={styles.select} value={deptId} onChange={e => setDeptId(e.target.value)}>
                  <option value="">— select department —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Owner (IAO)
                <select className={styles.select} value={ownerId} onChange={e => setOwner(e.target.value)}>
                  <option value="">— default to department head —</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Managed by (IAM)
                <select className={styles.select} value={managerId} onChange={e => setManager(e.target.value)}>
                  <option value="">— unassigned —</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
                </select>
              </label>
              <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
                Description
                <textarea className={styles.textarea} rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
              </label>
            </div>
            <div className={styles.checkboxField}>
              <label className={styles.checkboxLabel}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  checked={isShared}
                  onChange={e => setIsShared(e.target.checked)}
                />
                <span>Shared information asset</span>
                {isShared && <span className={styles.sharedTag}>shared</span>}
              </label>
              <p className={styles.fieldHint}>
                Counts towards every department&apos;s impact, not just{' '}
                {departments.find(d => d.id === deptId)?.name || 'the owning department'}&apos;s.
              </p>
            </div>
            {error && <p className={styles.errorMsg}>{error}</p>}
            <div className={styles.formActions}>
              <button type="submit" disabled={saving} className={styles.btnPrimary}>
                {saving ? 'Creating…' : 'Create asset'}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => navigate(fromSystemId ? `/systems/${fromSystemId}` : fromServiceId ? `/services/${fromServiceId}` : '/assets')}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </Shell>
    );
  }

  if (!asset && error) return <Shell><p className={styles.errorMsg}>{error}</p></Shell>;
  if (!asset) return null;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <BackButton fallback="/assets" />
          {!canEdit && <ReadOnlyBadge reason="Your role has view-only access to information assets." />}
          <span className={styles.viewModeSlot}><ViewModeToggle {...viewMode} /></span>
        </div>

        <AssetSummaryCard asset={asset} isExpert={isExpert} />

        <RatingFindingBanner asset={asset} onChanged={reload} />

        {asset.risk_paths && asset.risk_paths.length > 0 && (
          <RiskPathTree paths={asset.risk_paths} title="Risks to this information asset" groupBy="system" collapsed isExpert={isExpert} />
        )}

        <div className={styles.tabs}>
          <button
            className={activeTab === 'details' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('details')}
          >Details</button>
          <button
            className={activeTab === 'services' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('services')}
          >
            Linked Services
            <span className={styles.tabCount}>{(asset.linked_services || []).length}</span>
          </button>
          <button
            className={activeTab === 'rating' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('rating')}
          >
            Impact &amp; Rating
            <span className={styles.tabCount}>{(asset.impact_ratings || []).length}</span>
          </button>
        </div>

        {activeTab === 'details' && (
          <form className={styles.form} onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <label className={styles.fieldLabel}>
                Name
                <input
                  className={styles.input}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!canEdit}
                />
              </label>

              {isCrossDept ? (
                <label className={styles.fieldLabel}>
                  Department
                  <select
                    className={styles.select}
                    value={deptId}
                    onChange={e => setDeptId(e.target.value)}
                    disabled={!canEdit}
                  >
                    <option value="">— none —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className={styles.fieldLabel}>
                  Department
                  <input className={styles.input} value={asset.department_name || '—'} disabled />
                </label>
              )}

              <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
                Description
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  disabled={!canEdit}
                />
              </label>

              {canEdit && (
                <label className={styles.fieldLabel}>
                  Owner (IAO)
                  <select className={styles.select} value={ownerId} onChange={e => setOwner(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{personLabel(u)}</option>
                    ))}
                  </select>
                </label>
              )}

              {canEdit && (
                <label className={styles.fieldLabel}>
                  Managed by (IAM)
                  <select className={styles.select} value={managerId} onChange={e => setManager(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{personLabel(u)}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
                Rating Notes
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>

            <div className={styles.checkboxField}>
              <label className={styles.checkboxLabel}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  checked={isShared}
                  onChange={e => setIsShared(e.target.checked)}
                  disabled={!canEdit}
                  title={!canEdit ? 'View only' : undefined}
                />
                <span>Shared information asset</span>
                {isShared && <span className={styles.sharedTag}>shared</span>}
              </label>
              <p className={styles.fieldHint}>
                Counts towards every department&apos;s impact, not just{' '}
                {asset.department_name || 'the owning department'}&apos;s.
              </p>
            </div>

            {asset.rated_by_name && (
              <p className={styles.ratedBy}>
                Last rated by {asset.rated_by_name}
                {asset.rated_at && ` on ${new Date(asset.rated_at).toLocaleDateString()}`}
              </p>
            )}

            {error && <p className={styles.errorMsg}>{error}</p>}
            {saved && <p className={styles.savedMsg}>Saved.</p>}

            {canEdit && (
              <div className={styles.formActions}>
                <button type="submit" disabled={saving} className={styles.btnPrimary}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {['ciso', 'admin'].includes(user?.role) && asset.is_active && (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={handleDeactivate}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            )}
          </form>
        )}

        {activeTab === 'rating' && (
          <>
            <ImpactTablesSection asset={asset} canEdit={canEdit} onChanged={reload} />
            <RatingPanel
              asset={asset}
              canEdit={canEdit}
              onSaved={reload}
              isExpert={isExpert}
            />
          </>
        )}

        {activeTab === 'services' && (
          <div className={styles.servicesPanel}>
            {(asset.linked_services || []).length === 0 ? (
              <p className={styles.muted}>No services linked to this asset.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Department</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {(asset.linked_services || []).map(s => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/services/${s.id}`} className={styles.serviceLink}>{s.name}</Link>
                      </td>
                      <td className={styles.deptCell}>{s.department_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* v104: services are DERIVED here — a service composes systems, so
                this asset appears under a service once it sits in one of that
                service's systems. Nothing to link from this side. */}
          </div>
        )}
      </div>
    </Shell>
  );
}
