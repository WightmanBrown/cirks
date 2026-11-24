// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RatingChip } from './RatingChip';
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

// `compact` (the system's own page, owner 2026-11-19): one header line. The
// maximum impact sits beside the risk as a chip, a changed impact is a tag, the
// description one line; the components and the C/I/A breakdown are the page's
// tabs, so they are not repeated here.
export function SystemSummaryCard({ system, openHref, isExpert = true, showRiskPath = true, compact = false }) {
  if (!system) return null;

  const hasOwner = !!system.owner_name;
  const hasDesc  = !!(system.description && system.description.trim());
  const maxImpact = [system.impact_c, system.impact_i, system.impact_a].some(v => v != null)
    ? Math.max(system.impact_c ?? 0, system.impact_i ?? 0, system.impact_a ?? 0) : null;

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
      rightSlot={<>
        {compact && maxImpact != null && (
          <span className={styles.compactImpact} title={`Maximum impact C${system.impact_c ?? '–'} I${system.impact_i ?? '–'} A${system.impact_a ?? '–'}`}>
            Impact <RatingChip value={maxImpact} scale="impact" variant={isExpert ? 'number' : 'word'} />
          </span>
        )}
        <RiskPill level={(() => { const sc = system.max_risk_score ?? system.top_risk?.risk_score; return sc != null ? scoreLevel(sc) : null; })()} />
      </>}
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
          {compact && system.impact_changed_in_cycle && (
            <span className={styles.compactChanged} title="Impact values have changed within the current review cycle: review the risk assessments.">
              impact changed this cycle
            </span>
          )}
        </>
      }
    >
      {compact ? (
        <p className={styles.compactDesc} title={hasDesc ? system.description : undefined}>
          {hasDesc ? system.description : <Gap label="No description" />}
        </p>
      ) : (<>
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
      </>)}
    </EntitySummaryCard>
  );
}
