// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal shell: full-screen backdrop + centring + the cross-cutting
 * behaviour every dialog needs:
 *   - click-outside-to-close and Escape-to-close (both suppressed while `busy`)
 *   - `role="dialog" aria-modal aria-label`
 *   - focus management: focus moves into the dialog on open, Tab/Shift-Tab are
 *     trapped inside it, and focus returns to the previously-focused element on
 *     close (this is what makes `aria-modal` honest).
 *
 * The panel itself stays the caller's responsibility (each modal keeps its own
 * width/padding), passed as children — typically a `<div className={styles.modal}>`.
 */
export function Modal({ label, onClose, busy = false, children }) {
  const backdropRef = useRef(null);
  const restoreRef  = useRef(null);

  // Focus into the dialog on mount; restore focus to the opener on unmount.
  useEffect(() => {
    restoreRef.current = document.activeElement;
    const root = backdropRef.current;
    const first = root?.querySelector(FOCUSABLE);
    (first || root)?.focus();
    return () => {
      const el = restoreRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, []);

  // Escape closes; Tab is trapped within the dialog.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = backdropRef.current;
      if (!root) return;
      const items = root.querySelectorAll(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  function onBackdrop(e) {
    if (e.target === e.currentTarget && !busy) onClose();
  }

  return (
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
