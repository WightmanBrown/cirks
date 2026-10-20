// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getSecuritySolution, updateSecuritySolution, deleteSecuritySolution, addSecuritySolutionObjective,
  removeSecuritySolutionObjective, addSecuritySolutionPart, removeSecuritySolutionPart, getControls, listComponents,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { DeliveryChip } from '../components/DeliveryChip';
import { SecuritySolutionSummaryCard } from '../components/SecuritySolutionSummaryCard';
import { SolutionPartForm } from '../components/SolutionPartForm';
import { COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import { partWhere, deliveryLabel } from '../utils/deliveryPatterns';
import shared from './ScopesPage.module.css';
import parts from '../components/DeliveryPatternsSection.module.css';

// One security solution (v147): the objectives it delivers, its parts, and the
// systems it is in place on. Everything changed here changes the solution for
// every objective it delivers — which is the point of defining it once.
// Report only: where it is in place is derived from what systems record.
export function SecuritySolutionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('controls.write');
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [controls, setControls] = useState([]);
  const [components, setComponents] = useState(null);
  const [pick, setPick] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', notes: '' });

  const load = useCallback(() => {
    getSecuritySolution(id).then(setS).catch(err => {
      if (err?.response?.status === 404) setNotFound(true);
      else setError('Could not load the security solution.');
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadComponents = () => listComponents().then(setComponents).catch(() => setComponents([]));
  useEffect(() => {
    if (!canEdit) return;
    getControls().then(d => setControls(d.controls || [])).catch(() => setControls([]));
    loadComponents();
  }, [canEdit]);

  const run = async (fn) => {
    setError('');
    try { const next = await fn(); if (next) setS(next); return true; }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); return false; }
  };

  const delivered = useMemo(() => new Set((s?.objectives || []).map(o => o.id)), [s]);
  const addable = useMemo(() => [...controls].filter(c => !delivered.has(c.id)).sort((a, b) =>
    (a.framework_ref || '~').localeCompare(b.framework_ref || '~', undefined, { numeric: true }) || a.title.localeCompare(b.title)),
  [controls, delivered]);

  if (notFound) {
    return <Shell><div className={shared.page}><BackButton fallback="/security-solutions" />
      <p className={shared.muted}>That security solution does not exist — it may have been removed.</p></div></Shell>;
  }

  const n = s?.objectives.length || 0;
  const reach = n > 1 ? ` It delivers ${n} objectives, so a change here changes it for all of them.` : '';

  return (
    <Shell>
      <div className={shared.page}>
        <BackButton fallback="/security-solutions" />
        {error && <div className={shared.error} role="alert">{error}</div>}
        {s && (<>
          <div className={shared.header}>
            <div style={{ flex: 1 }}><SecuritySolutionSummaryCard solution={s} /></div>
            {!canEdit && <ReadOnlyBadge reason="Changing a security solution needs the controls.write capability (CISO, risk analyst, admin)." />}
          </div>

          {canEdit && (editing ? (
            <form className={shared.create} onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => updateSecuritySolution(id, draft))) setEditing(false);
            }}>
              <input className={shared.input} value={draft.name} aria-label="Name" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              <input className={shared.input} value={draft.notes} aria-label="Notes" placeholder="Notes (optional)"
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              <button className={shared.primary} type="submit">Save</button>
              <button className={shared.secondary} type="button" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <div className={shared.actions}>
              {s.kind === 'parts' && (
                <button className={shared.secondary} onClick={() => { setDraft({ name: s.name, notes: s.notes || '' }); setEditing(true); }}>
                  Rename or edit notes
                </button>
              )}
              <button className={shared.danger} onClick={() => window.confirm(
                `Remove "${s.name}" from the library?${n ? ` It stops delivering its ${n} objective${n === 1 ? '' : 's'}.` : ''}`)
                && run(async () => { await deleteSecuritySolution(id); navigate('/security-solutions'); })}>
                Remove from the library
              </button>
            </div>
          ))}

          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Control objectives it delivers <span className={shared.count}>{n}</span></h2>
            {n === 0 ? <p className={shared.muted}>None yet — it delivers nothing until an objective is added.</p> : (
              <table className={shared.table}>
                <tbody>
                  {s.objectives.map(o => (
                    <tr key={o.id}>
                      <td>{o.reference_code && <span className={shared.ref}>{o.reference_code}</span>}<Link to={`/controls/${o.id}`}>{o.title}</Link></td>
                      {canEdit && (
                        <td className={shared.right}>
                          <button className={shared.linkBtn} aria-label={`Stop delivering ${o.reference_code || o.title}`}
                            onClick={() => run(() => removeSecuritySolutionObjective(id, o.id))}>Stop delivering this</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canEdit && (
              <div className={shared.create}>
                <select className={shared.input} value={pick} onChange={e => setPick(e.target.value)} aria-label="Objective it also delivers">
                  <option value="">It also delivers…</option>
                  {addable.map(c => <option key={c.id} value={c.id}>{c.framework_ref ? `${c.framework_ref} — ` : ''}{c.title}</option>)}
                </select>
                <button className={shared.primary} disabled={!pick}
                  onClick={async () => { if (await run(() => addSecuritySolutionObjective(id, pick))) setPick(''); }}>Add objective</button>
              </div>
            )}
          </section>

          {s.kind === 'parts' && (
            <section className={shared.section}>
              <h2 className={shared.sectionTitle}>Component parts <span className={shared.count}>{s.parts.length}</span></h2>
              <p className={shared.note}>
                A system has this solution when every part is in place: parts on the system are recorded on each system,
                parts on a security system are read from that system, and parts once for the organisation are in their own
                state.{reach}
              </p>
              {s.parts.length === 0 ? <p className={shared.muted}>No parts yet — a solution with no parts delivers nothing.</p> : (
                <ul className={parts.parts}>
                  {s.parts.map(part => (
                    <li key={part.id}>
                      <span className={parts.type}>{COMPONENT_TYPE_LABEL[part.component_type] || part.component_type}</span>
                      <Link to={`/components/${part.component_id}`}>{part.component_name}</Link>
                      <span className={parts.where}>{partWhere(part)}</span>
                      {canEdit && (
                        <button className={parts.linkBtn} aria-label={`Remove ${part.component_name}`}
                          onClick={() => (!reach || window.confirm(`Remove "${part.component_name}" from "${s.name}"?${reach}`))
                            && run(() => removeSecuritySolutionPart(id, part.id))}>Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <SolutionPartForm pattern={s} components={components} onScopeStated={loadComponents} setError={setError}
                  sharedWarning={reach.trim()} confirmShared={(what) => !reach || window.confirm(`${what}${reach}`)}
                  run={(fn) => run(fn)} onAdd={(body) => addSecuritySolutionPart(id, body)} />
              )}
            </section>
          )}

          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Where it is in place <span className={shared.count}>{s.systems.length}</span></h2>
            <p className={shared.note}>
              Systems that record its parts on the system itself. A solution with no part on the system leaves no
              trace there, so it counts only where a component recorded on the system implies it (a security pattern
              trigger) or it was chosen for the system. It reports; it does not change any status or risk score.
            </p>
            {s.systems.length === 0 ? <p className={shared.muted}>Not in place on any system.</p> : (
              <table className={shared.table}>
                <thead><tr><th>System</th><th>Department</th><th>State</th><th>What is wrong</th></tr></thead>
                <tbody>
                  {s.systems.map(x => (
                    <tr key={x.system_id}>
                      <td><Link to={`/systems/${x.system_id}`}>{x.system_name}</Link></td>
                      <td>{x.department_name || '—'}</td>
                      <td><DeliveryChip delivery={x.state} title={deliveryLabel(x.state)} /></td>
                      <td>
                        {x.missing_parts?.length > 0 && <div>Missing: {x.missing_parts.join(', ')}</div>}
                        {x.degraded_parts?.length > 0 && <div>Degraded: {x.degraded_parts.join(', ')}</div>}
                        {!x.missing_parts?.length && !x.degraded_parts?.length && <span className={shared.muted}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>)}
      </div>
    </Shell>
  );
}
