// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Standalone detail page for a single impact table at /impact-tables/:id.
// Wraps the shared TableDetail component (defined in ImpactTablesPage) in a
// Shell with a BackButton. Reloading the tables list on change/delete is a
// no-op here since the list is on a separate route — navigate back instead.
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth }                from '../context/AuthContext';
import { Shell }                  from '../components/Shell';
import { BackButton }             from '../components/BackButton';
import { TableDetail }            from './ImpactTablesPage';
import styles                     from './ImpactTableDetailPage.module.css';

const CAN_EDIT = new Set(['ciso', 'admin', 'risk_analyst', 'information_asset_manager']);
const CAN_ORG  = new Set(['ciso', 'siro', 'admin']);

export function ImpactTableDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit  = CAN_EDIT.has(user?.role);
  const canOrg   = CAN_ORG.has(user?.role);

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <TableDetail
          tableId={id}
          canEdit={canEdit}
          canOrg={canOrg}
          onChanged={() => {}}
          onDeleted={() => navigate('/impact-tables')}
        />
      </div>
    </Shell>
  );
}
