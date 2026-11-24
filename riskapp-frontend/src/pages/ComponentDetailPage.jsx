// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth }               from '../context/AuthContext';
import { getComponent, updateComponent, deleteComponent } from '../api';
import { Shell }                 from '../components/Shell';
import { BackButton }            from '../components/BackButton';
import { EntityKind }            from '../components/EntityKind';
import { DocumentLifecycle }     from '../components/DocumentLifecycle';
import { DocumentReviewFindingBanner } from '../components/FindingBanner';
import { Spinner }               from '../components/Spinner';
import { getComponentColor }     from '../utils/componentColors';
import { scoreLevel }            from '../utils/riskColors';
import styles                    from './ComponentDetailPage.module.css';
import { COMPONENT_TYPE_OPTIONS, COMPONENT_TYPE_LABEL, componentStatusLabel, componentStatusOptions } from '../utils/componentTypes';
import { SuppliersPanel } from '../components/SuppliersPanel';
import { ComponentRisksDiagram, componentSystemsOf, componentCriticality } from '../components/ComponentRisksDiagram';
import { bandStripe }            from '../components/SystemRisksDiagram';
import { FilterChip }            from '../components/FilterChip';
import { RatingChip }            from '../components/RatingChip';
import { ViewModeToggle }        from '../components/ViewModeToggle';
import { useViewMode }           from '../hooks/useViewMode';
import { departmentColour }      from '../utils/departmentColour';


const TYPE_OPTIONS = COMPONENT_TYPE_OPTIONS;
const TYPE_LABELS = COMPONENT_TYPE_LABEL;

const CATEGORY_LABELS = {
  technical:    'Technical',
  human:        'Human',
  physical:     'Physical',
  environmental:'Environmental',
  supply_chain: 'Supply chain',
  organisational:'Organisational',
};

function RiskBand({ score }) {
  if (score == null) return <span className={styles.noRisk}>no active risks</span>;
  const level = scoreLevel(score);
  return <span className={`${styles.riskBand} ${styles[`risk_${level}`]}`}>{level} {score}</span>;
}

