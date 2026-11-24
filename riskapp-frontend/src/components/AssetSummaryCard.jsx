// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { CiaChipGroup } from './CiaChipGroup';
import { RatingChip } from './RatingChip';
import { EntitySummaryCard } from './EntitySummaryCard';
import { Gap } from './Gap';
import { maxCia } from '../utils/cia';
import { levelClass, scoreLevel } from '../utils/riskColors';
import styles from './EntitySummaryCard.module.css';

// `compact` (the asset's own page, owner 2026-11-19): one header line, as on a
// system's and a service's page. The maximum impact and the worst risk sit on
// the right, the description is one line; the linked services and the rating
// are the page's tabs, so they are not repeated here.
export function AssetSummaryCard({ asset, openHref, isExpert = true, compact = false }) {
  if (!asset) return null;
  const maxImpact = [asset.confidentiality, asset.integrity, asset.availability].some(v => v != null)
    ? maxCia(asset.confidentiality, asset.integrity, asset.availability) : null;
  const worst = (asset.risk_paths || []).reduce((m, p) => Math.max(m, p.risk_score ?? 0), 0);
  const worstLevel = worst ? scoreLevel(worst) : null;

  const hasOwner   = !!asset.owner_name;
  const hasManager = !!asset.manager_name;
  const hasDesc    = !!(asset.description && asset.description.trim());

  const linkedServices = Array.isArray(asset.linked_services) ? asset.linked_services : null;
  const serviceCount   = linkedServices ? linkedServices.length : (asset.service_count ?? 0);

  return (
    <EntitySummaryCard
      name={asset.name}
      kind="information asset"
      helpKey="asset_card.title"
      openHref={openHref}
      rightSlot={compact ? <>
        {maxImpact != null && (
          <span className={styles.compactImpact} title={`Impact C${asset.confidentiality ?? '–'} I${asset.integrity ?? '–'} A${asset.availability ?? '–'}`}>
            Impact <RatingChip value={maxImpact} scale="impact" variant={isExpert ? 'number' : 'word'} />
          </span>
        )}
        {worstLevel
          ? <span className={`${styles.riskPill} ${levelClass(worstLevel)}`}>Risk: {worstLevel}</span>
          : <span className={styles.riskPillNone}>no risk rated</span>}
      </> : (
        isExpert ? (
          <CiaChipGroup
            c={asset.confidentiality}
            i={asset.integrity}
            a={asset.availability}
            size="lg"
          />
        ) : (
          <RatingChip
            value={maxCia(asset.confidentiality, asset.integrity, asset.availability)}
            scale="impact"
            variant="word"
          />
        )
      )}
      meta={
        <>
          {asset.department_name && (
            <span className={styles.metaChip}>{asset.department_name}</span>
          )}
          {!asset.is_active && (
            <span className={styles.inactiveBadge}>Inactive</span>
          )}
          {hasOwner
            ? <span className={styles.metaLine}>Owner (IAO): {asset.owner_name}</span>
            : <Gap label="No IAO assigned" />}
          {hasManager
            ? <span className={styles.metaLine}>Managed by (IAM): {asset.manager_name}</span>
            : <Gap label="No IAM assigned" />}
        </>
      }
    >
      {compact ? (
        <p className={styles.compactDesc} title={hasDesc ? asset.description : undefined}>
          {hasDesc ? asset.description : <Gap label="No description" />}
        </p>
      ) : (
      <div className={styles.body}>
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Description</span>
          <span className={styles.bodyValue}>
            {hasDesc ? asset.description : <Gap label="No description" />}
          </span>
        </div>

        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Linked services</span>
          <span className={styles.bodyValue}>
            {serviceCount === 0 ? (
              <Gap label="No services linked" />
            ) : linkedServices ? (
              <span className={styles.servicesList}>
                {linkedServices.slice(0, 6).map(s => (
                  <span key={s.id} className={styles.serviceTag}>{s.name}</span>
                ))}
                {linkedServices.length > 6 && (
                  <span className={styles.serviceTag}>+{linkedServices.length - 6} more</span>
                )}
              </span>
            ) : (
              <>{serviceCount} service{serviceCount === 1 ? '' : 's'} linked</>
            )}
          </span>
        </div>
      </div>
      )}
    </EntitySummaryCard>
  );
}
