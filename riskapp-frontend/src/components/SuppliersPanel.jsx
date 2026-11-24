// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupplierRelationships } from '../api';
import { useAuth } from '../context/AuthContext';
import { SupplierRelationshipsTable } from './SupplierRelationshipsTable';
import { SystemSuppliersDiagram, suppliersOf } from './SystemSuppliersDiagram';
import { FilterChip } from './FilterChip';
import { useNavigate } from 'react-router-dom';
import styles from '../pages/ScopesPage.module.css';

// "Who do we rely on for this?" — the supplier relationships touching a system
// (directly, or through a component on it) or recorded against a component.
// Read-only here: a relationship is recorded from the supplier's page.
// `system` (on the system page) heads the panel with its picture (relation
// diagrams, owner 2026-11-19): supplier, contract, system, information assets.
// A supplier unfolds its contracts in the table below; nothing is listed until
// one is chosen (or List all).
export function SuppliersPanel({ systemId = null, componentId = null, isExpert = false, system = null }) {
  const { hasCapability } = useAuth();
  const navigate = useNavigate();
  const canRead = hasCapability('suppliers.read');
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState(null);

  useEffect(() => {
    if (!canRead) return;
    const params = systemId ? { system_id: systemId } : { component_id: componentId };
    getSupplierRelationships(params).then(setRows).catch(() => setRows([]));
  }, [canRead, systemId, componentId]);

  if (!canRead || rows === null) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Suppliers <HelpDot k="suppliers_panel.title" placement="bottom" /> <span className={styles.count}>{rows.length}</span></h2>
      {rows.length === 0 ? (
        <p className={styles.muted}>
          No supplier relationship touches this {systemId ? 'system' : 'component'}.{' '}
          {hasCapability('suppliers.write') && <Link to="/suppliers">Record one from the supplier&apos;s page.</Link>}
        </p>
      ) : system ? (() => {
        const suppliers = suppliersOf(rows);
        const sup = suppliers.find((x) => `sup:${x.id}` === filter);
        const listed = !filter ? [] : filter === 'all' ? rows : (sup?.rows || []);
        const pick = (key) => setFilter((cur) => (cur === key ? null : key));
        return (<>
          <SystemSuppliersDiagram system={system} rows={rows} active={filter} onFilter={pick}
            onSupplier={(id) => navigate(`/suppliers/${id}`)} onAsset={(id) => navigate(`/assets/${id}`)} />
          <p className={styles.muted}>
            Select a supplier to list its contracts; select a contract to open the supplier, an asset to open it.{' '}
            {filter !== 'all' && <button type="button" className={styles.linkBtn} onClick={() => pick('all')}>List all {rows.length}</button>}
          </p>
          {filter && <FilterChip words={filter === 'all' ? 'All supplier contracts' : sup?.name} stripe={sup?.stripe} onClose={() => setFilter(null)} />}
          {listed.length > 0 && (
            <div style={sup ? { borderLeft: `4px solid ${sup.stripe}`, paddingLeft: 8 } : undefined}>
              <SupplierRelationshipsTable rows={listed} show="supplier" isExpert={isExpert} />
            </div>
          )}
        </>);
      })() : (
        <SupplierRelationshipsTable rows={rows} show="supplier" isExpert={isExpert} />
      )}
    </section>
  );
}
