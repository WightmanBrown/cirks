// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './AssignedPerson.module.css';

// One table cell naming who is actually assigned.
//
// These columns used to show the department's role-holder derived from role
// membership, ignoring the stored assignment entirely — so a list could say
// "Grace Hopper" while the database said "Katie Sommer", and no screen could
// ever reveal it.
//
// It now shows what is STORED, and marks the two states worth noticing:
//
//   unassigned  — a dash. Nobody is assigned, and implying otherwise is what
//                 hid the problem in the first place.
//   outside the — the name plus a quiet marker. A system owned by someone in
//   department    another department is either a deliberate exception or the
//                 record of who happened to create it; both deserve a look.
//
// The marker deliberately does NOT fire when the assignee simply is not the
// department's IAO/IAM. That rule was tried and flags almost every row —
// managed_by_user_id has historically held the IAO rather than the IAM, so
// 39 of 39 systems and 94 of 94 services lit up. A marker on everything is
// decoration. Outside-the-department flags 4 to 16 rows per list, which is the
// anomaly worth surfacing.
export function AssignedPerson({ name, personDepartment, ownerDepartment }) {
  if (!name) return <span className={styles.unassigned} title="Nobody is assigned">—</span>;

  const outside = personDepartment && ownerDepartment && personDepartment !== ownerDepartment;
  if (!outside) return <span>{name}</span>;

  return (
    <span className={styles.differs} title={`${name} is in ${personDepartment}, not ${ownerDepartment}`}>
      {name}<span className={styles.marker} aria-hidden="true"> ●</span>
      <span className={styles.srOnly}> (in {personDepartment}, not {ownerDepartment})</span>
    </span>
  );
}
