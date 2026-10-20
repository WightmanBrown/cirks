// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getActionRollUp } from '../api';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import styles from './ActionRollUpPage.module.css';
import { componentTypeShort } from '../utils/componentTypes';

// The cross-system remediation view (docs/security-actions.md, decision #2):
// open action items grouped by control/component and its library owner — the
// systems where each still needs work. Derived from GET /actions/roll-up.
const KIND_LABEL = {
  control_add: 'Add', control_improve: 'Improve',
  component_add: 'Add', component_improve: 'Improve',
};

export function ActionRollUpPage() {
  const [data, setData]       = useState(null);
  const [mine, setMine]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getActionRollUp(mine)
      .then(d => { if (!cancelled) { setData(d); setError(''); } })
      .catch(e => { if (!cancelled) setError(e.response?.data?.error || 'Failed to load.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mine]);

  const empty = data && data.controls.length === 0 && data.components.length === 0;

  return (
    <Shell>
      <BackButton />
      <div className={styles.header}>
        <h1 className={styles.title}>Remediation roll-up</h1>
        <label className={styles.mineToggle}>
          <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />
          Only mine
        </label>
      </div>
      <p className={styles.sub}>
        Open security-action items grouped by control / component and its owner — the systems where each still needs work.
      </p>
      {error && <p className={styles.err}>{error}</p>}
      {loading ? <Spinner />
        : empty ? <p className={styles.empty}>No open remediation items{mine ? ' assigned to you' : ''}.</p>
        : data && (
          <>
            <Section title="Controls" rows={data.controls} kind="control" />
            <Section title="Components" rows={data.components} kind="component" />
          </>
        )}
    </Shell>
  );
}

function Section({ title, rows, kind }) {
  if (!rows.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title} <span className={styles.count}>{rows.length}</span></h2>
      {rows.map(r => (
        <ElementCard key={kind === 'control' ? r.control_id : r.component_id} row={r} kind={kind} />
      ))}
    </section>
  );
}

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null;

// Who is doing the work. The catalogue's library owner is shown when one is
// set — it is on no control today (controls.owner_user_id is NULL on all of
// them, and components have none by design), so the header used to read
// "owner: —" on every row. The people named on the items are the answer.
function responsibleLabel(row) {
  if (row.library_owner?.name) return `owner: ${row.library_owner.name}`;
  const names = [...new Set(row.systems.map(s => s.item_owner?.name).filter(Boolean))];
  if (!names.length) return 'no one named';
  return names.length <= 2 ? `responsible: ${names.join(', ')}` : `responsible: ${names[0]} +${names.length - 1}`;
}

// systems_count counts ITEMS; two actions can plan the same element on the same
// system, which read as "2 systems" beside one system named twice.
function countLabel(row) {
  const items = row.systems.length;
  const systems = new Set(row.systems.map(s => s.system_id)).size;
  if (items === systems) return `${systems} system${systems !== 1 ? 's' : ''}`;
  return `${items} items on ${systems} system${systems !== 1 ? 's' : ''}`;
}

function ElementCard({ row, kind }) {
  const [open, setOpen] = useState(false);
  const name  = kind === 'control' ? row.title : row.name;
  return (
    <div className={styles.card}>
      <button type="button" className={styles.cardHead} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={styles.caret}>{open ? '▾' : '▸'}</span>
        {kind === 'control' && row.framework_ref && <span className={styles.ref}>{row.framework_ref}</span>}
        {kind === 'component' && <span className={styles.ctype}>{componentTypeShort(row.component_type)}</span>}
        <span className={styles.name}>{name}</span>
        <span className={styles.owner}>{responsibleLabel(row)}</span>
        <span className={styles.sysCount}>{countLabel(row)}</span>
      </button>
      {open && (
        <ul className={styles.sysList}>
          {row.systems.map(s => (
            <li key={s.item_id}>
              <Link to={`/actions/${s.action_id}`} className={styles.sysRow}
                title="Open the security action this item belongs to">
                <span className={styles.kind}>{KIND_LABEL[s.change_kind]}</span>
                <span className={styles.sysName}>{s.system_name}</span>
                <span className={styles.status}>{s.status}</span>
                <span className={styles.itemOwner}>{s.item_owner ? `→ ${s.item_owner.name}` : 'no one named'}</span>
                <span className={styles.actionRef}>
                  {s.action_title}
                  {s.target_date && (
                    <span className={s.is_overdue ? styles.overdue : styles.due}>
                      {' '}· due {fmtDate(s.target_date)}{s.is_overdue ? ' — overdue' : ''}
                    </span>
                  )}
                  <span className={styles.chev}> ›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
