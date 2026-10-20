// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDepartments, getBusinessServices,
  createImpactTable, createImpactTableCustomRow,
  getDeptCustomRows,
} from '../api';

function rowKey(cat, subcat) { return `${cat}|||${subcat}`; }
function loadSavedArchetypes(deptId) {
  try {
    const raw = localStorage.getItem(`dept_archetypes_${deptId}`);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch { return null; }
}
import { useAuth } from '../context/AuthContext';
import { Shell }  from '../components/Shell';
import styles from './DepartmentSetupWizard.module.css';
import { BackButton } from '../components/BackButton';

// ── Archetype catalogue (labels only — service examples live in dept wizard) ──

const ARCHETYPES = [
  { id: 'it',         label: 'IT / Technology',        description: 'Infrastructure, systems, and technical services' },
  { id: 'finance',    label: 'Finance',                 description: 'Financial transactions, reporting, and compliance' },
  { id: 'hr',         label: 'HR / People',             description: 'Employee lifecycle and people services' },
  { id: 'legal',      label: 'Legal / Compliance',      description: 'Legal risk, contracts, and regulatory obligations' },
  { id: 'operations', label: 'Operations',              description: 'Core service delivery and operational processes' },
  { id: 'comms',      label: 'Communications',          description: 'Brand, media, and stakeholder communications' },
  { id: 'customer',   label: 'Customer Services',       description: 'Customer-facing interactions and support' },
  { id: 'data',       label: 'Data / Analytics',        description: 'Data assets, reporting, and analytical services' },
  { id: 'public',     label: 'Public / Social Services', description: 'Direct delivery of public-facing or citizen services' },
];

// ── Suggested impact rows by archetype ───────────────────────────────────────
// These scaffold the structure only; BIL descriptions are filled in via the
// impact table editor on the service detail page.

const ARCHETYPE_ROWS = {
  it: [
    { category_name: 'Operational Impact',    subcategory_name: 'System and Service Availability' },
    { category_name: 'Operational Impact',    subcategory_name: 'Staff Productivity Loss' },
    { category_name: 'Financial Impact',      subcategory_name: 'Revenue and Cost Impact' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Personal Data Breach' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Security Compliance Failure' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Stakeholder and Customer Trust' },
    { category_name: 'Safety Impact',         subcategory_name: 'Safety-Critical System Failure' },
  ],
  finance: [
    { category_name: 'Financial Impact',      subcategory_name: 'Direct Financial Loss or Error' },
    { category_name: 'Financial Impact',      subcategory_name: 'Payroll Failure' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Regulatory Reporting Failure' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Audit and Compliance Breach' },
    { category_name: 'Operational Impact',    subcategory_name: 'Payment Processing Disruption' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Investor and Auditor Confidence' },
  ],
  hr: [
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Employment Law Breach' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Data Protection / GDPR (Employee Data)' },
    { category_name: 'Financial Impact',      subcategory_name: 'Payroll Disruption' },
    { category_name: 'Operational Impact',    subcategory_name: 'Workforce Management Disruption' },
    { category_name: 'Operational Impact',    subcategory_name: 'Recruitment and Onboarding Disruption' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Employer Reputation and Trust' },
  ],
  legal: [
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Regulatory or Statutory Breach' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Contractual Obligations Failure' },
    { category_name: 'Financial Impact',      subcategory_name: 'Litigation and Legal Costs' },
    { category_name: 'Operational Impact',    subcategory_name: 'Policy and Governance Failure' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Public and Regulatory Trust' },
  ],
  operations: [
    { category_name: 'Operational Impact',    subcategory_name: 'Core Service Delivery Failure' },
    { category_name: 'Operational Impact',    subcategory_name: 'Supply Chain Disruption' },
    { category_name: 'Financial Impact',      subcategory_name: 'Operational Cost Increase' },
    { category_name: 'Safety Impact',         subcategory_name: 'Health and Safety Incident' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Regulatory Compliance Failure' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Customer and Stakeholder Confidence' },
  ],
  comms: [
    { category_name: 'Reputational Impact',   subcategory_name: 'Brand and Public Perception' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Media and Press Relations Failure' },
    { category_name: 'Operational Impact',    subcategory_name: 'Internal Communications Breakdown' },
    { category_name: 'Financial Impact',      subcategory_name: 'Revenue Impact from Reputational Damage' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Misinformation or Regulatory Messaging Breach' },
  ],
  customer: [
    { category_name: 'Reputational Impact',   subcategory_name: 'Customer Satisfaction and Retention' },
    { category_name: 'Financial Impact',      subcategory_name: 'Revenue Loss from Service Failure' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Consumer Protection Regulatory Breach' },
    { category_name: 'Operational Impact',    subcategory_name: 'Contact Channel Availability' },
    { category_name: 'Operational Impact',    subcategory_name: 'Complaint and Escalation Handling Failure' },
  ],
  data: [
    { category_name: 'Operational Impact',    subcategory_name: 'Management Decision-Making Capability' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Data Breach and Privacy Violation' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Data Governance and Regulatory Compliance' },
    { category_name: 'Financial Impact',      subcategory_name: 'Analytical Capability and Revenue Impact' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Data Integrity and Stakeholder Trust' },
  ],
  public: [
    { category_name: 'Safety Impact',         subcategory_name: 'Citizen or Service User Safety' },
    { category_name: 'Legal and Regulatory',  subcategory_name: 'Statutory Duty Failure' },
    { category_name: 'Operational Impact',    subcategory_name: 'Continuity of Public Service Delivery' },
    { category_name: 'Financial Impact',      subcategory_name: 'Funding and Grant Impact' },
    { category_name: 'Reputational Impact',   subcategory_name: 'Public Confidence and Trust' },
  ],
};

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ steps, currentKey }) {
  const currentIdx = steps.findIndex(s => s.key === currentKey);
  return (
    <div className={styles.stepIndicator}>
      {steps.map((s, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className={styles.stepItem}>
            {i > 0 && <div className={done ? styles.stepLineDone : styles.stepLine} />}
            <div className={done ? styles.stepDotDone : active ? styles.stepDotActive : styles.stepDot}>
              {done ? '✓' : i + 1}
            </div>
            <span className={active ? styles.stepLabelActive : styles.stepLabel}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function ImpactTableWizard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const isCrossDept = ['admin', 'ciso', 'security_consultant'].includes(user?.role);

  const STEPS = useMemo(() => isCrossDept
    ? [
        { key: 'dept',    label: 'Department' },
        { key: 'type',    label: 'Type' },
        { key: 'service', label: 'Service' },
        { key: 'rows',    label: 'Review' },
      ]
    : [
        { key: 'type',    label: 'Type' },
        { key: 'service', label: 'Service' },
        { key: 'rows',    label: 'Review' },
      ],
  [isCrossDept]);

  const [stepKey,       setStepKey]       = useState(STEPS[0].key);
  const [departments,   setDepartments]   = useState([]);
  const [deptId,        setDeptId]        = useState('');
  const [deptName,      setDeptName]      = useState('');
  const [archetypeIds,  setArchetypeIds]  = useState(new Set());
  const [services,      setServices]      = useState([]);
  const [serviceId,     setServiceId]     = useState('');
  const [selected,      setSelected]      = useState(new Set()); // Set<"cat|||subcat">
  const [prevRows,      setPrevRows]      = useState([]);        // { category_name, subcategory_name }
  const [addingRow,     setAddingRow]     = useState(false);
  const [newCat,        setNewCat]        = useState('');
  const [newSubcat,     setNewSubcat]     = useState('');
  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState('');
  const [, setCreatedTable] = useState(null);
  const [remaining,     setRemaining]     = useState(0);
  const [loadingDepts,  setLoadingDepts]  = useState(false);
  const [loadingSvcs,   setLoadingSvcs]   = useState(false);

  // Load departments for cross-dept roles
  useEffect(() => {
    if (!isCrossDept) return;
    setLoadingDepts(true);
    getDepartments().then(setDepartments).finally(() => setLoadingDepts(false));
  }, [isCrossDept]);

  // For non-cross-dept: load services immediately, derive deptId, check localStorage
  useEffect(() => {
    if (isCrossDept) return;
    setLoadingSvcs(true);
    getBusinessServices()
      .then(data => {
        const unrated = data.filter(s => !s.has_impact_tables && !s.adopted);
        setServices(unrated);
        const id = unrated[0]?.department_id || data[0]?.department_id;
        const name = unrated[0]?.department_name || data[0]?.department_name;
        if (id) {
          setDeptId(id);
          if (name) setDeptName(name);
          const saved = loadSavedArchetypes(id);
          if (saved) { setArchetypeIds(saved); setStepKey('service'); }
        }
      })
      .finally(() => setLoadingSvcs(false));
  }, [isCrossDept]);

  function handleSelectDept(id, name) {
    setDeptId(id);
    setDeptName(name);
    setServices([]);
    const saved = loadSavedArchetypes(id);
    if (saved) {
      setArchetypeIds(saved);
      setLoadingSvcs(true);
      getBusinessServices({ for_dept: id })
        .then(data => setServices(data.filter(s => !s.has_impact_tables && !s.adopted)))
        .finally(() => setLoadingSvcs(false));
      setStepKey('service');
    } else {
      setStepKey('type');
    }
  }

  function handleConfirmArchetypes() {
    if (archetypeIds.size === 0) return;
    setLoadingSvcs(true);
    const fetchArgs = isCrossDept ? { for_dept: deptId } : {};
    getBusinessServices(fetchArgs)
      .then(data => setServices(data.filter(s => !s.has_impact_tables && !s.adopted)))
      .finally(() => setLoadingSvcs(false));
    setStepKey('service');
  }

  function handleSelectService(id) {
    setServiceId(id);
    // Pre-select all archetype rows + load previously used dept rows
    const keys = new Set();
    for (const aid of archetypeIds) {
      for (const row of (ARCHETYPE_ROWS[aid] || [])) {
        keys.add(rowKey(row.category_name, row.subcategory_name));
      }
    }
    setSelected(keys);
    setPrevRows([]);
    if (deptId) {
      getDeptCustomRows(deptId).then(rows => {
        setPrevRows(rows);
        setSelected(prev => {
          const next = new Set(prev);
          rows.forEach(r => next.add(rowKey(r.category_name, r.subcategory_name)));
          return next;
        });
      }).catch(() => {});
    }
    setAddingRow(false);
    setNewCat('');
    setNewSubcat('');
    setStepKey('rows');
  }

  function toggleKey(key) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleAddCustomRow() {
    if (!newCat.trim() || !newSubcat.trim()) return;
    const key = rowKey(newCat.trim(), newSubcat.trim());
    setSelected(prev => new Set([...prev, key]));
    setNewCat('');
    setNewSubcat('');
    setAddingRow(false);
  }

  async function handleFinish() {
    setBusy(true);
    setError('');
    try {
      const svc = services.find(s => s.id === serviceId);
      // The table is named after the service and scoped to its department, but
      // is no longer LINKED to it (v99 — services carry no impact-table link).
      // It becomes available for rating that service's information assets
      // against, which is what actually drives the service's impact.
      const tbl = await createImpactTable({ name: `${svc.name} Impact Table`, scope: 'department' });

      for (const key of selected) {
        const [category_name, subcategory_name] = key.split('|||');
        await createImpactTableCustomRow(tbl.id, { category_name, subcategory_name });
      }

      setRemaining(services.filter(s => s.id !== serviceId).length);
      setCreatedTable(tbl);
      setStepKey('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create impact table');
    } finally {
      setBusy(false);
    }
  }

  function handleNextService() {
    setServices(prev => prev.filter(s => s.id !== serviceId));
    setServiceId('');
    setSelected(new Set());
    setPrevRows([]);
    setCreatedTable(null);
    setError('');
    setStepKey('service');
  }

  const selectedArchetypes = ARCHETYPES.filter(a => archetypeIds.has(a.id));
  const service            = services.find(s => s.id === serviceId);

  // All archetype-suggested rows, deduplicated by content key
  const suggestedRows = useMemo(() => {
    const seen = new Set();
    const out  = [];
    for (const a of selectedArchetypes) {
      for (const row of (ARCHETYPE_ROWS[a.id] || [])) {
        const k = rowKey(row.category_name, row.subcategory_name);
        if (!seen.has(k)) { seen.add(k); out.push(row); }
      }
    }
    return out;
  }, [archetypeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Previously-used rows that aren't already in the archetype suggestions
  const suggestedKeys  = useMemo(() => new Set(suggestedRows.map(r => rowKey(r.category_name, r.subcategory_name))), [suggestedRows]);
  const novelPrevRows  = prevRows.filter(r => !suggestedKeys.has(rowKey(r.category_name, r.subcategory_name)));

  // Group suggested rows by category for display
  const groupedRows = suggestedRows.reduce((acc, row) => {
    (acc[row.category_name] = acc[row.category_name] || []).push(row);
    return acc;
  }, {});

  const selectedCount = selected.size;

  // ── Done screen ─────────────────────────────────────────────────────────────

  if (stepKey === 'done') {
    return (
      <Shell>
        <div className={styles.page}>
        <BackButton />
          <div className={styles.doneScreen}>
            <div className={styles.doneCheck}>✓</div>
            <h1 className={styles.doneTitle}>Structure saved</h1>
            <p className={styles.doneSub}>
              <strong style={{ color: 'var(--text-primary)' }}>{service?.name}</strong> now has{' '}
              {selectedCount} impact categor{selectedCount !== 1 ? 'ies' : 'y'} defined.
              That's the hard part done.
            </p>

            <div className={styles.doneNext}>
              <p className={styles.doneNextLabel}>What happens next</p>
              <p className={styles.doneNextHint}>
                A risk analyst will fill in the BIL 1–5 descriptions for each category — what
                does a minor disruption look like vs. a catastrophic one? That's a separate
                exercise and doesn't need to happen today.
              </p>
            </div>

            {remaining > 0 && (
              <div className={styles.doneNext} style={{ marginTop: 0 }}>
                <p className={styles.doneNextLabel}>More services to do</p>
                <p className={styles.doneNextHint}>
                  {remaining} service{remaining !== 1 ? 's' : ''} in this department still {remaining === 1 ? 'needs' : 'need'} impact categories defined.
                </p>
              </div>
            )}

            <div className={styles.doneActions}>
              {remaining > 0 && (
                <button className={styles.btnPrimary} onClick={handleNextService}>
                  Do next service →
                </button>
              )}
              {remaining === 0 && (
                <button className={styles.btnPrimary} onClick={() => navigate('/services')}>
                  Back to services
                </button>
              )}
              <button className={styles.btnSecondary} onClick={() => navigate(`/services/${serviceId}`)}>
                View service
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Wizard steps ────────────────────────────────────────────────────────────

  return (
    <Shell>
      <div className={styles.page}>
        <StepIndicator steps={STEPS} currentKey={stepKey} />

        {/* ── Step: Department (cross-dept roles only) ── */}
        {stepKey === 'dept' && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h1>Which <em>department</em> are you setting up?</h1>
              <p>Select the department whose services you want to create impact tables for.</p>
            </div>
            {loadingDepts
              ? <p className={styles.loading}>Loading departments…</p>
              : (
                <div className={styles.deptGrid}>
                  {departments.map(d => (
                    <button
                      key={d.id}
                      className={deptId === d.id
                        ? `${styles.deptCard} ${styles.deptCardActive}`
                        : styles.deptCard}
                      onClick={() => handleSelectDept(d.id, d.name)}
                    >
                      <span className={styles.deptCardName}>{d.name}</span>
                    </button>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ── Step: Type (dept-level, asked once) ── */}
        {stepKey === 'type' && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h1>What is <em>{deptName || 'this department'}</em> most like?</h1>
              <p>
                Select all that apply — this shapes the suggested impact categories for every
                service in this department. You can adjust them per service in the next step.
              </p>
            </div>
            <div className={styles.archetypeGrid}>
              {ARCHETYPES.map(a => {
                const active = archetypeIds.has(a.id);
                return (
                  <button
                    key={a.id}
                    className={active
                      ? `${styles.archetypeCard} ${styles.archetypeCardActive}`
                      : styles.archetypeCard}
                    onClick={() => setArchetypeIds(prev => {
                      const next = new Set(prev);
                      active ? next.delete(a.id) : next.add(a.id);
                      return next;
                    })}
                  >
                    <span className={styles.archetypeName}>
                      {active && <span style={{ color: 'var(--amber)', marginRight: 6 }}>✓</span>}
                      {a.label}
                    </span>
                    <span className={styles.archetypeDesc}>{a.description}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.stepActions}>
              {isCrossDept && (
                <button className={styles.btnSecondary} onClick={() => setStepKey('dept')}>
                  ← Back
                </button>
              )}
              <button
                className={styles.btnPrimary}
                disabled={archetypeIds.size === 0}
                onClick={handleConfirmArchetypes}
              >
                Next — choose service →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Service ── */}
        {stepKey === 'service' && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h1>Which <em>service</em> are you setting up?</h1>
              <p>These services don't yet have an impact table. Select one to define its impact categories.</p>
            </div>

            {loadingSvcs && <p className={styles.loading}>Loading services…</p>}

            {!loadingSvcs && services.length === 0 && (
              <div className={styles.error}>
                All services in this department already have an impact table, or there are no services yet.
              </div>
            )}

            {!loadingSvcs && services.length > 0 && (
              <div className={styles.servicesList}>
                {services.map(svc => (
                  <button
                    key={svc.id}
                    className={serviceId === svc.id
                      ? `${styles.serviceItem} ${styles.serviceItemEditing}`
                      : styles.serviceItem}
                    style={{ cursor: 'pointer', width: '100%', textAlign: 'left' }}
                    onClick={() => handleSelectService(svc.id)}
                  >
                    <div className={styles.serviceItemTop}>
                      <span className={styles.serviceItemName}>{svc.name}</span>
                      {svc.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
                    </div>
                    {svc.description && <p className={styles.serviceItemDesc}>{svc.description}</p>}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.stepActions}>
              <button className={styles.btnSecondary} onClick={() => setStepKey('type')}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Review rows ── */}
        {stepKey === 'rows' && (
          <div className={styles.stepContent} style={{ maxWidth: 860 }}>
            <div className={styles.stepHeading}>
              <h1>Review <em>impact categories</em></h1>
              <p>
                Suggested for {selectedArchetypes.map(a => a.label).join(' + ')}.
                Uncheck any that don't apply, and add your own below.
                BIL descriptions are filled in on the service page afterwards.
              </p>
            </div>

            {/* Archetype-suggested rows */}
            <div key={[...archetypeIds].join(',')} style={{ display: 'contents' }}>
              {Object.entries(groupedRows).map(([cat, rows], gi) => (
                <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p
                    className={styles.rowSlideIn}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: 'var(--text-muted)', margin: '8px 0 2px',
                      animationDelay: `${gi * 55}ms`,
                    }}
                  >
                    {cat}
                  </p>
                  {rows.map((row, ri) => {
                    const k = rowKey(row.category_name, row.subcategory_name);
                    const on = selected.has(k);
                    return (
                      <label
                        key={k}
                        className={styles.rowSlideIn}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px',
                          background: on ? 'var(--bg-elevated)' : 'transparent',
                          border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer', opacity: on ? 1 : 0.45,
                          transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                          animationDelay: `${(gi * 3 + ri) * 55 + 20}ms`,
                        }}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleKey(k)}
                          style={{ accentColor: 'var(--amber)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {row.subcategory_name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Previously used in this department */}
            {novelPrevRows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--amber)', margin: '8px 0 2px',
                }}>
                  Previously used in this department
                </p>
                {novelPrevRows.map(r => {
                  const k  = rowKey(r.category_name, r.subcategory_name);
                  const on = selected.has(k);
                  return (
                    <label key={k} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      background: on ? 'var(--bg-elevated)' : 'transparent',
                      border: `1px solid ${on ? 'var(--amber-dim)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', opacity: on ? 1 : 0.45,
                      transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggleKey(k)}
                        style={{ accentColor: 'var(--amber)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.category_name} / </span>
                        {r.subcategory_name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Add custom category */}
            {addingRow ? (
              <div className={styles.addCustomForm}>
                <input
                  className={styles.addCustomInput}
                  placeholder="Category (e.g. Safety Impact)"
                  value={newCat}
                  onChange={e => setNewCat(e.target.value)}
                  autoFocus
                />
                <input
                  className={styles.addCustomInput}
                  placeholder="Subcategory (e.g. Harm to vulnerable individuals)"
                  value={newSubcat}
                  onChange={e => setNewSubcat(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomRow()}
                />
                <div className={styles.addCustomActions}>
                  <button className={styles.btnSecondary} onClick={() => { setAddingRow(false); setNewCat(''); setNewSubcat(''); }}>
                    Cancel
                  </button>
                  <button className={styles.btnPrimary} onClick={handleAddCustomRow} disabled={!newCat.trim() || !newSubcat.trim()}>
                    Add category
                  </button>
                </div>
              </div>
            ) : (
              <button className={styles.addCustomBtn} onClick={() => setAddingRow(true)}>
                + Add your own category
              </button>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.stepActions}>
              <button className={styles.btnSecondary} onClick={() => setStepKey('service')}>
                ← Back
              </button>
              <button
                className={styles.btnPrimary}
                disabled={selectedCount === 0 || busy}
                onClick={handleFinish}
              >
                {busy ? 'Creating…' : `Create impact table (${selectedCount} categor${selectedCount !== 1 ? 'ies' : 'y'})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
