// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listSecuritySolutions, getSolutionPatterns } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { SecuritySolutionSummaryCard } from '../components/SecuritySolutionSummaryCard';
import { PatternChip } from '../components/PatternChip';
import { PatternFitChips } from '../components/PatternFitChips';
import styles from './ThreatsPage.module.css';
import own from './SecuritySolutionsPage.module.css';
import { HelpDot } from '../components/HelpDot';
import { useScrollRestore } from '../hooks/useScrollRestore';

// The security solutions library from the solution's side (v147), grouped by the
// security solution pattern each implements (v176). Each row checks the solution
// against its pattern: which slots it fills, and which required ones it lacks.
// An objective's page lists the solutions that can deliver it; this page lists
// each solution once with every objective it delivers. Rows unfold to the
// summary card (?selected=), which links to the solution's own page.
const FILTERS = [
  { key: '', label: 'All' },
  { key: 'incomplete', label: 'Missing a required part' },
  { key: 'complete', label: 'Complete against its pattern' },
];

export function SecuritySolutionsPage() {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('controls.write');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected');
  const onlyPattern = searchParams.get('pattern');
  const fitFilter = searchParams.get('fit') || '';
  const summaryRowRef = useRef(null);
  const [solutions, setSolutions] = useState(null);
  const [patterns, setPatterns] = useState([]);
  useScrollRestore(solutions !== null);   // Back from an item lands where you left the list
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listSecuritySolutions().then(setSolutions).catch(() => setError('Could not load the security solutions.'));
    getSolutionPatterns().then(setPatterns).catch(() => setPatterns([]));
  }, []);

  useEffect(() => {
    if (selectedId && solutions) summaryRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selectedId, solutions]);

  const setParam = (key, value) => setSearchParams((prev) => {
    const p = new URLSearchParams(prev);
    if (value) p.set(key, value); else p.delete(key);
    return p;
  }, { replace: true });
  const toggle = (id) => setParam('selected', selectedId === id ? '' : id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(solutions || [])].sort((a, b) => a.name.localeCompare(b.name))
      .filter(s => !onlyPattern || (s.solution_pattern || 'none') === onlyPattern)
      .filter(s => !fitFilter || s.pattern_fit?.state === fitFilter)
      .filter(s => !q || s.name.toLowerCase().includes(q)
        || s.objectives.some(o => `${o.reference_code || ''} ${o.title}`.toLowerCase().includes(q))
        || s.parts.some(p => p.component_name.toLowerCase().includes(q)));
  }, [solutions, search, onlyPattern, fitFilter]);

  // One group per pattern, in pattern order, then the solutions with none stated.
  const groups = useMemo(() => {
    const out = patterns.map(p => ({ key: p.code, title: `${p.code} · ${p.name}`, pattern: p,
      rows: filtered.filter(s => s.solution_pattern === p.code) }));
    out.push({ key: 'none', title: 'No pattern stated',
      rows: filtered.filter(s => !s.solution_pattern || !patterns.some(p => p.code === s.solution_pattern)) });
    return out.filter(g => g.rows.length);
  }, [patterns, filtered]);

  const counts = useMemo(() => ({
    incomplete: (solutions || []).filter(s => s.pattern_fit?.state === 'incomplete').length,
    complete: (solutions || []).filter(s => s.pattern_fit?.state === 'complete').length,
  }), [solutions]);

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/controls" />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Security solutions <HelpDot k="security_solutions.title" placement="bottom" /></h1>
            {solutions && (
              <span className={styles.subtitle}>
                {filtered.length} security solution{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== solutions.length && ` (of ${solutions.length})`}
              </span>
            )}
          </div>
          {canEdit && (
            <button className={styles.btnPrimary} onClick={() => navigate('/security-solutions/new')}>
              + New security solution
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          A security solution is one way of delivering control objectives: a set of parts, each on the system itself, on a
          security system, or once for the organisation. Each is grouped by the <Link to="/security-solution-patterns">pattern</Link> it
          implements and checked against it: a green part is recorded, a red dashed part is required and missing, a grey
          one is not needed in this form. The check is a report; it changes no objective&rsquo;s state.
        </p>

        <div className={styles.filterBar}>
          <input className={styles.searchInput} placeholder="Search by name, objective or part…"
            value={search} onChange={e => setSearch(e.target.value)} aria-label="Search security solutions" />
          <div className={own.filters} role="group" aria-label="Against its pattern">
            {FILTERS.map(f => (
              <button key={f.key} type="button" aria-pressed={fitFilter === f.key}
                className={fitFilter === f.key ? styles.chipActive : styles.chip}
                onClick={() => setParam('fit', f.key)}>
                {f.label}{f.key && solutions ? ` · ${counts[f.key]}` : ''}
              </button>
            ))}
          </div>
        </div>
        {onlyPattern && (
          <p className={styles.subtitle}>
            Showing {groups[0]?.title || onlyPattern} only.{' '}
            <button type="button" className={own.linkBtn} onClick={() => setParam('pattern', '')}>Show every pattern</button>
          </p>
        )}

        {!solutions && !error && <div className={styles.loadingBar} />}
        {error && <p className={styles.errorMsg} role="alert">{error}</p>}
        {solutions && groups.length === 0 && <p className={styles.empty}>No security solutions match.</p>}

        {solutions && groups.map(g => {
          const gap = commonestGap(g.rows);
          return (
            <section key={g.key} className={own.group} aria-labelledby={`group-${g.key}`}>
              <div className={own.groupHead}>
                <h2 id={`group-${g.key}`} className={own.groupTitle}>
                  {g.pattern ? <Link to={`/security-solution-patterns#${g.key}`}>{g.title}</Link> : g.title}
                </h2>
                <span className={styles.subtitle}>{g.rows.length} solution{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              {gap && <p className={own.finding}><b>{gap.n} of {g.rows.length} have no {gap.label.toLowerCase()}.</b></p>}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Security solution <HelpDot k="col.solution" placement="bottom" /></th>
                      <th className={styles.th}>Delivers <HelpDot k="security_solutions.col.delivers" placement="bottom" /></th>
                      <th className={styles.th}>Against its pattern <HelpDot k="security_solutions.col.pattern_fit" placement="bottom" /></th>
                      <th className={styles.th}>In place on <HelpDot k="security_solutions.col.in_place_on" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(s => {
                      const isSelected = selectedId === s.id;
                      return (
                        <Fragment key={s.id}>
                          <tr className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`} onClick={() => toggle(s.id)}>
                            <td className={styles.tdName}>
                              <span className={styles.threatName}><PatternChip kind="solution" iconOnly /> {s.name}</span>
                              {s.notes && <span className={styles.threatDesc}>{s.notes}</span>}
                            </td>
                            <td className={styles.tdMeta}>
                              {s.objectives.length} objective{s.objectives.length !== 1 ? 's' : ''}
                              {s.objectives.length > 0 && (
                                <span className={styles.threatDesc}>
                                  {s.objectives.slice(0, 3).map(o => o.reference_code || o.title).join(', ')}
                                  {s.objectives.length > 3 && `, +${s.objectives.length - 3}`}
                                </span>
                              )}
                            </td>
                            <td className={styles.tdMeta}><PatternFitChips fit={s.pattern_fit} /></td>
                            <td className={styles.tdUsage}>
                              <span className={styles.usageBadge}>{s.systems_in_place} system{s.systems_in_place !== 1 ? 's' : ''}</span>
                            </td>
                          </tr>
                          {isSelected && (
                            <tr className={styles.summaryRow} ref={summaryRowRef}>
                              <td colSpan={4} className={styles.summaryCell}>
                                <SecuritySolutionSummaryCard solution={s} openHref={`/security-solutions/${s.id}`} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}

// The required slot most often missing in a group, when any is.
export function commonestGap(rows) {
  const n = {};
  for (const s of rows) for (const slot of s.pattern_fit?.slots || []) if (slot.state === 'missing') n[slot.label] = (n[slot.label] || 0) + 1;
  const [label, count] = Object.entries(n).sort((a, b) => b[1] - a[1])[0] || [];
  return label ? { label, n: count } : null;
}
