// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDepartment, updateDepartment } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { personLabel } from '../utils/roles';
import { BackButton } from '../components/BackButton';
import { EntityKind } from '../components/EntityKind';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { scoreLevel } from '../utils/riskColors';
import styles from './DepartmentDetailPage.module.css';

const ROLE_LABEL = {
  admin: 'Admin', ciso: 'CISO', risk_analyst: 'Risk Analyst',
  information_asset_manager: 'IAM', information_asset_owner: 'IAO',
  security_consultant: 'Security Consultant', siro: 'SIRO',
  meeting_secretary: 'Meeting Secretary', soc_analyst: 'SOC Analyst',
  security_architect: 'Security Architect',
};

function EditModal({ dept, onClose, onSaved }) {
  const [name, setName]   = useState(dept.name || '');
  const [desc, setDesc]   = useState(dept.description || '');
  const [ownerId, setOwner] = useState(dept.owner_user_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await updateDepartment(dept.id, {
        name: name.trim(),
        description: desc.trim(),
        owner_user_id: ownerId || undefined,
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
        <h2 className={styles.modalTitle}>Edit Department <HelpDot k="department_detail.edit_modal" placement="bottom" /></h2>
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
            Owner
            <select className={styles.select} value={ownerId} onChange={e => setOwner(e.target.value)}>
              <option value="">— none —</option>
              {dept.staff.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
            </select>
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={styles.btnPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DepartmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const [dept, setDept]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState(false);

  const canManage = hasCapability('departments.write');

  const load = useCallback(() => {
    getDepartment(id)
      .then(setDept)
      .catch(err => setError(err.response?.data?.error || 'Failed to load department'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Shell><div className={styles.page}><BackButton /><p className={styles.muted}>Loading…</p></div></Shell>;
  if (error || !dept) return <Shell><div className={styles.page}><BackButton /><p className={styles.errorMsg}>{error || 'Not found.'}</p></div></Shell>;

  const stats = [
    { label: 'Active users',  value: dept.active_user_count },
    { label: 'Assets',        value: dept.asset_count },
    { label: 'Systems',       value: dept.system_count },
    { label: 'Services',      value: dept.service_count },
    { label: 'Impact tables', value: dept.impact_table_count },
    { label: 'Active risks',  value: dept.active_risk_count, warn: dept.active_risk_count > 0 },
    { label: 'Exceptions',    value: dept.active_exception_count, warn: dept.active_exception_count > 0 },
  ];

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.topRow}>
          <BackButton />
          {!canManage && <ReadOnlyBadge reason="You do not have permission to manage departments." />}
        </div>

        <div className={styles.header}>
          <h1 className={styles.title}>{dept.name}<EntityKind kind="department" /> <HelpDot k="department_detail.title" placement="bottom" /></h1>
          {canManage && (
            <button className={styles.btnSecondary} onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>

        {dept.description
          ? <p className={styles.desc}>{dept.description}</p>
          : <p className={styles.muted}>No description.</p>}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Owner</span>
          <span className={styles.metaValue}>
            {dept.owner_name || <span className={styles.muted}>— unassigned —</span>}
          </span>
        </div>

        {/* ── Roll-up stats ── */}
        <div className={styles.statStrip}>
          {stats.map(s => (
            <div key={s.label} className={styles.stat}>
              <span className={`${styles.statValue} ${s.warn ? styles.statWarn : ''}`}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Staff ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>People <HelpDot k="department_detail.people" placement="bottom" /></h2>
          {dept.staff.length === 0
            ? <p className={styles.muted}>No users in this department.</p>
            : (
              <table className={styles.table}>
                <thead><tr><th>Name <HelpDot k="department_detail.col.person" placement="bottom" /></th><th>Email <HelpDot k="col.email" placement="bottom" /></th><th>Role <HelpDot k="col.role" placement="bottom" /></th><th>Status <HelpDot k="department_detail.col.status" placement="bottom" /></th></tr></thead>
                <tbody>
                  {dept.staff.map(u => (
                    <tr key={u.id}>
                      <td className={styles.nameCell}>{u.full_name}</td>
                      <td className={styles.mutedCell}>{u.email}</td>
                      <td>{ROLE_LABEL[u.role] || u.role}</td>
                      <td>{u.is_active
                        ? <span className={styles.activePill}>active</span>
                        : <span className={styles.inactivePill}>inactive</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>

        {/* ── Systems ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Systems <HelpDot k="department_detail.systems" placement="bottom" /> <span className={styles.count}>{dept.systems.length}</span></h2>
          {dept.systems.length === 0
            ? <p className={styles.muted}>No systems.</p>
            : (
              <div className={styles.chipList}>
                {dept.systems.map(s => {
                  const level = s.max_risk_score != null ? scoreLevel(s.max_risk_score) : null;
                  return (
                    <button key={s.id} className={styles.entChip} onClick={() => navigate(`/systems/${s.id}`)}>
                      {s.name}
                      {s.is_shared && <span className={styles.sharedTag}>shared</span>}
                      {level && <span className={`${styles.riskTag} ${styles['risk_' + level]}`}>{level}</span>}
                    </button>
                  );
                })}
              </div>
            )}
        </section>

        {/* ── Information assets ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Information assets <HelpDot k="department_detail.assets" placement="bottom" /> <span className={styles.count}>{dept.assets.length}</span></h2>
          {dept.assets.length === 0
            ? <p className={styles.muted}>No information assets.</p>
            : (
              <div className={styles.chipList}>
                {dept.assets.map(a => (
                  <button key={a.id} className={styles.entChip} onClick={() => navigate(`/assets/${a.id}`)}>
                    {a.name}
                    {a.is_shared && <span className={styles.sharedTag}>shared</span>}
                  </button>
                ))}
              </div>
            )}
        </section>

        {/* ── Business services ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Business services <HelpDot k="department_detail.services" placement="bottom" /> <span className={styles.count}>{dept.services.length}</span></h2>
          {dept.services.length === 0
            ? <p className={styles.muted}>No business services.</p>
            : (
              <div className={styles.chipList}>
                {dept.services.map(s => (
                  <button key={s.id} className={styles.entChip} onClick={() => navigate(`/services/${s.id}`)}>
                    {s.name}
                    {s.is_shared && <span className={styles.sharedTag}>shared</span>}
                  </button>
                ))}
              </div>
            )}
        </section>

        {editing && (
          <EditModal dept={dept} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
        )}
      </div>
    </Shell>
  );
}
