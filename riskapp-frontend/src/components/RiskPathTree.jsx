// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { levelClass, scoreLevel } from '../utils/riskColors';
import { RatingChip } from './RatingChip';
import styles from './EntitySummaryCard.module.css';

// Business shows the band word, expert shows the score — the app-wide display
// model (utils/ratingScale.js). One component so every pill in this file obeys
// it and a new site cannot quietly forget; the tree used to hardcode the word
// in both modes, so expert mode silently lost the number it exists to show.
function RiskPill({ score, isExpert }) {
  if (score == null) return <span className={`${styles.riskPill} ${levelClass(scoreLevel(score))}`}>—</span>;
  return <RatingChip value={score} scale="risk" variant={isExpert ? 'number' : 'word'} />;
}

// Group paths by asset, then by system. Within each group keep the worst
// risk first so the tree reads top-down by severity.
function groupByAssetThenSystem(paths) {
  const byAsset = new Map();
  for (const p of paths) {
    if (!byAsset.has(p.asset_id)) {
      byAsset.set(p.asset_id, { asset_id: p.asset_id, asset_name: p.asset_name, systems: new Map(), worst: 0 });
    }
    const aGroup = byAsset.get(p.asset_id);
    aGroup.worst = Math.max(aGroup.worst, p.risk_score ?? 0);
    if (!aGroup.systems.has(p.system_id)) {
      aGroup.systems.set(p.system_id, { system_id: p.system_id, system_name: p.system_name, risks: [], worst: 0 });
    }
    const sGroup = aGroup.systems.get(p.system_id);
    sGroup.worst = Math.max(sGroup.worst, p.risk_score ?? 0);
    sGroup.risks.push(p);
  }
  // Null-safe: a path can carry no asset at all (v104 — a service reaches
  // risks through its SYSTEMS, and a dependency system holds none of the
  // department's information). An unguarded compare here blanked the page
  // the first time a service mixed both kinds.
  const assets = [...byAsset.values()].sort(
    (a, b) => b.worst - a.worst || (a.asset_name || '').localeCompare(b.asset_name || ''));
  for (const a of assets) {
    a.systemList = [...a.systems.values()].sort(
      (s1, s2) => s2.worst - s1.worst || (s1.system_name || '').localeCompare(s2.system_name || ''));
    for (const s of a.systemList) {
      s.risks.sort((r1, r2) => (r2.risk_score ?? 0) - (r1.risk_score ?? 0));
    }
  }
  return assets;
}

