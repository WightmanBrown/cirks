// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { CiaChipGroup } from './CiaChipGroup';
import { RatingChip } from './RatingChip';
import { EntitySummaryCard } from './EntitySummaryCard';
import { Gap } from './Gap';
import { maxCia } from '../utils/cia';
import styles from './EntitySummaryCard.module.css';

export function AssetSummaryCard({ asset, openHref, isExpert = true }) {
  if (!asset) return null;

  const hasOwner   = !!asset.owner_name;
  const hasManager = !!asset.manager_name;
  const hasDesc    = !!(asset.description && asset.description.trim());

  const linkedServices = Array.isArray(asset.linked_services) ? asset.linked_services : null;
  const serviceCount   = linkedServices ? linkedServices.length : (asset.service_count ?? 0);

  return (
    <EntitySummaryCard
      name={asset.name}
      kind="information asset"
      openHref={openHref}
      rightSlot={
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
      }
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
    </EntitySummaryCard>
  );
}
