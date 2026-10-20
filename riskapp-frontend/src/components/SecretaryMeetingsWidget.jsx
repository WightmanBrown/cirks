// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMeetings } from '../api/index';
import styles from './SecretaryMeetingsWidget.module.css';
import { HelpDot } from './HelpDot';

const STATE_LABELS = {
  draft:          'Draft',
  planned:        'Planned',
  closed:         'Closed',
  minutes_issued: 'Minutes Issued',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SecretaryMeetingsWidget() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getMeetings()
      .then(d => setMeetings(d.meetings.slice(0, 5)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Most urgent: planned (not yet closed), then closed (awaiting minutes), then others
  const openMeeting = meetings.find(m => m.state === 'planned');
  const closedMeeting = meetings.find(m => m.state === 'closed');
  const focusMeeting = openMeeting ?? closedMeeting ?? meetings[0];

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>SWG Meetings<HelpDot k="widget.swg_meetings" placement="bottom" label="About SWG Meetings" /></span>
        <button className={styles.btnAll} onClick={() => navigate('/meetings')}>
          All meetings →
        </button>
      </div>

      {loading && <p className={styles.empty}>Loading…</p>}

      {!loading && meetings.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.empty}>No meetings planned yet.</p>
          <button className={styles.btnPlan} onClick={() => navigate('/meetings/plan')}>
            + Plan first meeting
          </button>
        </div>
      )}

      {!loading && focusMeeting && (
        <div
          className={styles.focusCard}
          onClick={() => navigate(`/meetings/${focusMeeting.id}`)}
        >
          <div className={styles.focusDate}>{formatDate(focusMeeting.meeting_date)}</div>
          <div className={styles.focusMeta}>
            <span className={`${styles.stateBadge} ${styles[`state_${focusMeeting.state}`]}`}>
              {STATE_LABELS[focusMeeting.state] ?? focusMeeting.state}
            </span>
            {focusMeeting.cycle_name && (
              <span className={styles.cycleName}>{focusMeeting.cycle_name}</span>
            )}
          </div>
          <div className={styles.focusCounts}>
            {focusMeeting.attendee_count} attendees · {focusMeeting.agenda_item_count} agenda items
          </div>
          {focusMeeting.state === 'planned' && (
            <div className={styles.nextAction}>Agenda and prep pending</div>
          )}
          {focusMeeting.state === 'closed' && (
            <div className={styles.nextAction}>Awaiting minutes issuance</div>
          )}
        </div>
      )}

      {!loading && meetings.length > 0 && (
        <button className={styles.btnPlan} onClick={() => navigate('/meetings/plan')}>
          + Plan new meeting
        </button>
      )}
    </div>
  );
}
