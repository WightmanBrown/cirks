// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import { RatingChip } from './RatingChip';
import { criticalityNarrative } from '../utils/supplierCriticality';
import styles from './SupplierRelationshipCard.module.css';

// "Why is this supplier that critical?" — answered at the top of its page, in
// words: the system that sets the figure, how the supplier reaches it, and the
// dimension on which its information is rated (owner, 2026-09-30).
export function SupplierCriticality({ supplierName, relationships, isExpert }) {
  const { level, reasons } = criticalityNarrative(supplierName, relationships);
  return (
    <section className={styles.critBox} aria-label="Criticality">
      <div className={styles.critHead}>
        <span className={styles.h3}>Criticality <HelpDot k="supplier.criticality" placement="bottom" /></span>
        <RatingChip value={level} scale="impact" variant={isExpert ? 'number' : 'word'} />
      </div>
      {level == null ? (
        <p className={styles.explain}>
          None yet: no live relationship with this supplier touches a system that holds rated information.
        </p>
      ) : (
        reasons.map(r => <p key={r.relationship.id} className={styles.summary}>{r.text}</p>)
      )}
      <p className={styles.explain}>
        A supplier is as critical as the most important system its live relationships give it access to — the highest
        impact rating of the information on that system. It is worked out from the systems, never typed in.
      </p>
    </section>
  );
}
