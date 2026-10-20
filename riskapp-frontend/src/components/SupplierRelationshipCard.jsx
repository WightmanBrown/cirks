// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { RatingChip } from './RatingChip';
import { SupplierAssurance } from './SupplierAssurance';
import { supplierOwnerText } from './SupplierRelationshipsTable';
import { supplierTypeLabel, supplierStatusLabel, fmtDay } from '../utils/supplierTypes';
import styles from './SupplierRelationshipCard.module.css';

// One relationship with a supplier, read top to bottom: what it is (type, what it
// touches, contract, who is accountable), then — directly beneath and part of the
// same card — its assurance: the control objectives it must meet and the
// evidence that shows it.
export function SupplierRelationshipCard({ relationship: r, isExpert, canEdit, onEdit, onDelete, onChanged }) {
  return (
    <article className={styles.card} aria-label={`${supplierTypeLabel(r.relationship_type)} relationship`}>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.type}>{supplierTypeLabel(r.relationship_type)}</div>
            <h3 className={styles.title}>
              {r.system_id && <Link to={`/systems/${r.system_id}`}>{r.system_name}</Link>}
              {r.system_id && r.component_id && ' · '}
              {r.component_id && <Link to={`/components/${r.component_id}`}>{r.component_name}</Link>}
            </h3>
          </div>
          {canEdit && (
            <div className={styles.actions}>
              <button className={styles.linkBtn} onClick={onEdit}>Edit relationship</button>
              <button className={styles.linkBtn} onClick={onDelete}
                title="Only for a relationship recorded in error. One that has run its course should be set to Ended.">Delete</button>
            </div>
          )}
        </div>
        <dl className={styles.facts}>
          <div><dt>Status</dt><dd>{supplierStatusLabel(r.status)}</dd></div>
          <div><dt>Contracted by</dt><dd>{r.department_name}</dd></div>
          <div><dt>Accountable</dt><dd>{supplierOwnerText(r)}</dd></div>
          <div>
            <dt>Contract</dt>
            <dd>
              {r.contract_url
                ? <a href={r.contract_url} target="_blank" rel="noreferrer">{r.contract_ref || 'open the contract'}</a>
                : (r.contract_ref || 'no reference recorded')}
              {(r.contract_start || r.contract_end) && (
                <span className={styles.sub}>{r.contract_start ? fmtDay(r.contract_start) : '…'} to {r.contract_end ? fmtDay(r.contract_end) : 'no end date'}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Criticality</dt>
            <dd title={`The highest impact of the ${r.systems_touched} system${r.systems_touched === 1 ? '' : 's'} it touches`}>
              <RatingChip value={r.max_impact} scale="impact" variant={isExpert ? 'number' : 'word'} />
              {r.criticality_systems?.length === 1 && <span className={styles.sub}>from {r.criticality_systems[0].name}</span>}
              {r.criticality_systems?.length > 1 && <span className={styles.sub}>from {r.criticality_systems.length} systems at that level</span>}
            </dd>
          </div>
          {r.description && <div><dt>What they do for us</dt><dd>{r.description}</dd></div>}
        </dl>
      </header>
      <SupplierAssurance relationship={r} canEdit={canEdit} onChanged={onChanged} />
    </article>
  );
}
