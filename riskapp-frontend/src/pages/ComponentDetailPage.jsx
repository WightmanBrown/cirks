// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth }               from '../context/AuthContext';
import { getComponent, updateComponent } from '../api';
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
        <h2 className={styles.modalTitle}>Edit component</h2>
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
  const maxRisk    = systems.length
    ? Math.max(...systems.map(s => s.max_risk_score ?? 0).filter(Boolean)) || null
    : null;
  // No seat scope: the catalogue is shared org-wide and has no owning
  // department — see docs/component-ownership.md.
  const canEdit    = hasCapability('components.write');

  // Sort systems: highest max risk first, then alphabetical.
  const sortedSystems = [...systems].sort((a, b) => {
    const ra = a.max_risk_score ?? 0;
    const rb = b.max_risk_score ?? 0;
    return rb - ra || a.name.localeCompare(b.name);
  });

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />

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
            {maxRisk != null && <RiskBand score={maxRisk} />}
          </div>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{component.name}<EntityKind kind="component" /></h1>
            {canEdit && (
              <button className={styles.btnSecondary} onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {component.description && (
            <p className={styles.description}>{component.description}</p>
          )}
          <InstantiationRow component={component} systems={systems} onSaved={refresh} />
        </div>

        {component.component_type === 'information' && (<>
          <DocumentReviewFindingBanner component={component} onChanged={refresh} />
          <DocumentLifecycle component={component} onSaved={refresh} />
        </>)}

        {/* Network identity (hosts only) */}
        {component.is_host && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Network identity</h2>
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

        {/* Named as a vulnerability — the DIRECT signal. Deliberately ABOVE the
            systems section, because "someone judged this component to be part of
            why a threat succeeds" is a stronger statement than "it sits on a
            system that has risks", and the section below is the latter. */}
        {vulnerableOn.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Named as a vulnerability
              <span className={styles.sectionCount}>{vulnerableOn.length}</span>
            </h2>
            <p className={styles.sectionNote}>
              An analyst marked this component on these risks as part of why the threat
              succeeds. That is a judgement about this component — separate from its
              condition, and from the risks merely present on the systems it sits in.
            </p>
            <ul className={styles.vulnList}>
              {vulnerableOn.map(v => (
                <li key={v.risk_id}>
                  <button
                    type="button"
                    className={styles.vulnRow}
                    onClick={() => navigate(`/risks/${v.risk_id}`)}
                  >
                    <span className={styles.vulnThreat}>{v.threat_name}</span>
                    <span className={styles.vulnSystem}>on {v.system_name}</span>
                    <RiskBand score={v.risk_score} />
                    {v.marked_by && (
                      <span className={styles.vulnBy}>marked by {v.marked_by}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Systems */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Systems using this component
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

        {['people', 'process', 'technology'].includes(component.component_type) && (
          <SuppliersPanel componentId={component.id} />
        )}

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
