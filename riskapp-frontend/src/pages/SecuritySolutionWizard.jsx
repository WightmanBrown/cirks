// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  getSystems, getSystem, getArchitecture, getControls, searchComponents, updateComponent,
  createSecuritySolution, addSecuritySolutionObjective, addSecuritySolutionPart,
  createArchitectureItem, addArchitectureComponent,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { CapabilityGate } from '../components/CapabilityGate';
import { PatternChip } from '../components/PatternChip';
import { ComponentModal } from '../components/ComponentModal';
import { componentTypeShort } from '../utils/componentTypes';
import styles from './SystemCreateWizard.module.css';

// Creating a security solution (owner, 2026-10-09). Most of the library's
// solutions are really SYSTEMS — a console, a service, a monitoring team's
// tooling — so the first question is whether anything is run. If it is, the
// solution is LIFTED from that security system: which of its components
// provide the protection, what has to be installed on each protected system,
// and what it delivers. A solution that is only documents, processes and people
// is still built by hand on its own page.

const STEPS = ['What delivers it', 'Which system', 'What provides it', 'On each protected system', 'What it delivers'];

// A component of the security system can be a part "on" it only if it exists
// once (v137/v145). One that exists on each system is what the security system
// is built on — its operating system — not part of the protection it gives.
export function liftable(component) {
  if (component.instantiation === 'organisational') return { ok: true };
  if (component.instantiation === 'per_system') {
    return { ok: false, why: 'Exists on each system: it is what this system is built on, not part of the protection it provides.' };
  }
  return { ok: false, why: 'Its scope has not been stated.', ask: true };
}

