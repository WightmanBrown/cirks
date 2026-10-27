// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RiskPath } from './RiskPath';
import { Gap } from './Gap';
import { EntitySummaryCard } from './EntitySummaryCard';
import { CiaContributionTable } from './CiaContributionTable';
import styles from './EntitySummaryCard.module.css';

const SOURCE_LABEL = {
  none:   'No rated assets',
  assets: 'CIA derived from linked assets',
};

export function ServiceSummaryCard({ service, openHref, isExpert = true, showRiskPath = true }) {
  if (!service) return null;

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
    </EntitySummaryCard>
  );
}
