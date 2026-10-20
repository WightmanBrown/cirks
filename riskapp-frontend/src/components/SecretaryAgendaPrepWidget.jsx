// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMeetings, getMeeting, getAgenda } from '../api/index';
import styles from './SecretaryAgendaPrepWidget.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  const d = Math.round(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 0)   return `${Math.abs(d)} day${Math.abs(d) !== 1 ? 's' : ''} ago`;
  return `in ${d} day${d !== 1 ? 's' : ''}`;
}

export function SecretaryAgendaPrepWidget() {
  const navigate = useNavigate();
  const [meeting,   setMeeting]   = useState(null);   // the active planned/closed meeting
  const [attendees, setAttendees] = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const listData = await getMeetings();
        const active = listData.meetings.find(m => m.state === 'planned' || m.state === 'closed');
        if (!active) { setLoading(false); return; }

        const [detail, agendaData] = await Promise.all([
          getMeeting(active.id),
          getAgenda(active.id).catch(() => ({ items: [] })),
        ]);
        setMeeting(detail.meeting);
        setAttendees(detail.attendees);
        setItems(agendaData.items);
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.title}>Agenda Prep</span>
        </div>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.title}>Agenda Prep</span>
        </div>
        <p className={styles.muted}>No active meeting.</p>
        <button className={styles.btnAction} onClick={() => navigate('/meetings/plan')}>
          + Plan meeting
        </button>
      </div>
    );
  }

  const isClosed      = !!meeting.closed_at;
  const state         = meeting.state;
  const when          = daysUntil(meeting.meeting_date);
  const totalItems    = items.length;
  const decidedCount  = items.filter(i => i.decision_text).length;
  const totalAttendees = attendees.filter(a => a.user_id).length;
  const viewedCount   = attendees.filter(a => a.last_viewed_pack_at).length;
  const presenterCount = attendees.filter(a => a.presenting_agenda_item_id).length;
  const unviewedCount = totalAttendees - viewedCount;

  const packPct = totalAttendees ? Math.round((viewedCount / totalAttendees) * 100) : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>Agenda Prep</span>
        <button className={styles.btnLink} onClick={() => navigate(`/meetings/${meeting.id}`)}>
          Open →
        </button>
      </div>

      <div className={styles.meetingCard} onClick={() => navigate(`/meetings/${meeting.id}`)}>
        <div className={styles.meetingDate}>{formatDate(meeting.meeting_date)}</div>
        <div className={styles.meetingMeta}>
          <span className={`${styles.stateBadge} ${styles[`state_${state}`]}`}>
            {isClosed ? 'Closed' : 'Planned'}
          </span>
          {when && <span className={styles.when}>{when}</span>}
          {meeting.cycle_name && <span className={styles.cycle}>{meeting.cycle_name}</span>}
        </div>
      </div>

      {/* Agenda items */}
      <div className={styles.statRow}>
        <span className={styles.statLabel}>Agenda</span>
        <span className={styles.statValue}>
          {totalItems === 0
            ? <span className={styles.warn}>No items — generate agenda</span>
            : isClosed
              ? `${decidedCount} / ${totalItems} decided`
              : `${totalItems} item${totalItems !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Pack viewed */}
      <div className={styles.statRow}>
        <span className={styles.statLabel}>Pack viewed</span>
        <div className={styles.statRight}>
          <span className={styles.statValue}>
            {viewedCount} / {totalAttendees}
            {unviewedCount > 0 && (
              <span className={styles.warn}> · {unviewedCount} not viewed</span>
            )}
          </span>
          {totalAttendees > 0 && (
            <div className={styles.miniBar}>
              <div className={styles.miniFill} style={{ width: `${packPct}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Presenters */}
      <div className={styles.statRow}>
        <span className={styles.statLabel}>Presenters</span>
        <span className={styles.statValue}>
          {presenterCount > 0
            ? `${presenterCount} assigned`
            : <span className={styles.muted}>none assigned</span>}
        </span>
      </div>

      {/* CTA */}
      <div className={styles.actions}>
        {!isClosed && (
          <button
            className={styles.btnRun}
            onClick={() => navigate(`/meetings/${meeting.id}/run`)}
          >
            ▶ Run meeting
          </button>
        )}
        {isClosed && !meeting.minutes_issued_at && (
          <button
            className={styles.btnMinutes}
            onClick={() => navigate(`/meetings/${meeting.id}`)}
          >
            ✎ Write minutes
          </button>
        )}
        {!isClosed && totalItems === 0 && (
          <button
            className={styles.btnAction}
            onClick={() => navigate(`/meetings/${meeting.id}`)}
          >
            Generate agenda
          </button>
        )}
      </div>
    </div>
  );
}
