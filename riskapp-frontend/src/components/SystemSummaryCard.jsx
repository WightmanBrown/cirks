// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { levelClass, scoreLevel } from '../utils/riskColors';
import { isShared } from './SharedComponentChip';
import { RiskPath } from './RiskPath';
import { Gap } from './Gap';
import { EntitySummaryCard } from './EntitySummaryCard';
import { CiaContributionTable } from './CiaContributionTable';
import styles from './EntitySummaryCard.module.css';

function RiskPill({ level }) {
  if (!level) {
    return <span className={styles.riskPillNone}>no risk rated</span>;
  }
  return (
    <span className={`${styles.riskPill} ${levelClass(level)}`}>
      Risk: {level}
    </span>
  );
}

export function SystemSummaryCard({ system, openHref, isExpert = true, showRiskPath = true }) {
  if (!system) return null;

  const hasOwner = !!system.owner_name;
  const hasDesc  = !!(system.description && system.description.trim());

  const linkedAssets   = Array.isArray(system.information_assets) ? system.information_assets : null;
  const components     = Array.isArray(system.components) ? system.components : null;
  // The same count as the Components tab: the system's own components, not the
  // organisation-wide ones it shares.
  const componentCount = components ? components.filter(c => !isShared(c)).length : (system.component_count ?? 0);

  return (
    <EntitySummaryCard
      name={system.name}
      kind="system"
      helpKey="system_card.title"
      openHref={openHref}
      rightSlot={<RiskPill level={(() => { const sc = system.max_risk_score ?? system.top_risk?.risk_score; return sc != null ? scoreLevel(sc) : null; })()} />}
      meta={
        <>
          {system.department_name && (
            <span className={styles.metaChip}>{system.department_name}</span>
          )}
          {!system.is_active && (
            <span className={styles.inactiveBadge}>Inactive</span>
          )}
          {hasOwner
            ? <span className={styles.metaLine}>Owner: {system.owner_name}</span>
            : <Gap label="No owner assigned" />}
        </>
      }
    >
      {system.impact_changed_in_cycle && (
        <div className={styles.warnBanner}>
          Impact values have changed within the current review cycle — review risk assessments.
        </div>
      )}

      <CiaContributionTable
        c={system.impact_c}
        i={system.impact_i}
        a={system.impact_a}
        assets={linkedAssets}
        emptyLabel="No information assets linked — system CIA cannot be derived"
        isExpert={isExpert}
      />

      {showRiskPath && (
        <RiskPath
          paths={Array.isArray(system.risk_paths) ? system.risk_paths : null}
          emptyMessage="No active risks on this system."
          helpKey="system_card.risk_path"
        />
      )}

      <div className={styles.body}>
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Description</span>
          <span className={styles.bodyValue}>
            {hasDesc ? system.description : <Gap label="No description" />}
          </span>
        </div>

        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Components</span>
          <span className={styles.bodyValue}>
            {componentCount === 0
              ? <Gap label="No components linked" />
              : <>{componentCount} component{componentCount === 1 ? '' : 's'} linked</>
            }
          </span>
        </div>
      </div>
    </EntitySummaryCard>
  );
}
