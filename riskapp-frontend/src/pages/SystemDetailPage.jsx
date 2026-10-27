// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { PatternChip } from '../components/PatternChip';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSystem, updateSystem, deactivateSystem,
  linkSystemComponent, unlinkSystemComponent, setSystemComponentStatus, setSystemControlStatus,
  linkSystemInformationAsset, unlinkSystemInformationAsset,
  getAvailableInformationAssets,
  searchComponents, getUsers,
  getControls, getSystemControls, addSystemControl, removeSystemControl,
  getArchitecture, getSystemSecurity, chooseSystemSolution,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { personLabel } from '../utils/roles';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { CiaChipGroup } from '../components/CiaChipGroup';
import { SystemSummaryCard } from '../components/SystemSummaryCard';
import { RiskPathTree } from '../components/RiskPathTree';
import { SuppliersPanel } from '../components/SuppliersPanel';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { useViewMode } from '../hooks/useViewMode';
import { RiskCreateModal } from '../components/RiskCreateModal';
import { seatCanWrite, seatCanLinkAsset, seatCanUnlinkAsset } from '../utils/seatScope';
import { RatingChip } from '../components/RatingChip';
import styles from './SystemDetailPage.module.css';
import SharedComponentChip, { isShared as isSharedComponent } from '../components/SharedComponentChip';
import filterStyles from '../components/DepartmentScopeFilter.module.css';
import { componentTypeShort } from '../utils/componentTypes';
import { ComponentRecordFindingBanner } from '../components/FindingBanner';
import { deliverySentence } from '../utils/deliveryPatterns';
import { DeliveryChip } from '../components/DeliveryChip';
import { ComponentModal } from '../components/ComponentModal';
import { TemplateStrip, PatternAdoptionPanel } from '../components/SystemPatternAdoption';
import { SystemSecuritySolutions, triggeredSolutions } from '../components/SystemSecuritySolutions';

const CAN_EDIT  = new Set(['ciso', 'admin', 'risk_analyst', 'security_consultant', 'information_asset_manager']);
const CAN_ADMIN = new Set(['ciso', 'admin']);

const PPITF_TYPES = [
  { key: 'people',     label: 'People' },
  { key: 'process',    label: 'Process' },
  { key: 'technology', label: 'Technology' },
  { key: 'facility',   label: 'Facility' },
];

// CiaBadge moved to ../components/CiaBadge — shares the risk palette.

// ── PPITF Components tab ──────────────────────────────────────────────────────


