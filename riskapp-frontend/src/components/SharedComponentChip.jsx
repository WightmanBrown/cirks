// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { Link } from 'react-router-dom';
import styles from './DeliveredControlChip.module.css';
import { componentStatusLabel } from '../utils/componentTypes';

// A component that exists ONCE for the organisation (v137, §5) — a policy, one
// team, one server room — has one state, set on the component itself, and every
// system that relies on it shows that state. So where a per-system state picker
// would be, it shows the shared state and links to where it is set.

export function isShared(component) {
  return component?.instantiation === 'organisational' || component?.delivered_via === 'organisation'
    || component?.part_location === 'service';
}

// An organisation-wide component that is only IMPLIED on a system by a control,
// and is working, says nothing about that system — it is working everywhere
// (owner, 2026-10-02). Shown only when degraded or missing, or when the system
// records it (its network zone, its server room).
export function isQuietOrgComponent(c) {
  return !c.recorded && isShared(c) && (c.system_status ?? c.component_status) === 'operational';
}

// A part of a security solution that sits on a security system (v145) — the
// Wazuh manager, the SOC team — has its state recorded on THAT system, so this
// system shows it and links there rather than offering a picker of its own.
export default function SharedComponentChip({ component, status }) {
  const shown = componentStatusLabel(component.component_type,
    status ?? component.system_status ?? component.component_status);
  if (component.part_location === 'service' && component.security_system) {
    const where = component.security_system.name;
    return (
      <Link className={styles.chip} to={`/systems/${component.security_system.id}`}
        title={component.on_system
          ? `Recorded on ${where}, the security system that provides it: its state there (${shown}) applies to every system relying on it. Change it on ${where}.`
          : `Not recorded on ${where}, the security system it should be on, so it counts as missing everywhere that relies on it. Record it on ${where}.`}>
        on {where} · {component.on_system ? shown : 'not recorded'}
      </Link>
    );
  }
  return (
    <Link className={styles.chip} to={`/components/${component.id}`}
      title={`Exists once for the organisation: every system that relies on it shares this state (${shown}). Change it on the component's page.`}>
      organisation-wide · {shown}
    </Link>
  );
}
