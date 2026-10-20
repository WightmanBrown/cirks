// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { personLabel } from '../utils/roles';
import styles from './PersonSelect.module.css';

// A person picker that names role and department, so nobody has to cross-
// reference another screen to know who they are assigning.
//
// `suggestedId` marks one option as the sensible default (normally the owning
// department's IAO). `warning` renders under the control — used when a
// department has no IAO, where the honest answer is an empty field plus a
// pointer to fix it, never a plausible substitute.
export function PersonSelect({
  value, onChange, users = [], suggestedId = null,
  placeholder = '— unassigned —', warning = null, disabled = false, id,
}) {
  // The suggestion first, then everyone else. A list ordered by name alone
  // makes the right answer as hard to find as any other.
  const suggested = suggestedId ? users.find(u => u.id === suggestedId) : null;
  const rest = users.filter(u => u.id !== suggestedId);

  return (
    <>
      <select
        id={id}
        className={styles.select}
        value={value || ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {suggested && (
          <optgroup label="Suggested">
            <option value={suggested.id}>{personLabel(suggested)}</option>
          </optgroup>
        )}
        {rest.length > 0 && (
          <optgroup label={suggested ? 'Everyone else' : 'People'}>
            {rest.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
          </optgroup>
        )}
      </select>
      {warning && <p className={styles.warning}>{warning}</p>}
    </>
  );
}