function ComponentsTab({ system, canEdit, onRefresh }) {
  const { hasCapability } = useAuth();
  const [search,    setSearch]    = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [showNew,   setShowNew]   = useState(false);
  // Which recorded components to list: the system's own (default), the
  // organisation-wide ones it shares with every other system, or both.
  const [scope, setScope] = useState('system');
  // The security architecture as it bears on this tab: the patterns a component
  // may belong to, and the template groups this system answers. Both are extras —
  // if either cannot be read, the tab works as a plain component list.
  const [builds,   setBuilds]   = useState([]);
  const [security, setSecurity] = useState(null);
  const [adopt,    setAdopt]    = useState(null);   // { builds, component } while a pattern is offered
  const [notice,   setNotice]   = useState('');

  useEffect(() => {
    getArchitecture().then(a => setBuilds(a.builds || [])).catch(() => setBuilds([]));
  }, []);
  const componentCount = (system.components || []).length;
  const componentStates = (system.components || []).map(c => `${c.id}:${c.component_status}`).join(',');
  useEffect(() => {
    getSystemSecurity(system.id).then(setSecurity).catch(() => setSecurity(null));
  }, [system.id, componentCount, componentStates]);

  // Typing a pattern's name finds the pattern too: the dropdown beside the search
  // was the only way in, and the owner looked for it in the search box (2026-10-06).
  const matchingBuilds = search.trim().length >= 2
    ? builds.filter(b => b.name.toLowerCase().includes(search.trim().toLowerCase())) : [];
  const offerBuild = (b) => { setNotice(''); setAdopt({ builds: [b], component: null }); };

  const buildsWith = (componentId) => builds.filter(b => b.components.some(c => c.id === componentId));

  const linkedIds = new Set((system.components || []).map(c => c.id));

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { components } = await searchComponents(search, typeFilter || undefined);
        setResults((components || []).filter(c => c.component_type !== 'information' && !linkedIds.has(c.id)));
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  // Adding a component that belongs to a pattern offers the pattern first.
  function handleAdd(c) {
    const inBuilds = buildsWith(c.id);
    if (inBuilds.length === 0) { handleLink(c.id); return; }
    setNotice('');
    setAdopt({ builds: inBuilds, component: c });
  }

  function handleAdopted(result, build) {
    setAdopt(null); setSearch(''); setResults([]);
    setNotice(`${build.name} adopted: ${result.added} component${result.added === 1 ? '' : 's'} added`
      + (result.already ? `, ${result.already} already recorded` : '') + '.');
    onRefresh();
  }

  async function handleLink(componentId) {
    setLinkError(''); setAdopt(null);
    try {
      await linkSystemComponent(system.id, componentId);
      setSearch('');
      setResults([]);
      onRefresh();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to link component');
    }
  }

  async function handleUnlink(componentId) {
    setLinkError('');
    try {
      await unlinkSystemComponent(system.id, componentId);
      onRefresh();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to unlink component');
    }
  }

  async function handleCreated(created) {
    setShowNew(false);
    try {
      await linkSystemComponent(system.id, created.id);
      setSearch('');
      setResults([]);
      onRefresh();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Component created but failed to link');
    }
  }

  const all    = system.components || [];
  const shared = all.filter(isSharedComponent);
  const own    = all.filter(c => !isSharedComponent(c));
  // Hidden by default, so say so on the button when one of them is not working.
  const sharedTrouble = shared.filter(c => (c.system_status ?? c.component_status) !== 'operational').length;
  const listed = scope === 'system' ? own : scope === 'org' ? shared : all;
  const byType = {};
  PPITF_TYPES.forEach(({ key }) => { byType[key] = []; });
  listed.forEach(c => {
    if (byType[c.component_type]) byType[c.component_type].push(c);
  });

  // A gap already drawn on a triggered solution below is not listed a second time.
  const drawnGapIds = new Set(triggeredSolutions(security?.solutions)
    .flatMap(x => x.parts.filter(p => p.location === 'on_system' && p.status == null).map(p => p.component_id)));
  const expected = (system.expected_components || []).filter(c => !drawnGapIds.has(c.id));

  // Record a component the system's own controls say should be here. Linking it
  // and stating its health in one go, rather than linking and leaving it at the
  // column default `unknown` — which would make it a mandatory remediation
  // candidate on every risk for this system.
  async function handleRecord(componentId, status) {
    setLinkError('');
    try {
      await linkSystemComponent(system.id, componentId);
      await setSystemComponentStatus(system.id, componentId, status);
      onRefresh();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not record this component.');
    }
  }

  // Answer a blank template group from the strip. A component that exists once
  // for the organisation has no per-system state to set (the API refuses one).
  // Returns whether it was saved, so the strip knows to keep showing the answer
  // while the page refreshes, or to offer the choice again.
  async function handleAnswer(componentId, status) {
    setLinkError('');
    try {
      await linkSystemComponent(system.id, componentId);
      if (status) await setSystemComponentStatus(system.id, componentId, status);
      onRefresh();
      return true;
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not record this component.');
      return false;
    }
  }

  return (
    <div className={styles.ppitfSection}>
      {linkError && <p className={styles.linkError}>{linkError}</p>}

      <h3 className={styles.tabSectionTitle}>Architecture components <HelpDot k="system_detail.architecture_components" placement="bottom" /></h3>
      <p className={styles.muted}>
        What this system is made of. Add components freely; where one belongs to a system architecture pattern,
        the whole pattern is offered.
      </p>

      {security && security.memberships.length > 0 && (<>
        <div className={styles.tabSubTitle}>
          <PatternChip kind="template" />
          <span>Each system should include one component from each group.</span>
          <HelpDot k="system_detail.template" placement="bottom" />
        </div>
        <TemplateStrip memberships={security.memberships} canEdit={canEdit} onAnswer={handleAnswer} />
      </>)}

      {canEdit && (
        <div className={styles.pickerBox}>
          <div className={styles.pickerSearchRow}>
            <input
              className={styles.pickerInput}
              placeholder={builds.length > 0 ? 'Search components or patterns to add (min 2 chars)…' : 'Search components to add (min 2 chars)…'}
              aria-label="Search components to add"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className={styles.typeSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Component type">
              <option value="">All types</option>
              {PPITF_TYPES.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowNew(true)}>
              + New
            </button>
            {builds.length > 0 && (
              <select className={styles.typeSelect} value="" aria-label="Adopt a system architecture pattern"
                onChange={e => { const b = builds.find(x => x.id === e.target.value); if (b) offerBuild(b); }}>
                <option value="">Adopt a pattern…</option>
                {builds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
          {searching && <p className={styles.muted}>Searching…</p>}
          {matchingBuilds.length > 0 && (
            <div className={styles.pickerResults}>
              {matchingBuilds.map(b => (
                <div key={b.id} className={styles.pickerOption}>
                  <span className={styles.pickerOptionName}><PatternChip kind="pattern" iconOnly /> {b.name}</span>
                  <span className={styles.pickerOptionType}>pattern · {b.components.length} component{b.components.length === 1 ? '' : 's'}</span>
                  <button className={styles.btnLink} onClick={() => offerBuild(b)} aria-label={`Adopt the pattern ${b.name}`}>Adopt…</button>
                </div>
              ))}
            </div>
          )}
          {!searching && results.length > 0 && (
            <div className={styles.pickerResults}>
              {results.slice(0, 10).map(c => (
                <div key={c.id} className={styles.pickerOption}>
                  <span className={styles.pickerOptionName}>
                    {c.name}{buildsWith(c.id).length > 0 && <>{' '}<PatternChip kind="pattern" iconOnly /></>}
                  </span>
                  <span className={styles.pickerOptionType}>{componentTypeShort(c.component_type)}</span>
                  <button className={styles.btnLink} onClick={() => handleAdd(c)} aria-label={`Add ${c.name}`}>Add</button>
                </div>
              ))}
            </div>
          )}
          {!searching && search.length >= 2 && results.length === 0 && matchingBuilds.length === 0 && (
            <p className={styles.muted}>
              No matching components found.{' '}
              <button type="button" className={styles.btnLink} onClick={() => setShowNew(true)}>
                Create new
              </button>
            </p>
          )}
        </div>
      )}

      {notice && <p className={styles.muted} role="status">{notice}</p>}
      {canEdit && adopt && (
        <PatternAdoptionPanel key={adopt.component?.id || adopt.builds[0].id}
          systemId={system.id} builds={adopt.builds} component={adopt.component}
          onAddOnly={(c) => handleLink(c.id)} onAdopted={handleAdopted} onClose={() => setAdopt(null)} />
      )}

      <div className={styles.tabSubTitle}><span>Recorded on this system</span> <HelpDot k="system_detail.recorded_components" placement="bottom" /></div>

      <div className={styles.scopeRow} role="group" aria-label="Which components to list">
        {[
          { key: 'system', label: `This system (${own.length})` },
          { key: 'org',    label: `Organisation-wide (${shared.length})`, trouble: sharedTrouble },
          { key: 'all',    label: `All (${all.length})` },
        ].map(b => (
          <button key={b.key} type="button" aria-pressed={scope === b.key}
            className={scope === b.key ? filterStyles.filterActive : filterStyles.filterBtn}
            onClick={() => setScope(b.key)}>
            {b.label}
            {b.trouble > 0 && <span className={styles.scopeTrouble} title="Organisation-wide components that are degraded, missing or not recorded where they should be"> · {b.trouble} not working</span>}
          </button>
        ))}
      </div>
      <p className={styles.emptyGroup}>
        {scope === 'system' && 'Components that exist on this system itself. Those that exist once for the organisation, or on a security system, are shared with other systems and are not listed.'}
        {scope === 'org' && 'Components this system relies on that exist once for the organisation or on a security system. Each has one state, set where it lives.'}
        {scope === 'all' && 'Every component this system records or relies on.'}
      </p>

      {PPITF_TYPES.map(({ key, label }) => (
        <div key={key} className={styles.ppitfGroup}>
          <div className={styles.ppitfGroupHeader}>
            <span className={styles.ppitfGroupTitle}>{label}</span>
          </div>
          {byType[key].length === 0
            ? <p className={styles.emptyGroup}>
                {scope === 'system' && shared.some(c => c.component_type === key)
                  ? `Only organisation-wide ${label.toLowerCase()} objects.`
                  : scope === 'org' ? `No organisation-wide ${label.toLowerCase()} objects.`
                  : `No ${label.toLowerCase()} objects linked.`}
              </p>
            : byType[key].map(c => (
              <div key={c.id} className={styles.componentCard}>
                <div className={styles.componentCardLeft}>
                  <div className={styles.componentName}>{c.name}</div>
                  {c.role && <div className={styles.componentRole}>{c.role}</div>}
                </div>
                {isSharedComponent(c)
                  ? <SharedComponentChip component={c} />
                  : <span className={styles.componentStatus}>{c.component_status || 'unknown'}</span>}
                {/* A shared component only implied by a control has nothing to
                    unlink; one recorded here (the system's network zone, its
                    server room) is the system's own answer and can be removed. */}
                {canEdit && (!isSharedComponent(c) || c.recorded) && (
                  <button className={styles.btnIcon} onClick={() => handleUnlink(c.id)} title="Unlink" aria-label={`Unlink component: ${c.name}`}>×</button>
                )}
              </div>
            ))
          }
        </div>
      ))}

      <h3 className={styles.tabSectionTitle}>Security <HelpDot k="system_detail.security" placement="bottom" /></h3>
      <p className={styles.muted}>
        Some components trigger a security solution. Each is drawn as its ideal, with what this system has laid
        over it; what is left uncovered is a gap.
      </p>
      {system.is_security_system && (
        <p className={styles.muted}>
          This is a security system: other systems can rely on its components.{' '}
          {hasCapability('controls.write') && (
            <Link to={`/security-solutions/new?system=${system.id}`}>Create a security solution from this system →</Link>
          )}
        </p>
      )}
      {security && (
        <SystemSecuritySolutions solutions={security.solutions} canEdit={canEdit} onRecord={handleRecord} />
      )}
      {expected.length === 0 && (
        <p className={styles.muted}>Nothing else this system&rsquo;s control objectives need is missing from the record.</p>
      )}
      {/* Components this system's own controls are delivered by, which nobody
          has recorded here. Not part of the list above: they are not on the
          system, and saying otherwise would be a claim no one has made. */}
      {expected.length > 0 && (
        <section className={styles.expectedBlock}>
          <h3 className={styles.expectedTitle}>
            {expected.length} component{expected.length === 1 ? '' : 's'} expected here but not recorded{' '}
            <HelpDot k="system_detail.expected_components" placement="bottom" />
          </h3>
          <p className={styles.expectedBody}>
            A control deployed on this system needs {expected.length === 1 ? 'this part' : 'these parts'}, and the
            system&rsquo;s record does not mention {expected.length === 1 ? 'it' : 'them'}. Where the control has
            security solutions, only the parts of the solution in use here are listed. Until each is recorded, the
            coverage panel on this system&rsquo;s risks shows the control as needing improvement, and the solution is not
            complete here &mdash; so an objective delivered on each system reads missing, and its risks score as if it
            were absent. Record what is genuinely here, and leave the rest to show as the gap it is.
          </p>
          {expected.map(c => (
            <div key={c.id} className={styles.expectedRow}>
              <span className={styles.compType}>{componentTypeShort(c.component_type)}</span>
              <span className={styles.componentName}>{c.name}</span>
              <span className={styles.expectedWhy} title={c.required_by.join('\n')}>
                required by {c.required_by.length === 1
                  ? c.required_by[0]
                  : `${c.required_by.length} controls`}
              </span>
              {canEdit && (
                <span className={styles.expectedActions}>
                  <button className={styles.componentAdd}
                          onClick={() => handleRecord(c.id, 'operational')}>It is here, working</button>
                  <button className={styles.btnGhostSm}
                          onClick={() => handleRecord(c.id, 'degraded')}>Here, degraded</button>
                  <button className={styles.btnGhostSm}
                          onClick={() => handleRecord(c.id, 'missing')}>Genuinely missing</button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}


      {showNew && (
        <ComponentModal
          componentType={typeFilter || 'technology'}
          defaultName={search}
          onClose={() => setShowNew(false)}
          onSaved={handleCreated}
        />
      )}
    </div>
  );
}

// ── Controls tab (control posture) ────────────────────────────────────────────
// A system's control posture: the controls deployed on it and their maturity
// (control-maturity model). Maturity flows to every risk on this system whose
// threat the control counters.
// ── Threats tab ───────────────────────────────────────────────────────────────
// A threat linked to a system is an IDENTIFIED exposure. It is only ASSESSED
// once a risk exists for that system × threat pair — that risk is what scores
// the effect of the system's controls. The two states look identical unless we
// say so, which is how an estate can end up with 223 identified threats and 36
// assessments and still look finished. Unassessed threats sort first: they are
// the outstanding work.
function ThreatsTab({ system, canAssess, onAssess }) {
  const navigate = useNavigate();
  const threats  = system.threats || [];
  const pending  = threats.filter(t => !t.assessed);

  if (threats.length === 0) {
    return (
      <div>
        <p className={styles.muted}>
          No threats identified against this system yet. Identify one from the threat&apos;s
          own page, or raise a risk here — raising a risk identifies the threat and
          assesses it in the same step.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.muted}>
        {threats.length} threat{threats.length !== 1 ? 's' : ''} identified against this system.
        {pending.length > 0
          ? ` ${pending.length} not yet assessed — assessing one scores the effect of this
              system's controls and creates its risk.`
          : ' All have been assessed.'}
      </p>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {threats.map(t => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${t.assessed ? 'var(--border)' : 'var(--amber)'}`,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.name}</div>
              {t.description && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
              )}
            </div>

            {t.assessed ? (
              <>
                <RatingChip value={t.risk_score} scale="risk" variant="number" />
                <button
                  className={styles.btnSecondary}
                  onClick={() => navigate(`/risks/${t.validation_status === 'validated' ? 'current' : 'future'}?selected=${t.risk_id}`)}
                >
                  View risk →
                </button>
              </>
            ) : (
              <>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--amber)', whiteSpace: 'nowrap',
                }}>
                  Not assessed
                </span>
                {canAssess && (
                  <button className={styles.btnPrimary} onClick={() => onAssess(t)}>
                    Assess →
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlsTab({ system, canEdit, onRefresh }) {
  const [controls,  setControls]  = useState(null);
  // What the security architecture wants here: an objective with no solution
  // chosen, or two in conflict, is marked on its row (owner, 2026-10-06).
  const [security,  setSecurity]  = useState(null);
  const [choice,    setChoice]    = useState({});   // control_id -> pattern_id being chosen
  const [search,    setSearch]    = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [err,       setErr]       = useState('');

  const load = useCallback(async () => {
    try { setControls(await getSystemControls(system.id)); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to load controls'); }
    getSystemSecurity(system.id).then(setSecurity).catch(() => setSecurity(null));
  }, [system.id]);
  useEffect(() => { load(); }, [load]);

  // v150: a solution complete in place counts as chosen without anyone being
  // asked; the row says so, since no person's name is on that choice.
  const countedInPlace = new Map((security?.objectives || [])
    .filter(o => o.state === 'delivered' && o.choice_source === 'in_place').map(o => [o.control_id, o]));
  const undecided = new Map((security?.objectives || []).filter(o => o.state !== 'delivered').map(o => [o.control_id, o]));
  // Undecided objectives first; one the system does not record yet still gets a row.
  const rows = [
    ...[...undecided.values()].filter(o => !(controls || []).some(c => c.id === o.control_id))
      .map(o => ({ id: o.control_id, title: o.title, unrecorded: true })),
    ...(controls || []),
  ].sort((a, b) => Number(undecided.has(b.id)) - Number(undecided.has(a.id)));

  // Objectives the security architecture wants here that nobody has recorded on
  // the system: delivered by a wanted solution, but with no row, so no status and
  // no place in the system's control list. Adopting a pattern creates a dozen of
  // these at once, and the finding stays open until each is recorded.
  const wantedUnrecorded = (security?.objectives || []).filter(o => o.state === 'delivered' && !o.recorded);
  const solutionName = new Map((security?.solutions || []).map(x => [x.pattern_id, x.pattern_name]));
  const [recording, setRecording] = useState(false);

  // Record them in the state their solution is actually in — never the column
  // default `unknown`, which would read as a decision (the rule the Misty Isles
  // dataset was built with: complete → operational, degraded → degraded,
  // otherwise missing).
  const STATUS_FROM_DELIVERY = { complete: 'operational', degraded: 'degraded' };
  async function recordWanted(controlIds) {
    setErr(''); setRecording(true);
    try {
      for (const cid of controlIds) await addSystemControl(system.id, cid);
      const fresh = await getSystem(system.id);
      const delivered = new Map((fresh.control_delivery || []).map(d => [d.control_id, d.delivery]));
      for (const cid of controlIds) {
        await setSystemControlStatus(system.id, cid, STATUS_FROM_DELIVERY[delivered.get(cid)] || 'missing');
      }
      await load();
      onRefresh?.();
    } catch (e) { setErr(e.response?.data?.error || 'The control objectives were not all recorded.'); }
    finally { setRecording(false); }
  }

  async function handleChoose(controlId, patternId) {
    setErr('');
    try {
      setSecurity(await chooseSystemSolution(system.id, controlId, patternId));
      onRefresh?.();
    } catch (e) { setErr(e.response?.data?.error || 'The security solution was not chosen.'); }
  }

  const linkedIds = new Set((controls || []).map(c => c.id));
  const delivery = new Map((system.control_delivery || []).map(d => [d.control_id, d]));
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { controls: found } = await getControls({ q: search });
        setResults((found || []).filter(c => !linkedIds.has(c.id)));
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, controls]);

  async function handleAdd(controlId) {
    setErr('');
    try { await addSystemControl(system.id, controlId); setSearch(''); setResults([]); await load(); }
    catch (e) { setErr(e.response?.data?.error || 'The control objective was not added.'); }
  }
  async function handleRemove(controlId) {
    setErr('');
    try { await removeSystemControl(system.id, controlId); await load(); }
    catch (e) { setErr(e.response?.data?.error || 'The control objective was not removed.'); }
  }

  return (
    <div className={styles.ppitfSection}>
      <p className={styles.muted}>
        Control objectives recorded on this system. Select one to open its page. Maturity is set once for the
        organisation on the control objective&rsquo;s page; how it is delivered on this system is shown here as its status.
      </p>
      {err && <p className={styles.linkError}>{err}</p>}

      {wantedUnrecorded.length > 0 && (
        <section className={styles.expectedBlock}>
          <h3 className={styles.expectedTitle}>
            {wantedUnrecorded.length} control objective{wantedUnrecorded.length === 1 ? ' is' : 's are'} implied by this system&rsquo;s security solutions but not recorded on it{' '}
            <HelpDot k="system_detail.implied_objectives" placement="bottom" />
          </h3>
          <p className={styles.expectedBody}>
            Components recorded on this system trigger security solutions, and those solutions deliver {wantedUnrecorded.length === 1 ? 'this objective' : 'these objectives'}.
            So the system&rsquo;s own record implies {wantedUnrecorded.length === 1 ? 'it' : 'them'}; nobody has to ask for {wantedUnrecorded.length === 1 ? 'it' : 'them'}. Until each is recorded
            it has no status here and counts on none of this system&rsquo;s risks, and the system&rsquo;s record reads as incomplete.
            Recording sets each to the state its security solution is in: operational where the solution is complete,
            degraded where a part is degraded, otherwise missing.
          </p>
          {canEdit && (
            <p className={styles.expectedBody}>
              <button className={styles.btnPrimary} disabled={recording}
                onClick={() => recordWanted(wantedUnrecorded.map(o => o.control_id))}>
                {recording ? 'Recording…' : `Record ${wantedUnrecorded.length === 1 ? 'it' : `all ${wantedUnrecorded.length}`} on this system`}
              </button>
            </p>
          )}
          {wantedUnrecorded.map(o => (
            <div key={o.control_id} className={styles.expectedRow}>
              <span className={styles.componentName}><Link to={`/controls/${o.control_id}`}>{o.title}</Link></span>
              <span className={styles.expectedWhy}>
                <PatternChip kind="solution" iconOnly />{' '}implied by{' '}
                {(o.pattern_ids || []).map(pid => solutionName.get(pid)).filter(Boolean).join(', ') || 'a security solution on this system'}
              </span>
              {canEdit && (
                <span className={styles.expectedActions}>
                  <button className={styles.btnGhostSm} disabled={recording} aria-label={`Record ${o.title} on this system`}
                    onClick={() => recordWanted([o.control_id])}>Record</button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {controls == null ? (
        <p className={styles.muted}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={styles.emptyGroup}>No control objectives recorded on this system yet.</p>
      ) : (
        rows.map(c => (
          <div key={c.id} className={`${styles.componentCard} ${undecided.has(c.id) ? styles.cardUndecided : ''}`}>
            <div className={styles.componentCardLeft}>
              <div className={styles.componentName}><Link to={`/controls/${c.id}`}>{c.title}</Link></div>
              <div className={styles.componentRole}>
                {c.unrecorded ? 'Not recorded on this system' : c.framework_ref ? `${c.framework} ${c.framework_ref}` : c.control_type}
                {c.provenance === 'verified_action' && ' · via verified action'}
              </div>
              {undecided.has(c.id) && (() => {
                const o = undecided.get(c.id);
                // Still undecided with a solution in play means that solution is
                // NOT complete here (a complete one counts as chosen, v150), so it
                // is offered first but only as a suggestion.
                const inPlace = o.solutions.find(p => p.id === o.suggested_pattern_id);
                const picked = choice[c.id] ?? inPlace?.id ?? '';
                return (
                  <div className={styles.undecided}>
                    <span className={styles.undecidedTag}>
                      {o.state === 'conflict' ? 'Two required security solutions: choose one' : 'No security solution chosen'}
                    </span>
                    <span>
                      {o.threats.length > 0 && <>Called for by {o.threats.join(', ')}. </>}
                      {o.solutions.length === 0
                        ? 'No security solution delivers this objective yet.'
                        : <>It can be delivered by {o.solutions.map((p, i) => (
                            <span key={p.id}>{i > 0 && ', '}<Link to={`/security-solutions/${p.id}`}>{p.name}</Link></span>
                          ))}.</>}
                      {inPlace && <> <b>{inPlace.name}</b> is partly in place here. It is not complete, so it was not counted as chosen.</>}
                    </span>
                    {canEdit && o.solutions.length > 0 && (
                      <span className={styles.undecidedChoose}>
                        <select className={styles.typeSelect} value={picked} aria-label={`Security solution for ${c.title}`}
                          onChange={e => setChoice(v => ({ ...v, [c.id]: e.target.value }))}>
                          <option value="">Choose a security solution…</option>
                          {o.solutions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className={styles.btnPrimary} disabled={!picked} onClick={() => handleChoose(c.id, picked)}>
                          Choose for this system
                        </button>
                      </span>
                    )}
                  </div>
                );
              })()}
              {/* v152/v159: the state, and where it comes from. For an objective
                  delivered per system it follows the security solution, and is
                  missing when it has none; otherwise somebody set it. */}
              {!c.unrecorded && c.status && (
                <div className={styles.componentRole}>
                  State on this system: <b>{c.status === 'not_applicable' ? 'not applicable here' : c.status}</b>
                  {c.status === 'not_applicable' ? ' (excluded by a person, with a reason)'
                    : delivery.get(c.id) ? ' (follows its security solution)'
                    : c.delivery === 'system' ? ' (no security solution delivers this objective, so it is missing; give it one on the Security solutions page, or mark it not applicable here)'
                    : ' (set by hand: this objective is not delivered per system)'}
                </div>
              )}
              {/* v145: how it is delivered here. */}
              {delivery.get(c.id) && (
                <div className={styles.componentRole}
                  style={delivery.get(c.id).delivery !== 'complete' ? { color: 'var(--text-primary)' } : undefined}>
                  {delivery.get(c.id).delivery !== 'no_pattern_in_place' && <><PatternChip kind="solution" iconOnly />{' '}</>}
                  {deliverySentence(delivery.get(c.id))}
                  {delivery.get(c.id).disagreement && (
                    <span style={{ color: 'var(--amber)' }}> · {delivery.get(c.id).disagreement}</span>
                  )}
                </div>
              )}
              {countedInPlace.has(c.id) && (
                <div className={styles.componentRole}>
                  Counted as this system&rsquo;s chosen solution because it is complete in place
                  {countedInPlace.get(c.id).chosen_at && <> ({new Date(countedInPlace.get(c.id).chosen_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})</>}.
                  Nobody was asked to choose.
                </div>
              )}
            </div>
            {/* Maturity is an organisation-wide property of the control (edited on the
                control detail page) — read-only here. */}
            {delivery.get(c.id) && (
              <DeliveryChip delivery={delivery.get(c.id).delivery} title={deliverySentence(delivery.get(c.id))} />
            )}
            {!c.unrecorded && (
              <span className={styles.componentStatus}>
                {c.maturity != null ? `maturity ${c.maturity}` : 'not rated'}
              </span>
            )}
            {canEdit && !c.unrecorded && (
              <button className={styles.btnIcon} onClick={() => handleRemove(c.id)} title="Remove" aria-label={`Remove ${c.title}`}>×</button>
            )}
          </div>
        ))
      )}

      {canEdit && (
        <div className={styles.pickerBox}>
          <div className={styles.pickerSearchRow}>
            <input
              className={styles.pickerInput}
              placeholder="Search control objectives to add (min 2 chars)…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {searching && <p className={styles.muted}>Searching…</p>}
          {!searching && results.length > 0 && (
            <div className={styles.pickerResults}>
              {results.slice(0, 10).map(c => (
                <div key={c.id} className={styles.pickerOption}>
                  <span className={styles.pickerOptionName}>{c.title}</span>
                  <span className={styles.pickerOptionType}>{c.framework_ref || c.control_type}</span>
                  <button className={styles.btnLink} onClick={() => handleAdd(c.id)}>Add</button>
                </div>
              ))}
            </div>
          )}
          {!searching && search.length >= 2 && results.length === 0 && (
            <p className={styles.muted}>No matching control objectives found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Information Assets tab ────────────────────────────────────────────────────

function InformationAssetsTab({ system, canLinkAssets, canUnlinkAsset, isExpert, onRefresh }) {
  const navigate  = useNavigate();
  const [available, setAvailable] = useState([]);
  const [search,    setSearch]    = useState('');
  const [linkError, setLinkError] = useState('');
  const [loadingAvail, setLoadingAvail] = useState(false);

  const loadAvailable = useCallback(async () => {
    setLoadingAvail(true);
    try {
      const data = await getAvailableInformationAssets(system.id);
      setAvailable(data);
    } catch { /* silent */ } finally { setLoadingAvail(false); }
  }, [system.id]);

  useEffect(() => { if (canLinkAssets) loadAvailable(); }, [canLinkAssets, loadAvailable]);

  async function handleLink(assetId) {
    setLinkError('');
    try {
      await linkSystemInformationAsset(system.id, assetId);
      onRefresh();
      loadAvailable();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to link information asset');
    }
  }

  async function handleUnlink(assetId) {
    setLinkError('');
    try {
      await unlinkSystemInformationAsset(system.id, assetId);
      onRefresh();
      loadAvailable();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to unlink information asset');
    }
  }

  const filteredAvail = available.filter(a =>
    search.length < 1 || a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {linkError && <p className={styles.linkError}>{linkError}</p>}

      <div className={styles.assetList}>
        {(system.information_assets || []).length === 0
          ? <p className={styles.muted}>No information assets linked to this system.</p>
          : (system.information_assets || []).map(ia => (
            <div key={ia.id} className={`${styles.assetCard}${ia.impact_changed_in_cycle ? ` ${styles.assetCardChanged}` : ''}`} onClick={() => navigate(`/assets/${ia.id}`)}>
              <div className={styles.assetCardLeft}>
                <div className={styles.assetName}>
                  {ia.name}
                  {ia.is_shared && <span className={styles.sharedTag}>shared</span>}
                  {ia.impact_changed_in_cycle && <span className={styles.changedTag} title="Impact ratings changed in this review cycle">changed</span>}
                </div>
                {ia.department_name && <div className={styles.assetDept}>{ia.department_name}</div>}
              </div>
              <div className={styles.assetCia}>
                {isExpert
                  ? <CiaChipGroup c={ia.confidentiality} i={ia.integrity} a={ia.availability} />
                  : <RatingChip value={Math.max(ia.confidentiality ?? 0, ia.integrity ?? 0, ia.availability ?? 0) || null} scale="impact" variant="word" />
                }
              </div>
              {canUnlinkAsset(ia) && (
                <button
                  className={styles.btnIcon}
                  onClick={e => { e.stopPropagation(); handleUnlink(ia.id); }}
                  title="Unlink"
                  aria-label={`Unlink asset: ${ia.name}`}
                >×</button>
              )}
            </div>
          ))
        }
      </div>

      {canLinkAssets && (
        <div className={styles.pickerBox} style={{ marginTop: 16 }}>
          <input
            className={styles.pickerInput}
            placeholder="Search available information assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {loadingAvail && <p className={styles.muted}>Loading…</p>}
          {!loadingAvail && (
            filteredAvail.length === 0
              ? <p className={styles.muted}>{search.length > 0 ? 'No matching information assets.' : 'No available information assets.'}</p>
              : (
                <div className={styles.pickerResults}>
                  {filteredAvail.map(ia => (
                    <div key={ia.id} className={styles.pickerOption}>
                      <span className={styles.pickerOptionName}>{ia.name}</span>
                      <span className={styles.pickerOptionType}>{ia.department_name}</span>
                      {ia.is_shared && <span className={styles.sharedTag}>shared</span>}
                      <button className={styles.btnLink} onClick={() => handleLink(ia.id)}>Add</button>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SystemDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user, hasCapability, departmentIsolation } = useAuth();
  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const [system,  setSystem]  = useState(null);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [name,    setName]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [ownerId,     setOwner]      = useState('');
  const [managedById, setManagedBy] = useState('');
  const [isShared,    setIsShared]  = useState(false);
  const [isSecuritySystem, setIsSecuritySystem] = useState(false);
  const [saving,      setSaving]    = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [formErr, setFormErr] = useState('');

  const [activeTab, setActiveTab] = useState('details');
  // The threat currently being assessed — opens RiskCreateModal already pointed
  // at this system × threat pair.
  const [assessThreat, setAssessThreat] = useState(null);

  // Seat eligibility: dept-scoped roles can only edit their own department's
  // systems (backend assertWriteScope is authoritative; this hides dead buttons).
  const canEdit  = CAN_EDIT.has(user?.role)  && seatCanWrite(user, departmentIsolation, system?.department_id);
  const canAdmin = CAN_ADMIN.has(user?.role) && seatCanWrite(user, departmentIsolation, system?.department_id);
  const canLinkAssets  = CAN_EDIT.has(user?.role) && seatCanLinkAsset(user, departmentIsolation, system?.department_id, system?.is_shared);
  const canUnlinkAsset = (ia) => CAN_EDIT.has(user?.role) && seatCanUnlinkAsset(user, departmentIsolation, system?.department_id, ia.department_id);

  const load = useCallback(async () => {
    try {
      const s = await getSystem(id);
      setSystem(s);
      setName(s.name);
      setDesc(s.description || '');
      setOwner(s.owner_id || '');
      setManagedBy(s.managed_by_id || '');
      setIsShared(Boolean(s.is_shared));
      setIsSecuritySystem(Boolean(s.is_security_system));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load system');
    }
  }, [id]);

  useEffect(() => {
    Promise.all([
      load(),
      canEdit ? getUsers() : Promise.resolve([]),
    ])
      .then(([, u]) => setUsers(u || []))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) { setFormErr('Name is required'); return; }
    setSaving(true); setFormErr(''); setSaved(false);
    try {
      await updateSystem(id, { name: name.trim(), description: desc.trim() || null, owner_user_id: ownerId || null, managed_by_user_id: managedById || null, is_shared: isShared, is_security_system: isSecuritySystem });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormErr(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate "${system.name}"?`)) return;
    try {
      await deactivateSystem(id);
      navigate('/systems');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate');
    }
  }

  if (loading) return <Shell><p className={styles.muted}>Loading…</p></Shell>;
  if (!system && error) return <Shell><p className={styles.errorMsg}>{error}</p></Shell>;
  if (!system) return null;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <BackButton fallback="/systems" />
          {!canEdit && <ReadOnlyBadge reason={canLinkAssets ? "System details are read-only — you can manage information assets on the Assets tab." : "Your role has view-only access to systems."} />}
          <span className={styles.viewModeSlot}><ViewModeToggle {...viewMode} /></span>
        </div>

        <SystemSummaryCard system={system} isExpert={isExpert} showRiskPath={false} />
        <ComponentRecordFindingBanner system={system} onChanged={load} />

        {system.risk_paths && system.risk_paths.length > 0 && (
          <RiskPathTree paths={system.risk_paths} title="Risks on this system" helpKey="system_detail.risks" isExpert={isExpert} />
        )}

        <div className={styles.tabs}>
          <button className={activeTab === 'details'    ? styles.tabActive : styles.tab} onClick={() => setActiveTab('details')}>Details</button>
          <button className={activeTab === 'components' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('components')}>
            Components
            <span className={styles.tabCount}>{(system.components || []).filter(c => !isSharedComponent(c)).length}</span>
            {/* The count alone understates: a system with 4 recorded components
                and 28 its controls expect is not a 4-component system. */}
            {(system.expected_components || []).length > 0 && (
              <span
                className={styles.tabWarn}
                title={`${system.expected_components.length} component(s) a control here is delivered by are not on this system's record`}
              >+{system.expected_components.length}?</span>
            )}
          </button>
          <button className={activeTab === 'controls' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('controls')}>
            Control objectives
            {(system.component_finding?.unrecorded_objective_names || []).length > 0 && (
              <span className={styles.tabWarn} title="Control objectives implied by this system&rsquo;s security solutions that are not recorded on it">
                {system.component_finding.unrecorded_objective_names.length} to record
              </span>
            )}
            {(system.component_finding?.needs_solution_count || 0) + (system.component_finding?.conflict_count || 0) > 0 && (
              <span className={styles.tabWarn} title="Control objectives on this system that need a security solution chosen">
                {(system.component_finding.needs_solution_count || 0) + (system.component_finding.conflict_count || 0)} to decide
              </span>
            )}
          </button>
          <button className={activeTab === 'assets' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('assets')}>
            Information Assets
            <span className={styles.tabCount}>{(system.information_assets || []).length}</span>
          </button>
          <button className={activeTab === 'threats' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('threats')}>
            Threats
            <span className={styles.tabCount}>{(system.threats || []).length}</span>
            {(system.threats || []).some(t => !t.assessed) && (
              <span
                className={styles.tabCount}
                title="Threats identified against this system that have not been assessed yet"
                style={{ background: 'var(--amber-faint)', color: 'var(--amber)' }}
              >
                {(system.threats || []).filter(t => !t.assessed).length} to assess
              </span>
            )}
          </button>
          {hasCapability('suppliers.read') && (
            <button className={activeTab === 'suppliers' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('suppliers')}>
              Suppliers
            </button>
          )}
          <button
            className={styles.tab}
            onClick={() => {
              const validated = system.risk_count_validated ?? 0;
              const view = validated > 0 ? 'current' : 'future';
              navigate(`/risks/${view}?system=${system.id}`);
            }}
            title="Open the risk summary filtered to this system"
          >
            Risks →
            <span className={styles.tabCount}>{system.risk_count ?? 0}</span>
          </button>
        </div>

        {activeTab === 'details' && (
          <form className={styles.form} onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <label className={styles.fieldLabel}>
                Name
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} title={!canEdit ? 'View only' : undefined} />
              </label>
              <label className={styles.fieldLabel}>
                Description
                <textarea className={styles.textarea} value={desc} onChange={e => setDesc(e.target.value)} rows={4} disabled={!canEdit} title={!canEdit ? 'View only' : undefined} />
              </label>
              <label className={styles.fieldLabel}>
                Department
                <input className={styles.input} value={system.department_name || '—'} disabled />
              </label>
              {canEdit && (
                <label className={styles.fieldLabel}>
                  Owner
                  <select className={styles.select} value={ownerId} onChange={e => setOwner(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
                  </select>
                </label>
              )}
              {canEdit && (
                <label className={styles.fieldLabel}>
                  Manager (IAM)
                  <select className={styles.select} value={managedById} onChange={e => setManagedBy(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
                  </select>
                </label>
              )}
            </div>
            <label className={styles.checkboxLabel}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
                disabled={!canEdit}
                title={!canEdit ? 'View only' : undefined}
              />
              <span>Shared system</span>
              {/* The same chip the systems list shows, so ticking the box
                  previews exactly what the row will look like. */}
              {isShared && <span className={styles.sharedTag}>shared</span>}
            </label>
            <p className={styles.fieldHint}>
              Other departments can see this system and link their own information assets to it.
            </p>
            <label className={styles.checkboxLabel}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={isSecuritySystem}
                onChange={e => setIsSecuritySystem(e.target.checked)}
                disabled={!canEdit}
                title={!canEdit ? 'View only' : undefined}
              />
              <span>Security system</span>
              {isSecuritySystem && <span className={styles.sharedTag}>security system</span>}
            </label>
            <p className={styles.fieldHint}>
              This system exists to protect other systems (CCTV, an anti-virus console, a backup server). A security
              solution can then place a part on it and read that part&rsquo;s state from here. It is assessed like any
              other system; this changes no score.
            </p>
            {canEdit && (
              <div className={styles.formActions}>
                {formErr && <span className={styles.errorMsg}>{formErr}</span>}
                {saved   && <span className={styles.savedMsg}>✓ Saved</span>}
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {canAdmin && (
                  <button type="button" className={styles.btnDanger} onClick={handleDeactivate}>
                    Deactivate
                  </button>
                )}
              </div>
            )}
          </form>
        )}

        {activeTab === 'components' && (
          <ComponentsTab system={system} canEdit={canEdit} onRefresh={load} />
        )}

        {activeTab === 'controls' && (
          <ControlsTab system={system} canEdit={canEdit} onRefresh={load} />
        )}

        {activeTab === 'assets' && (
          <InformationAssetsTab system={system} canLinkAssets={canLinkAssets} canUnlinkAsset={canUnlinkAsset} isExpert={isExpert} onRefresh={load} />
        )}

        {activeTab === 'threats' && (
          <ThreatsTab
            system={system}
            canAssess={canEdit && hasCapability('risks.write')}
            onAssess={setAssessThreat}
          />
        )}

        {activeTab === 'suppliers' && (
          <SuppliersPanel systemId={system.id} isExpert={isExpert} />
        )}

        {assessThreat && (
          <RiskCreateModal
            initialSystemId={system.id}
            initialThreatId={assessThreat.id}
            onClose={() => setAssessThreat(null)}
            onCreated={(id) => { setAssessThreat(null); navigate(`/risks/${id}?panel=coverage`); }}
          />
        )}
      </div>
    </Shell>
  );
}
