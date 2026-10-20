'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, Fragment } from 'react';
import { getAuditLog } from '../api';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import styles from './AuditLogPage.module.css';
import { DateField } from '../components/DateField';

const PAGE_SIZE = 50;

const humanize = (s) => (s || '').replace(/_/g, ' ');

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const EMPTY = { entity_type: '', action: '', user: '', q: '', from: '', to: '' };

export function AuditLogPage() {
  const [form,    setForm]    = useState(EMPTY);   // live input values
  const [applied, setApplied] = useState(EMPTY);   // filters actually queried
  const [offset,  setOffset]  = useState(0);

  const [data,    setData]    = useState(null);    // { rows, total, filters }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAuditLog({ ...applied, limit: PAGE_SIZE, offset });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [applied, offset]);

  useEffect(() => { load(); }, [load]);

  function apply(e) {
    e?.preventDefault();
    setExpanded(null);
    setOffset(0);
    setApplied(form);
  }
  function clearAll() {
    setExpanded(null);
    setOffset(0);
    setForm(EMPTY);
    setApplied(EMPTY);
  }

  const rows         = data?.rows ?? [];
  const total        = data?.total ?? 0;
  const entityTypes  = data?.filters?.entity_types ?? [];
  const actions      = data?.filters?.actions ?? [];
  const from         = total === 0 ? 0 : offset + 1;
  const to           = Math.min(offset + PAGE_SIZE, total);
  const hasPrev      = offset > 0;
  const hasNext      = offset + PAGE_SIZE < total;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Audit Log</h1>
            <p className={styles.subtitle}>
              Append-only record of governance actions — who did what, to which entity, and when.
            </p>
          </div>
          <span className={styles.total}>{total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}</span>
        </div>

        <form className={styles.filters} onSubmit={apply}>
          <label className={styles.field}>
            <span>Entity</span>
            <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))}>
              <option value="">All entities</option>
              {entityTypes.map(t => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Action</span>
            <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
              <option value="">All actions</option>
              {actions.map(a => <option key={a} value={a}>{humanize(a)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>User / role</span>
            <input type="text" placeholder="name or role" value={form.user}
                   onChange={e => setForm(f => ({ ...f, user: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Text</span>
            <input type="text" placeholder="narrative or label" value={form.q}
                   onChange={e => setForm(f => ({ ...f, q: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>From</span>
            <DateField value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <DateField value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
          </label>
          <div className={styles.filterBtns}>
            <button type="submit" className={styles.applyBtn}>Apply</button>
            <button type="button" className={styles.clearBtn} onClick={clearAll}>Clear</button>
          </div>
        </form>

        {error && <p className={styles.error}>{error}</p>}
        {loading && <div className={styles.loadingBar} />}

        {data && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Narrative</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className={styles.empty}>No audit entries match these filters.</td></tr>
                  ) : rows.map(r => {
                    const isOpen = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className={styles.row} onClick={() => setExpanded(isOpen ? null : r.id)}>
                          <td className={styles.when}>{fmtWhen(r.created_at)}</td>
                          <td>
                            <span className={styles.userName}>{r.user_name || <span className={styles.muted}>system</span>}</span>
                            {r.user_role && <span className={styles.roleChip}>{humanize(r.user_role)}</span>}
                          </td>
                          <td><span className={styles.actionChip}>{humanize(r.action)}</span></td>
                          <td>
                            <span className={styles.entityType}>{humanize(r.entity_type)}</span>
                            {r.entity_label && <span className={styles.entityLabel}>{r.entity_label}</span>}
                          </td>
                          <td className={styles.narrative}>{r.human_narrative || <span className={styles.muted}>—</span>}</td>
                        </tr>
                        {isOpen && (
                          <tr className={styles.detailRow}>
                            <td colSpan={5}>
                              <dl className={styles.detail}>
                                <Detail label="Entity ID"      value={r.entity_id} mono />
                                <Detail label="Field"          value={r.field_name} />
                                <Detail label="Old value"      value={r.old_value} />
                                <Detail label="New value"      value={r.new_value} />
                                <Detail label="Changes"        value={r.changes ? JSON.stringify(r.changes, null, 2) : null} mono pre />
                                <Detail label="Effective role" value={r.effective_role ? humanize(r.effective_role) : null} />
                                <Detail label="Acting-as note" value={r.acting_as_note} />
                                <Detail label="IP address"     value={r.ip_address} mono />
                                <Detail label="User agent"     value={r.user_agent} />
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pager}>
              <span className={styles.pagerInfo}>
                {total === 0 ? 'No results' : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
              </span>
              <div className={styles.pagerBtns}>
                <button disabled={!hasPrev} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>← Newer</button>
                <button disabled={!hasNext} onClick={() => setOffset(o => o + PAGE_SIZE)}>Older →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Detail({ label, value, mono, pre }) {
  if (value == null || value === '') return null;
  return (
    <div className={styles.detailItem}>
      <dt>{label}</dt>
      <dd className={`${mono ? styles.mono : ''} ${pre ? styles.pre : ''}`}>{value}</dd>
    </div>
  );
}
