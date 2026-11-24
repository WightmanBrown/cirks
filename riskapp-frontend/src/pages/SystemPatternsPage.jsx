// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSystemPatterns, listComponents } from '../api';
import { useAuth } from '../context/AuthContext';
import { RoleChangeDialog } from '../components/RoleChangeDialog';
import { ComponentPicker, ComponentChips } from './ArchitecturePages';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { PatternDiagram } from '../components/PatternDiagram';
import { PatternFitChips } from '../components/PatternFitChips';
import { slotComponentType } from '../components/SystemPatternSection';
import { TypeBadge } from '../components/ComponentPill';
import { useScrollRestore } from '../hooks/useScrollRestore';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';
import shared from './ScopesPage.module.css';
import styles from './SecuritySolutionPatternsPage.module.css';

// The system patterns (v177, docs/system-patterns.md): the eight shapes a business
// system takes, each drawn as its slots, with the systems that follow it and how
// each measures up. The pattern decides which questions a system must answer; a
// system with no pattern stated is asked none. Which components fulfil which roles is
// a role on the component (v178), listed once at the end and changed there by an
// architect, with what the change does shown first.
//
// The systems with no pattern come straight after the patterns, each with
// what it records and the pattern it is closest to: placing them is an
// architect's job, and one that fits none is the evidence for a new pattern
// (owner, 2026-11-17).

// Which pattern a system's record is closest to: the share of each pattern's
// questions answered by role that what it records can answer (required ones
// first). A suggestion only; a pattern is never chosen for a system.
export function closestPattern(patterns, recorded) {
  const roles = new Set((recorded || []).flatMap(c => c.roles || []));
  if (!roles.size) return null;
  let best = null;
  for (const p of patterns) {
    const asked = p.slots.filter(s => s.fill === 'role');
    const required = asked.filter(s => s.required);
    if (!asked.length) continue;
    const answered = asked.filter(s => roles.has(s.key));
    const reqAnswered = required.filter(s => roles.has(s.key));
    const score = [required.length ? reqAnswered.length / required.length : 1, answered.length / asked.length];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
      best = { code: p.code, name: p.name, score, answered: reqAnswered.length, of: required.length,
        missing: required.filter(s => !roles.has(s.key)).map(s => s.label.toLowerCase()) };
    }
  }
  return best;
}

// Column key → value, for sorting the systems under each pattern (useTableSort).
// One sort applies within every pattern; the patterns stay in their defined order.
// Against its pattern sorts by how many required questions are unanswered.
export const PATTERN_SYSTEM_ACCESSORS = {
  name:       (s) => s.name,
  department: (s) => s.department_name,
  fit:        (s) => (s.pattern_fit && s.pattern_fit.state !== 'no_pattern' ? (s.pattern_fit.missing || []).length : null),
};

// The same for the systems with no pattern, each row carrying its closest
// pattern as `near` (closestPattern): what it records sorts by how many
// components it records, the closest pattern by its code.
export const UNSTATED_SYSTEM_ACCESSORS = {
  name:       (s) => s.name,
  department: (s) => s.department_name,
  records:    (s) => (s.recorded || []).length,
  closest:    (s) => s.near?.code,
};

