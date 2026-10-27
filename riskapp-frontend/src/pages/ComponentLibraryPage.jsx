// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link }            from 'react-router-dom';
import React                            from 'react';
import { listComponents, getComponent } from '../api';
import { useAuth }          from '../context/AuthContext';
import { Shell }            from '../components/Shell';
import { BackButton }       from '../components/BackButton';
import { useSelectedRow }   from '../hooks/useSelectedRow';
import { useTableSort }     from '../hooks/useTableSort';
import { SortableTh }       from '../components/SortableTh';
import { scoreLevel }       from '../utils/riskColors';
import { getComponentColor } from '../utils/componentColors';
import styles               from './ComponentLibraryPage.module.css';
import { componentStatusLabel } from '../utils/componentTypes';
import { ComponentModal } from '../components/ComponentModal';
import { HelpDot } from '../components/HelpDot';


// Status is a health ladder, not a word list, so it sorts by how much attention
// the component wants rather than alphabetically (which would read
// degraded → non-operational → operational → unknown and mean nothing).
// Ascending = healthiest first; click again for the ones that need work.
export const STATUS_RANK = { operational: 0, unknown: 1, degraded: 2, non_operational: 3 };

// `null` for anything the row renders as a blank/dash — useTableSort always
// sinks those to the bottom, in either direction, so an empty cell never
// outranks a real value.
export const SORT_ACCESSORS = {
  name:       (c) => c.name,
  status:     (c) => STATUS_RANK[c.effective_status || c.status] ?? STATUS_RANK.unknown,
  kind:       (c) => c.document_kind || null,
  review:     (c) => c.document_next_review || null,
  // An organisation-wide component (v137) has no per-system count — it exists
  // once — so it sorts above every count rather than among them.
  systems:    (c) => (c.instantiation === 'organisational' ? Number.MAX_SAFE_INTEGER : (c.systems?.length || null)),
  supports:   (c) => c.controls?.length || null,
  // The two vulnerability columns sort on different halves of the same fact, so
  // each click buys you something: how MANY risks name this component, and how
  // bad the worst of them is.
  vulnerable: (c) => c.vulnerable_risk_count || null,
  risk:       (c) => c.vulnerable_max_score,
};

const BY_NAME = (a, b) => a.name.localeCompare(b.name);

// Small inline risk-band chip — no external dep needed.
// The DIRECT signal: an analyst named this component on a risk as a reason the
// threat succeeds. Distinct from RiskChip below, which shows the worst risk on
// any system the component happens to sit in — that lights up 110 of 155
// components and discriminates poorly; this one selects the handful someone has
// actually judged to be part of the problem.
function VulnerableChip({ count, maxScore }) {
  if (!count) return null;
  const level = maxScore == null ? null : scoreLevel(maxScore);
  return (
    <span
      className={`${styles.vulnChip} ${level ? styles[`risk_${level}`] : ''}`}
      title={`Named as a reason the threat succeeds on ${count} active risk${count === 1 ? '' : 's'}`
             + (maxScore != null ? ` — worst scores ${maxScore}` : '')}
    >
      vulnerable{count > 1 ? ` ×${count}` : ''}
    </span>
  );
}

function RiskChip({ score }) {
  if (score == null) return <span className={styles.noRisk}>no risks</span>;
  const level = scoreLevel(score);
  return <span className={`${styles.riskChip} ${styles[`risk_${level}`]}`}>{level} {score}</span>;
}

// The "Risk score" column. Two columns, two questions, and they are NOT the
// same one:
//
//   Vulnerable  how many active risks NAME this component as a reason the
//               threat succeeds
//   Risk score  how bad the worst of THOSE risks is
//
// It deliberately does not show the worst risk on any system the component
// happens to sit in, which is what it used to show. That lit up 110 of 155
// components, and on CIRKS-test it reported IT Administrators as a 25 when the
// risk actually naming it scores 12 — someone else's risk, printed against this
// row. A number under a column header reads as a property of the row, so
// proximity to a risk cannot go there. The summary card below still shows the
// system-level worst, because there it is labelled "N systems · max risk" and
// sits beside the per-system chips, where proximity is the point.
function NamedRiskCell({ score, count }) {
  if (score == null) return <span className={styles.muted}>—</span>;
  const level = scoreLevel(score);
  return (
    <span
      className={`${styles.riskChip} ${styles[`risk_${level}`]}`}
      title={`Worst of the ${count} active risk${count === 1 ? '' : 's'} naming this component`}
    >
      {level} {score}
    </span>
  );
}

