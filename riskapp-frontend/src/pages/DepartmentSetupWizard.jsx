// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, getBusinessServices, getSharedServices, createBusinessService, updateBusinessService, deleteBusinessService, adoptService } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { CapabilityGate } from '../components/CapabilityGate';
import styles from './DepartmentSetupWizard.module.css';

// ── Archetype catalogue ──────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    id: 'it',
    label: 'IT / Technology',
    description: 'Infrastructure, systems, and technical services',
    examples: [
      { name: 'Email and Collaboration', description: 'Provision and support of email, calendar, and collaboration tools such as Microsoft 365 or Google Workspace.' },
      { name: 'Network Infrastructure', description: 'Management of internal and external network connectivity, firewalls, and switches.' },
      { name: 'Identity and Access Management', description: 'Provisioning, management, and deprovisioning of user accounts and access rights across systems.' },
      { name: 'IT Service Desk', description: 'First and second-line support for staff experiencing technical issues or requesting IT services.' },
      { name: 'Server and Storage Management', description: 'Provision, maintenance, and monitoring of on-premises and cloud servers and storage.' },
      { name: 'Endpoint Device Management', description: 'Procurement, configuration, and lifecycle management of laptops, desktops, and mobile devices.' },
      { name: 'Business Application Support', description: 'Support and maintenance of line-of-business applications used by operational teams.' },
      { name: 'Backup and Recovery', description: 'Scheduled backup of critical systems and data, with tested recovery procedures.' },
      { name: 'Cybersecurity Operations', description: 'Monitoring for threats, vulnerability management, and incident response.' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Financial transactions, reporting, and compliance',
    examples: [
      { name: 'Accounts Payable', description: 'Processing of supplier invoices and payment runs in accordance with agreed payment terms.' },
      { name: 'Accounts Receivable', description: 'Invoicing customers and managing the collection of outstanding debts.' },
      { name: 'Payroll Processing', description: 'Calculation and payment of employee salaries, expenses, and statutory deductions.' },
      { name: 'Financial Reporting', description: 'Production of management accounts, statutory accounts, and regulatory financial returns.' },
      { name: 'Procurement', description: 'Management of supplier relationships, tendering processes, and purchase orders.' },
      { name: 'Treasury Management', description: 'Management of cash flow, banking relationships, and investment of surplus funds.' },
      { name: 'Expense Management', description: 'Processing and reimbursement of staff expense claims against agreed policy.' },
      { name: 'Budget Management', description: 'Annual budget setting, in-year monitoring, and variance reporting across cost centres.' },
    ],
  },
  {
    id: 'hr',
    label: 'HR / People',
    description: 'Employee lifecycle and people services',
    examples: [
      { name: 'Recruitment and Onboarding', description: 'Advertising vacancies, managing applications, conducting interviews, and inducting new employees.' },
      { name: 'Employee Relations', description: 'Management of grievance, disciplinary, and performance processes in line with employment law.' },
      { name: 'Learning and Development', description: 'Delivery of training programmes, mandatory compliance training, and career development pathways.' },
      { name: 'HR Information System', description: 'Maintenance of the HR database including employment records, contracts, and absence data.' },
      { name: 'Absence Management', description: 'Monitoring, recording, and management of employee sickness, leave, and flexible working.' },
      { name: 'Payroll Administration', description: 'Input of payroll changes: new starters, leavers, salary changes, and benefit elections.' },
      { name: 'Workforce Planning', description: 'Analysis of workforce data to support headcount planning and organisational design.' },
    ],
  },
  {
    id: 'legal',
    label: 'Legal / Compliance',
    description: 'Legal risk, contracts, and regulatory obligations',
    examples: [
      { name: 'Contract Management', description: 'Drafting, reviewing, and maintaining contracts with customers, suppliers, and partners.' },
      { name: 'Regulatory Compliance Monitoring', description: 'Tracking applicable legislation and coordinating internal compliance activities.' },
      { name: 'Data Protection / GDPR', description: 'Ensuring lawful processing of personal data, managing subject access requests, and maintaining records of processing.' },
      { name: 'Legal Advisory Services', description: 'Legal advice and representation across the organisation on commercial and employment matters.' },
      { name: 'Policy Management', description: 'Development, maintenance, and communication of organisational policies and procedures.' },
      { name: 'Insurance Management', description: 'Procurement and management of the organisation\'s insurance portfolio.' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Core service delivery and operational processes',
    examples: [
      { name: 'Supply Chain Management', description: 'Management of supplier relationships, stock levels, and procurement of goods for operational delivery.' },
      { name: 'Quality Assurance', description: 'Monitoring and improvement of service and product quality against defined standards.' },
      { name: 'Facilities Management', description: 'Management of office and operational premises including maintenance, cleaning, and security.' },
      { name: 'Health and Safety', description: 'Management of workplace health and safety risks, incident reporting, and HSE compliance.' },
      { name: 'Business Continuity', description: 'Planning and testing of arrangements to maintain critical services during disruption.' },
      { name: 'Logistics and Distribution', description: 'Management of the movement of goods and materials to and from operational sites.' },
    ],
  },
  {
    id: 'comms',
    label: 'Communications',
    description: 'Brand, media, and stakeholder communications',
    examples: [
      { name: 'Website and Digital Channels', description: 'Management and content publishing for the organisation\'s public-facing website and digital platforms.' },
      { name: 'Internal Communications', description: 'Production and distribution of internal communications to keep staff informed.' },
      { name: 'Press and Media Relations', description: 'Management of journalist relationships and handling of media enquiries and press releases.' },
      { name: 'Social Media Management', description: 'Publishing and monitoring of the organisation\'s presence on social media platforms.' },
      { name: 'Brand Management', description: 'Maintenance of brand guidelines and oversight of their application across all materials.' },
      { name: 'Events Management', description: 'Planning and delivery of external events, conferences, and stakeholder engagement activities.' },
    ],
  },
  {
    id: 'customer',
    label: 'Customer Services',
    description: 'Customer-facing interactions and support',
    examples: [
      { name: 'Customer Contact Centre', description: 'Telephone, email, and webchat support for customers with queries, complaints, or requests.' },
      { name: 'Complaint Handling', description: 'Formal investigation and resolution of customer complaints in line with regulatory requirements.' },
      { name: 'Customer Onboarding', description: 'End-to-end process for registering and activating new customers or service users.' },
      { name: 'Account Management', description: 'Relationship management for key customers, including regular reviews and escalation handling.' },
      { name: 'Self-Service Portal', description: 'Online portal allowing customers to manage accounts and raise requests without staff assistance.' },
    ],
  },
  {
    id: 'data',
    label: 'Data / Analytics',
    description: 'Data assets, reporting, and analytical services',
    examples: [
      { name: 'Data Platform / Warehouse', description: 'Central repository for structured data from across the organisation, supporting reporting and analysis.' },
      { name: 'Business Intelligence and Reporting', description: 'Production of dashboards, reports, and analysis to support management decision-making.' },
      { name: 'Data Governance', description: 'Definition and enforcement of data quality, ownership, classification, and lifecycle standards.' },
      { name: 'Master Data Management', description: 'Management of critical reference data such as customer, product, and supplier records.' },
      { name: 'Data Engineering', description: 'Development and maintenance of data pipelines, ETL processes, and data integration services.' },
    ],
  },
  {
    id: 'public',
    label: 'Public / Social Services',
    description: 'Direct delivery of public-facing or citizen services',
    examples: [
      { name: 'Benefits Administration', description: 'Assessment, award, and payment of financial benefits or entitlements to eligible individuals.' },
      { name: 'Case Management', description: 'End-to-end management of individual cases from intake through to resolution or closure.' },
      { name: 'Safeguarding Services', description: 'Identification, assessment, and management of risk to vulnerable individuals or groups.' },
      { name: 'Licensing and Permits', description: 'Processing applications for and issuing of licences, permits, and certificates.' },
      { name: 'Grant Management', description: 'Administration of grant funding from application through to payment and post-award monitoring.' },
      { name: 'Enquiry and Information Service', description: 'Providing the public with information, signposting, and general assistance via multiple channels.' },
    ],
  },
];

const STEP_LIST     = 1;
const STEP_TYPE     = 2;
const STEP_SERVICES = 3;
const STEP_DONE     = 4;

// ── Step indicator (wizard steps only: Service Template → Services) ──────────

function StepIndicator({ step }) {
  const steps = ['Service Template', 'Services'];
  return (
    <div className={styles.stepIndicator}>
      {steps.map((label, i) => {
        const num    = i + 1;
        const done   = step > num;
        const active = step === num;
        return (
          <div key={label} className={styles.stepItem}>
            <div className={done ? styles.stepDotDone : active ? styles.stepDotActive : styles.stepDot}>
              {done ? '✓' : num}
            </div>
            <span className={active ? styles.stepLabelActive : styles.stepLabel}>{label}</span>
            {i < steps.length - 1 && <div className={done ? styles.stepLineDone : styles.stepLine} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main wizard ──────────────────────────────────────────────────────────────

export function DepartmentSetupWizard() {
  const { user, hasCapability } = useAuth();
  const navigate  = useNavigate();

  const [step,         setStep]         = useState(STEP_LIST);
  const [departments,  setDepartments]  = useState([]);
  const [deptLoading,  setDeptLoading]  = useState(true);
  const [deptId,       setDeptId]       = useState('');
  const [deptName,     setDeptName]     = useState('');
  const [archetypeIds, setArchetypeIds] = useState(new Set());
  const [services,        setServices]        = useState([]);
  const [sharedFromOthers, setSharedFromOthers] = useState([]);
  const [step3Loading,    setStep3Loading]    = useState(false);
  const [addingCustom,    setAddingCustom]    = useState(false);
  const [newName,         setNewName]         = useState('');
  const [newDesc,         setNewDesc]         = useState('');
  const [newShared,       setNewShared]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [addingName,      setAddingName]      = useState(null);
  const [adoptingId,      setAdoptingId]      = useState(null);
  const [editingId,       setEditingId]       = useState(null);
  const [editDraft,       setEditDraft]       = useState({});
  const [deletingId,      setDeletingId]      = useState(null);
  const [error,           setError]           = useState('');

  // List-page state
  const [expandedDeptId,  setExpandedDeptId]  = useState(null);
  const [creatingDept,    setCreatingDept]    = useState(false);

  const canManageDepts = ['admin', 'ciso'].includes(user?.role);

  const [editingDeptId,   setEditingDeptId]   = useState(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  const [deptSaving,      setDeptSaving]      = useState(false);
  const [deptError,       setDeptError]       = useState('');

  const [newDeptName,    setNewDeptName]    = useState('');
  const [newDeptSaving,  setNewDeptSaving]  = useState(false);

  async function handleRenameDept(id) {
    if (!editingDeptName.trim()) return;
    setDeptSaving(true);
    setDeptError('');
    try {
      const updated = await updateDepartment(id, editingDeptName.trim());
      setDepartments(ds => ds.map(d => d.id === id ? { ...d, name: updated.name } : d));
      if (deptId === id) setDeptName(updated.name);
      setEditingDeptId(null);
    } catch (err) {
      setDeptError(err.response?.data?.error || 'Failed to rename.');
    } finally {
      setDeptSaving(false);
    }
  }

  async function handleDeleteDept(id) {
    setDeptSaving(true);
    setDeptError('');
    try {
      await deleteDepartment(id);
      setDepartments(ds => ds.filter(d => d.id !== id));
      if (deptId === id) { setDeptId(''); setDeptName(''); }
      if (expandedDeptId === id) setExpandedDeptId(null);
    } catch (err) {
      setDeptError(err.response?.data?.error || 'Failed to delete department.');
    } finally {
      setDeptSaving(false);
    }
  }

  async function handleCreateAndStart(e) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setNewDeptSaving(true);
    setDeptError('');
    try {
      const created = await createDepartment(newDeptName.trim());
      setDepartments(ds => [...ds, { ...created, iao_names: null, iam_names: null, impact_table_count: 0, information_asset_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName('');
      setCreatingDept(false);
      selectDept(created.id, created.name);
      setArchetypeIds(new Set());
      setServices([]);
      setStep(STEP_TYPE);
    } catch (err) {
      setDeptError(err.response?.data?.error || 'Failed to create department.');
    } finally {
      setNewDeptSaving(false);
    }
  }

  function startWizard(dept) {
    selectDept(dept.id, dept.name);
    setArchetypeIds(new Set());
    setServices([]);
    setStep(STEP_TYPE);
  }

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {})
      .finally(() => setDeptLoading(false));
  }, []);

  // Load existing services + shared services from other depts when entering step 3
  useEffect(() => {
    if (step !== STEP_SERVICES || !deptId) return;
    setStep3Loading(true);
    Promise.all([
      getBusinessServices({ for_dept: deptId }),
      getSharedServices({ for_dept: deptId }),
    ])
      .then(([existing, shared]) => {
        setServices(existing);
        setSharedFromOthers(shared.filter(s => !s.already_adopted));
      })
      .catch(() => {})
      .finally(() => setStep3Loading(false));
  }, [step, deptId]);

  const selectedArchetypes = ARCHETYPES.filter(a => archetypeIds.has(a.id));
  const addedNames         = new Set(services.map(s => s.name));

  async function doAddService({ name, description, is_shared }) {
    setSaving(true);
    setError('');
    try {
      const body = { name, description: description || null, is_shared: !!is_shared };
      if (deptId) body.department_id = deptId;
      const svc = await createBusinessService(body);
      setServices(s => [...s, svc]);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create service');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAddExample(example) {
    setAddingName(example.name);
    await doAddService({ name: example.name, description: example.description, is_shared: false });
    setAddingName(null);
  }

  async function handleAdopt(svc) {
    setAdoptingId(svc.id);
    setError('');
    try {
      await adoptService(svc.id, deptId);
      setServices(s => [...s, { ...svc, adopted: true, is_shared: true }]);
      setSharedFromOthers(prev => prev.filter(s => s.id !== svc.id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adopt service');
    } finally {
      setAdoptingId(null);
    }
  }

  function startEdit(svc) {
    setEditingId(svc.id);
    setEditDraft({ name: svc.name, description: svc.description || '', is_shared: svc.is_shared || false });
    setError('');
  }

  async function handleSaveEdit(id) {
    if (!editDraft.name?.trim()) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateBusinessService(id, {
        name:        editDraft.name.trim(),
        description: editDraft.description.trim() || null,
        is_shared:   editDraft.is_shared,
      });
      setServices(s => s.map(svc => svc.id === id ? { ...svc, ...updated } : svc));
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    setError('');
    try {
      await deleteBusinessService(id);
      setServices(s => s.filter(svc => svc.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove service');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddCustom(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await doAddService({ name: newName.trim(), description: newDesc.trim(), is_shared: newShared });
    if (ok) {
      setNewName('');
      setNewDesc('');
      setNewShared(false);
      setAddingCustom(false);
    }
  }

  function selectDept(id, name) {
    setDeptId(id);
    setDeptName(name);
  }

  // Gate the whole wizard up front: department setup needs departments.write.
  // Show a clear warning on entry rather than letting the user fill it in and
  // hit a 403 on save.
  if (!hasCapability('departments.write')) {
    return <CapabilityGate capability="departments.write" feature="set up departments" />;
  }

  // ── Step 1: department list ────────────────────────────────────────────────

  if (step === STEP_LIST) {
    return (
      <Shell>
        <div className={styles.page}>
          <BackButton />
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.title}>Department Setup</h1>
              {!deptLoading && (
                <span className={styles.subtitle}>
                  {departments.length} department{departments.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {canManageDepts && !creatingDept && (
              <button className={styles.btnPrimary} onClick={() => setCreatingDept(true)}>
                + New Department
              </button>
            )}
          </div>

          {creatingDept && (
            <form className={styles.createForm} onSubmit={handleCreateAndStart}>
              <input
                className={styles.createInput}
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder="Department name"
                autoFocus
                disabled={newDeptSaving}
              />
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!newDeptName.trim() || newDeptSaving}
              >
                {newDeptSaving ? 'Creating…' : 'Create and continue →'}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => { setCreatingDept(false); setNewDeptName(''); setDeptError(''); }}
                disabled={newDeptSaving}
              >
                Cancel
              </button>
            </form>
          )}

          {deptError && <p className={styles.deptError}>{deptError}</p>}

          {deptLoading ? (
            <p className={styles.loading}>Loading departments…</p>
          ) : departments.length === 0 ? (
            <p className={styles.empty}>No departments yet. Use the button above to add the first one.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Department</th>
                    <th className={styles.th}>Information Asset Owner</th>
                    <th className={styles.th}>Information Asset Manager</th>
                    <th className={`${styles.th} ${styles.thNum}`}>Impact tables</th>
                    <th className={`${styles.th} ${styles.thNum}`}>Information assets</th>
                    <th className={styles.th} />
                  </tr>
                </thead>
                <tbody>
                  {departments.map(d => {
                    const isExpanded = expandedDeptId === d.id;
                    const isEditing  = editingDeptId === d.id;
                    return (
                      <Fragment key={d.id}>
                        {isEditing ? (
                          <tr className={styles.tableRow}>
                            <td colSpan={6} className={styles.tdEdit}>
                              <div className={styles.deptEditForm}>
                                <input
                                  className={styles.deptEditInput}
                                  value={editingDeptName}
                                  onChange={e => setEditingDeptName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameDept(d.id);
                                    if (e.key === 'Escape') setEditingDeptId(null);
                                  }}
                                  autoFocus
                                />
                                <button className={styles.deptEditSave} onClick={() => handleRenameDept(d.id)} disabled={deptSaving || !editingDeptName.trim()}>Save</button>
                                <button className={styles.deptEditCancel} onClick={() => setEditingDeptId(null)} disabled={deptSaving}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr
                            className={`${styles.tableRow} ${isExpanded ? styles.tableRowSelected : ''}`}
                            onClick={() => setExpandedDeptId(isExpanded ? null : d.id)}
                          >
                            <td className={styles.tdName}>{d.name}</td>
                            <td className={styles.tdMeta}>{d.iao_names || <span className={styles.muted}>—</span>}</td>
                            <td className={styles.tdMeta}>{d.iam_names || <span className={styles.muted}>—</span>}</td>
                            <td className={styles.tdNum}>{d.impact_table_count}</td>
                            <td className={styles.tdNum}>{d.information_asset_count}</td>
                            <td className={styles.tdActions} onClick={e => e.stopPropagation()}>
                              {canManageDepts && (
                                <div className={styles.rowActions}>
                                  <button
                                    className={styles.rowActionBtn}
                                    onClick={() => { setEditingDeptId(d.id); setEditingDeptName(d.name); setDeptError(''); }}
                                  >Rename</button>
                                  <button
                                    className={`${styles.rowActionBtn} ${styles.rowActionBtnDanger}`}
                                    onClick={() => handleDeleteDept(d.id)}
                                    disabled={deptSaving}
                                  >Remove</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        {isExpanded && !isEditing && (
                          <tr className={styles.summaryRow}>
                            <td colSpan={6} className={styles.summaryCell}>
                              <div className={styles.deptFoldCard}>
                                <span className={styles.deptFoldHint}>
                                  Set up or review the business services catalogued for <strong>{d.name}</strong>.
                                </span>
                                <button className={styles.btnPrimary} onClick={() => startWizard(d)}>
                                  Set up services →
                                </button>
                              </div>
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

  // ── Step 2: archetype ──────────────────────────────────────────────────────

  if (step === STEP_TYPE) {
    return (
      <Shell>
        <div className={styles.page}>
          <StepIndicator step={1} />
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h1>Would you like to use a service template?</h1>
              <p>
                Select a template to see example services for <em>{deptName}</em> as inspiration.
                This is optional — skip straight through if you'd prefer to add your own services from scratch.
              </p>
            </div>

            <div className={styles.archetypeGrid}>
              {ARCHETYPES.map(a => {
                const active = archetypeIds.has(a.id);
                return (
                  <button
                    key={a.id}
                    className={active ? `${styles.archetypeCard} ${styles.archetypeCardActive}` : styles.archetypeCard}
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
              <button className={styles.btnSecondary} onClick={() => setStep(STEP_LIST)}>← Back</button>
              <button
                className={styles.btnPrimary}
                onClick={() => {
                  localStorage.setItem(`dept_archetypes_${deptId}`, JSON.stringify([...archetypeIds]));
                  setStep(STEP_SERVICES);
                }}
              >
                {archetypeIds.size === 0 ? 'Skip — add services →' : 'Next — add services →'}
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Step 3: running services list ──────────────────────────────────────────

  if (step === STEP_SERVICES) {
    return (
      <Shell>
        <div className={styles.page}>
          <StepIndicator step={2} />
          <div className={styles.servicesStep}>

            {/* Left: examples panel */}
            <aside className={styles.examplesPanel}>
              <div className={styles.examplesPanelHeader}>
                <span className={styles.examplesPanelTitle}>Examples</span>
                <span className={styles.examplesPanelSub}>
                  {selectedArchetypes.map(a => a.label).join(', ')}
                </span>
              </div>
              <div className={styles.examplesList}>

                {sharedFromOthers.length > 0 && (
                  <>
                    <div className={styles.examplesSectionLabel}>From your organisation</div>
                    {sharedFromOthers.map(svc => {
                      const adopted  = addedNames.has(svc.name);
                      const loading  = adoptingId === svc.id;
                      return (
                        <div key={svc.id} className={adopted ? `${styles.exampleCard} ${styles.exampleCardAdded}` : styles.exampleCard}>
                          <div className={styles.exampleName}>{svc.name}</div>
                          <div className={styles.exampleMeta}>{svc.owner_department_name}</div>
                          {svc.description && <div className={styles.exampleDesc}>{svc.description}</div>}
                          <button
                            className={adopted ? styles.addExampleBtnDone : styles.addExampleBtn}
                            disabled={adopted || saving || loading}
                            onClick={() => handleAdopt(svc)}
                          >
                            {loading ? '…' : adopted ? '✓ Adopted' : 'Adopt'}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}

                {selectedArchetypes.map(archetype => (
                  <div key={archetype.id}>
                    <div className={styles.examplesSectionLabel}>Examples — {archetype.label}</div>
                    {archetype.examples.map(ex => {
                      const added   = addedNames.has(ex.name);
                      const loading = addingName === ex.name;
                      return (
                        <div key={ex.name} className={added ? `${styles.exampleCard} ${styles.exampleCardAdded}` : styles.exampleCard}>
                          <div className={styles.exampleName}>{ex.name}</div>
                          <div className={styles.exampleDesc}>{ex.description}</div>
                          <button
                            className={added ? styles.addExampleBtnDone : styles.addExampleBtn}
                            disabled={added || saving}
                            onClick={() => handleAddExample(ex)}
                          >
                            {loading ? '…' : added ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}

              </div>
            </aside>

            {/* Right: services list */}
            <div className={styles.servicesMain}>
              <div className={styles.servicesMainHeader}>
                <div>
                  <h1 className={styles.servicesTitle}>{deptName}</h1>
                  <p className={styles.servicesSubtitle}>
                    {services.length === 0
                      ? 'No services yet — add from the examples or create your own.'
                      : `${services.length} service${services.length !== 1 ? 's' : ''} added`}
                  </p>
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              {step3Loading && <p className={styles.loadingInline}>Loading services…</p>}

              <div className={styles.servicesList}>
                {services.map(svc => {
                  const isEditing  = editingId === svc.id;
                  const isDeleting = deletingId === svc.id;
                  return isEditing ? (
                    <div key={svc.id} className={styles.serviceItemEditing}>
                      <input
                        className={styles.editInput}
                        value={editDraft.name}
                        onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="Service name"
                        autoFocus
                      />
                      <textarea
                        className={styles.editTextarea}
                        value={editDraft.description}
                        onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="Description (optional)"
                        rows={2}
                      />
                      <label className={styles.sharedCheckLabel}>
                        <input
                          type="checkbox"
                          className={styles.sharedCheck}
                          checked={editDraft.is_shared}
                          onChange={e => setEditDraft(d => ({ ...d, is_shared: e.target.checked }))}
                        />
                        Shared with other departments
                      </label>
                      <div className={styles.editActions}>
                        <button className={styles.btnSecondary} onClick={() => setEditingId(null)}>Cancel</button>
                        <button
                          className={styles.btnPrimary}
                          disabled={!editDraft.name?.trim() || saving}
                          onClick={() => handleSaveEdit(svc.id)}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={svc.id} className={styles.serviceItem}>
                      <div className={styles.serviceItemTop}>
                        <span className={styles.serviceItemName}>{svc.name}</span>
                        <div className={styles.serviceItemBadges}>
                          {svc.adopted && <span className={styles.adoptedBadge}>ADOPTED</span>}
                          {!svc.adopted && svc.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
                        </div>
                        <div className={styles.serviceItemActions}>
                          {!svc.adopted && (
                            <button className={styles.editBtn} onClick={() => startEdit(svc)}>Edit</button>
                          )}
                          <button
                            className={styles.removeBtn}
                            disabled={isDeleting}
                            onClick={() => handleDelete(svc.id)}
                          >
                            {isDeleting ? '…' : 'Remove'}
                          </button>
                        </div>
                      </div>
                      {svc.description && (
                        <div className={styles.serviceItemDesc}>{svc.description}</div>
                      )}
                    </div>
                  );
                })}

                {addingCustom ? (
                  <form className={styles.addCustomForm} onSubmit={handleAddCustom}>
                    <input
                      className={styles.addCustomInput}
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Service name"
                      autoFocus
                    />
                    <textarea
                      className={styles.addCustomTextarea}
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                      placeholder="Description (optional)"
                      rows={2}
                    />
                    <label className={styles.sharedCheckLabel}>
                      <input
                        type="checkbox"
                        checked={newShared}
                        onChange={e => setNewShared(e.target.checked)}
                        className={styles.sharedCheck}
                      />
                      Shared with other departments
                    </label>
                    <div className={styles.addCustomActions}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => { setAddingCustom(false); setError(''); setNewName(''); setNewDesc(''); setNewShared(false); }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={styles.btnPrimary}
                        disabled={!newName.trim() || saving}
                      >
                        {saving ? 'Adding…' : 'Add Service'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button className={styles.addCustomBtn} onClick={() => setAddingCustom(true)}>
                    + Add your own service
                  </button>
                )}
              </div>

              <div className={styles.stepActions}>
                <button className={styles.btnSecondary} onClick={() => setStep(STEP_TYPE)}>← Back</button>
                <button
                  className={styles.btnPrimary}
                  disabled={services.length === 0}
                  onClick={() => setStep(STEP_DONE)}
                >
                  Finish — {services.length} service{services.length !== 1 ? 's' : ''} created →
                </button>
              </div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Step 4: done ───────────────────────────────────────────────────────────

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.doneScreen}>
          <div className={styles.doneCheck}>✓</div>
          <h1 className={styles.doneTitle}>{deptName} set up</h1>
          <p className={styles.doneSub}>
            {services.length} service{services.length !== 1 ? 's' : ''} catalogued
          </p>

          <ul className={styles.doneList}>
            {services.map(svc => (
              <li key={svc.id} className={styles.doneListItem}>
                <span className={styles.doneListName}>{svc.name}</span>
                {svc.is_shared && <span className={styles.sharedBadge}>SHARED</span>}
              </li>
            ))}
          </ul>

          <div className={styles.doneNext}>
            <p className={styles.doneNextLabel}>What's next?</p>
            <p className={styles.doneNextHint}>
              Each service needs a BIL impact table before it can be rated.
              Set one up from the service detail page, or run the impact table wizard when it's available.
            </p>
          </div>

          <div className={styles.doneActions}>
            <button className={styles.btnPrimary} onClick={() => navigate('/services')}>
              View services →
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => { setStep(STEP_LIST); setServices([]); setDeptId(''); setDeptName(''); setArchetypeIds(new Set()); setExpandedDeptId(null); }}
            >
              Set up another department
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
