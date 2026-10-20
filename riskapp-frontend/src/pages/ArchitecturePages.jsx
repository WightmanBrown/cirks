// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getArchitecture, createArchitectureItem, updateArchitectureItem, deleteArchitectureItem,
  addArchitectureComponent, removeArchitectureComponent, listSecuritySolutions, listComponents,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { PatternChip } from '../components/PatternChip';
import { COMPONENT_TYPES, componentTypeLabel, componentTypeShort } from '../utils/componentTypes';
import shared from './ScopesPage.module.css';
import styles from './ArchitecturePages.module.css';

// The security architecture (v148, docs/system-security-view.md §4.2–§4.4), as
// three pages (owner, 2026-10-02):
//   Systems architecture template  — what every system must record (membership groups);
//   Security pattern triggers      — the security solutions a component on a system calls for (rules);
//   System architecture patterns   — components that live together, applied as a copy (builds).
// Written by the security team (controls.write); everyone who reads the control
// catalogue can see them. Report only: nothing here changes a status or a risk score.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A component picker grouped by type, leaving out the ones already chosen.
function ComponentPicker({ components, exclude, label, placeholder, onPick }) {
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
function ComponentChips({ items, canEdit, onRemove, empty, removeLabel }) {
  if (!items.length) return <span className={shared.muted}>{empty}</span>;
  return (
    <ul className={styles.chips}>
      {items.map(c => (
        <li key={c.id} className={styles.chip}>
          <Link to={`/components/${c.id}`}>{c.name}</Link>
          <span className={styles.kind}>{componentTypeShort(c.component_type)}</span>
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


const PAGES = [
  { path: '/architecture-template',     label: 'Systems architecture template' },
  { path: '/security-pattern-triggers', label: 'Security pattern triggers' },
  { path: '/architecture-patterns',     label: 'System architecture patterns' },
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

function Frame({ title, comment, children, a, needsDocs }) {
  const here = PAGES.find(p => p.label === title);
  return (
    <Shell>
      <div className={shared.page}>
        <BackButton fallback="/controls" />
        <div className={shared.header}>
          <div>
            <h1 className={shared.title}>{title}</h1>
            {comment && <p className={shared.desc}><b>{comment}</b></p>}
            <p className={shared.note}>
              Part of the security architecture, with{' '}
              {PAGES.filter(p => p !== here).map((p, i) => (
                <span key={p.path}>{i > 0 && ' and '}<Link to={p.path}>{p.label}</Link></span>
              ))}. Gaps appear on each system and in the <Link to="/findings">findings</Link>; nothing here changes a
              control&rsquo;s status or a risk score.
            </p>
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

export function ArchitectureTemplatePage() {
  const a = useArchitecture('architecture.write');
  const { canEdit, lib, components, run, docs, noDocs, confirmRemove } = a;
  const [draftGroup, setDraftGroup] = useState({ name: '', standard_id: '' });
  return (
    <Frame title="Systems architecture template" comment="What every system must record." a={a} needsDocs>
      {lib && (<>
          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Groups <span className={shared.count}>{lib.groups.length}</span></h2>
            <p className={shared.note}>
              Each system should include one component from each group — its network zone, where it is hosted,
              its operating system and so on. A system that includes none has a gap, because without it the rules
              below cannot tell what the system needs. Where a group does not really apply, the system records an
              explicit answer (for example <i>Supplier-managed (SaaS)</i>) rather than leaving it blank.
            </p>
            {lib.groups.length === 0 && <p className={shared.muted}>No membership groups yet.</p>}
            {lib.groups.map(g => {
              const memberIds = new Set(g.members.map(m => m.id));
              const triggerIds = new Set(g.triggers.map(m => m.id));
              return (
                <article key={g.id} className={styles.card}>
                  <header className={styles.cardHead}>
                    <div>
                      <div className={styles.titleRow}><h3 className={styles.cardTitle}>{g.name}</h3><PatternChip kind="template" /></div>
                      <span className={shared.note}>
                        From {g.standard_name} ·{' '}
                        {g.triggers.length ? 'applies to systems recording a trigger below' : `applies to all ${plural(lib.active_systems, 'system')}`}
                        {' · '}
                        <span className={g.systems_unanswered ? shared.warn : shared.good}>
                          {g.systems_unanswered ? `${plural(g.systems_unanswered, 'system')} ${g.systems_unanswered === 1 ? 'has' : 'have'} not recorded one` : 'every system has recorded one'}
                        </span>
                      </span>
                    </div>
                    {canEdit && (
                      <button className={shared.linkBtn} onClick={() => confirmRemove(`the group "${g.name}"`, 'Systems will no longer be asked to record one of its members.')
                        && run(() => deleteArchitectureItem('groups', g.id))}>Remove group</button>
                    )}
                  </header>
                  <div className={styles.row}>
                    <span className={styles.label}>Members</span>
                    <ComponentChips items={g.members} canEdit={canEdit} empty="No members yet — a system cannot answer this group."
                      removeLabel="Remove member" onRemove={(cid) => run(() => removeArchitectureComponent('groups', g.id, 'members', cid))} />
                  </div>
                  {canEdit && (
                    <ComponentPicker components={components} exclude={memberIds} label={`Member to add to ${g.name}`}
                      placeholder="Add a member…" onPick={(cid) => run(() => addArchitectureComponent('groups', g.id, 'members', cid))} />
                  )}
                  {(g.triggers.length > 0 || canEdit) && (
                    <details className={styles.more} open={g.triggers.length > 0}>
                      <summary>Applies only to systems recording… <span className={shared.count}>{g.triggers.length || 'every system'}</span></summary>
                      <ComponentChips items={g.triggers} canEdit={canEdit} empty="Every system — no triggers."
                        removeLabel="Remove trigger" onRemove={(cid) => run(() => removeArchitectureComponent('groups', g.id, 'triggers', cid))} />
                      {canEdit && (
                        <ComponentPicker components={components} exclude={triggerIds} label={`Trigger to add to ${g.name}`}
                          placeholder="Limit to systems recording…" onPick={(cid) => run(() => addArchitectureComponent('groups', g.id, 'triggers', cid))} />
                      )}
                    </details>
                  )}
                </article>
              );
            })}
            {canEdit && !noDocs && (
              <div className={shared.create}>
                <input className={shared.input} placeholder="New group, e.g. Network zone" value={draftGroup.name}
                  aria-label="Name of the new membership group" onChange={e => setDraftGroup(d => ({ ...d, name: e.target.value }))} />
                <DocumentSelect documents={docs} value={draftGroup.standard_id} label="Document the new group comes from"
                  onChange={v => setDraftGroup(d => ({ ...d, standard_id: v }))} />
                <button className={shared.primary} disabled={!draftGroup.name.trim() || !draftGroup.standard_id}
                  onClick={async () => { if (await run(() => createArchitectureItem('groups', draftGroup))) setDraftGroup({ name: '', standard_id: '' }); }}>
                  Create group
                </button>
              </div>
            )}
          </section>

      </>)}
    </Frame>
  );
}

export function SecurityPatternTriggersPage() {
  const a = useArchitecture();
  const { canEdit, lib, solutions, components, run, docs, noDocs, confirmRemove } = a;
  const [draftRule, setDraftRule]   = useState({ pattern_id: '', standard_id: '' });
  return (
    <Frame title="Security pattern triggers" a={a} needsDocs>
      {lib && (<>
          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Triggers <span className={shared.count}>{lib.rules.length}</span></h2>
            <p className={shared.note}>
              Each rule below names a security solution and the components that trigger it. A system that has <b>any one</b> of
              those components must have the solution. List alternatives on one rule (for example <i>Windows Server 2016</i> and{' '}
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
                      <div className={styles.titleRow}><h3 className={styles.cardTitle}><Link to={`/security-solutions/${r.pattern_id}`}>{r.pattern_name}</Link></h3><PatternChip kind="solution" /></div>
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

export function ArchitecturePatternsPage() {
  const a = useArchitecture('architecture.write');
  const { canEdit, lib, components, run } = a;
  const [draftBuild, setDraftBuild] = useState('');
  const [renaming, setRenaming] = useState(null);   // { id, name } while a pattern's name is being edited
  return (
    <Frame title="System architecture patterns" a={a}>
      {lib && (<>
          <section className={shared.section}>
            <h2 className={shared.sectionTitle}>Patterns <span className={shared.count}>{lib.builds.length}</span></h2>
            <p className={shared.note}>
              A system architecture pattern is a named set of components that are normally installed together. For example,
              a standard Windows server is its operating system, its endpoint protection agent and its logging agent. Define
              each pattern once here, then use it to record those components on a system in one step instead of adding them
              one at a time.
            </p>
            <p className={shared.note}>
              Applying a pattern <b>copies</b> its components onto the system. After that the system&rsquo;s components are its
              own: changing or removing a pattern here does not change any system it was already applied to.
            </p>
            <p className={shared.note}>
              A pattern does not decide what a system must have. That comes from the{' '}
              <Link to="/architecture-template">Systems architecture template</Link> and the{' '}
              <Link to="/security-pattern-triggers">Security pattern triggers</Link>. Applying a pattern from a system&rsquo;s
              page is not available yet.
            </p>
            {lib.builds.length === 0 && <p className={shared.muted}>No patterns yet.</p>}
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
                        <div className={styles.titleRow}><h3 className={styles.cardTitle}>{b.name}</h3><PatternChip kind="pattern" /></div>
                        {b.notes && <span className={shared.note}>{b.notes}</span>}
                      </div>
                    )}
                    {canEdit && renaming?.id !== b.id && (
                      <div className={styles.row}>
                        <button className={shared.linkBtn} aria-label={`Rename ${b.name}`}
                          onClick={() => setRenaming({ id: b.id, name: b.name })}>Rename pattern</button>
                        <button className={shared.linkBtn}
                          onClick={() => window.confirm(`Remove the pattern "${b.name}"? Systems it was applied to keep their components.`)
                            && run(() => deleteArchitectureItem('builds', b.id))}>Remove pattern</button>
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
                <input className={shared.input} placeholder="New pattern, e.g. MIG Windows server" value={draftBuild}
                  aria-label="Name of the new pattern" onChange={e => setDraftBuild(e.target.value)} />
                <button className={shared.primary} disabled={!draftBuild.trim()}
                  onClick={async () => { if (await run(() => createArchitectureItem('builds', { name: draftBuild }))) setDraftBuild(''); }}>
                  Create pattern
                </button>
              </div>
            )}
          </section>
      </>)}
    </Frame>
  );
}