function ServiceTree({ paths, navigate, isExpert = false }) {
  const assets = groupByAssetThenSystem(paths);
  return (
    <div className={styles.riskTree} style={{ gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(180px, 1.5fr) auto' }}>
      <div className={styles.riskTreeHeader}>
        <span>Information asset</span>
        <span>System</span>
        <span>Threat</span>
        <span>Risk</span>
      </div>
      {assets.flatMap(asset =>
        asset.systemList.flatMap((sys, sIdx) =>
          sys.risks.map((r, rIdx) => {
            const isFirstSystemRow = sIdx === 0 && rIdx === 0;
            const isFirstRiskOfSystem = rIdx === 0;
            return (
              <div key={r.risk_id} style={{ display: 'contents' }}>
                {isFirstSystemRow ? (
                  <div className={styles.riskTreeAsset}>
                    <span className={styles.riskTreeName}>{asset.asset_name}</span>
                    <span className={styles.riskTreeKind}>information asset</span>
                  </div>
                ) : (
                  <div className={styles.riskTreeAsset} aria-hidden="true" />
                )}
                {isFirstRiskOfSystem ? (
                  <div className={styles.riskTreeSystem}>
                    <span className={styles.riskTreeName}>{sys.system_name}</span>
                    <span className={styles.riskTreeKind}>system</span>
                  </div>
                ) : (
                  <div className={styles.riskTreeSystem} aria-hidden="true" />
                )}
                <div
                  className={r.risk_id ? `${styles.riskTreeThreat} ${styles.riskTreeCellLink}` : styles.riskTreeThreat}
                  onClick={r.risk_id ? () => navigate(`/risks/${r.risk_id}`) : undefined}
                  role={r.risk_id ? 'link' : undefined}
                  tabIndex={r.risk_id ? 0 : undefined}
                  onKeyDown={r.risk_id ? e => e.key === 'Enter' && navigate(`/risks/${r.risk_id}`) : undefined}
                >
                  <span className={styles.riskTreeName}>{r.threat_name}</span>
                  <span className={styles.riskTreeKind}>threat</span>
                </div>
                <div
                  className={r.risk_id ? `${styles.riskTreePill} ${styles.riskTreeCellLink}` : styles.riskTreePill}
                  onClick={r.risk_id ? () => navigate(`/risks/${r.risk_id}`) : undefined}
                >
                  <RiskPill score={r.risk_score} isExpert={isExpert} />
                </div>
              </div>
            );
          })
        )
      )}
    </div>
  );
}

// System | Threat | Risk — for an entity (e.g. an information asset) whose
// risks live on the systems it belongs to. Grouped by system, worst-first.
function SystemTree({ paths, navigate, collapsed = false, isExpert = false }) {
  const bySystem = new Map();
  for (const p of paths) {
    if (!bySystem.has(p.system_id)) {
      bySystem.set(p.system_id, { system_id: p.system_id, system_name: p.system_name, risks: [], worst: 0 });
    }
    const g = bySystem.get(p.system_id);
    g.worst = Math.max(g.worst, p.risk_score ?? 0);
    g.risks.push(p);
  }
  const systems = [...bySystem.values()].sort(
    (a, b) => b.worst - a.worst || (a.system_name || '').localeCompare(b.system_name || '')
  );
  for (const s of systems) s.risks.sort((r1, r2) => (r2.risk_score ?? 0) - (r1.risk_score ?? 0));

  // Folded by default on arrival: a service with a dozen systems otherwise
  // opens as a wall of threat rows, and the question being asked on arrival is
  // "which system is worst", not "list everything". Each system states its
  // headline — worst risk and how many — and opens on demand.
  const [open, setOpen] = useState(() => new Set());
  const isOpen = (id) => (collapsed ? open.has(id) : true);
  const toggle = (id) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!collapsed) return <SystemGrid systems={systems} navigate={navigate} isExpert={isExpert} />;

  return (
    <div className={styles.riskFoldList}>
      {systems.map(sys => {
        const expanded = isOpen(sys.system_id);
        return (
          <div key={sys.system_id} className={styles.riskFoldGroup}>
            <button
              type="button"
              className={styles.riskFoldHeader}
              aria-expanded={expanded}
              onClick={() => toggle(sys.system_id)}
            >
              <span className={expanded ? styles.riskFoldChevronOpen : styles.riskFoldChevron} aria-hidden="true">▸</span>
              <span className={styles.riskFoldName}>{sys.system_name}</span>
              <span className={styles.riskFoldCount}>
                {sys.risks.length} risk{sys.risks.length === 1 ? '' : 's'}
              </span>
              <RiskPill score={sys.worst} isExpert={isExpert} />
            </button>

            {expanded && (
              <div className={styles.riskFoldBody}>
                {sys.risks.map(r => (
                  <div
                    key={r.risk_id}
                    className={r.risk_id ? `${styles.riskFoldRow} ${styles.riskTreeCellLink}` : styles.riskFoldRow}
                    onClick={r.risk_id ? () => navigate(`/risks/${r.risk_id}`) : undefined}
                    role={r.risk_id ? 'link' : undefined}
                    tabIndex={r.risk_id ? 0 : undefined}
                    onKeyDown={r.risk_id ? e => e.key === 'Enter' && navigate(`/risks/${r.risk_id}`) : undefined}
                  >
                    <span className={styles.riskFoldThreat}>{r.threat_name}</span>
                    <RiskPill score={r.risk_score} isExpert={isExpert} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The original always-open grid, kept for the pages that want the full list.
function SystemGrid({ systems, navigate, isExpert }) {
  return (
    <div className={styles.riskTree} style={{ gridTemplateColumns: 'minmax(160px, 1fr) minmax(180px, 1.5fr) auto' }}>
      <div className={styles.riskTreeHeader}>
        <span>System</span>
        <span>Threat</span>
        <span>Risk</span>
      </div>
      {systems.flatMap(sys =>
        sys.risks.map((r, rIdx) => (
          <div key={r.risk_id} style={{ display: 'contents' }}>
            {rIdx === 0 ? (
              <div className={styles.riskTreeSystem}>
                <span className={styles.riskTreeName}>{sys.system_name}</span>
                <span className={styles.riskTreeKind}>system</span>
              </div>
            ) : (
              <div className={styles.riskTreeSystem} aria-hidden="true" />
            )}
            <div
              className={r.risk_id ? `${styles.riskTreeThreat} ${styles.riskTreeCellLink}` : styles.riskTreeThreat}
              onClick={r.risk_id ? () => navigate(`/risks/${r.risk_id}`) : undefined}
              role={r.risk_id ? 'link' : undefined}
              tabIndex={r.risk_id ? 0 : undefined}
              onKeyDown={r.risk_id ? e => e.key === 'Enter' && navigate(`/risks/${r.risk_id}`) : undefined}
            >
              <span className={styles.riskTreeName}>{r.threat_name}</span>
              <span className={styles.riskTreeKind}>threat</span>
            </div>
            <div
              className={r.risk_id ? `${styles.riskTreePill} ${styles.riskTreeCellLink}` : styles.riskTreePill}
              onClick={r.risk_id ? () => navigate(`/risks/${r.risk_id}`) : undefined}
            >
              <RiskPill score={r.risk_score} isExpert={isExpert} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FlatTree({ paths, navigate, isExpert = false }) {
  const sorted = [...paths].sort(
    (a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)
  );
  return (
    <div className={styles.riskTree} style={{ gridTemplateColumns: 'minmax(220px, 1fr) auto' }}>
      <div className={styles.riskTreeHeader}>
        <span>Threat</span>
        <span>Risk</span>
      </div>
      {sorted.map(r => {
        const cellProps = r.risk_id ? {
          className: `${styles.riskTreeThreat} ${styles.riskTreeCellLink}`,
          onClick: () => navigate(`/risks/${r.risk_id}`),
          role: 'link',
          tabIndex: 0,
          onKeyDown: e => e.key === 'Enter' && navigate(`/risks/${r.risk_id}`),
        } : { className: styles.riskTreeThreat };
        const pillProps = r.risk_id ? {
          className: `${styles.riskTreePill} ${styles.riskTreeCellLink}`,
          onClick: () => navigate(`/risks/${r.risk_id}`),
        } : { className: styles.riskTreePill };
        return (
          <div key={r.risk_id} style={{ display: 'contents' }}>
            <div {...cellProps}>
              <span className={styles.riskTreeName}>{r.threat_name}</span>
              <span className={styles.riskTreeKind}>threat</span>
            </div>
            <div {...pillProps}>
              <RiskPill score={r.risk_score} isExpert={isExpert} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// groupBy: 'auto' (default) picks ServiceTree when paths carry an asset, else a
// flat Threat|Risk list. 'system' forces the System|Threat|Risk grouping (used
// by the information-asset detail page, whose risks span multiple systems).
export function RiskPathTree({ paths, title = 'Risk paths', groupBy = 'auto', collapsed = false, isExpert = false }) {
  const navigate = useNavigate();
  if (!paths || paths.length === 0) return null;
  // EVERY, not SOME: one asset-bearing path among many asset-less ones used
  // to select the asset-first tree for all of them — both wrong to read and
  // the shape that crashed. Mixed data falls through to the flat tree.
  const hasAsset = paths.every(p => p.asset_id);
  let tree;
  if (groupBy === 'system')   tree = <SystemTree  paths={paths} navigate={navigate} collapsed={collapsed} isExpert={isExpert} />;
  else if (hasAsset)          tree = <ServiceTree paths={paths} navigate={navigate} isExpert={isExpert} />;
  else                        tree = <FlatTree    paths={paths} navigate={navigate} isExpert={isExpert} />;
  return (
    <section>
      <h3 className={styles.riskTreeSectionTitle}>{title}</h3>
      {tree}
    </section>
  );
}
