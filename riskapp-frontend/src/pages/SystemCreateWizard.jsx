// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getArchitecture, getDepartments, getUsers, searchComponents,
  createSystem, applySystemBuild, linkSystemComponent, setSystemComponentStatus,
  createArchitectureItem, addArchitectureComponent,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { CapabilityGate } from '../components/CapabilityGate';
import { PersonSelect } from '../components/PersonSelect';
import { PatternChip } from '../components/PatternChip';
import { ComponentModal } from '../components/ComponentModal';
import { componentTypeShort } from '../utils/componentTypes';
import { CROSS_DEPT_ROLES } from '../utils/departmentScope';
import styles from './SystemCreateWizard.module.css';

// Creating a system, led through a system architecture pattern (owner,
// 2026-10-09). A pattern records the usual components in one step and keeps
// systems of the same kind alike; a one-off is still built by hand and can be
// saved as a pattern at the end. The last step shows what the system's own
// record will imply before anything is created.

const STEPS = ['What it is', 'What it is built like', 'Its answers', 'Anything special', 'Review'];
const HAND = 'hand';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Everything the new system will record: the pattern's components, the template
// answers picked by hand, and anything added specially — each once.
export function chosenComponents({ build, picks, groups, custom }) {
  const out = new Map();
  for (const c of build?.components || []) out.set(c.id, { ...c, from: 'pattern' });
  for (const [gid, cid] of Object.entries(picks || {})) {
    const m = (groups || []).find(g => g.id === gid)?.members.find(x => x.id === cid);
    if (m && !out.has(m.id)) out.set(m.id, { ...m, from: 'answer' });
  }
  for (const c of custom || []) if (!out.has(c.id)) out.set(c.id, { ...c, from: 'added' });
  return [...out.values()];
}

// A template group applies to every system, or — with triggers — only to a
// system that records one of them.
export function groupsThatApply(groups, chosen) {
  const ids = new Set(chosen.map(c => c.id));
  return (groups || []).filter(g => !g.triggers?.length || g.triggers.some(t => ids.has(t.id)));
}

// The security solutions the record will imply: a rule whose trigger is among
// the components.
export function impliedSolutions(rules, chosen) {
  const ids = new Set(chosen.map(c => c.id));
  const out = new Map();
  for (const r of rules || []) {
    const by = r.triggers.filter(t => ids.has(t.id)).map(t => t.name);
    if (by.length) out.set(r.pattern_name, [...(out.get(r.pattern_name) || []), ...by]);
  }
  return [...out.entries()].map(([name, by]) => ({ name, by: [...new Set(by)] }));
}

