// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { levelClass, scoreLevel } from '../utils/riskColors';
import styles from './EntitySummaryCard.module.css';

function pickWorst(paths) {
  if (!paths || paths.length === 0) return null;
  return [...paths].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))[0];
}

function pathSegments(p) {
  return [
    p.asset_name  && { name: p.asset_name,  kind: 'information asset' },
    p.system_name && { name: p.system_name, kind: 'system' },
    p.threat_name && { name: p.threat_name, kind: 'threat' },
  ].filter(Boolean);
}

function Node({ name, kind }) {
  return (
    <div className={styles.riskPathNode} title={name}>
      <span className={styles.riskPathNodeName}>{name}</span>
      <span className={styles.riskPathNodeKind}>{kind}</span>
    </div>
  );
}

export function RiskPath({ paths, label = 'Highest risk path', emptyMessage = 'No active risks contributing.' }) {
  if (paths == null) {
    return (
      <div className={styles.riskPathSection}>
        <div className={styles.riskPathHeader}>
          <span className={styles.riskPathLabel}>{label}</span>
        </div>
        <span className={styles.riskPathEmpty}>Open details to see risk path.</span>
      </div>
    );
  }
  if (paths.length === 0) {
    return (
      <div className={styles.riskPathSection}>
        <div className={styles.riskPathHeader}>
          <span className={styles.riskPathLabel}>{label}</span>
        </div>
        <span className={styles.riskPathEmpty}>{emptyMessage}</span>
      </div>
    );
  }

  const worst = pickWorst(paths);
  const more  = paths.length - 1;
  const segments = pathSegments(worst);

  return (
    <div className={styles.riskPathSection}>
      <div className={styles.riskPathHeader}>
        <span className={styles.riskPathLabel}>{label}</span>
        {more > 0 && (
          <span className={styles.riskPathMore}>+{more} more risk{more === 1 ? '' : 's'}</span>
        )}
      </div>
      <div className={styles.riskPathStrip}>
        {segments.map((seg, idx) => (
          <span key={`${seg.kind}-${idx}`} style={{ display: 'contents' }}>
            <Node name={seg.name} kind={seg.kind} />
            <span className={styles.riskPathArrow} aria-hidden="true">→</span>
          </span>
        ))}
        <span className={`${styles.riskPill} ${levelClass(scoreLevel(worst.risk_score))}`}>
          {scoreLevel(worst.risk_score)}
        </span>
      </div>
    </div>
  );
}