function ComponentSummaryCard({ component, detail, openHref, onEdit, canEdit }) {
  const navigate = useNavigate();
  const col = getComponentColor(component.component_type);

  const systems = detail?.systems ?? component.systems ?? [];
  const maxRisk = detail
    ? (systems.length ? Math.max(...systems.map(s => s.max_risk_score ?? 0).filter(Boolean)) || null : null)
    : component.max_risk_score ?? null;
  // Only the detail fetch carries these; the list row knows the count but not
  // which risks, so the pills appear once the row's detail has loaded.
  const vulnerableOn = detail?.vulnerable_on ?? [];

  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLeft}>
        <span
          className={styles.typeDot}
          style={{ background: col.bg, borderColor: col.border }}
          title={component.component_type}
        />
        <div className={styles.summaryMeta}>
          <span className={styles.summaryName}>{component.name}</span>
          {component.description && (
            <span className={styles.summaryDesc}>{component.description}</span>
          )}
          <div className={styles.summaryTags}>
            <span className={`${styles.statusTag} ${styles[`status_${component.status}`] || ''}`}>
              {componentStatusLabel(component.component_type, component.status)}
            </span>
            {component.is_host && (
              <span className={styles.hostTag}>
                HOST{component.ip_addresses?.length ? ` · ${component.ip_addresses.length} IP${component.ip_addresses.length !== 1 ? 's' : ''}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The risks this component was NAMED on. Each is a link, so the flow the
          list exists for — spot a component with a problem, find out which risk
          — completes here rather than requiring a hunt through the register. */}
      {vulnerableOn.length > 0 && (
        <div className={styles.summaryVuln}>
          <span className={styles.systemsLabel}>
            Named as a vulnerability on {vulnerableOn.length} risk{vulnerableOn.length !== 1 ? 's' : ''}
          </span>
          <div className={styles.systemsList}>
            {vulnerableOn.slice(0, 4).map(v => (
              <button
                key={v.risk_id}
                type="button"
                className={styles.vulnRiskPill}
                onClick={e => { e.stopPropagation(); navigate(`/risks/${v.risk_id}`); }}
                title={`${v.threat_name} on ${v.system_name} — open the risk`}
              >
                {v.threat_name} <span className={styles.vulnRiskOn}>on {v.system_name}</span>
                {v.risk_score != null && <RiskChip score={v.risk_score} />}
              </button>
            ))}
            {vulnerableOn.length > 4 && (
              <span className={styles.moreSystems}>+{vulnerableOn.length - 4} more</span>
            )}
          </div>
        </div>
      )}

      <div className={styles.summarySystems}>
        {systems.length === 0 ? (
          <span className={styles.noSystems}>Not linked to any systems</span>
        ) : (
          <>
            <span className={styles.systemsLabel}>
              {systems.length} system{systems.length !== 1 ? 's' : ''}
              {maxRisk != null && <> · max risk <RiskChip score={maxRisk} /></>}
            </span>
            <div className={styles.systemsList}>
              {systems.slice(0, 5).map(s => (
                <span key={s.id} className={styles.systemPill}>
                  {s.name}
                  {s.max_risk_score != null && <RiskChip score={s.max_risk_score} />}
                </span>
              ))}
              {systems.length > 5 && (
                <span className={styles.moreSystems}>+{systems.length - 5} more</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.summaryActions}>
        {canEdit && (
          <button className={styles.btnSecondary} onClick={e => { e.stopPropagation(); onEdit(); }}>
            Edit
          </button>
        )}
        <button className={styles.btnPrimary} onClick={e => { e.stopPropagation(); navigate(openHref); }}>
          Open details →
        </button>
      </div>
    </div>
  );
}

// `supportsControls` swaps the "Linked systems" column for the control objectives
// the component helps deliver — the useful fact for a policy or document, which
// belongs to the objectives it supports rather than to any system. `intro` is a
// short explanation under the heading.
// `helpKey` is the ⓘ on the page title — each wrapper passes its own literal key.
export default function ComponentLibraryPage({ componentType, title, singular, supportsControls = false, intro = null, helpKey = null }) {
  // The capability, not a list of role names: the Security Architect holds
  // components.write and was missing from the list this used to be.
  const { hasCapability } = useAuth();
  const canCreate = hasCapability('components.write');

  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState(null);
  const [detailCache, setDetailCache] = useState({});

  const { selectedId, toggleSelect, summaryRowRef } = useSelectedRow(loading);

  // The catalogue is shared org-wide and has no owning department, so anyone
  // who may create a component may edit any of them — see
  // docs/component-ownership.md.
  const canEditComponent = () => canCreate;

  function load() {
    setLoading(true);
    listComponents(componentType)
      .then(setItems)
      .catch(err => setError(err.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [componentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-fetch full detail (systems + risks) when a row is expanded.
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return;
    let cancelled = false;
    getComponent(selectedId)
      .then(d => { if (!cancelled) setDetailCache(prev => ({ ...prev, [selectedId]: d })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, detailCache]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const { sorted, sortKey, sortDir, toggleSort } =
    useTableSort(filtered, { accessors: SORT_ACCESSORS, defaultCompare: BY_NAME });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  function handleSaved() {
    setShowAdd(false);
    setEditing(null);
    load();
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{title}{helpKey && <> <HelpDot k={helpKey} placement="bottom" /></>}</h1>
            {!loading && (
              <span className={styles.subtitle}>
                {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                {search && items.length !== filtered.length && ` (of ${items.length})`}
              </span>
            )}
          </div>
          {canCreate && (
            <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
              + New {singular}
            </button>
          )}
        </div>
        {intro && <p className={styles.intro}>{intro}</p>}

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            placeholder={`Search ${title.toLowerCase()}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className={styles.muted}>Loading…</p>}
        {error   && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && (
          sorted.length === 0
            ? <p className={styles.muted}>No {title.toLowerCase()} found.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortableTh column="name"       className={styles.th} {...sortProps} helpKey="col.name">Name</SortableTh>
                    <SortableTh column="status"     className={styles.th} {...sortProps} helpKey="components.col.status">Status</SortableTh>
                    {supportsControls
                      ? <SortableTh column="supports" className={styles.th} {...sortProps} helpKey="policies.col.supports">Supports</SortableTh>
                      : <SortableTh column="systems"  className={styles.th} {...sortProps} helpKey="components.col.linked_systems">Linked systems</SortableTh>}
                    {supportsControls ? (<>
                      <SortableTh column="kind"   className={styles.th} {...sortProps} helpKey="policies.col.kind">Kind</SortableTh>
                      <SortableTh column="review" className={styles.th} {...sortProps} helpKey="policies.col.next_review">Next review</SortableTh>
                    </>) : (<>
                      <SortableTh column="vulnerable" className={styles.th} {...sortProps} helpKey="components.col.vulnerable">Vulnerable</SortableTh>
                      <SortableTh column="risk"       className={styles.th} {...sortProps} helpKey="components.col.risk_score">Risk score</SortableTh>
                    </>)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => {
                    const isSelected = selectedId === c.id;
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                          onClick={() => toggleSelect(c.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className={styles.td}>
                            <span className={styles.itemName}>{c.name}</span>
                            {c.description && (
                              <span className={styles.itemDesc}>{c.description}</span>
                            )}
                          </td>
                          <td className={`${styles.td} ${styles.tdMeta}`}>
                            <span className={`${styles.statusBadge} ${styles[`status_${c.effective_status || c.status}`] || ''}`}
                              title={c.review_overdue ? 'Past its review date, so it reads as Under review' : undefined}>
                              {componentStatusLabel(c.component_type, c.effective_status || c.status)}
                              {c.review_overdue && ' · overdue'}
                            </span>
                          </td>
                          <td className={`${styles.td} ${styles.tdMeta}`}>
                            {supportsControls ? (
                              c.controls?.length > 0
                                ? <span className={styles.supports}>
                                    {c.controls.map(ct => (
                                      <Link key={ct.id} to={`/controls/${ct.id}`} title={ct.title}
                                        onClick={e => e.stopPropagation()}>{ct.ref || ct.title}</Link>
                                    ))}
                                  </span>
                                : <span className={styles.muted} title="No control objective is delivered by it yet">none</span>
                            ) : c.instantiation === 'organisational'
                              // It exists once for the organisation (v137): a count of the
                              // systems relying on it would read as that many copies.
                              ? <span title={`Exists once for the organisation — ${c.systems?.length || 0} system${c.systems?.length === 1 ? '' : 's'} rely on it`}>organisation wide</span>
                              : c.systems?.length > 0
                              ? <span>{c.systems.length}</span>
                              : <span className={styles.muted}>—</span>}
                          </td>
                          {supportsControls ? (<>
                            <td className={`${styles.td} ${styles.tdMeta}`}>
                              {c.document_kind
                                ? <span className={c.document_kind === 'guideline' ? styles.muted : undefined}>
                                    {c.document_kind}{c.document_kind === 'guideline' && ' (advisory)'}
                                  </span>
                                : <span className={styles.muted}>—</span>}
                            </td>
                            <td className={`${styles.td} ${styles.tdMeta}`}>
                              {c.document_next_review
                                ? <span className={c.review_overdue ? styles.overdueDate : undefined}>
                                    {new Date(`${String(c.document_next_review).slice(0, 10)}T00:00:00`)
                                      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                : <span className={styles.muted} title="No review date recorded">none</span>}
                            </td>
                          </>) : (<>
                            <td className={`${styles.td} ${styles.tdMeta}`}>
                              <VulnerableChip count={c.vulnerable_risk_count} maxScore={c.vulnerable_max_score} />
                            </td>
                            <td className={`${styles.td} ${styles.tdMeta}`}>
                              <NamedRiskCell score={c.vulnerable_max_score}
                                             count={c.vulnerable_risk_count} />
                            </td>
                          </>)}
                        </tr>
                        {isSelected && (
                          <tr className={styles.summaryRow} ref={summaryRowRef}>
                            <td colSpan={5} className={styles.summaryCell}>
                              <ComponentSummaryCard
                                component={c}
                                detail={detailCache[c.id] || null}
                                openHref={`/components/${c.id}`}
                                canEdit={canEditComponent(c)}
                                onEdit={() => { setEditing(c); }}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )
        )}

        {(showAdd || editing) && (
          <ComponentModal
            componentType={componentType}
            singular={singular}
            existing={editing}
            onClose={() => { setShowAdd(false); setEditing(null); }}
            onSaved={handleSaved}
          />
        )}
      </div>
    </Shell>
  );
}
