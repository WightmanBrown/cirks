// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { enrichKnowledge, searchArchitecture } from '../api';
import { Shell } from '../components/Shell';
import { Spinner } from '../components/Spinner';
import { CiaChipGroup } from '../components/CiaChipGroup';
import { RatingChip } from '../components/RatingChip';
import { useViewMode } from '../hooks/useViewMode';
import { EntityKind } from '../components/EntityKind';
import styles from './KnowledgeSearchPage.module.css';

const ENTITY_CONFIG = {
  service:    { label: 'Business Service',    path: id => `/services/${id}`,   graphType: 'service' },
  asset:      { label: 'Information Asset',   path: id => `/assets/${id}`,     graphType: 'asset' },
  system:     { label: 'System',              path: id => `/systems/${id}`,    graphType: 'system' },
  people:     { label: 'People & Groups',     path: id => `/components/${id}`, graphType: 'component' },
  process:    { label: 'Process',             path: id => `/components/${id}`, graphType: 'component' },
  technology: { label: 'Technology',          path: id => `/components/${id}`, graphType: 'component' },
  facility:   { label: 'Facility',            path: id => `/components/${id}`, graphType: 'component' },
  risk:       { label: 'Risk',                path: id => `/risks/${id}`,      graphType: 'risk' },
  action:     { label: 'Security Action',     path: id => `/actions/${id}`,    graphType: 'action' },
  threat:     { label: 'Threat',              path: id => `/threats/${id}`,    graphType: 'threat' },
  control:    { label: 'Control',             path: id => `/controls/${id}`,   graphType: 'control' },
};


// ── Chips of interest ────────────────────────────────────────────────────────
// Deliberately 1-DIMENSIONAL: one impact figure and one risk figure, never the
// C/I/A triple. This is a triage summary — the reader clicks through for the
// detail. bil_1d is the MAX across C/I/A (the "1dBIL" of the impact-table
// vocabulary); risk_1d is the worst live risk score reachable from the row.
function EntityChips({ item, isExpert }) {
  const bil  = item.bil_1d;
  const risk = item.risk_1d;
  const vuln = item.is_vulnerable;
  if (bil == null && risk == null && !vuln) return null;
  return (
    <span className={styles.chipStrip}>
      {bil != null && (
        <span className={styles.chipCell} title="Highest business impact level (max of C/I/A)">
          <span className={styles.chipCap}>BIL</span>
          <RatingChip value={bil} scale="impact" variant={isExpert ? 'number' : 'word'} />
        </span>
      )}
      {risk != null && (
        <span className={styles.chipCell} title="Worst active risk score">
          <span className={styles.chipCap}>Risk</span>
          <RatingChip value={risk} scale="risk" variant={isExpert ? 'number' : 'word'} />
        </span>
      )}
      {vuln && (
        <span
          className={styles.vulnChip}
          title="Named on an active risk as a reason the threat succeeds (Risk detail → Vulnerable System Components)"
        >vulnerable</span>
      )}
      {vuln && item.component_status && item.component_status !== 'operational' && (
        <span className={styles.statusChip} title="Component status">{item.component_status}</span>
      )}
    </span>
  );
}

