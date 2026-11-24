// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getSupplier, updateSupplier, deleteSupplier,
  createSupplierRelationship, updateSupplierRelationship, deleteSupplierRelationship,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { EntityKind } from '../components/EntityKind';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { SupplierRelationshipForm } from '../components/SupplierRelationshipForm';
import { SupplierRelationshipsTable } from '../components/SupplierRelationshipsTable';
import { SupplierCriticality } from '../components/SupplierCriticality';
import { seatCanWrite } from '../utils/seatScope';
import { SupplierRelationshipsDiagram } from '../components/SupplierRelationshipsDiagram';
import { SupplierAssuranceDiagram, assuranceCounts, relationshipsByAssurance } from '../components/SupplierAssuranceDiagram';
import { SupplierAssurance } from '../components/SupplierAssurance';
import { CompletenessRing } from '../components/CompletenessRing';
import { FilterChip } from '../components/FilterChip';
import { RatingChip } from '../components/RatingChip';
import { criticalityNarrative } from '../utils/supplierCriticality';
import { supplierTypeLabel } from '../utils/supplierTypes';
import { departmentColour } from '../utils/departmentColour';
import styles from './ScopesPage.module.css';
import own from './SupplierDetailPage.module.css';

// One supplier and the relationships we have with it. Each relationship is
// owned by the department that contracts it; an IAM/IAO records and edits their
// own department's. A relationship that has run its course is ENDED — deleting
// is for one recorded in error.
function AssetRows({ assets, isExpert, navigate, empty }) {
  if (!assets.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <div className={own.assetRows}>
      {assets.map(a => (
        <button key={a.id} type="button" className={own.assetRow}
          style={{ borderLeftColor: departmentColour(a.department_id) }} onClick={() => navigate(`/assets/${a.id}`)}>
          <RatingChip value={topImpact(a) || null} scale="impact" variant={isExpert ? 'number' : 'word'} />
          <span className={own.assetName}>{a.name}{a.is_shared && ' · shared'}</span>
          <span className={own.assetMeta}>{a.department_name || 'No department'} · in {(a.system_ids || []).length} system{(a.system_ids || []).length === 1 ? '' : 's'}</span>
        </button>
      ))}
    </div>
  );
}

const topImpact = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);