function EditModal({ component, onClose, onSaved }) {
  const [name, setName]     = useState(component.name || '');
  const [desc, setDesc]     = useState(component.description || '');
  const [type, setType]     = useState(component.component_type || 'technology');
  const [status, setStatus] = useState(component.status || 'unknown');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await updateComponent(component.id, {
        component_type: type,
        name: name.trim(),
        description: desc.trim() || undefined,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Edit component <HelpDot k="component_detail.edit_modal" placement="bottom" /></h2>
        <form onSubmit={handleSubmit}>
          <label className={styles.fieldLabel}>
            Name
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </label>
          <label className={styles.fieldLabel}>
            Description
            <textarea className={styles.textarea} value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
          </label>
          <label className={styles.fieldLabel}>
            Type
            <select className={styles.select} value={type} onChange={e => setType(e.target.value)}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Status
            <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
              {componentStatusOptions(type).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={styles.btnPrimary}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// One system card — shows the system's max risk and its active risks with threats.
// Where each kind of component is listed, to return to after deleting one.
const LIBRARY_OF = {
  technology: '/technology', people: '/people-groups', process: '/processes',
  facility: '/facilities', information: '/policies-documents',
};

function SystemCard({ system, navigate }) {
  const [expanded, setExpanded] = useState(false);
  const hasRisks = system.risks && system.risks.length > 0;

  return (
    <div className={styles.systemCard}>
      <div className={styles.systemHeader} onClick={() => hasRisks && setExpanded(e => !e)}>
        <div className={styles.systemInfo}>
          <button
            type="button"
            className={styles.systemName}
            onClick={e => { e.stopPropagation(); navigate(`/systems/${system.id}`); }}
          >
            {system.name}
          </button>
          {system.department_name && (
            <span className={styles.systemDept}>{system.department_name}</span>
          )}
        </div>
        <div className={styles.systemRight}>
          <RiskBand score={system.max_risk_score} />
          {hasRisks && (
            <span className={styles.riskCount}>
              {system.risks.length} risk{system.risks.length !== 1 ? 's' : ''}
              <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
            </span>
          )}
        </div>
      </div>

      {expanded && hasRisks && (
        <div className={styles.riskList}>
          {system.risks.map(r => (
            <button
              key={r.id}
              type="button"
              className={styles.riskRow}
              onClick={() => navigate(`/risks/current?selected=${r.id}`)}
            >
              <span className={styles.riskThreat}>
                <span className={styles.threatCat}>
                  {CATEGORY_LABELS[r.threat_category] || r.threat_category}
                </span>
                {r.threat_name}
              </span>
              <RiskBand score={r.risk_score} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Does it exist once for the organisation, or once per system (v137, §5)? Never
// guessed: a policy or one team is organisational, an agent is per system, and
// neither the type nor the number of systems says which.
const INSTANTIATION = [
  { value: '',               label: 'not stated' },
  { value: 'organisational', label: 'once for the organisation' },
  { value: 'per_system',     label: 'once per system' },
];

function InstantiationRow({ component, systems = [], onSaved }) {
  const { hasCapability } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const current = component.instantiation || '';
  const canSet = hasCapability('components.write');

  async function change(value) {
    setBusy(true); setErr('');
    try { await updateComponent(component.id, { instantiation: value || null }); await onSaved(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not save.'); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.instRow}>
      <span className={styles.instLabel}>Scope</span>
      {canSet ? (
        <select value={current} disabled={busy} onChange={e => change(e.target.value)}
          aria-label="Scope: does this component exist once for the organisation, or once per system?">
          {INSTANTIATION.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <span>{INSTANTIATION.find(o => o.value === current)?.label}</span>
      )}
      <span className={styles.instHint}>
        {current === 'organisational'
          ? (() => {
              // Make the effect of the answer visible where it is given: the
              // component is not taken off any system — every system that relies
              // on it now shares this one state.
              const risks = new Set(systems.flatMap(s => (s.risks || []).map(r => r.id))).size;
              return systems.length
                ? `Relied on by ${systems.length} system${systems.length === 1 ? '' : 's'} (${risks} risk${risks === 1 ? '' : 's'}) — its state, ${componentStatusLabel(component.component_type, component.status)}, applies to all of them.`
                : 'One state, shown above, shared by every system that relies on it. No system relies on it yet.';
            })()
          : current === 'per_system'
            ? 'Its state is recorded separately on each system.'
            : 'Until stated, it is treated as existing on each system.'}
      </span>
      {err && <span className={styles.instErr}>{err}</span>}
    </div>
  );
}

export function ComponentDetailPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { hasCapability } = useAuth();

  const [component, setComponent] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [editing, setEditing]     = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [tab, setTab]             = useState('risks');
  // The system whose risks the picture draws, and which risks the list shows.
  const [riskLayer, setRiskLayer] = useState(null);
  // A component may be on most systems, with hundreds of risks between them, so
  // the list starts on the chosen system's ('layer'); All risks is asked for.
  const [riskList, setRiskList]   = useState('layer');
  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  function load() {
    setLoading(true);
    getComponent(id)
      .then(setComponent)
      .catch(err => setError(
        err.response?.status === 404
          ? 'Component not found.'
          : err.response?.data?.error || 'Failed to load component.'
      ))
      .finally(() => setLoading(false));
  }
  // A background refresh after an in-place edit: load() would swap the page for
  // its loading state and snap the scroll to the top.
  const refresh = () => getComponent(id).then(setComponent).catch(() => {});

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Shell>
        <div className={styles.page}>
          <div className={styles.loadingState}><Spinner /><span>Loading…</span></div>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className={styles.page}>
          <BackButton />
          <div className={styles.errorBanner} role="alert">⚠ {error}</div>
        </div>
      </Shell>
    );
  }

  const col        = getComponentColor(component.component_type);
  const systems    = component.systems || [];
  const vulnerableOn = component.vulnerable_on || [];
  // Its criticality is the highest impact of the systems it is on; a risk score
  // only where an analyst named it on the risk (owner, 2026-11-19).
  const crit = componentCriticality(component);
  // No seat scope: the catalogue is shared org-wide and has no owning
  // department — see docs/component-ownership.md.
  const canEdit    = hasCapability('components.write');

  // A component created by mistake (a duplicate) is deleted; one anything uses is
  // refused by the API, which names where, so it is taken out there first.
  async function handleDelete() {
    if (!window.confirm(`Delete "${component.name}"? This cannot be undone. It is only allowed when nothing uses it.`)) return;
    setDeleteError('');
    try {
      await deleteComponent(component.id);
      navigate(LIBRARY_OF[component.component_type] || '/technology', { replace: true });
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not delete this component.');
    }
  }

  // Sort systems: highest max risk first, then alphabetical.
  const sortedSystems = [...systems].sort((a, b) => {
    const ra = a.max_risk_score ?? 0;
    const rb = b.max_risk_score ?? 0;
    return rb - ra || a.name.localeCompare(b.name);
  });

  // The Risks tab (owner, 2026-11-19): component → systems → risks.
  const compSystems = componentSystemsOf(component);
  const layer = compSystems.find(s => s.id === riskLayer) || compSystems[0] || null;
  const riskById = new Map();
  for (const sys of compSystems) {
    for (const r of sys.risks) riskById.set(r.id, { ...r, system_id: sys.id, system_name: sys.name });
  }
  const allRisks = [...riskById.values()].sort((x, y) => Number(y.named) - Number(x.named)
    || (y.risk_score ?? 0) - (x.risk_score ?? 0) || x.threat_name.localeCompare(y.threat_name));
  const listSystem = riskList === 'all' ? null : riskList === 'layer' ? layer : compSystems.find(s => s.id === riskList) || layer;
  const listedRisks = listSystem ? listSystem.risks.map(r => riskById.get(r.id)) : allRisks;
  const markedBy = new Map(vulnerableOn.map(v => [v.risk_id, v.marked_by]));
  function pickRiskLayer(sid, keepOpen = false) {
    setRiskLayer(sid);
    setRiskList(cur => ((cur === sid || (cur === 'layer' && layer?.id === sid)) && !keepOpen ? 'all' : sid));
  }
  const hasDetails = component.is_host || component.component_type === 'information';
  const hasSuppliers = ['people', 'process', 'technology'].includes(component.component_type);
  const TABS = [
    ['risks', 'Risks', allRisks.length],
    ['systems', 'Systems', systems.length],
    ...(hasDetails ? [['details', component.component_type === 'information' ? 'Document' : 'Network identity', null]] : []),
    ...(hasSuppliers ? [['suppliers', 'Suppliers', null]] : []),
  ];
  const shownTab = TABS.some(([k]) => k === tab) ? tab : 'risks';

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <BackButton />
          <span className={styles.viewModeSlot}><ViewModeToggle {...viewMode} /></span>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <span
              className={styles.typeBadge}
              style={{ background: col.bg, borderColor: col.border, color: col.text }}
            >
              {TYPE_LABELS[component.component_type] || component.component_type}
            </span>
            {/* The state as it READS (v139): a Published document past its review
                date shows as Under review. */}
            <span className={`${styles.statusBadge} ${styles[`status_${component.effective_status || component.status}`] || ''}`}>
              {componentStatusLabel(component.component_type, component.effective_status || component.status)}
              {component.review_overdue && ' · review overdue'}
            </span>
            {component.is_host && <span className={styles.hostBadge}>HOST</span>}
            {crit.impact != null && (
              <span className={styles.critChip}
                title={`The highest impact of the systems it is on: ${crit.from.map(x => x.name).slice(0, 3).join(', ')}${crit.from.length > 3 ? ` and ${crit.from.length - 3} more` : ''}`}>
                Criticality <RatingChip value={crit.impact} scale="impact" variant={isExpert ? 'number' : 'word'} />
              </span>
            )}
            {crit.namedRisk != null && (
              <span className={styles.critChip} title="The worst risk an analyst named this component on">
                Named on a risk <RatingChip value={crit.namedRisk} scale="risk" variant={isExpert ? 'number' : 'word'} />
              </span>
            )}
          </div>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{component.name}<EntityKind kind="component" /> <HelpDot k="component_detail.title" placement="bottom" /></h1>
            {canEdit && (
              <span className={styles.headerActions}>
                <button className={styles.btnSecondary} onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button className={styles.btnDanger} onClick={handleDelete}
                  title="For a component created by mistake, such as a duplicate. Only allowed when nothing uses it.">
                  Delete
                </button>
              </span>
            )}
          </div>
          {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}
          {component.description && (
            <p className={styles.description} title={component.description}>{component.description}</p>
          )}
          <InstantiationRow component={component} systems={systems} onSaved={refresh} />
        </div>

        {component.component_type === 'information' && (
          <DocumentReviewFindingBanner component={component} onChanged={refresh} />
        )}

        <div className={styles.tabs} role="tablist">
          {TABS.map(([k, words, n]) => (
            <button key={k} type="button" role="tab" aria-selected={shownTab === k}
              className={shownTab === k ? styles.tabActive : styles.tab} onClick={() => setTab(k)}>
              {words}{n != null && <span className={styles.tabCount}>{n}</span>}
            </button>
          ))}
        </div>

        {shownTab === 'risks' && (
          <div className={styles.risksTab}>
            <ComponentRisksDiagram component={component} selected={layer?.id}
              onSelect={pickRiskLayer} onComponent={() => setRiskList('all')}
              onRisk={(rid) => navigate(`/risks/${rid}#score`)} onMore={() => setTab('systems')} />
            <p className={styles.sectionNote}>
              Select a system to draw and list its risks, or All risks for every system; select a risk to open it.
              A risk marked <strong>named here</strong> is one an analyst named this component on, as part of
              why the threat succeeds.{' '}
              <HelpDot k="component_detail.risks" placement="bottom" />
            </p>
            <div className={styles.riskListBar} role="group" aria-label="Which risks to list">
              <button type="button" aria-pressed={!listSystem}
                className={!listSystem ? styles.riskListAllOn : styles.riskListAll}
                onClick={() => setRiskList('all')}>
                All risks <span className={styles.tabCount}>{allRisks.length}</span>
              </button>
              {listSystem && (
                <FilterChip words={`${listSystem.name} · ${listSystem.risks.length}`} stripe={departmentColour(listSystem.department_id)}
                  onClose={() => setRiskList('all')} />
              )}
            </div>
            <div className={styles.riskRows}>
              {listedRisks.map(r => (
                <button key={r.id} type="button" className={styles.riskRow}
                  style={{ borderLeftColor: listSystem ? departmentColour(listSystem.department_id) : bandStripe(r.risk_score) }}
                  onClick={() => navigate(`/risks/${r.id}#score`)}>
                  <RatingChip value={r.risk_score} scale="risk" variant={isExpert ? 'number' : 'word'} />
                  <span className={styles.riskRowName}>{r.threat_name}</span>
                  {r.named && (
                    <span className={styles.namedTag} title="An analyst named this component on the risk as part of why the threat succeeds">
                      named here{markedBy.get(r.id) ? ` by ${markedBy.get(r.id)}` : ''}
                    </span>
                  )}
                  <span className={styles.riskRowSystem}>{r.system_name}</span>
                </button>
              ))}
              {listedRisks.length === 0 && (
                <p className={styles.empty}>{listSystem ? 'No active risks on this system.' : 'No active risks on the systems it is on.'}</p>
              )}
            </div>
          </div>
        )}

        {shownTab === 'systems' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Systems using this component <HelpDot k="component_detail.systems" placement="bottom" />
              {systems.length > 0 && <span className={styles.sectionCount}>{systems.length}</span>}
            </h2>
            {sortedSystems.length === 0 ? (
              <p className={styles.empty}>This component is not linked to any systems.</p>
            ) : (
              <div className={styles.systemGrid}>
                {sortedSystems.map(s => (
                  <SystemCard key={s.id} system={s} navigate={navigate} />
                ))}
              </div>
            )}
          </section>
        )}

        {shownTab === 'details' && component.component_type === 'information' && (
          <DocumentLifecycle component={component} onSaved={refresh} />
        )}

        {shownTab === 'details' && component.is_host && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Network identity <HelpDot k="component_detail.network_identity" placement="bottom" /></h2>
            {component.hostname && (
              <p className={styles.hostnameLine}>
                <span className={styles.hostnameLabel}>Hostname</span>
                <span className={styles.hostnameValue}>{component.hostname}</span>
              </p>
            )}
            {(component.ip_addresses?.length ?? 0) === 0 ? (
              <p className={styles.empty}>No IP addresses recorded.</p>
            ) : (
              <div className={styles.ipChips}>
                {component.ip_addresses.map(ip => (
                  <span key={ip.id} className={styles.ipChip}>
                    {ip.ip_address}
                    {ip.label && <span className={styles.ipChipLabel}>{ip.label}</span>}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {shownTab === 'suppliers' && <SuppliersPanel componentId={component.id} />}

        {editing && (
          <EditModal
            component={component}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); load(); }}
          />
        )}
      </div>
    </Shell>
  );
}
