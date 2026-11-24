// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMeetings } from '../api/index';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import styles from './MeetingsListPage.module.css';
import { HelpDot } from '../components/HelpDot';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';

const STATE_LABELS = {
  draft:          { label: 'Draft',          cls: 'draft' },
  planned:        { label: 'Planned',         cls: 'planned' },
  closed:         { label: 'Closed',          cls: 'closed' },
  minutes_issued: { label: 'Minutes Issued',  cls: 'issued' },
};

function StateBadge({ state }) {
  const s = STATE_LABELS[state] ?? { label: state, cls: 'draft' };
  return <span className={`${styles.stateBadge} ${styles[`state_${s.cls}`]}`}>{s.label}</span>;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Column key → value, for sorting the list by a header (useTableSort).
export const MEETING_ACCESSORS = {
  date:      (m) => m.meeting_date,
  // In the order a meeting goes through them, not alphabetically.
  state:     (m) => { const k = Object.keys(STATE_LABELS).indexOf(m.state); return k >= 0 ? k : null; },
  cycle:     (m) => m.cycle_name,
  chair:     (m) => m.chaired_by_name,
  secretary: (m) => m.secretary_name,
  attendees: (m) => m.attendee_count,
  agenda:    (m) => m.agenda_item_count,
};

export function MeetingsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    getMeetings()
      .then(d => setMeetings(d.meetings))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isSecretary = user?.role === 'meeting_secretary';

  // Sorted by a header, the sort kept in the address so Back returns to it.
  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(meetings, { accessors: MEETING_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <Shell>
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <BackButton />
        <h1 className={styles.pageTitle}>SWG Meetings <HelpDot k="meetings.title" placement="bottom" /></h1>
        {isSecretary && (
          <button
            className={styles.btnPlanMeeting}
            onClick={() => navigate('/meetings/plan')}
          >
            + Plan Meeting
          </button>
        )}
      </div>

      {loading && <p className={styles.loading}>Loading meetings…</p>}
      {error   && <p className={styles.error}>{error}</p>}

      {!loading && !error && meetings.length === 0 && (
        <div className={styles.empty}>
          <p>No meetings have been planned yet.</p>
          {isSecretary && (
            <button className={styles.btnPlanMeeting} onClick={() => navigate('/meetings/plan')}>
              Plan the first meeting
            </button>
          )}
        </div>
      )}

      {!loading && !error && meetings.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <SortableTh column="date" {...sortProps} helpKey="meetings.col.date">Date</SortableTh>
              <SortableTh column="state" {...sortProps} helpKey="meetings.col.state">State</SortableTh>
              <SortableTh column="cycle" {...sortProps} helpKey="meetings.col.cycle">Cycle</SortableTh>
              <SortableTh column="chair" {...sortProps} helpKey="meetings.col.chair">Chair</SortableTh>
              <SortableTh column="secretary" {...sortProps} helpKey="meetings.col.secretary">Secretary</SortableTh>
              <SortableTh column="attendees" {...sortProps} helpKey="meetings.col.attendees">Attendees</SortableTh>
              <SortableTh column="agenda" {...sortProps} helpKey="meetings.col.agenda_items">Agenda items</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <tr
                key={m.id}
                className={`${styles.row} ${m.state === 'closed' ? styles.rowNeedsAction : ''}`}
                onClick={() => navigate(`/meetings/${m.id}`)}
              >
                <td className={styles.tdDate}>{formatDate(m.meeting_date)}</td>
                <td>
                  <div className={styles.stateCell}>
                    <StateBadge state={m.state} />
                    {m.state === 'closed' && (
                      <span
                        className={styles.outstandingFlag}
                        title="This meeting is closed but its minutes have not been issued yet"
                      >
                        ⚠ Minutes not issued
                      </span>
                    )}
                  </div>
                </td>
                <td className={styles.tdCycle}>{m.cycle_name ?? '—'}</td>
                <td>{m.chaired_by_name ?? '—'}</td>
                <td>{m.secretary_name ?? '—'}</td>
                <td className={styles.tdNum}>{m.attendee_count}</td>
                <td className={styles.tdNum}>{m.agenda_item_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </Shell>
  );
}
