// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getScope, getSystems, updateScope, deleteScope, addScopeSystems, removeScopeSystem } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { EntityKind } from '../components/EntityKind';
import styles from './ScopesPage.module.css';

// One scope: the systems in it and the objectives narrowed to it. Changing the
// systems changes where every one of those objectives is expected to be deployed,
// so it is a governance act (scopes.manage) and each change is audited.
export function ScopeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const canManage = hasCapability('scopes.manage');
  const [data, setData]       = useState(null);
  const [systems, setSystems] = useState([]);
  const [error, setError]     = useState('');
  const [pick, setPick]       = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');

  const load = useCallback(async () => {
    try { setData(await getScope(id)); setError(''); }
    catch (err) { setError(err?.response?.status === 404 ? 'Scope not found.' : 'Could not load the scope.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canManage) return;
    getSystems().then(d => setSystems(Array.isArray(d) ? d : (d?.systems || []))).catch(() => setSystems([]));
  }, [canManage]);

  const inScope = useMemo(() => new Set((data?.systems || []).map(s => s.id)), [data]);
  const candidates = systems.filter(s => !inScope.has(s.id) && s.is_active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  if (!data) {
    return <Shell><div className={styles.page}><BackButton fallback="/scopes" />{error && <div className={styles.error} role="alert">{error}</div>}</div></Shell>;
  }
  const { scope } = data;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/scopes" />
        <div className={styles.header}>
          <div>
            {editing ? (
              <div className={styles.create}>
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} aria-label="Scope name" maxLength={200} />
                <input className={styles.input} value={desc} onChange={e => setDesc(e.target.value)} aria-label="Scope description" placeholder="What it covers" />
                <button className={styles.primary} onClick={() => run(async () => { await updateScope(id, { name, description: desc }); setEditing(false); })}>Save</button>
                <button className={styles.secondary} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <h1 className={styles.title}>{scope.name}<EntityKind kind="scope" /></h1>
                {scope.description && <p className={styles.desc}>{scope.description}</p>}
              </>
            )}
          </div>
          {canManage && !editing ? (
            <div className={styles.actions}>
              <button className={styles.secondary} onClick={() => { setName(scope.name); setDesc(scope.description ?? ''); setEditing(true); }}>Rename</button>
              <button className={styles.danger}
                onClick={() => run(async () => { await deleteScope(id); navigate('/scopes'); })}>Delete scope</button>
            </div>
          ) : !canManage && <ReadOnlyBadge reason="Drawing scopes needs the scopes.manage capability (CISO, SIRO, admin)." />}
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Systems in this scope <span className={styles.count}>{data.systems.length}</span></h2>
          {canManage && (
            <div className={styles.create}>
              <select className={styles.input} value={pick} onChange={e => setPick(e.target.value)} aria-label="System to add">
                <option value="">Add a system…</option>
                {candidates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className={styles.primary} disabled={!pick}
                onClick={() => run(async () => { await addScopeSystems(id, [pick]); setPick(''); })}>Add</button>
            </div>
          )}
          {data.systems.length === 0 ? (
            <p className={styles.muted}>No systems yet. An objective narrowed to an empty scope is expected nowhere.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>System</th><th>Department</th>{canManage && <th />}</tr></thead>
              <tbody>
                {data.systems.map(s => (
                  <tr key={s.id}>
                    <td><Link className={styles.name} to={`/systems/${s.id}`}>{s.name}</Link>{!s.is_active && <span className={styles.note}>inactive</span>}</td>
                    <td>{s.department_name ?? '—'}</td>
                    {canManage && (
                      <td className={styles.right}>
                        <button className={styles.linkBtn} aria-label={`Remove ${s.name} from the scope`}
                          onClick={() => run(() => removeScopeSystem(id, s.id))}>Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Objectives that apply only here <span className={styles.count}>{data.objectives.length}</span></h2>
          {data.objectives.length === 0 ? (
            <p className={styles.muted}>None yet. Narrow an objective to this scope from its page, or from the SoA&apos;s bulk decision.</p>
          ) : (
            <ul className={styles.list}>
              {data.objectives.map(o => (
                <li key={o.control_id}>
                  {o.ref && <span className={styles.ref}>{o.ref}</span>}
                  <Link to={`/controls/${o.control_id}`}>{o.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