export function SystemPatternsPage() {
  const { hasCapability } = useAuth();
  const canArchitect = hasCapability('architecture.write');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [components, setComponents] = useState([]);
  const [change, setChange] = useState(null);       // { component, roles } while a change is previewed
  const load = useCallback(() => getSystemPatterns().then(setData).catch(() => setError('Could not load the system patterns.')), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (canArchitect) listComponents().then(setComponents).catch(() => setComponents([])); }, [canArchitect]);
  useScrollRestore(Boolean(data));
  const roleLabel = (k) => data?.roles.find(r => r.key === k)?.labels[0] || k;
  const byId = (id) => components.find(c => c.id === id) || data?.roles.flatMap(r => r.members).find(m => m.id === id);
  const startChange = (id, add, role) => {
    const c = byId(id);
    if (!c) return;
    const now = c.roles || [];
    setChange({ component: { id: c.id, name: c.name, roles: now }, roles: add ? [...new Set([...now, role])] : now.filter(r => r !== role) });
  };

  // Sorted by a header, each table kind with its own address parameter.
  const patternSort = useTableSort(data?.systems || [], { accessors: PATTERN_SYSTEM_ACCESSORS, state: useUrlSortState() });
  const unstatedRows = useMemo(() => (data?.systems || []).filter(s => !s.system_pattern)
    .map(s => ({ ...s, near: closestPattern(data.patterns, s.recorded) })), [data]);
  const unstatedSort = useTableSort(unstatedRows, { accessors: UNSTATED_SYSTEM_ACCESSORS, state: useUrlSortState('sort_unstated') });
  const systemsOf = (code) => patternSort.sorted.filter(s => s.system_pattern === code);
  const unstated = unstatedSort.sorted;
  const unstatedBusiness = unstated.filter(s => !s.is_security_system);
  const unstatedSecurity = unstated.filter(s => s.is_security_system);
  // What a system records, said by role: "Operating system: Windows 11 · No role: ArcGIS".
  const recordedByRole = (list) => {
    if (!list?.length) return null;
    const lines = (data?.roles || []).map(r => [r.labels[0], list.filter(c => (c.roles || []).includes(r.key)).map(c => c.name)])
      .filter(([, names]) => names.length);
    const none = list.filter(c => !(c.roles || []).length).map(c => c.name);
    if (none.length) lines.push(['No role', none]);
    return lines;
  };
  const gaps = (list) => list.filter(s => s.pattern_fit?.state === 'incomplete').length;

  const patternProps = { sortKey: patternSort.sortKey, sortDir: patternSort.sortDir, onSort: patternSort.toggleSort };
  const unstatedProps = { sortKey: unstatedSort.sortKey, sortDir: unstatedSort.sortDir, onSort: unstatedSort.toggleSort };

  // One row per system with no pattern: what it records, and its closest pattern.
  const unstatedTable = (list) => (
    <div className={styles.tableWrap}>
      <table className={shared.table}>
        <thead>
          <tr>
            <SortableTh column="name" {...unstatedProps} helpKey="col.name">System</SortableTh>
            <SortableTh column="department" {...unstatedProps} helpKey="col.department">Department</SortableTh>
            <SortableTh column="records" {...unstatedProps} helpKey="system_patterns.col.records">What it records</SortableTh>
            <SortableTh column="closest" {...unstatedProps} helpKey="system_patterns.col.closest">Closest pattern</SortableTh>
          </tr>
        </thead>
        <tbody>
          {list.map(s => {
            const lines = recordedByRole(s.recorded);
            const near = s.near;
            return (
              <tr key={s.id}>
                <td><Link to={`/systems/${s.id}`}>{s.name}</Link></td>
                <td>{s.department_name || '—'}</td>
                <td>
                  {lines
                    ? lines.map(([label, names]) => <div key={label}><span className={shared.muted}>{label}:</span> {names.join(', ')}</div>)
                    : <span className={shared.muted}>nothing recorded</span>}
                </td>
                <td>
                  {!near && <span className={shared.muted}>nothing recorded answers any pattern&rsquo;s questions</span>}
                  {near && (<>
                    <a href={`#${near.code}`}>{near.code} · {near.name}</a>
                    <div className={shared.note}>
                      {near.answered} of its {near.of} required question{near.of === 1 ? '' : 's'} answered
                      {near.missing.length ? `; not: ${near.missing.join(', ')}` : ''}
                    </div>
                  </>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Shell>
      <div className={shared.page}>
        <BackButton fallback="/systems" />
        <div className={shared.header}>
          <div>
            <h1 className={shared.title}>System patterns <HelpDot k="system_patterns.title" placement="bottom" /></h1>
            <p className={styles.keyMessage}>
              A system pattern decides which security questions a system must answer. A{' '}
              <Link to="/architecture-patterns">standard build</Link> is a ready-made set of answers for one pattern.
            </p>
            <p className={styles.reminder}>
              We model systems only to answer security questions, so a pattern asks only for high-level, security-relevant facts.
            </p>
            <details className={styles.more}>
              <summary>More about system patterns</summary>
              <p className={shared.note}>
                There are eight patterns. An application follows the cloud service model it runs on: on premises, infrastructure
                as a service (IaaS), platform as a service (PaaS) or software as a service (SaaS). Each pattern asks its own
                questions: Where does the system run? Who runs it? How do people sign in? What network is it on?
              </p>
              <p className={shared.note}>
                A system answers the questions of the pattern it follows, and it is complete when every required question is
                answered. A question is required only where something reads the answer: the security pattern triggers and
                supplier assurance. The answers are what decide which security solutions a system implies, whether an objective
                is met, what a risk scores and who has to act.
              </p>
              <p className={shared.note}>
                A standard build answers some of its pattern&rsquo;s questions, the ones repeated on every system built to it, and
                leaves the rest (most often where it runs) to each system. Which questions a component can answer is said on the
                component: see <a href="#roles">which components fulfil which roles</a>. A system with no pattern stated is asked
                nothing, and a business system with none is named in the findings.
              </p>
            </details>
          </div>
        </div>
        {error && <div className={shared.error} role="alert">{error}</div>}
        {!data && !error && <p className={shared.muted}>Loading…</p>}
        {data && (<>
          <nav className={styles.grid} aria-label="The system patterns">
            {data.patterns.map(p => {
              const list = systemsOf(p.code); const g = gaps(list);
              return (
                <a key={p.code} href={`#${p.code}`} className={styles.tile}>
                  <span className={styles.code}>{p.code} · {list.length} system{list.length === 1 ? '' : 's'}</span>
                  <b>{p.name}</b>
                  <span className={styles.tileText}>{p.summary}</span>
                  <span className={g ? styles.tileGap : styles.tileOk}>{list.length === 0 ? 'no system follows it yet' : g ? `${g} with a gap` : 'all complete'}</span>
                </a>
              );
            })}
            <a href="#unstated" className={`${styles.tile} ${unstatedBusiness.length === 0 ? styles.tileClear : ''}`}>
              <span className={styles.code}>{unstatedBusiness.length} business system{unstatedBusiness.length === 1 ? '' : 's'}</span>
              <b>Pattern not stated</b>
              <span className={styles.tileText}>
                {unstatedBusiness.length} business system{unstatedBusiness.length === 1 ? '' : 's'} to place
                {unstatedSecurity.length ? ` · ${unstatedSecurity.length} security system${unstatedSecurity.length === 1 ? '' : 's'} (optional)` : ''}.
                Which pattern each is closest to, or none.
              </span>
              <span className={unstatedBusiness.length ? styles.tileGap : styles.tileOk}>
                {unstatedBusiness.length ? 'named in the findings' : 'every business system placed'}
              </span>
            </a>
          </nav>

          {data.patterns.map(p => {
            const list = systemsOf(p.code);
            return (
              <section key={p.code} id={p.code} className={`${shared.section} ${styles.pattern}`}>
                <div className={styles.patternHead}>
                  <h2 className={shared.sectionTitle}>{p.code} · {p.name} <HelpDot k="system_patterns.pattern" placement="bottom" /></h2>
                  <span className={shared.muted}>{list.length} system{list.length === 1 ? '' : 's'}{gaps(list) ? ` · ${gaps(list)} with a gap` : ''}</span>
                </div>
                <p className={styles.lead}>{p.summary} <b>Complete when</b> {p.complete_when}.</p>
                {p.variants && <p className={shared.note}>{p.variants}</p>}
                <PatternDiagram pattern={p} />
                <p className={shared.note}>
                  <b>Required:</b> {p.slots.filter(s => s.required).map(s => s.label.toLowerCase()).join(', ')}
                  {p.slots.some(s => !s.required) && <>. <b>Optional:</b> {p.slots.filter(s => !s.required).map(s => s.label.toLowerCase()).join(', ')} (dashed)</>}.
                </p>
                {list.length === 0 && <p className={shared.muted}>No system follows it yet.</p>}
                {list.length > 0 && (
                  <details className={styles.fold}>
                    <summary>
                      {list.length} system{list.length === 1 ? '' : 's'} follow{list.length === 1 ? 's' : ''} it
                      {gaps(list) ? <span className={styles.tileGap}> · {gaps(list)} with a gap</span> : <span className={styles.tileOk}> · all complete</span>}
                    </summary>
                  <div className={styles.tableWrap}>
                    <table className={shared.table}>
                      <thead>
                        <tr>
                          <SortableTh column="name" {...patternProps} helpKey="col.name">System</SortableTh>
                          <SortableTh column="department" {...patternProps} helpKey="col.department">Department</SortableTh>
                          <SortableTh column="fit" {...patternProps} helpKey="system_patterns.col.fit">Against its pattern</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(s => (
                          <tr key={s.id}>
                            <td><Link to={`/systems/${s.id}`}>{s.name}</Link></td>
                            <td>{s.department_name || '—'}</td>
                            <td><PatternFitChips fit={s.pattern_fit} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </details>
                )}
              </section>
            );
          })}

          <section id="unstated" className={`${shared.section} ${styles.pattern}`}>
            <h2 className={shared.sectionTitle}>Pattern not stated <HelpDot k="system_patterns.unstated" placement="bottom" /></h2>
            <p className={shared.note}>
              These systems are asked nothing, because CIRKS cannot tell what they should record; a business system here is
              named in the component-record finding. For each: what it records, and the pattern its record is closest to.
              Where one fits, choose it on the system&rsquo;s Components tab. Where none fits, that is the case for a new
              pattern. Security systems are described by the security solutions they provide, so they can stay here.
            </p>
            {unstated.length === 0 && <p className={shared.muted}>Every system has a pattern.</p>}
            {unstated.length > 0 && (<>
              <div className={unstatedBusiness.length === 0 ? styles.boxClear : undefined}>
                <h3 className={styles.sub}>Business systems · {unstatedBusiness.length}</h3>
                {unstatedBusiness.length === 0
                  ? <p className={shared.muted}>Every business system has a pattern.</p>
                  : unstatedTable(unstatedBusiness)}
              </div>
            </>)}
            {unstatedSecurity.length > 0 && (
              <details className={`${styles.fold} ${styles.boxSecurity}`}>
                <summary>
                  Security systems · {unstatedSecurity.length}{' '}
                  <span className={shared.muted}>(optional: a pattern makes their own record checkable)</span>
                </summary>
                <p className={shared.note}>
                  Not a gap: what a security system provides is described by its security solutions, and it is not named in
                  the findings. It is still a system that can be attacked, though, and a pattern asks of it what is asked of
                  any other: where it runs, its network, how people sign in.
                </p>
                {unstatedTable(unstatedSecurity)}
              </details>
            )}
          </section>

          <section id="roles" className={`${shared.section} ${styles.pattern}`}>
            <h2 className={shared.sectionTitle}>Which components fulfil which roles? <HelpDot k="system_patterns.roles" placement="bottom" /></h2>
            <p className={shared.note}>
              A component&rsquo;s roles: Windows 11 can answer <i>Operating system</i> on any system that records it. One
              component can have several (IT Administrators: <i>Support team</i> and <i>Who uses it</i>). Changing them shows
              first which systems would lose or gain an answer.
            </p>
            {change && (
              <RoleChangeDialog component={change.component} roles={change.roles} roleLabel={roleLabel}
                onClose={() => setChange(null)}
                onDone={() => { setChange(null); load(); if (canArchitect) listComponents().then(setComponents).catch(() => {}); }} />
            )}
            {data.roles.map(r => {
              const slot = data.patterns.flatMap(p => p.slots).find(sl => sl.key === r.key);
              const type = slot ? slotComponentType(slot) : 'technology';
              return (
              <article key={r.key} className={`${styles.role} ${styles['role_' + type] || ''}`}>
                <div className={styles.roleHead}>
                  <TypeBadge type={type} label="long" />
                  <b>{r.labels.join(' / ')}</b>
                  <span className={shared.muted}>{r.members.length} component{r.members.length === 1 ? '' : 's'}</span>
                  <span className={shared.muted}>
                    {r.required_in.length ? `required for ${r.required_in.join(', ')}` : 'required for no pattern'}
                    {r.optional_in.length ? `; optional for ${r.optional_in.join(', ')}` : ''}
                  </span>
                </div>
                <ComponentChips items={r.members} canEdit={canArchitect && !change} removeLabel={`Not ${r.labels[0].toLowerCase()}:`}
                  empty="Nothing can answer it yet." onRemove={(id) => startChange(id, false, r.key)} />
                {canArchitect && !change && (
                  <ComponentPicker components={components} exclude={new Set(r.members.map(m => m.id))}
                    label={`A component that can answer ${r.labels[0].toLowerCase()}`} placeholder="Add a component that can answer it…"
                    onPick={(id) => startChange(id, true, r.key)} />
                )}
              </article>
              );
            })}
          </section>

        </>)}
      </div>
    </Shell>
  );
}