export function SystemCreateWizard() {
  const navigate = useNavigate();
  const { user, hasCapability } = useAuth();
  const canArchitect = hasCapability('architecture.write');
  const isCrossDept = CROSS_DEPT_ROLES.has(user?.role);

  const [lib, setLib]       = useState(null);
  const [depts, setDepts]   = useState([]);
  const [users, setUsers]   = useState([]);
  const [step, setStep]     = useState(0);
  // step 1
  const [name, setName]     = useState('');
  const [desc, setDesc]     = useState('');
  const [deptId, setDeptId] = useState('');
  const [ownerId, setOwner] = useState('');
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [security, setSecurity] = useState(null);     // null = not answered
  // step 2
  const [mode, setMode]     = useState(undefined);    // a pattern's id | HAND
  // step 3 / 4
  const [picks, setPicks]   = useState({});           // group id → component id
  const [custom, setCustom] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState('');
  // step 5
  const [savePattern, setSavePattern] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [createdId, setCreatedId] = useState(null);

  const loadLib = useCallback(() => getArchitecture().then(setLib).catch(() => setLib({ groups: [], rules: [], builds: [] })), []);
  useEffect(() => {
    loadLib();
    getDepartments().then(d => setDepts(d || [])).catch(() => {});
    getUsers().then(u => setUsers(u || [])).catch(() => {});
  }, [loadLib]);

  const effectiveDeptId = (isCrossDept ? deptId : user?.department_id) || '';
  const deptIao = users.find(u => u.role === 'information_asset_owner' && u.department_id === effectiveDeptId) || null;
  useEffect(() => { if (!ownerTouched) setOwner(deptIao?.id || ''); }, [deptIao?.id, ownerTouched]);

  const build = lib?.builds.find(b => b.id === mode) || null;
  const chosen = useMemo(() => chosenComponents({ build, picks, groups: lib?.groups, custom }), [build, picks, lib, custom]);
  const applying = useMemo(() => groupsThatApply(lib?.groups, chosen), [lib, chosen]);
  const answersFor = (g) => chosen.filter(c => g.members.some(m => m.id === c.id));
  const blanks = applying.filter(g => answersFor(g).length === 0);
  const implied = useMemo(() => impliedSolutions(lib?.rules, chosen), [lib, chosen]);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { components } = await searchComponents(search.trim());
        const have = new Set(chosen.map(c => c.id));
        setResults((components || []).filter(c => c.component_type !== 'information' && !have.has(c.id)).slice(0, 8));
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search on the text only
  }, [search]);

  if (!hasCapability('systems.write')) return <CapabilityGate capability="systems.write" feature="create a system" />;

  const stepOk = [
    name.trim() && (!isCrossDept || deptId) && security !== null,
    mode !== undefined,
    true,
    chosen.length === 0 || status !== '',
    true,
  ];

  async function create() {
    setBusy(true); setError('');
    let id = createdId;
    try {
      if (!id) {
        const made = await createSystem({
          name: name.trim(), description: desc.trim() || undefined, department_id: deptId || undefined,
          owner_user_id: ownerId || undefined, is_shared: isShared, is_security_system: security === true,
        });
        id = made.id; setCreatedId(id);
      }
      if (build) await applySystemBuild(id, build.id, status);
      for (const c of chosen.filter(x => x.from !== 'pattern')) {
        await linkSystemComponent(id, c.id);
        // A component that exists once for the organisation keeps its own state:
        // the API refuses a per-system one (409), which is the right outcome here.
        try { await setSystemComponentStatus(id, c.id, status); }
        catch (err) { if (err.response?.status !== 409) throw err; }
      }
      if (savePattern && !build && chosen.length) {
        const made = await createArchitectureItem('builds', { name: `${name.trim()} pattern` });
        const bid = (made.build || made).id;
        for (const c of chosen) await addArchitectureComponent('builds', bid, 'components', c.id);
      }
      navigate(`/systems/${id}`);
    } catch (err) {
      setError((err.response?.data?.error || 'Something was not saved.')
        + (id ? ' The system itself was created; you can finish it on its own page.' : ''));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/systems" />
        <h1 className={styles.title}>New system</h1>
        <ol className={styles.steps}>
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? styles.stepOn : i < step ? styles.stepDone : styles.step}
              aria-current={i === step ? 'step' : undefined}>{i + 1}. {label}</li>
          ))}
        </ol>

        <div className={styles.body}>
          {step === 0 && (<>
            <label className={styles.field}>Name
              <input className={styles.input} value={name} onChange={e => setName(e.target.value)} autoFocus />
            </label>
            <label className={styles.field}>Description
              <textarea className={styles.input} rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
            </label>
            {isCrossDept && (
              <label className={styles.field}>Department that owns it
                <select className={styles.input} value={deptId} onChange={e => setDeptId(e.target.value)}>
                  <option value="">Choose a department…</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
            <label className={styles.field}>Owner
              <PersonSelect users={users} value={ownerId} suggestedId={deptIao?.id || null}
                onChange={v => { setOwnerTouched(true); setOwner(v || ''); }} placeholder="— unassigned —"
                warning={effectiveDeptId && !deptIao ? 'This department has no Information Asset Owner. Assign one in user administration, or pick an owner here.' : null} />
            </label>
            <label className={styles.tick}>
              <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
              <span>Shared system<small>Other departments can see it and link their own information assets to it.</small></span>
            </label>
            <div className={styles.field}>Does this system protect other systems?
              <div className={styles.options}>
                <button type="button" className={styles.option} aria-pressed={security === false} onClick={() => setSecurity(false)}>
                  No, it does a job for the business
                  <small>A booking server, a case management system, a billing service.</small>
                </button>
                <button type="button" className={styles.option} aria-pressed={security === true} onClick={() => setSecurity(true)}>
                  Yes, it is a security system
                  <small>CCTV, an anti-virus console, a backup server, a monitoring platform. Other systems will rely on it.</small>
                </button>
              </div>
            </div>
            {security === true && (
              <p className={styles.say}>Recorded as a <b>security system</b>. It is built like any other system, and assessed like
                any other. Security solutions can then rely on its components.</p>
            )}
          </>)}

          {step === 1 && (<>
            <p className={styles.lead}>Start from a system architecture pattern if one fits. It records the usual components in one
              step and keeps systems of the same kind alike.</p>
            {lib && lib.builds.length === 0 && <p className={styles.muted}>No patterns have been made yet.</p>}
            <div className={styles.options}>
              {(lib?.builds || []).map(b => (
                <button type="button" key={b.id} className={styles.option} aria-pressed={mode === b.id}
                  onClick={() => { setMode(b.id); setPicks({}); }}>
                  <span><PatternChip kind="pattern" iconOnly /> {b.name}</span>
                  <small>{plural(b.components.length, 'component')}{b.notes ? ` · ${b.notes}` : ''}</small>
                </button>
              ))}
            </div>
            <h2 className={styles.sub}>Nothing fits?</h2>
            <div className={styles.options}>
              <div className={styles.note}>
                <b>There will be more like this: make a pattern first.</b>{' '}
                {canArchitect
                  ? <>Build it on <Link to="/architecture-patterns" target="_blank" rel="noreferrer">System architecture patterns</Link> (opens in a new tab), then{' '}
                      <button type="button" className={styles.linkBtn} onClick={loadLib}>reload the patterns</button> and choose it here.</>
                  : <>Making a pattern needs the architecture permission. Ask an architect, or build this one by hand.</>}
              </div>
              <button type="button" className={styles.option} aria-pressed={mode === HAND} onClick={() => { setMode(HAND); setPicks({}); }}>
                It is a one-off: build it by hand
                <small>Pick each component yourself. You can save it as a pattern at the end.</small>
              </button>
            </div>
          </>)}

          {step === 2 && (<>
            <p className={styles.lead}>Every system records one component from each group of the systems architecture template.
              {build ? ' The pattern answers most of them.' : ' Building by hand, you answer each one.'}</p>
            {applying.length === 0 && <p className={styles.muted}>The template has no groups yet.</p>}
            <div className={styles.slots}>
              {applying.map(g => {
                const got = answersFor(g);
                return (
                  <div key={g.id} className={got.length ? styles.slot : styles.slotEmpty}>
                    <span className={styles.slotGroup}>{g.name}</span>
                    {got.length > 0
                      ? <span className={styles.slotValue}>{got.map(c => c.name).join(', ')}</span>
                      : (
                        <select className={styles.input} value={picks[g.id] || ''} aria-label={`Answer for ${g.name}`}
                          onChange={e => setPicks(p => ({ ...p, [g.id]: e.target.value }))}>
                          <option value="">Nothing recorded — choose one…</option>
                          {g.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      )}
                    {picks[g.id] && got.length > 0 && (
                      <button type="button" className={styles.linkBtn} onClick={() => setPicks(p => { const n = { ...p }; delete n[g.id]; return n; })}>Change</button>
                    )}
                  </div>
                );
              })}
            </div>
            {blanks.length > 0
              ? <p className={styles.warn}>{plural(blanks.length, 'group')} not answered: {blanks.map(g => g.name).join(', ')}. You can create the
                  system with blanks; it will show as an incomplete record until they are answered.</p>
              : applying.length > 0 && <p className={styles.say}>Every group is answered.</p>}
            <p className={styles.muted}>The right answer is not listed? It has to be created and added to that group first; you can do that in the next step.</p>
          </>)}

          {step === 3 && (<>
            <p className={styles.lead}>Anything this system has that {build ? 'the pattern does not' : 'is not an answer above'}: special software, a
              device, a team.</p>
            <ul className={styles.list}>
              {chosen.map(c => (
                <li key={c.id}>
                  <span className={styles.type}>{componentTypeShort(c.component_type)}</span> {c.name}
                  <span className={styles.from}>{c.from === 'pattern' ? 'from the pattern' : c.from === 'answer' ? 'template answer' : 'added by hand'}</span>
                  {c.from === 'added' && (
                    <button type="button" className={styles.linkBtn} aria-label={`Remove ${c.name}`}
                      onClick={() => setCustom(list => list.filter(x => x.id !== c.id))}>Remove</button>
                  )}
                </li>
              ))}
              {chosen.length === 0 && <li className={styles.muted}>Nothing chosen yet.</li>}
            </ul>
            <div className={styles.searchRow}>
              <input className={styles.input} placeholder="Search components to add (min 2 chars)…" aria-label="Search components to add"
                value={search} onChange={e => setSearch(e.target.value)} />
              <button type="button" className={styles.secondary} onClick={() => setShowNew(true)}>Create a new component…</button>
            </div>
            {results.length > 0 && (
              <ul className={styles.list}>
                {results.map(c => (
                  <li key={c.id}>
                    <span className={styles.type}>{componentTypeShort(c.component_type)}</span> {c.name}
                    <button type="button" className={styles.linkBtn} aria-label={`Add ${c.name}`}
                      onClick={() => { setCustom(list => [...list, c]); setSearch(''); setResults([]); }}>Add</button>
                  </li>
                ))}
              </ul>
            )}
            {chosen.length > 0 && (
              <label className={styles.field}>State of the {plural(chosen.length, 'component')} being recorded (required)
                <select className={styles.input} value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="">Choose their state…</option>
                  <option value="operational">Operational: in place and working</option>
                  <option value="degraded">Degraded: in place, not working properly</option>
                  <option value="missing">Missing: should be here, not yet in place</option>
                  <option value="unknown">Unknown: nobody has checked</option>
                </select>
                <small>There is no default. A component that exists once for the organisation keeps its own state whatever is chosen here.</small>
              </label>
            )}
          </>)}

          {step === 4 && (<>
            <div className={styles.review}>
              <div><b>{name.trim()}</b> {security && <span className={styles.tag}>security system</span>} {isShared && <span className={styles.tag}>shared</span>}</div>
              <div className={styles.muted}>
                {build ? <>Built from <PatternChip kind="pattern" iconOnly /> {build.name}</> : 'Built by hand'}
                {chosen.some(c => c.from !== 'pattern') && `, plus ${plural(chosen.filter(c => c.from !== 'pattern').length, 'component')} added here`}.
                {' '}{plural(chosen.length, 'component')}{status ? `, recorded as ${status}` : ''}.
              </div>
              <div className={styles.slots}>
                {applying.map(g => {
                  const got = answersFor(g);
                  return (
                    <div key={g.id} className={got.length ? styles.slot : styles.slotEmpty}>
                      <span className={styles.slotGroup}>{g.name}</span>
                      <span className={styles.slotValue}>{got.length ? got.map(c => c.name).join(', ') : 'Nothing recorded'}</span>
                    </div>
                  );
                })}
              </div>
              <h2 className={styles.sub}>What this record implies</h2>
              {implied.length === 0
                ? <p className={styles.muted}>No security solution is implied: none of these components triggers one.</p>
                : (
                  <ul className={styles.list}>
                    {implied.map(s => <li key={s.name}><PatternChip kind="solution" iconOnly /> {s.name}<span className={styles.from}>implied by {s.by.join(', ')}</span></li>)}
                  </ul>
                )}
              <p className={styles.muted}>Each implied solution brings its control objectives onto the system, in the state its parts are in.</p>
            </div>
            {!build && chosen.length > 0 && canArchitect && (
              <label className={styles.tick}>
                <input type="checkbox" checked={savePattern} onChange={e => setSavePattern(e.target.checked)} />
                <span>Save this build as a system architecture pattern<small>Named &ldquo;{name.trim()} pattern&rdquo;, for the next system like it. You can rename it afterwards.</small></span>
              </label>
            )}
            {error && <p className={styles.error} role="alert">{error}{createdId && <> <Link to={`/systems/${createdId}`}>Open the system</Link></>}</p>}
          </>)}
        </div>

        <div className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}>Back</button>
          {step < STEPS.length - 1
            ? <button type="button" className={styles.primary} disabled={!stepOk[step]} onClick={() => setStep(s => s + 1)}>Next</button>
            : <button type="button" className={styles.primary} disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create system'}</button>}
        </div>

        {showNew && (
          <ComponentModal componentType="technology" defaultName={search}
            onClose={() => setShowNew(false)}
            onSaved={(c) => { setShowNew(false); setSearch(''); setResults([]); setCustom(list => [...list, c]); loadLib(); }} />
        )}
      </div>
    </Shell>
  );
}
