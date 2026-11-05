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
import { HelpDot } from '../components/HelpDot';

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
            <h2 className={shared.sectionTitle}>Control objectives it delivers <span className={shared.count}>{n}</span> <HelpDot k="security_solution.objectives" placement="bottom" /></h2>
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

          <CostSection s={s} canEdit={canEdit} onSave={(body) => run(() => updateSecuritySolution(id, body))} />
          <EffortSection s={s} canEdit={canEdit} onSave={(body) => run(() => updateSecuritySolution(id, body))} />

          {s.kind === 'parts' && (
            <section className={shared.section}>
              <h2 className={shared.sectionTitle}>Component parts <span className={shared.count}>{s.parts.length}</span> <HelpDot k="security_solution.parts" placement="bottom" /></h2>
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
            <h2 className={shared.sectionTitle}>Where it is in place <span className={shared.count}>{s.systems.length}</span> <HelpDot k="security_solution.in_place" placement="bottom" /></h2>
            <p className={shared.note}>
              Systems that record its parts on the system itself. A solution with no part on the system leaves no
              trace there, so it counts only where a component recorded on the system implies it (a security pattern
              trigger) or it was chosen for the system. Where it is the solution in use, the status of each objective it
              delivers there follows the state of its parts, and the system&rsquo;s risk scores follow that status.
            </p>
            {s.systems.length === 0 ? <p className={shared.muted}>Not in place on any system.</p> : (
              <table className={shared.table}>
                <thead><tr><th>System <HelpDot k="col.system" placement="bottom" /></th><th>Department <HelpDot k="col.department" placement="bottom" /></th><th>State <HelpDot k="security_solution.col.state" placement="bottom" /></th><th>What is wrong <HelpDot k="security_solution.col.what_is_wrong" placement="bottom" /></th></tr></thead>
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

const BASIS_LABEL = { organisation: 'for the organisation, bought once', per_system: 'for each system it is put on' };
const amount = (v) => (v == null ? null : Number(v).toLocaleString());

// The estimated effort to operate (v173, docs/reporting-iam.md decision 3):
// hours a month, optional and never defaulted, like the cost above. The IAM's
// system report sums it for the people needed to run a system.
function EffortSection({ s, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const known = s.effort_basis != null;
  const start = () => {
    setDraft({ effort_hours_month: s.effort_hours_month ?? '', effort_basis: s.effort_basis || '', effort_note: s.effort_note || '' });
    setEditing(true);
  };
  const set = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));
  return (
    <section className={shared.section}>
      <h2 className={shared.sectionTitle}>Estimated effort to operate <HelpDot k="security_solution.effort" placement="bottom" /></h2>
      {editing ? (
        <form className={shared.create} onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(draft)) setEditing(false);
        }}>
          <input className={shared.input} inputMode="decimal" aria-label="Hours a month" placeholder="Hours a month"
            value={draft.effort_hours_month} onChange={set('effort_hours_month')} />
          <select className={shared.input} aria-label="What the effort is for" value={draft.effort_basis} onChange={set('effort_basis')}>
            <option value="">What is the effort for?</option>
            <option value="organisation">For the organisation, once for everyone</option>
            <option value="per_system">For each system it is on</option>
          </select>
          <input className={shared.input} aria-label="Where the estimate comes from" placeholder="Where the estimate comes from (optional)"
            value={draft.effort_note} onChange={set('effort_note')} />
          <button className={shared.primary} type="submit">Save</button>
          {known && (
            <button className={shared.secondary} type="button" onClick={async () => {
              if (await onSave({ effort_hours_month: null, effort_basis: null })) setEditing(false);
            }}>Clear the estimate</button>
          )}
          <button className={shared.secondary} type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (<>
        {known ? (
          <p>
            {s.effort_hours_month} hour{Number(s.effort_hours_month) === 1 ? '' : 's'} a month — {s.effort_basis === 'per_system' ? 'for each system it is on' : 'for the organisation, once for everyone'}.
            {s.effort_note && <> {s.effort_note}.</>}
            {s.effort_set_by_name && <span className={shared.muted}> Estimated by {s.effort_set_by_name}{s.effort_set_at ? `, ${new Date(s.effort_set_at).toLocaleDateString('en-GB')}` : ''}.</span>}
          </p>
        ) : (
          <p className={shared.muted}>Not known. A system&apos;s report says the people needed to run this solution are not known until an estimate is given.</p>
        )}
        {canEdit && <div className={shared.actions}><button className={shared.secondary} onClick={start}>{known ? 'Change the estimate' : 'Give an estimate'}</button></div>}
      </>)}
    </section>
  );
}

// The estimated cost (v170, docs/reporting-ciso.md): optional, never defaulted.
// The CISO's investment report divides the risk a solution removes by it; left
// blank, the report says the cost is not known rather than treating it as free.
function CostSection({ s, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const known = s.cost_basis != null;
  const start = () => {
    setDraft({ cost_one_off: s.cost_one_off ?? '', cost_annual: s.cost_annual ?? '',
               cost_basis: s.cost_basis || '', cost_note: s.cost_note || '' });
    setEditing(true);
  };
  const set = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));
  return (
    <section className={shared.section}>
      <h2 className={shared.sectionTitle}>Estimated cost <HelpDot k="security_solution.cost" placement="bottom" /></h2>
      {editing ? (
        <form className={shared.create} onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(draft)) setEditing(false);
        }}>
          <input className={shared.input} inputMode="numeric" aria-label="One-off cost" placeholder="One-off"
            value={draft.cost_one_off} onChange={set('cost_one_off')} />
          <input className={shared.input} inputMode="numeric" aria-label="Annual cost" placeholder="Each year"
            value={draft.cost_annual} onChange={set('cost_annual')} />
          <select className={shared.input} aria-label="What the cost is for" value={draft.cost_basis} onChange={set('cost_basis')}>
            <option value="">What is the cost for?</option>
            <option value="organisation">For the organisation, bought once</option>
            <option value="per_system">For each system it is put on</option>
          </select>
          <input className={shared.input} aria-label="Where the estimate comes from" placeholder="Where the estimate comes from (optional)"
            value={draft.cost_note} onChange={set('cost_note')} />
          <button className={shared.primary} type="submit">Save</button>
          {known && (
            <button className={shared.secondary} type="button" onClick={async () => {
              if (await onSave({ cost_one_off: null, cost_annual: null, cost_basis: null })) setEditing(false);
            }}>Clear the estimate</button>
          )}
          <button className={shared.secondary} type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (<>
        {known ? (
          <p>
            {[s.cost_one_off != null && `${amount(s.cost_one_off)} one-off`, s.cost_annual != null && `${amount(s.cost_annual)} each year`]
              .filter(Boolean).join(' and ')} — {BASIS_LABEL[s.cost_basis]}.
            {s.cost_note && <> {s.cost_note}.</>}
            {s.cost_set_by_name && <span className={shared.muted}> Estimated by {s.cost_set_by_name}{s.cost_set_at ? `, ${new Date(s.cost_set_at).toLocaleDateString('en-GB')}` : ''}.</span>}
          </p>
        ) : (
          <p className={shared.muted}>Not known. The CISO&apos;s investment report ranks this solution by risk removed per system until a cost is given.</p>
        )}
        {canEdit && <div className={shared.actions}><button className={shared.secondary} onClick={start}>{known ? 'Change the estimate' : 'Give an estimate'}</button></div>}
      </>)}
    </section>
  );
}
