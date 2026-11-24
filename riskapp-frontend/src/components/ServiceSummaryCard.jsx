// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RiskPath } from './RiskPath';
import { RatingChip } from './RatingChip';
import { levelClass, scoreLevel } from '../utils/riskColors';
import { Gap } from './Gap';
import { EntitySummaryCard } from './EntitySummaryCard';
import { CiaContributionTable } from './CiaContributionTable';
import styles from './EntitySummaryCard.module.css';

const SOURCE_LABEL = {
  none:   'No rated assets',
  assets: 'CIA derived from linked assets',
};

// `compact` (the service's own page, owner 2026-11-19): one header line, as
// on a system's page. The maximum impact and the worst risk sit on the right,
// the description is one line; the C/I/A breakdown and the impact tables are
// the page's tabs, so they are not repeated here.
export function ServiceSummaryCard({ service, openHref, isExpert = true, showRiskPath = true, compact = false }) {
  if (!service) return null;
  const maxImpact = [service.effective_c, service.effective_i, service.effective_a].some(v => v != null)
    ? Math.max(service.effective_c ?? 0, service.effective_i ?? 0, service.effective_a ?? 0) : null;
  const worst = (service.risk_paths || []).reduce((m, p) => Math.max(m, p.risk_score ?? 0), 0);
  const worstLevel = worst ? scoreLevel(worst) : null;

  const hasDesc = !!(service.description && service.description.trim());

  // Owner department only shown when distinct from the service's home dept
  // (i.e. the service has been adopted by another dept).
  const ownerDept = service.owner_department_name;
  const homeDept  = service.department_name;
  const showOwner = ownerDept && ownerDept !== homeDept;

  const linkedAssets = Array.isArray(service.linked_information_assets)
    ? service.linked_information_assets
    : null;
  const impactTableCount = Array.isArray(service.impact_tables)
    ? service.impact_tables.length
    : null;

  const sourceLabel = SOURCE_LABEL[service.cia_source];

  return (
    <EntitySummaryCard
      name={service.name}
      kind="business service"
      helpKey="service_card.title"
      openHref={openHref}
      rightSlot={compact ? <>
        {maxImpact != null && (
          <span className={styles.compactImpact} title={`Maximum impact C${service.effective_c ?? '–'} I${service.effective_i ?? '–'} A${service.effective_a ?? '–'}`}>
            Impact <RatingChip value={maxImpact} scale="impact" variant={isExpert ? 'number' : 'word'} />
          </span>
        )}
        {worstLevel
          ? <span className={`${styles.riskPill} ${levelClass(worstLevel)}`}>Risk: {worstLevel}</span>
          : <span className={styles.riskPillNone}>no risk rated</span>}
      </> : undefined}
      meta={
        <>
          {homeDept && <span className={styles.metaChip}>{homeDept}</span>}
          {service.is_shared && <span className={styles.metaChip}>Shared</span>}
          {service.adopted   && <span className={styles.metaChip}>Adopted</span>}
          {!service.is_active && (
            <span className={styles.inactiveBadge}>Inactive</span>
          )}
          {showOwner && (
            <span className={styles.metaLine}>Owner dept: {ownerDept}</span>
          )}
          {sourceLabel && (
            <span className={styles.metaLine}>{sourceLabel}</span>
          )}
        </>
      }
    >
      {compact ? (
        <p className={styles.compactDesc} title={hasDesc ? service.description : undefined}>
          {hasDesc ? service.description : <Gap label="No description" />}
        </p>
      ) : (<>
      {showRiskPath && <RiskPath paths={service.risk_paths ?? null} helpKey="service_card.risk_path" />}

      <CiaContributionTable
        c={service.effective_c}
        i={service.effective_i}
        a={service.effective_a}
        assets={linkedAssets}
        emptyLabel="No information assets linked to this service"
        isExpert={isExpert}
      />

      <div className={styles.body}>
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Description</span>
          <span className={styles.bodyValue}>
            {hasDesc ? service.description : <Gap label="No description" />}
          </span>
        </div>

        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Impact tables</span>
          <span className={styles.bodyValue}>
            {impactTableCount === null
              ? <span className={styles.ciaRowNameMuted}>Open details to see impact tables.</span>
              : impactTableCount === 0
                ? <Gap label="No impact tables linked" />
                : <>{impactTableCount} impact table{impactTableCount === 1 ? '' : 's'} linked</>
            }
          </span>
        </div>
      </div>
      </>)}
    </EntitySummaryCard>
  );
}
