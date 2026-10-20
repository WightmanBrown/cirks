// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listSecuritySolutions } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { SecuritySolutionSummaryCard } from '../components/SecuritySolutionSummaryCard';
import { PatternChip } from '../components/PatternChip';
import styles from './ThreatsPage.module.css';

// The security solutions library from the solution's side (v147). An objective's
// page lists the solutions that can deliver it; this page lists each solution
// once with every objective it delivers — CrowdStrike EDR is one solution for
// six objectives, not six. Rows unfold to the summary card (?selected=), which
// links to the solution's own page.
export function SecuritySolutionsPage() {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('controls.write');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected');
  const summaryRowRef = useRef(null);
  const [solutions, setSolutions] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listSecuritySolutions().then(setSolutions).catch(() => setError('Could not load the security solutions.'));
  }, []);

  useEffect(() => {
    if (selectedId && solutions) summaryRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selectedId, solutions]);

  const toggle = (id) => {
    if (selectedId === id) searchParams.delete('selected'); else searchParams.set('selected', id);
    setSearchParams(searchParams, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(solutions || [])].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter(s => s.name.toLowerCase().includes(q)
      || s.objectives.some(o => `${o.reference_code || ''} ${o.title}`.toLowerCase().includes(q))
      || s.parts.some(p => p.component_name.toLowerCase().includes(q)));
  }, [solutions, search]);


  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/controls" />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Security solutions</h1>
            {solutions && (
              <span className={styles.subtitle}>
                {filtered.length} security solution{filtered.length !== 1 ? 's' : ''}
                {search && solutions.length !== filtered.length && ` (of ${solutions.length})`}
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
          A security solution is one way of delivering control objectives — a set of parts, each on the system itself, on
          a security system, or once for the organisation. One solution can deliver several objectives, so it is defined
          once here and shared. Each objective&rsquo;s page lists the solutions that can deliver it.
        </p>

        <div className={styles.filterBar}>
          <input className={styles.searchInput} placeholder="Search by name, objective or part…"
            value={search} onChange={e => setSearch(e.target.value)} aria-label="Search security solutions" />
        </div>

        {!solutions && !error && <div className={styles.loadingBar} />}
        {error && <p className={styles.errorMsg} role="alert">{error}</p>}

        {solutions && (filtered.length === 0 ? <p className={styles.empty}>No security solutions match.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Security solution</th>
                  <th className={styles.th}>Delivers</th>
                  <th className={styles.th}>Component parts</th>
                  <th className={styles.th}>In place on</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
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
                        <td className={styles.tdMeta}>
                          {s.kind === 'supplier' ? 'Provided by the supplier' : `${s.parts.length} component part${s.parts.length !== 1 ? 's' : ''}`}
                        </td>
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
        ))}
      </div>
    </Shell>
  );
}
