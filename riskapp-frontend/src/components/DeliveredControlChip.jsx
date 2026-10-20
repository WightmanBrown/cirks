// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { Link } from 'react-router-dom';
import styles from './DeliveredControlChip.module.css';

// A control delivered organisation-wide or for a group (v127) has no per-system
// record: where it reaches a system it counts with the control's OWN status, set
// on the objective page (v128). So the coverage panel shows that status rather
// than offering a per-system picker that would change nothing.

const MODE_LABEL = { organisation: 'organisation-wide', group: 'for a group' };

export function isDeliveredOnce(control) {
  return control?.delivery === 'organisation' || control?.delivery === 'group';
}

export default function DeliveredControlChip({ control }) {
  const mode = MODE_LABEL[control.delivery];
  if (!mode) return null;
  const reached = control.delivered_via === 'organisation' || control.delivered_via === 'group';
  const status = reached ? control.system_status : null;
  const title = reached
    ? `Delivered ${mode}: it counts on this system with the control's own status (${status}). Change it on the control's page.`
    : control.delivery === 'organisation'
      ? `Delivered ${mode}, but this system is outside where it applies, so it does not count here.`
      : `Delivered ${mode}, but none of its people groups is on this system, so it does not count here.`;
  return (
    <Link className={reached ? styles.chip : styles.chipNotHere} to={`/controls/${control.id}`} title={title}>
      {mode} · {reached ? status : 'not here'}
    </Link>
  );
}
