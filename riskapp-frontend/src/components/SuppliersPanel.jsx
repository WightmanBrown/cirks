// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupplierRelationships } from '../api';
import { useAuth } from '../context/AuthContext';
import { SupplierRelationshipsTable } from './SupplierRelationshipsTable';
import styles from '../pages/ScopesPage.module.css';

// "Who do we rely on for this?" — the supplier relationships touching a system
// (directly, or through a component on it) or recorded against a component.
// Read-only here: a relationship is recorded from the supplier's page.
export function SuppliersPanel({ systemId = null, componentId = null, isExpert = false }) {
  const { hasCapability } = useAuth();
  const canRead = hasCapability('suppliers.read');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!canRead) return;
    const params = systemId ? { system_id: systemId } : { component_id: componentId };
    getSupplierRelationships(params).then(setRows).catch(() => setRows([]));
  }, [canRead, systemId, componentId]);

  if (!canRead || rows === null) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Suppliers <span className={styles.count}>{rows.length}</span></h2>
      {rows.length === 0 ? (
        <p className={styles.muted}>
          No supplier relationship touches this {systemId ? 'system' : 'component'}.{' '}
          {hasCapability('suppliers.write') && <Link to="/suppliers">Record one from the supplier&apos;s page.</Link>}
        </p>
      ) : (
        <SupplierRelationshipsTable rows={rows} show="supplier" isExpert={isExpert} />
      )}
    </section>
  );
}
