// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getArchitecture, createArchitectureItem, updateArchitectureItem, deleteArchitectureItem,
  addRulePatternTrigger, removeRulePatternTrigger,
  addArchitectureComponent, removeArchitectureComponent, listSecuritySolutions, listComponents,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { PatternChip } from '../components/PatternChip';
import { COMPONENT_TYPES, componentTypeLabel } from '../utils/componentTypes';
import shared from './ScopesPage.module.css';
import styles from './ArchitecturePages.module.css';
import { TypeBadge } from '../components/ComponentPill';
import { HelpDot } from '../components/HelpDot';

// The security architecture (v148, docs/system-security-view.md §4.2–§4.4), as
// pages (owner, 2026-10-02):
//   Security pattern triggers — the security solutions a component on a system,
//                               or a system pattern (v178), calls for (rules);
//   Standard builds           — components that live together, applied as a copy (builds).
// The System profile page (membership groups) was retired in v178: what a system
// must record is its pattern's slots, and what can answer them is a role on the
// component, both on the System patterns page.
// Written by the security team (controls.write); everyone who reads the control
// catalogue can see them. Template gaps are reported (system page, findings); a
// trigger implies a solution, and an implied objective's status follows its
// solution (v152), so triggers and applied patterns can change risk scores.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A component picker grouped by type, leaving out the ones already chosen.
export function ComponentPicker({ components, exclude, label, placeholder, onPick }) {
  const [value, setValue] = useState('');
  const groups = useMemo(() => COMPONENT_TYPES.map(t => ({
    type: t, items: components.filter(c => c.component_type === t && !exclude.has(c.id)),
  })).filter(g => g.items.length), [components, exclude]);
  return (
    <span className={shared.create}>
      <select className={shared.input} value={value} aria-label={label} onChange={e => setValue(e.target.value)}>
        <option value="">{placeholder}</option>
        {groups.map(g => (
          <optgroup key={g.type} label={componentTypeLabel(g.type)}>
            {g.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
      <button className={shared.secondary} disabled={!value}
        onClick={async () => { await onPick(value); setValue(''); }}>Add</button>
    </span>
  );
}

// Components as removable chips, each linking to its page.
export function ComponentChips({ items, canEdit, onRemove, empty, removeLabel }) {
  if (!items.length) return <span className={shared.muted}>{empty}</span>;
  return (
    <ul className={styles.chips}>
      {items.map(c => (
        <li key={c.id} className={styles.chip}>
          <Link to={`/components/${c.id}`}>{c.name}</Link>
          <TypeBadge type={c.component_type} variant="text" />
          {c.systems != null && <span className={styles.kind} title="Active systems recording it">· {plural(c.systems, 'system')}</span>}
          {canEdit && (
            <button className={styles.x} aria-label={`${removeLabel} ${c.name}`} title={`${removeLabel} ${c.name}`}
              onClick={() => onRemove(c.id)}>×</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DocumentSelect({ documents, value, onChange, label }) {
  return (
    <select className={shared.input} value={value} aria-label={label} onChange={e => onChange(e.target.value)}>
      <option value="">From which document?</option>
      {documents.map(d => (
        <option key={d.id} value={d.id}>{d.name} ({d.document_kind}{d.status !== 'operational' ? ', not published' : ''})</option>
      ))}
    </select>
  );
}


// v178: the System profile page is retired. What a system must record is its
// system pattern's slots, and what can answer each is a role on the component
// (the System patterns page).
const PAGES = [
  { path: '/system-patterns',           label: 'System patterns' },
  { path: '/security-pattern-triggers', label: 'Security pattern triggers' },
  { path: '/architecture-patterns',     label: 'Standard builds' },
];

// What each page loads, and the shared refresh-after-change.
// `cap`: the template and the patterns are an architect's work (architecture.write,
// v155); the rules that require a security solution stay with controls.write.
function useArchitecture(cap = 'controls.write') {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability(cap);
  const [lib, setLib]               = useState(null);
  const [solutions, setSolutions]   = useState([]);
  const [components, setComponents] = useState([]);
  const [error, setError]           = useState('');

  const load = useCallback(async () => {
    try { setLib(await getArchitecture()); setError(''); }
    catch { setError('Could not load the security architecture.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canEdit) return;
    listSecuritySolutions().then(s => setSolutions(s.filter(x => x.kind === 'parts'))).catch(() => setSolutions([]));
    listComponents().then(setComponents).catch(() => setComponents([]));
  }, [canEdit]);

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); return true; }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); return false; }
  };
  const docs = lib?.documents || [];
  return { canEdit, cap, lib, solutions, components, error, run, docs, noDocs: lib && docs.length === 0,
           confirmRemove: (what, effect) => window.confirm(`Remove ${what}? ${effect}`) };
}

function Frame({ title, comment, children, a, needsDocs, helpKey, helpPlacement = 'bottom' }) {
  const here = PAGES.find(p => p.label === title);
  return (
    <Shell>
      <div className={shared.page}>
        <BackButton fallback="/controls" />
        <div className={shared.header}>
          <div>
            <h1 className={shared.title}>{title}{helpKey && <> <HelpDot k={helpKey} placement={helpPlacement} /></>}</h1>
            {comment && <p className={shared.desc}><b>{comment}</b></p>}
            <details className={styles.more}>
              <summary>
                Part of the security architecture, with{' '}
                {PAGES.filter(p => p !== here).map((p, i) => (
                  <span key={p.path}>{i > 0 && ' and '}<Link to={p.path}>{p.label}</Link></span>
                ))}
              </summary>
              <p className={shared.note}>
                Gaps appear on each system and in the <Link to="/findings">findings</Link>. What a system records
                decides which security solutions it implies, and an implied objective&rsquo;s status on the system
                follows its solution &mdash; so this can change risk scores.
              </p>
            </details>
          </div>
          {!a.canEdit && <ReadOnlyBadge reason={`Editing this needs the ${a.cap} capability (CISO, risk analyst, admin).`} />}
        </div>
        {a.error && <div className={shared.error} role="alert">{a.error}</div>}
        {needsDocs && a.canEdit && a.noDocs && (
          <div className={shared.error} role="status">
            These must cite a policy, standard or procedure. There are none yet —
            add one in <Link to="/policies-documents">Policies &amp; documents</Link> first.
          </div>
        )}
        {a.lib && children}
      </div>
    </Shell>
  );
}

// The system patterns (src/lib/systemPatterns.js), by code, for the trigger chips.
const SYSTEM_PATTERN_NAMES = {
  S1: 'Application on premises', S2: 'Software as a service (SaaS)', S3: 'Dedicated equipment and operational technology',
  S4: 'End-user device', S5: 'Network infrastructure', S6: 'Document record',
  S7: 'Application on cloud infrastructure (IaaS)', S8: 'Application on a cloud platform (PaaS)',
};

export function SecurityPatternTriggersPage() {
  const a = useArchitecture();
  const { canEdit, lib, solutions, components, run, docs, noDocs, confirmRemove } = a;
  const [draftRule, setDraftRule]   = useState({ pattern_id: '', standard_id: '' });
  return (
    <Frame title="Security pattern triggers" a={a} needsDocs helpKey="security_architecture.triggers">
      {lib && (<>
          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Triggers <span className={shared.count}>{lib.rules.length}</span> <HelpDot k="security_architecture.rules" placement="bottom" /></h2>
            <p className={shared.note}>
              Each rule below names a security solution and what triggers it: components, or a system pattern. A system that
              has <b>any one</b> of those components, or follows one of those patterns, must have the solution. List alternatives on one rule (for example <i>Windows Server 2016</i> and{' '}
              <i>Windows Server 2025</i>) rather than writing two rules. If two rules call for different solutions for the same
              control objective on a system, the system shows a conflict and someone chooses.
            </p>
            {lib.rules.length === 0 && <p className={shared.muted}>No rules yet.</p>}
            {lib.rules.map(r => {
              const triggerIds = new Set(r.triggers.map(t => t.id));
              return (
                <article key={r.id} className={styles.card}>
                  <header className={styles.cardHead}>
                    <div>
                      <div className={styles.titleRow}><h3 className={styles.cardTitle}><Link to={`/security-solutions/${r.pattern_id}`}>{r.pattern_name}</Link> <HelpDot k="security_architecture.rule_card" placement="bottom" /></h3><PatternChip kind="solution" /></div>
                      <span className={shared.note}>
                        Required by {r.standard_name} · applies to {plural(r.systems, 'system')} today
                        {r.notes && <> · {r.notes}</>}
                      </span>
                    </div>
                    {canEdit && (
                      <button className={shared.linkBtn} onClick={() => confirmRemove(`the rule requiring "${r.pattern_name}"`, `This solution will no longer be implied on the ${plural(r.systems, 'system')} the rule applies to.`)
                        && run(() => deleteArchitectureItem('rules', r.id))}>Remove rule</button>
                    )}
                  </header>
                  <div className={styles.row}>
                    <span className={styles.label}>Triggered by any of</span>
                    <ComponentChips items={r.triggers} canEdit={canEdit} empty="No triggers — this rule applies to no system yet."
                      removeLabel="Remove trigger" onRemove={(cid) => run(() => removeArchitectureComponent('rules', r.id, 'triggers', cid))} />
                  </div>
                  {canEdit && (
                    <ComponentPicker components={components} exclude={triggerIds} label={`Trigger to add to the ${r.pattern_name} rule`}
                      placeholder="Add a trigger…" onPick={(cid) => run(() => addArchitectureComponent('rules', r.id, 'triggers', cid))} />
                  )}
                  <div className={styles.row}>
                    <span className={styles.label}>Or every system following <HelpDot k="security_architecture.pattern_triggers" /></span>
                    {(r.pattern_triggers || []).length === 0 && !canEdit && <span className={shared.muted}>no system pattern</span>}
                    <ul className={styles.chips}>
                      {(r.pattern_triggers || []).map(code => (
                        <li key={code} className={styles.chip}>
                          <Link to={`/system-patterns#${code}`}>{code} · {SYSTEM_PATTERN_NAMES[code]}</Link>
                          {canEdit && (
                            <button className={styles.x} aria-label={`Remove trigger ${code}`} title={`Remove trigger ${code}`}
                              onClick={() => run(() => removeRulePatternTrigger(r.id, code))}>×</button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canEdit && (
                      <select className={shared.input} value="" aria-label={`System pattern to add as a trigger of the ${r.pattern_name} rule`}
                        onChange={e => e.target.value && run(() => addRulePatternTrigger(r.id, e.target.value))}>
                        <option value="">Add a system pattern…</option>
                        {Object.entries(SYSTEM_PATTERN_NAMES).filter(([c]) => !(r.pattern_triggers || []).includes(c))
                          .map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                      </select>
                    )}
                  </div>
                </article>
              );
            })}
            {canEdit && !noDocs && (
              <div className={shared.create}>
                <select className={shared.input} value={draftRule.pattern_id} aria-label="Security solution the new rule requires"
                  onChange={e => setDraftRule(d => ({ ...d, pattern_id: e.target.value }))}>
                  <option value="">Which security solution?</option>
                  {solutions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <DocumentSelect documents={docs} value={draftRule.standard_id} label="Document the new rule comes from"
                  onChange={v => setDraftRule(d => ({ ...d, standard_id: v }))} />
                <button className={shared.primary} disabled={!draftRule.pattern_id || !draftRule.standard_id}
                  onClick={async () => { if (await run(() => createArchitectureItem('rules', draftRule))) setDraftRule({ pattern_id: '', standard_id: '' }); }}>
                  Create rule
                </button>
              </div>
            )}
          </section>

      </>)}
    </Frame>
  );
}

// The applications in order of who answers for each layer, then the rest.
const PATTERN_ORDER = ['S1', 'S7', 'S8', 'S2', 'S3', 'S4', 'S5', 'S6'];

// "… follows S1 · Application on premises" on a standard build's header line
// (v182). No pattern is allowed, with a warning; an architect chooses or changes
// it in place.
function BuildPattern({ build, canEdit, onChange }) {
  const [editing, setEditing] = useState(false);
  const code = build.system_pattern;
  if (editing || (canEdit && !code)) {
    return (
      <span className={styles.follows}>
        follows
        <select className={shared.input} value={code || ''} autoFocus={editing}
          aria-label={`The system pattern ${build.name} follows`}
          onChange={async (e) => { await onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}>
          <option value="">no pattern yet: choose one</option>
          {PATTERN_ORDER.map(c => <option key={c} value={c}>{c} · {SYSTEM_PATTERN_NAMES[c]}</option>)}
        </select>
      </span>
    );
  }
  if (!code) {
    return <span className={`${styles.follows} ${styles.noPattern}`}>follows no pattern yet: the questions a system built from it must answer are unknown</span>;
  }
  return (
    <span className={styles.follows}>
      follows <Link to={`/system-patterns#${code}`}>{code} · {SYSTEM_PATTERN_NAMES[code]}</Link>
      {canEdit && <button className={shared.linkBtn} aria-label={`Change the pattern ${build.name} follows`} onClick={() => setEditing(true)}>change</button>}
    </span>
  );
}

export function ArchitecturePatternsPage() {
  const a = useArchitecture('architecture.write');
  const { canEdit, lib, components, run } = a;
  const [draftBuild, setDraftBuild] = useState('');
  const [draftPattern, setDraftPattern] = useState('');
  const [renaming, setRenaming] = useState(null);   // { id, name } while a pattern's name is being edited
  return (
    <Frame title="Standard builds" a={a} helpKey="security_architecture.patterns">
      {lib && (<>
          <section className={shared.section}>
            <p className={styles.keyMessage}>
              A standard build is a short-hand way of creating a system using repeatable components.{' '}
              <span className={styles.buildCount}>{lib.builds.length} standard build{lib.builds.length === 1 ? '' : 's'}</span>{' '}
              <HelpDot k="security_architecture.builds" placement="bottom" />
            </p>
            <details className={styles.more}>
              <summary>More about standard builds</summary>
              <p className={shared.note}>
                A standard build is a named set of components installed together, repeated on every system built to it. For
                example, a standard Windows server is its operating system, its endpoint protection agent and its logging agent.
                Define each standard build once here, then use it to record those components on a system in one step.
              </p>
              <p className={shared.note}>
                Each standard build follows a <Link to="/system-patterns">system pattern</Link>, which decides the questions a
                system must answer. A build answers some of them, not necessarily all: what differs from system to system, most
                often where it runs, is answered on each system. What a system must have comes from its pattern and the{' '}
                <Link to="/security-pattern-triggers">Security pattern triggers</Link>, never from the build.
              </p>
              <p className={shared.note}>
                Applying a standard build <b>copies</b> its components onto the system. After that the system&rsquo;s components are its
                own: changing or removing a standard build here does not change any system it was already applied to.
              </p>
            </details>
            {lib.builds.length === 0 && <p className={shared.muted}>No standard builds yet.</p>}
            {lib.builds.map(b => {
              const ids = new Set(b.components.map(c => c.id));
              return (
                <article key={b.id} className={styles.card}>
                  <header className={styles.cardHead}>
                    {renaming?.id === b.id ? (
                      <form className={styles.row}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await run(() => updateArchitectureItem('builds', b.id, { name: renaming.name }))) setRenaming(null);
                        }}>
                        <input className={shared.input} value={renaming.name} autoFocus aria-label={`New name for ${b.name}`}
                          onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                          onKeyDown={e => e.key === 'Escape' && setRenaming(null)} />
                        <button className={shared.primary} type="submit"
                          disabled={!renaming.name.trim() || renaming.name.trim() === b.name}>Save name</button>
                        <button className={shared.linkBtn} type="button" onClick={() => setRenaming(null)}>Cancel</button>
                      </form>
                    ) : (
                      <div>
                        <div className={styles.titleRow}>
                          <h3 className={styles.cardTitle}>{b.name} <HelpDot k="security_architecture.build_card" placement="bottom" /></h3>
                          <PatternChip kind="pattern" />
                          <BuildPattern build={b} canEdit={canEdit}
                            onChange={(code) => run(() => updateArchitectureItem('builds', b.id, { system_pattern: code || null }))} />
                        </div>
                        {b.notes && <span className={shared.note}>{b.notes}</span>}
                      </div>
                    )}
                    {canEdit && renaming?.id !== b.id && (
                      <div className={styles.row}>
                        <button className={shared.linkBtn} aria-label={`Rename ${b.name}`}
                          onClick={() => setRenaming({ id: b.id, name: b.name })}>Rename standard build</button>
                        <button className={shared.linkBtn}
                          onClick={() => window.confirm(`Remove the standard build "${b.name}"? Systems it was applied to keep their components.`)
                            && run(() => deleteArchitectureItem('builds', b.id))}>Remove standard build</button>
                      </div>
                    )}
                  </header>
                  <ComponentChips items={b.components} canEdit={canEdit} empty="No components yet."
                    removeLabel="Remove component" onRemove={(cid) => run(() => removeArchitectureComponent('builds', b.id, 'components', cid))} />
                  {canEdit && (
                    <ComponentPicker components={components} exclude={ids} label={`Component to add to ${b.name}`}
                      placeholder="Add a component…" onPick={(cid) => run(() => addArchitectureComponent('builds', b.id, 'components', cid))} />
                  )}
                </article>
              );
            })}
            {canEdit && (
              <div className={shared.create}>
                <input className={shared.input} placeholder="New standard build, e.g. MIG Windows server" value={draftBuild}
                  aria-label="Name of the new standard build" onChange={e => setDraftBuild(e.target.value)} />
                <select className={shared.input} value={draftPattern} aria-label="The system pattern the new standard build follows"
                  onChange={e => setDraftPattern(e.target.value)}>
                  <option value="">Which system pattern does it follow?</option>
                  {PATTERN_ORDER.map(code => <option key={code} value={code}>{code} · {SYSTEM_PATTERN_NAMES[code]}</option>)}
                </select>
                <button className={shared.primary} disabled={!draftBuild.trim()}
                  onClick={async () => {
                    if (await run(() => createArchitectureItem('builds', { name: draftBuild, system_pattern: draftPattern || null }))) { setDraftBuild(''); setDraftPattern(''); }
                  }}>
                  Create standard build
                </button>
              </div>
            )}
          </section>
      </>)}
    </Frame>
  );
}