export function KnowledgeSearchPage() {
  const { isExpert } = useViewMode();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ]               = useState(params.get('q') || '');
  const [archResult, setArch]   = useState(null);
  const [enrichResult, setEnrich] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function runSearch(term) {
    const value = (term ?? q).trim();
    if (!value) return;
    setLoading(true); setError(''); setArch(null); setEnrich(null);
    try {
      const [arch, enr] = await Promise.allSettled([
        searchArchitecture(value),
        enrichKnowledge(value),
      ]);
      if (arch.status === 'fulfilled') setArch(arch.value);
      if (enr.status  === 'fulfilled') setEnrich(enr.value);
      if (arch.status === 'rejected' && enr.status === 'rejected') {
        setError('Search failed — please try again.');
      }
      setParams(value ? { q: value } : {}, { replace: true });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) { e.preventDefault(); runSearch(); }

  const hasArch   = archResult && archResult.total > 0;
  const hasHosts  = enrichResult?.matched;
  const hasResult = archResult || enrichResult;
  const noResults = hasResult && !hasArch && !hasHosts;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Knowledge search<EntityKind kind="architecture" /></h1>
          <p className={styles.subtitle}>
            Search across business services, information assets, systems, components,
            risks, security actions, threats, and controls — results are scoped to what
            you have access to. IP addresses and hostnames also resolve to the systems
            and risks they belong to.
          </p>
        </div>

        <form className={styles.searchBar} onSubmit={handleSubmit}>
          <input
            className={styles.searchInput}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Finance   ·   CRM   ·   10.0.4.12   ·   dc01.corp.local"
            autoFocus
            spellCheck={false}
          />
          <button type="submit" className={styles.searchBtn} disabled={loading || !q.trim()}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && <p className={styles.error}>⚠ {error}</p>}
        {loading && <div className={styles.loadingState}><Spinner /><span>Searching…</span></div>}

        {!loading && noResults && (
          <div className={styles.noMatch}>
            <span className={styles.noMatchIcon}>∅</span>
            <div>
              <p className={styles.noMatchTitle}>No results for "{archResult?.query}".</p>
              <p className={styles.noMatchHint}>
                Try a different name, department, or — for network lookup — an IP address or hostname.
              </p>
            </div>
          </div>
        )}

        {!loading && hasResult && (
          <div className={styles.results}>
            {/* Architecture entity results */}
            {hasArch && (
              <>
                {archResult.services.length > 0 && (
                  <EntitySection title="Business Services" items={archResult.services} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.assets.length > 0 && (
                  <EntitySection title="Information Assets" items={archResult.assets} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.systems.length > 0 && (
                  <EntitySection title="Systems" items={archResult.systems} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.components.length > 0 && (
                  <EntitySection title="System Components" items={archResult.components} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.risks?.length > 0 && (
                  <EntitySection title="Risks" items={archResult.risks} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.actions?.length > 0 && (
                  <EntitySection title="Security Actions" items={archResult.actions} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.threats?.length > 0 && (
                  <EntitySection title="Threats" items={archResult.threats} navigate={navigate} isExpert={isExpert} />
                )}
                {archResult.controls?.length > 0 && (
                  <EntitySection title="Controls" items={archResult.controls} navigate={navigate} isExpert={isExpert} />
                )}
              </>
            )}

            {/* SOC enrichment — hosts + systems at risk */}
            {hasHosts && (
              <>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    Matched host{enrichResult.hosts.length !== 1 ? 's' : ''}
                    <span className={styles.count}>{enrichResult.hosts.length}</span>
                  </h2>
                  <div className={styles.hostList}>
                    {enrichResult.hosts.map(h => (
                      <div key={h.id} className={styles.hostCard}>
                        <span className={styles.hostName}>{h.name}</span>
                        {h.hostname && <span className={styles.hostFqdn}>{h.hostname}</span>}
                        {h.matched_ips?.length > 0 && (
                          <span className={styles.hostIps}>
                            {h.matched_ips.map(ip => <span key={ip} className={styles.ipChip}>{ip}</span>)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    System{enrichResult.systems.length !== 1 ? 's' : ''} at risk
                    <span className={styles.count}>{enrichResult.systems.length}</span>
                  </h2>
                  {enrichResult.systems.length === 0 ? (
                    <p className={styles.empty}>The matched host(s) are not linked to any active system.</p>
                  ) : (
                    <div className={styles.sysTable}>
                      <div className={`${styles.sysRow} ${styles.sysHead}`}>
                        <span>System</span>
                        <span>Department</span>
                        <span className={styles.colCia}>Impact (C/I/A)</span>
                        <span className={styles.colRisk}>Max risk</span>
                        <span />
                      </div>
                      {enrichResult.systems.map(s => (
                        <div key={s.id} className={styles.sysRow}>
                          <span className={styles.sysName}>
                            {s.name}
                            {s.via_hosts?.length > 0 && (
                              <span className={styles.viaHosts}>via {s.via_hosts.join(', ')}</span>
                            )}
                          </span>
                          <span className={styles.sysDept}>{s.department_name || '—'}</span>
                          <span className={styles.colCia}>
                            <CiaChipGroup c={s.impact.c} i={s.impact.i} a={s.impact.a} />
                          </span>
                          <span className={styles.colRisk}>
                            {s.risk.max_score != null ? (
                              <span className={styles.riskCell}>
                                <RatingChip value={s.risk.max_score} scale="risk" variant="number" />
                                <span className={styles.bandWord}>{s.risk.band}</span>
                                <span className={styles.activeCount}>{s.risk.active_count} active</span>
                              </span>
                            ) : (
                              <span className={styles.noRisk}>no active risks</span>
                            )}
                          </span>
                          <span className={styles.sysActions}>
                            <button className={styles.linkBtn} onClick={() => navigate(`/systems/${s.id}`)}>System →</button>
                            <button className={styles.linkBtn} onClick={() => navigate(`/risks/current?system=${s.id}`)}>Risks →</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function EntitySection({ title, items, navigate, isExpert }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title}
        <span className={styles.count}>{items.length}</span>
      </h2>
      <div className={styles.entityList}>
        {items.map(item => {
          const cfg = ENTITY_CONFIG[item.entity_type];
          return (
            <div
              key={item.id}
              className={styles.entityRow}
              role="button"
              tabIndex={0}
              onClick={() => navigate(cfg.path(item.id))}
              onKeyDown={e => e.key === 'Enter' && navigate(cfg.path(item.id))}
            >
              <span className={styles.entityType}>{cfg?.label ?? item.entity_type}</span>
              <span className={styles.entityName}>{item.name}</span>
              <EntityChips item={item} isExpert={isExpert} />
              {item.department_name && (
                <span className={styles.entityDept}>{item.department_name}</span>
              )}
              {cfg?.graphType && (
                <button
                  type="button"
                  className={styles.graphBtn}
                  title="Explore this item's connections as a graph"
                  aria-label="Explore in graph"
                  onClick={(e) => { e.stopPropagation(); navigate(`/knowledge/graph/${cfg.graphType}/${item.id}`); }}
                >
                  <svg className={styles.graphIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="5" cy="6" r="2.4" />
                    <circle cx="19" cy="7" r="2.4" />
                    <circle cx="12" cy="18" r="2.4" />
                    <line x1="6.9" y1="7.4" x2="10.3" y2="16" />
                    <line x1="13.7" y1="16.4" x2="17.2" y2="8.6" />
                    <line x1="7.3" y1="6.3" x2="16.7" y2="6.8" />
                  </svg>
                  <span>Graph</span>
                </button>
              )}
              {item.description && (
                <span className={styles.entityDesc}>{item.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
