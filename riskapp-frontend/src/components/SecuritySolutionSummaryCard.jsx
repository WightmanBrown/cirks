// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { EntitySummaryCard } from './EntitySummaryCard';
import { COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import { partWhere } from '../utils/deliveryPatterns';
import { PatternChip } from './PatternChip';
import styles from './EntitySummaryCard.module.css';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A security solution at a glance (v147): what it delivers and what it is made
// of. The unfold row on SecuritySolutionsPage and the header of the solution's
// own page — the same card, so the row and the page cannot disagree.
export function SecuritySolutionSummaryCard({ solution: s, openHref }) {
  if (!s) return null;
  const inPlace = s.systems ? s.systems.length : s.systems_in_place;
  return (
    <EntitySummaryCard
      name={s.name}
      kind="security solution"
      helpKey="security_solution.card"
      openHref={openHref}
      meta={<>
        <PatternChip kind="solution" />
        <span className={styles.metaChip}>{s.kind === 'supplier' ? 'Provided by the supplier' : plural(s.parts.length, 'component part')}</span>
        <span className={styles.metaChip}>Delivers {plural(s.objectives.length, 'objective')}</span>
        {inPlace != null && <span className={styles.metaChip}>In place on {plural(inPlace, 'system')}</span>}
      </>}
    >
      <div className={styles.body}>
        {s.notes && (
          <div className={styles.bodyRow}>
            <span className={styles.bodyLabel}>Notes</span>
            <span className={styles.bodyValue}>{s.notes}</span>
          </div>
        )}
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Delivers</span>
          <span className={styles.bodyValue}>
            {s.objectives.length === 0 ? 'No control objectives yet — it delivers nothing until one is added.'
              : s.objectives.map((o, i) => (
                <span key={o.id}>{i > 0 && '; '}<Link to={`/controls/${o.id}`}>{o.reference_code ? `${o.reference_code} ` : ''}{o.title}</Link></span>
              ))}
          </span>
        </div>
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Made of</span>
          <span className={styles.bodyValue}>
            {s.kind === 'supplier'
              ? 'No parts: met when the supplier hosting or operating the system has current evidence covering the objective.'
              : s.parts.length === 0 ? 'No parts yet — a solution with no parts delivers nothing.'
                : s.parts.map((p, i) => (
                  <span key={p.id}>{i > 0 && '; '}<Link to={`/components/${p.component_id}`}>{p.component_name}</Link>
                    {' '}({(COMPONENT_TYPE_LABEL[p.component_type] || p.component_type).toLowerCase()}, {partWhere(p)})</span>
                ))}
          </span>
        </div>
      </div>
    </EntitySummaryCard>
  );
}
