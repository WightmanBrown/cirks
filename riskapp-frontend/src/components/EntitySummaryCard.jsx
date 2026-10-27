// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import { Link } from 'react-router-dom';
import { EntityKind } from './EntityKind';
import styles from './EntitySummaryCard.module.css';

/**
 * Shared shell for the entity summary cards (asset / system / service).
 * Owns the card scaffold: title + kind, the meta block, an optional right-side
 * slot (CIA chips, risk pill…), and the "Open details →" footer. Everything
 * specific to an entity — banners, the CIA contribution table, body rows — is
 * passed as children between the header and the footer.
 */
// `helpKey` adds an ⓘ after the title; each card passes its own literal key.
export function EntitySummaryCard({ name, kind, meta, rightSlot, openHref, children, helpKey = null, helpPlacement = 'bottom' }) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.left}>
          <h2 className={styles.title}>
            {name}<EntityKind kind={kind} />
            {helpKey && <> <HelpDot k={helpKey} placement={helpPlacement} /></>}
          </h2>
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>

        {rightSlot && <div className={styles.right}>{rightSlot}</div>}
      </div>

      {children}

      {openHref && (
        <div className={styles.actions}>
          <Link to={openHref} className={styles.openBtn}>
            Open details →
          </Link>
        </div>
      )}
    </div>
  );
}
