// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { chipClass, rawColorClass } from '../utils/riskColors';
import styles from './CiaChipGroup.module.css';

export function CiaChipGroup({ c, i, a, size = 'md' }) {
  const groupCls = `${styles.ciaGroup} ${size === 'lg' ? styles.lg : ''}`.trim();
  return (
    <span className={groupCls}>
      {[['C', c], ['I', i], ['A', a]].map(([dim, val]) => (
        <span key={dim} className={styles.ciaCell}>
          <span className={styles.ciaLetter}>{dim}</span>
          {val != null
            ? <span className={`${chipClass()} ${rawColorClass(val)}`}>{val}</span>
            : <span className={styles.ciaUnrated}>—</span>
          }
        </span>
      ))}
    </span>
  );
}
