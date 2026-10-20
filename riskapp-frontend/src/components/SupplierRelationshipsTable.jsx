// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { RatingChip } from './RatingChip';
import { supplierTypeLabel, supplierStatusLabel } from '../utils/supplierTypes';
import styles from '../pages/ScopesPage.module.css';

// Who is accountable, with the role named: the contracting department's IAO,
// or the SIRO when the department has none.
export function supplierOwnerText(r) {
  if (!r.owner_names) return '—';
  return r.owner_is_siro_fallback
    ? `${r.owner_names} — SIRO (${r.department_name} has no IAO)`
    : `${r.owner_names} — IAO, ${r.department_name}`;
}

// Supplier relationships as a table. `show` picks the first column: the supplier
// (on a system or component page) or what it touches (on the supplier's page).
export function SupplierRelationshipsTable({ rows, show = 'supplier', isExpert = false, renderActions = null }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{show === 'supplier' ? 'Supplier' : 'Touches'}</th>
          <th>Supplier type</th><th>Status</th><th>Contract</th><th>Accountable</th><th>Criticality</th>
          {renderActions && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>
              {show === 'supplier'
                ? <Link className={styles.name} to={`/suppliers/${r.supplier_id}`}>{r.supplier_name}</Link>
                : <span className={styles.name}>
                    {r.system_id && <Link to={`/systems/${r.system_id}`}>{r.system_name}</Link>}
                    {r.system_id && r.component_id && ' · '}
                    {r.component_id && <Link to={`/components/${r.component_id}`}>{r.component_name}</Link>}
                  </span>}
              {r.description && <span className={styles.note}>{r.description}</span>}
            </td>
            <td>{supplierTypeLabel(r.relationship_type)}</td>
            <td>{supplierStatusLabel(r.status)}</td>
            <td>
              {r.contract_url
                ? <a href={r.contract_url} target="_blank" rel="noreferrer">{r.contract_ref || 'contract'}</a>
                : (r.contract_ref || '—')}
              {(r.contract_start || r.contract_end) && (
                <span className={styles.note}>{r.contract_start || '…'} to {r.contract_end || 'open-ended'}</span>
              )}
            </td>
            <td>{supplierOwnerText(r)}</td>
            <td title={`Touches ${r.systems_touched} system${r.systems_touched === 1 ? '' : 's'}`}>
              <RatingChip value={r.max_impact} scale="impact" variant={isExpert ? 'number' : 'word'} />
            </td>
            {renderActions && <td className={styles.right}>{renderActions(r)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
