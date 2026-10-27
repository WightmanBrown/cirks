// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDepartments, createDepartment, getUsers } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { personLabel } from '../utils/roles';
import { BackButton } from '../components/BackButton';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import styles from './DepartmentsPage.module.css';

// Column key → value accessor, for interactive header sorting (see useTableSort).
const DEPT_ACCESSORS = {
  name:     (d) => d.name,
  iao:      (d) => d.iao_names,
  iam:      (d) => d.iam_names,
  assets:   (d) => d.information_asset_count,
  systems:  (d) => d.system_count,
  services: (d) => d.service_count,
  tables:   (d) => d.impact_table_count,
  risks:    (d) => d.active_risk_count,
};
const byDeptName = (a, b) => a.name.localeCompare(b.name);

function NewDepartmentModal({ onClose, onCreated, users }) {
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [ownerId, setOwner] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const result = await createDepartment({
        name: name.trim(),
        description: desc.trim() || undefined,
        owner_user_id: ownerId || undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create department');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>New Department <HelpDot k="departments.new_modal" placement="bottom" /></h2>
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
              {users.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
            </select>
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={styles.btnPrimary}>
              {saving ? 'Creating…' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DepartmentsPage() {
  const { hasCapability } = useAuth();
  const navigate = useNavigate();
  const [depts, setDepts]     = useState([]);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const canManage = hasCapability('departments.write');

  useEffect(() => {
    Promise.all([
      getDepartments(),
      canManage ? getUsers() : Promise.resolve([]),
    ])
      .then(([d, u]) => { setDepts(d); setUsers(u); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load departments'))
      .finally(() => setLoading(false));
  }, [canManage]);

  const filtered = useMemo(() => depts.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())), [depts, search]);

  const { sorted, sortKey, sortDir, toggleSort } =
    useTableSort(filtered, { accessors: DEPT_ACCESSORS, defaultCompare: byDeptName });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  function handleCreated(result) {
    setShowAdd(false);
    navigate(`/departments/${result.id}`);
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Organisation <HelpDot k="departments.title" placement="bottom" /></h1>
            {!loading && (
              <span className={styles.subtitle}>
                {sorted.length} department{sorted.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {canManage && (
            <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
              + New Department
            </button>
          )}
        </div>

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            placeholder="Search departments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className={styles.muted}>Loading…</p>}
        {error   && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && (
          sorted.length === 0
            ? <p className={styles.muted}>No departments found.</p>
            : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <SortableTh column="name" {...sortProps} helpKey="col.name">Name</SortableTh>
                      <SortableTh column="iao" className={styles.colOptional} {...sortProps} helpKey="departments.col.iao">Owner (IAO)</SortableTh>
                      <SortableTh column="iam" className={styles.colOptional} {...sortProps} helpKey="departments.col.iam">Manager (IAM)</SortableTh>
                      <SortableTh column="assets" className={styles.colNum} {...sortProps} helpKey="departments.col.assets">Assets</SortableTh>
                      <SortableTh column="systems" className={styles.colNum} {...sortProps} helpKey="departments.col.systems">Systems</SortableTh>
                      <SortableTh column="services" className={styles.colNum} {...sortProps} helpKey="departments.col.services">Services</SortableTh>
                      <SortableTh column="tables" className={styles.colNum} {...sortProps} helpKey="departments.col.impact_tables">Impact tables</SortableTh>
                      <SortableTh column="risks" className={styles.colNum} {...sortProps} helpKey="departments.col.active_risks">Active risks</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(d => (
                      <tr
                        key={d.id}
                        className={styles.row}
                        onClick={() => navigate(`/departments/${d.id}`)}
                      >
                        <td className={styles.nameCell}>{d.name}</td>
                        <td className={styles.colOptional}>
                          {d.iao_names || (
                            <span className={styles.roleMissing} title="Systems and assets created for this department will have no owner until an Information Asset Owner is assigned">
                              No IAO
                            </span>
                          )}
                        </td>
                        <td className={styles.colOptional}>
                          {d.iam_names || <span className={styles.roleMissing} title="No Information Asset Manager assigned">No IAM</span>}
                        </td>
                        <td className={styles.countCell}>{d.information_asset_count}</td>
                        <td className={styles.countCell}>{d.system_count}</td>
                        <td className={styles.countCell}>{d.service_count}</td>
                        <td className={styles.countCell}>{d.impact_table_count}</td>
                        <td className={styles.countCell}>
                          {d.active_risk_count > 0
                            ? <span className={styles.riskCount}>{d.active_risk_count}</span>
                            : <span className={styles.muted}>0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {showAdd && (
          <NewDepartmentModal
            onClose={() => setShowAdd(false)}
            onCreated={handleCreated}
            users={users}
          />
        )}
      </div>
    </Shell>
  );
}