export function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // ?relationship=<id>: opened for one relationship (a finding links here), so
  // its assurance starts open and scrolls into view.
  const [search] = useSearchParams();
  const focusRel = search.get('relationship');
  const { user, hasCapability, departmentIsolation } = useAuth();
  const canWrite = hasCapability('suppliers.write');
  const viewMode = useViewMode();
  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState('');
  const [notes, setNotes]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [editRel, setEditRel]   = useState(null);
  // Relationships is the first tab and the one the page opens on (owner,
  // 2026-11-19). A relationship in its picture lights its systems and narrows
  // the cards to it; the chip's ×, the supplier or choosing it again lists all.
  // Opened from a finding (?relationship=), the page starts on its assurance.
  const [tab, setTab]           = useState(focusRel ? 'assurance' : 'relationships');
  const [relPick, setRelPick]   = useState(null);
  // The Assurance tab: the relationship drawn as a layer, and the objective
  // (or No evidence) lit in it.
  const [assRel, setAssRel]     = useState(focusRel);
  const [assPick, setAssPick]   = useState(null);

  const load = useCallback(async () => {
    try { setData(await getSupplier(id)); setError(''); }
    catch (err) { setError(err?.response?.status === 404 ? 'Supplier not found.' : 'Could not load the supplier.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  if (!data) {
    return <Shell><div className={styles.page}><BackButton fallback="/suppliers" />{error && <div className={styles.error} role="alert">{error}</div>}</div></Shell>;
  }
  const canEditRel = (r) => canWrite && seatCanWrite(user, departmentIsolation, r.department_id);
  const { level } = criticalityNarrative(data.name, data.relationships);
  const pickedId = relPick?.startsWith('rel:') ? relPick.slice(4) : null;
  // Every information asset the supplier may reach through a live relationship,
  // unfolded under the picture from its "N more" box.
  const liveRels = new Set(data.relationships.filter(r => r.status === 'active').map(r => r.id));
  const reachable = (data.information_assets || []).filter(a => (a.relationship_ids || []).some(rid => liveRels.has(rid)));
  const picked = pickedId ? data.relationships.find(r => r.id === pickedId) : null;
  const pickRel = (rid) => setRelPick(cur => (cur === `rel:${rid}` ? null : `rel:${rid}`));
  // A system chosen in the picture or a list: what it holds that the supplier may reach.
  const pickSys = (sid) => setRelPick(cur => (cur === `sys:${sid}` ? null : `sys:${sid}`));
  const pickedSysId = relPick?.startsWith('sys:') ? relPick.slice(4) : null;
  const sysById = new Map(data.relationships.flatMap(r => r.systems || []).map(y => [y.id, y]));
  const pickedSys = pickedSysId ? sysById.get(pickedSysId) || null : null;
  const assetsOf = (pred) => reachable.filter(pred)
    .sort((x, y) => topImpact(y) - topImpact(x) || x.name.localeCompare(y.name));
  const pickedAssets = picked ? assetsOf(a => (a.relationship_ids || []).includes(picked.id))
    : pickedSys ? assetsOf(a => (a.system_ids || []).includes(pickedSys.id)) : [];
  const reachingSys = pickedSys ? data.relationships.filter(r => (r.systems || []).some(y => y.id === pickedSys.id)) : [];
  const counts = assuranceCounts(data.relationships);
  const assChosen = relationshipsByAssurance(data.relationships).find(r => r.id === assRel)
    || relationshipsByAssurance(data.relationships)[0] || null;
  const TABS = [
    { key: 'relationships', label: 'Relationships', count: data.relationships.length },
    { key: 'assurance', label: 'Assurance', warn: counts.findings > 0 },
    { key: 'criticality', label: 'Criticality' },
  ];

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/suppliers" />
        <div className={styles.header}>
          <div>
            {editing ? (
              <div className={styles.create}>
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} aria-label="Supplier name" maxLength={200} />
                <input className={styles.input} value={notes} onChange={e => setNotes(e.target.value)} aria-label="Notes" placeholder="Notes" />
                <button className={styles.primary} onClick={() => run(async () => { await updateSupplier(id, { name, notes }); setEditing(false); })}>Save</button>
                <button className={styles.secondary} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <h1 className={styles.title}>{data.name}<EntityKind kind="supplier" /> <HelpDot k="supplier_detail.title" placement="bottom" /></h1>
                {data.notes && <p className={`${styles.desc} ${own.oneLine}`} title={data.notes}>{data.notes}</p>}
              </>
            )}
          </div>
          <div className={`${styles.actions} ${own.actionsRow}`}>
            <span className={own.crit} title="How critical the supplier is: the highest impact of the systems its live relationships reach">
              Criticality <RatingChip value={level} scale="impact" variant={viewMode.isExpert ? 'number' : 'word'} />
            </span>
            <ViewModeToggle {...viewMode} />
            {canWrite && !editing && (
              <>
                <button className={styles.secondary} onClick={() => { setName(data.name); setNotes(data.notes ?? ''); setEditing(true); }}>Edit</button>
                {data.relationships.length === 0 && (
                  <button className={styles.danger}
                    onClick={() => run(async () => { await deleteSupplier(id); navigate('/suppliers'); })}>Delete supplier</button>
                )}
              </>
            )}
            {!canWrite && <ReadOnlyBadge reason="Recording suppliers needs the suppliers.write capability." />}
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={own.tabs} role="tablist">
          {TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={tab === t.key ? own.tabActive : own.tab} onClick={() => setTab(t.key)}>
              {t.label}{t.warn && <span className={own.tabWarn}> !</span>}{t.count !== undefined && <span className={own.tabCount}>{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'assurance' && (
          <section className={styles.section}>
            <div className={own.summary}>
              <CompletenessRing complete={counts.met} partial={counts.expired} missing={counts.missing} size={56}
                labels={{ complete: 'met', partial: 'evidence expired', missing: 'not evidenced' }}
                of="supplier control objectives" />
              <p className={own.summaryText}>
                Across {counts.live} live relationship{counts.live === 1 ? '' : 's'}: <b>{counts.met}</b> of{' '}
                {counts.met + counts.expired + counts.missing} supplier control objectives met by current evidence
                {counts.expired > 0 && <>, {counts.expired} covered only by expired evidence</>}
                {counts.missing > 0 && <>, {counts.missing} not evidenced</>}.{' '}
                {counts.evidence} piece{counts.evidence === 1 ? '' : 's'} of evidence recorded, {counts.current} current.{' '}
                {counts.findings > 0
                  ? <span className={own.bad}>{counts.findings} open finding{counts.findings === 1 ? '' : 's'}.</span>
                  : <span className={own.good}>No open finding.</span>}
              </p>
            </div>
            <div className={own.picture}>
              <SupplierAssuranceDiagram supplier={data} selected={assChosen?.id} active={assPick}
                onSelect={(rid) => { setAssRel(rid); setAssPick(null); }}
                onObjective={(k) => setAssPick(cur => (cur === k ? null : k))} />
              <p className={styles.note}>
                Select a relationship to draw its control objectives and the evidence covering each; select an objective
                to light its evidence, or No evidence to light every objective nothing covers.{' '}
                <HelpDot k="supplier_detail.assurance_picture" placement="bottom" />
              </p>
            </div>
            {assChosen && (
              <SupplierAssurance key={assChosen.id} relationship={assChosen} canEdit={canEditRel(assChosen)}
                onChanged={load} defaultOpen focus={assChosen.id === focusRel} />
            )}
          </section>
        )}

        {tab === 'criticality' && (
          <SupplierCriticality supplierName={data.name} relationships={data.relationships} isExpert={viewMode.isExpert} />
        )}

        {tab === 'relationships' && (
        <section className={styles.section}>
          <div className={own.picture}>
            <SupplierRelationshipsDiagram supplier={data} level={level} active={relPick}
              onRelationship={pickRel}
              onSystem={pickSys} onSupplier={() => setRelPick(null)}
              onAsset={(aid) => navigate(`/assets/${aid}`)}
              onAssets={() => setRelPick(cur => (cur === 'assets' ? null : 'assets'))} />
            <p className={styles.note}>
              Each relationship is one thing we have with this supplier, in the colour of the department contracting
              it, with how much of its assurance is met, the systems it reaches and the information assets held in them. Select a
              relationship to list every system and information asset it reaches, or a system to see what it holds; an
              asset opens it.{' '}
              <HelpDot k="supplier_detail.relationships" placement="bottom" />
            </p>
            {picked && (
              <>
                <FilterChip words={`${supplierTypeLabel(picked.relationship_type)}: ${picked.component_name || picked.system_name} · ${(picked.systems || []).length} system${(picked.systems || []).length === 1 ? '' : 's'}`}
                  stripe={departmentColour(picked.department_id)} onClose={() => setRelPick(null)} />
                <h3 className={own.listHead}>Information assets it may reach <span className={own.count}>{pickedAssets.length}</span></h3>
                <AssetRows assets={pickedAssets} isExpert={viewMode.isExpert} navigate={navigate}
                  empty={picked.status === 'active' ? 'The systems it reaches hold no information asset.' : 'Not a live relationship, so it reaches nothing now.'} />
                <h3 className={own.listHead}>Systems it reaches <span className={own.count}>{(picked.systems || []).length}</span></h3>
                <div className={own.assetRows}>
                  {(picked.systems || []).map(y => (
                    <button key={y.id} type="button" className={own.assetRow} title="Show what this system holds"
                      style={{ borderLeftColor: departmentColour(y.department_id) }} onClick={() => pickSys(y.id)}>
                      <RatingChip value={y.impact} scale="impact" variant={viewMode.isExpert ? 'number' : 'word'} />
                      <span className={own.assetName}>{y.name}</span>
                      <span className={own.assetMeta}>{y.department_name || 'No department'}</span>
                    </button>
                  ))}
                  {!(picked.systems || []).length && <p className={styles.muted}>It reaches no active system.</p>}
                </div>
              </>
            )}
            {pickedSys && (
              <>
                <div className={own.chipRow}>
                  <FilterChip words={`System: ${pickedSys.name} · ${pickedAssets.length} information asset${pickedAssets.length === 1 ? '' : 's'}`}
                    stripe={departmentColour(pickedSys.department_id)} onClose={() => setRelPick(null)} />
                  <button type="button" className={own.linkBtn} onClick={() => navigate(`/systems/${pickedSys.id}`)}>Open the system →</button>
                </div>
                <p className={styles.muted}>
                  Reached through {reachingSys.map(r => `${supplierTypeLabel(r.relationship_type).toLowerCase()} (${r.component_name || r.contract_ref || r.department_name})`).join(', ') || 'no relationship'}.
                </p>
                <AssetRows assets={pickedAssets} isExpert={viewMode.isExpert} navigate={navigate}
                  empty="It holds no information asset the supplier may reach." />
              </>
            )}
            {relPick === 'assets' && (
              <>
                <FilterChip words={`Information assets it may reach: ${reachable.length}`} stripe="var(--graph-asset)"
                  onClose={() => setRelPick(null)} />
                <AssetRows assets={assetsOf(() => true)} isExpert={viewMode.isExpert} navigate={navigate} empty="None." />
              </>
            )}
          </div>
          {/* The relationships in summary, at the top (owner, 2026-11-19): what
              each touches, its type, standing, contract, who is accountable and
              its criticality. A row chooses it, as its box in the picture does. */}
          {editRel ? (
            <SupplierRelationshipForm key={editRel.id} initial={editRel} submitLabel="Save relationship"
              onCancel={() => setEditRel(null)}
              onSubmit={async (body) => { await updateSupplierRelationship(editRel.id, body); setEditRel(null); await load(); }} />
          ) : data.relationships.length === 0 ? (
            <p className={styles.muted}>None recorded{departmentIsolation && canWrite ? ' that concern your department' : ''}.</p>
          ) : (
            <SupplierRelationshipsTable rows={data.relationships} show="touches" isExpert={viewMode.isExpert}
              selectedId={pickedId} onSelect={pickRel}
              renderActions={(r) => canEditRel(r) && (
                <span className={own.rowActions}>
                  <button className={own.linkBtn} onClick={(e) => { e.stopPropagation(); setAdding(false); setEditRel(r); }}>Edit</button>
                  <button className={own.linkBtn} title="Only for a relationship recorded in error. One that has run its course should be set to Ended."
                    onClick={(e) => { e.stopPropagation(); run(() => deleteSupplierRelationship(r.id)); }}>Delete</button>
                </span>
              )} />
          )}
          {canWrite && !editRel && (adding ? (
            <SupplierRelationshipForm submitLabel="Record relationship" onCancel={() => setAdding(false)}
              onSubmit={async (body) => { await createSupplierRelationship(id, body); setAdding(false); await load(); }} />
          ) : (
            <div><button className={styles.primary} onClick={() => setAdding(true)}>Record a relationship</button></div>
          ))}

        </section>
        )}
      </div>
    </Shell>
  );
}
