// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { previewComponentRoles, setComponentRoles } from '../api';
import shared from '../pages/ScopesPage.module.css';
import styles from './RoleChangeDialog.module.css';

// Changing what a component can answer (v178), with what it does first. Every
// system recording the component is read before and after; a change that leaves
// one of them with a gap must be confirmed with a tick. The preview is the real
// change rolled back, so it says what saving will do. Security solutions do not
// change: the triggers follow components, not roles.
//
// component: { id, name, roles }   roles: the roles it would have afterwards
// roleLabel(key) → words            onDone() after saving, onClose() to cancel
export function RoleChangeDialog({ component, roles, roleLabel, onDone, onClose }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = [...roles].sort().join(',');
  useEffect(() => {
    let live = true;
    setPreview(null); setSure(false);
    previewComponentRoles(component.id, roles).then(p => { if (live) setPreview(p); })
      .catch(e => live && setError(e?.response?.data?.error || 'Could not work out what this would do.'));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-preview when the roles change, not on each render
  }, [component.id, key]);

  const words = (list) => (list.length ? list.map(roleLabel).join(', ') : 'nothing');
  const touched = (preview?.systems || []).filter(x => x.new_gaps.length || x.closed_gaps.length);
  const gaps = preview?.gaps_created || 0;

  async function save() {
    setBusy(true); setError('');
    try { await setComponentRoles(component.id, roles, gaps > 0); onDone(); }
    catch (e) { setError(e?.response?.data?.error || 'Not saved.'); setBusy(false); }
  }

  return (
    <div className={styles.dialog} role="dialog" aria-label={`Change what ${component.name} can answer`}>
      <p className={styles.change}>
        <b>{component.name}</b> can answer: <span className={styles.was}>{words(component.roles || [])}</span> → <b>{words(roles)}</b>
      </p>
      {!preview && !error && <p className={shared.muted}>Working out what this does…</p>}
      {preview && (
        <div className={`${styles.ripple} ${gaps ? styles.risky : ''}`}>
          <h4 className={styles.head}>What this change does</h4>
          <ul>
            <li><b>{preview.systems.length} system{preview.systems.length === 1 ? '' : 's'}</b> record{preview.systems.length === 1 ? 's' : ''} it.</li>
            {touched.map(x => (
              <li key={x.id}>
                {x.name}: {x.new_gaps.length > 0 && <span className={styles.bad}>loses {x.new_gaps.join(', ')}</span>}
                {x.new_gaps.length > 0 && x.closed_gaps.length > 0 && '; '}
                {x.closed_gaps.length > 0 && <span className={styles.good}>now answers {x.closed_gaps.join(', ')}</span>}
              </li>
            ))}
            {touched.length === 0 && <li>No slot is answered or left empty on any of them.</li>}
            <li>No security solution changes: the security pattern triggers follow components, not roles. No score changes.</li>
          </ul>
        </div>
      )}
      {error && <p className={shared.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        {gaps > 0 && (
          <label className={styles.sure}>
            <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />
            I understand {gaps} system{gaps === 1 ? '' : 's'} will show a gap
          </label>
        )}
        <button type="button" className={shared.primary} disabled={!preview || busy || (gaps > 0 && !sure)} onClick={save}>
          {busy ? 'Saving…' : 'Change what it can answer'}
        </button>
        <button type="button" className={shared.linkBtn} onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
