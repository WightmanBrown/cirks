// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './ViewModeToggle.module.css';

/**
 * Business / Expert display-mode switch.
 *
 * Presentational — drive it from the `useViewMode()` hook:
 *
 *   const vm = useViewMode();
 *   <ViewModeToggle {...vm} />
 *
 * Renders nothing for roles that cannot use expert mode (`canUseExpert` false),
 * so callers can drop it in unconditionally. Shows a "Set as default" affordance
 * when the session mode differs from the account default (`isDirty`).
 */
export function ViewModeToggle({ mode, setMode, canUseExpert, isDirty, saveDefault }) {
  if (!canUseExpert) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.toggle}>
        <button
          type="button"
          className={mode === 'business' ? styles.active : styles.btn}
          onClick={() => setMode('business')}
        >
          Business
        </button>
        <button
          type="button"
          className={mode === 'expert' ? styles.active : styles.btn}
          onClick={() => setMode('expert')}
        >
          Expert
        </button>
      </div>
      {isDirty && (
        <button
          type="button"
          className={styles.setDefault}
          onClick={saveDefault}
          title="Save as your account default"
        >
          Set as default
        </button>
      )}
    </div>
  );
}