// Search as the person types; `fetcher` returns the rows to offer.
function useSearch(text, setResults, fetcher) {
  useEffect(() => {
    if (text.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      try { setResults(await fetcher(text.trim())); } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search on the text only
  }, [text]);
}

export function SecuritySolutionWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromSystem = params.get('system');
  const { hasCapability } = useAuth();

  const [step, setStep]       = useState(fromSystem ? 2 : 0);
  const [run, setRun]         = useState(fromSystem ? true : null);
  const [systems, setSystems] = useState([]);
  const [systemId, setSystemId] = useState(fromSystem || '');
  const [system, setSystem]   = useState(null);
  const [ticks, setTicks]     = useState({});            // component id → true
  const [agent, setAgent]     = useState(undefined);     // a component | null (nothing) | undefined (not answered)
  const [agentSearch, setAgentSearch] = useState('');
  const [agentResults, setAgentResults] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName]       = useState('');
  const [objectives, setObjectives] = useState([]);
  const [objSearch, setObjSearch] = useState('');
  const [objResults, setObjResults] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [trigSearch, setTrigSearch] = useState('');
  const [trigResults, setTrigResults] = useState([]);
  const [docs, setDocs]       = useState([]);
  const [docId, setDocId]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [createdId, setCreatedId] = useState(null);

  useEffect(() => {
    getSystems().then(list => setSystems((list || []).filter(s => s.is_security_system))).catch(() => setSystems([]));
    getArchitecture().then(a => setDocs(a.documents || [])).catch(() => setDocs([]));
  }, []);

  const loadSystem = (id) => getSystem(id).then(s => setSystem(s.system || s)).catch(() => setSystem(null));
  useEffect(() => { if (systemId) { setTicks({}); loadSystem(systemId); } else setSystem(null); }, [systemId]);

  // The components this system records as its own (not ones merely implied on it).
  const own = useMemo(() => (system?.components || []).filter(c => c.recorded !== false && c.component_type !== 'information'), [system]);
  const picked = own.filter(c => ticks[c.id] && liftable(c).ok);

  useSearch(agentSearch, setAgentResults, async (q) =>
    ((await searchComponents(q)).components || []).filter(c => c.instantiation === 'per_system').slice(0, 8));
  useSearch(trigSearch, setTrigResults, async (q) =>
    ((await searchComponents(q)).components || []).filter(c => c.component_type !== 'information' && !triggers.some(t => t.id === c.id)).slice(0, 8));
  useSearch(objSearch, setObjResults, async (q) =>
    ((await getControls({ q })).controls || []).filter(c => !objectives.some(o => o.id === c.id)).slice(0, 8));

  if (!hasCapability('controls.write')) return <CapabilityGate capability="controls.write" feature="create a security solution" />;

  const stateScope = async (c) => {
    setError('');
    try { await updateComponent(c.id, { instantiation: 'organisational' }); await loadSystem(systemId); setTicks(t => ({ ...t, [c.id]: true })); }
    catch (err) { setError(err.response?.data?.error || 'The scope was not saved.'); }
  };

  const stepOk = [
    run !== null,
    !!systemId,
    picked.length > 0,
    agent !== undefined,
    name.trim() && (triggers.length === 0 || docId),
  ];

  async function byHand() {
    setBusy(true); setError('');
    try { navigate(`/security-solutions/${(await createSecuritySolution({ name: name.trim(), kind: 'parts' })).id}`); }
    catch (err) { setError(err.response?.data?.error || 'The security solution was not created.'); setBusy(false); }
  }

  async function create() {
    setBusy(true); setError('');
    let id = createdId;
    try {
      if (!id) { id = (await createSecuritySolution({ name: name.trim(), kind: 'parts' })).id; setCreatedId(id); }
      for (const o of objectives) await addSecuritySolutionObjective(id, o.id);
      if (agent) await addSecuritySolutionPart(id, { component_id: agent.id, location: 'on_system' });
      for (const c of picked) await addSecuritySolutionPart(id, { component_id: c.id, location: 'service', service_system_id: systemId });
      if (triggers.length) {
        const made = await createArchitectureItem('rules', { pattern_id: id, standard_id: docId });
        const rid = (made.rule || made).id;
        for (const t of triggers) await addArchitectureComponent('rules', rid, 'triggers', t.id);
      }
      navigate(`/security-solutions/${id}`);
    } catch (err) {
      setError((err.response?.data?.error || 'Something was not saved.')
        + (id ? ' The security solution itself was created; you can finish it on its own page.' : ''));
      setBusy(false);
    }
  }

  const chips = (items, onRemove, label) => (
    <ul className={styles.list}>
      {items.map(x => (
        <li key={x.id}>{label(x)}
          <button type="button" className={styles.linkBtn} aria-label={`Remove ${label(x)}`} onClick={() => onRemove(x)}>Remove</button></li>
      ))}
    </ul>
  );
  const results = (items, onAdd, label) => items.length > 0 && (
    <ul className={styles.list}>
      {items.map(x => (
        <li key={x.id}>{label(x)}
          <button type="button" className={styles.linkBtn} aria-label={`Add ${label(x)}`} onClick={() => onAdd(x)}>Add</button></li>
      ))}
    </ul>
  );
  const compLabel = (c) => `${c.name}`;
  const objLabel = (o) => (o.framework_ref ? `${o.framework_ref} ${o.title}` : o.title);
  const steps = run === false ? STEPS.slice(0, 1) : STEPS;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/security-solutions" />
        <h1 className={styles.title}>New security solution</h1>
        <ol className={styles.steps}>
          {steps.map((label, i) => (
            <li key={label} className={i === step ? styles.stepOn : i < step ? styles.stepDone : styles.step}
              aria-current={i === step ? 'step' : undefined}>{i + 1}. {label}</li>
          ))}
        </ol>

        <div className={styles.body}>
          {step === 0 && (<>
            <p className={styles.lead}>A security solution says which components must be working for a control objective to be met.
              Start with what kind of thing delivers it.</p>
            <div className={styles.options}>
              <button type="button" className={styles.option} aria-pressed={run === true} onClick={() => setRun(true)}>
                Something is run to deliver it
                <small>A console, a service, a monitoring team&rsquo;s tooling, cameras and a recorder. Anti-virus, backup, CCTV.</small>
              </button>
              <button type="button" className={styles.option} aria-pressed={run === false} onClick={() => setRun(false)}>
                It is documents, processes and people
                <small>An acceptable use policy and the awareness training that goes with it.</small>
              </button>
            </div>
            {run === true && <p className={styles.say}>Then it is a <b>security system</b>, and the solution is lifted from that system. Someone
              owns it, it can fail, and its state is recorded in one place.</p>}
            {run === false && (<>
              <p className={styles.say}>That is built by hand: name it here, then add the policy, process and people as its parts on
                the solution&rsquo;s own page, each <b>once for the organisation</b>.</p>
              <label className={styles.field}>Name
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acceptable use" />
              </label>
              {error && <p className={styles.error} role="alert">{error}</p>}
            </>)}
          </>)}

          {step === 1 && (<>
            <label className={styles.field}>Which security system delivers it?
              <select className={styles.input} value={systemId} onChange={e => setSystemId(e.target.value)}>
                <option value="">Choose a security system…</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <small>Only systems recorded as security systems are listed.</small>
            </label>
            <p className={styles.muted}>It does not exist yet? <Link to="/systems/new">Create the system first</Link>, answering
              &ldquo;Yes, it is a security system&rdquo;, then come back here.</p>
          </>)}

          {step === 2 && (<>
            <p className={styles.lead}><b>Which of {system?.name || 'this system'}&rsquo;s components provide the protection?</b> They become
              parts of the solution, and their state is read from this system. Leave out what merely hosts it.</p>
            {system && own.length === 0 && <p className={styles.warn}>This system records no components yet. Record what it is made of on
              its <Link to={`/systems/${systemId}`}>Components tab</Link> first.</p>}
            {own.map(c => {
              const l = liftable(c);
              return (
                <label key={c.id} className={styles.tick}>
                  <input type="checkbox" checked={!!ticks[c.id] && l.ok} disabled={!l.ok}
                    onChange={e => setTicks(t => ({ ...t, [c.id]: e.target.checked }))} aria-label={c.name} />
                  <span>{c.name}
                    <small>{componentTypeShort(c.component_type)}{!l.ok && ` · ${l.why}`}
                      {l.ask && hasCapability('components.write') && (<>{' '}
                        <button type="button" className={styles.linkBtn} onClick={() => stateScope(c)}>It exists once, as part of this system</button></>)}
                    </small>
                  </span>
                </label>
              );
            })}
            {picked.length > 0 && <p className={styles.say}>Their state is set once, on {system?.name}. If one fails, every protected system shows it.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </>)}

          {step === 3 && (<>
            <p className={styles.lead}><b>Which component has to be installed on each protected system?</b> An agent, a client, a setting.
              It is usually not a component of the security system itself.</p>
            {agent
              ? <p className={styles.say}>Each protected system must record its own <b>{agent.name}</b>. A system without it shows a gap.{' '}
                  <button type="button" className={styles.linkBtn} onClick={() => setAgent(undefined)}>Change</button></p>
              : (<>
                <div className={styles.searchRow}>
                  <input className={styles.input} placeholder="Search components that exist once per system (min 2 chars)…"
                    aria-label="Search for the component installed on each protected system" value={agentSearch} onChange={e => setAgentSearch(e.target.value)} />
                  <button type="button" className={styles.secondary} onClick={() => setShowNew(true)}>Create a new component…</button>
                </div>
                {results(agentResults, (c) => { setAgent(c); setAgentSearch(''); setAgentResults([]); }, compLabel)}
                <div className={styles.options}>
                  <button type="button" className={styles.option} aria-pressed={agent === null} onClick={() => setAgent(null)}>
                    Nothing
                    <small>It protects systems without anything installed on them, like a firewall or CCTV.</small>
                  </button>
                </div>
                {agent === null && <p className={styles.say}>With nothing on the protected system, the solution applies only where
                  something implies it or it is chosen. Say what implies it in the next step.</p>}
              </>)}
          </>)}

          {step === 4 && (<>
            <label className={styles.field}>Name
              <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CrowdStrike EDR" />
            </label>
            <div className={styles.field}>Control objectives it delivers
              {chips(objectives, (o) => setObjectives(list => list.filter(x => x.id !== o.id)), objLabel)}
              <input className={styles.input} placeholder="Search control objectives (min 2 chars)…" aria-label="Search control objectives"
                value={objSearch} onChange={e => setObjSearch(e.target.value)} />
              {results(objResults, (o) => { setObjectives(list => [...list, o]); setObjSearch(''); setObjResults([]); }, objLabel)}
              {objectives.length === 0 && <small>It delivers nothing until an objective is added. You can add them later on the solution&rsquo;s page.</small>}
            </div>
            <div className={styles.field}>What implies it (optional)
              {chips(triggers, (t) => setTriggers(list => list.filter(x => x.id !== t.id)), compLabel)}
              <input className={styles.input} placeholder="Search components, e.g. an operating system or a network…" aria-label="Search components that imply it"
                value={trigSearch} onChange={e => setTrigSearch(e.target.value)} />
              {results(trigResults, (c) => { setTriggers(list => [...list, c]); setTrigSearch(''); setTrigResults([]); }, compLabel)}
              <small>A system recording any one of these is expected to have this solution.</small>
            </div>
            {triggers.length > 0 && (
              <label className={styles.field}>Which policy, standard or procedure requires it?
                <select className={styles.input} value={docId} onChange={e => setDocId(e.target.value)}>
                  <option value="">Choose a document…</option>
                  {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <small>A rule that requires a solution has to cite the document it comes from.</small>
              </label>
            )}
            <div className={styles.review}>
              <div><PatternChip kind="solution" /> <b>{name.trim() || 'Unnamed'}</b></div>
              <h2 className={styles.sub}>On each protected system</h2>
              <ul className={styles.list}><li>{agent ? agent.name : <span className={styles.muted}>nothing</span>}</li></ul>
              <h2 className={styles.sub}>On {system?.name}</h2>
              <ul className={styles.list}>{picked.map(c => <li key={c.id}>{c.name}</li>)}</ul>
            </div>
            {error && <p className={styles.error} role="alert">{error}{createdId && <> <Link to={`/security-solutions/${createdId}`}>Open the security solution</Link></>}</p>}
          </>)}
        </div>

        <div className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={step === 0 || busy || (fromSystem && step === 2)} onClick={() => setStep(s => s - 1)}>Back</button>
          {run === false
            ? <button type="button" className={styles.primary} disabled={!name.trim() || busy} onClick={byHand}>Create and add its parts</button>
            : step < STEPS.length - 1
              ? <button type="button" className={styles.primary} disabled={!stepOk[step]} onClick={() => setStep(s => s + 1)}>Next</button>
              : <button type="button" className={styles.primary} disabled={busy || !stepOk[4]} onClick={create}>{busy ? 'Creating…' : 'Create security solution'}</button>}
        </div>

        {showNew && (
          <ComponentModal componentType="technology" defaultName={agentSearch}
            onClose={() => setShowNew(false)}
            onSaved={(c) => { setShowNew(false); setAgentSearch(''); if (c.instantiation === 'per_system') setAgent(c); }} />
        )}
      </div>
    </Shell>
  );
}
