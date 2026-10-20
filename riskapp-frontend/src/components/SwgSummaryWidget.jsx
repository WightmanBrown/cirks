// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSwgSummary, downloadMeetingIcal, getMyInProgressActions } from '../api/index';
import { HelpDot } from './HelpDot';
import styles from './SwgSummaryWidget.module.css';

// Format a 'YYYY-MM-DD' string without going through Date() — avoids the
// timezone shift that can roll a date back a day in some browsers.
function formatYmd(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SwgSummaryWidget() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [icalBusy, setIcalBusy] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(0);

  useEffect(() => {
    getSwgSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    // Per-user "update required" signal — how many of MY in-flight actions still
    // need a progress note for the scheduled meeting (0 when none is open).
    getMyInProgressActions()
      .then(d => setNeedsUpdate(d?.needs_update_count ?? 0))
      .catch(() => {});
  }, []);

  async function handleIcal(meeting) {
    setIcalBusy(true);
    try {
      const blob = await downloadMeetingIcal(meeting.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swg-${meeting.meeting_date}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* ignore — non-critical */ }
    finally { setIcalBusy(false); }
  }

  const next   = data?.next_meeting   ?? null;
  const latest = data?.latest_minutes ?? null;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>Security Working Group<HelpDot k="widget.swg_summary" placement="bottom" label="About the Security Working Group" /></span>
      </div>

      {loading && (
        <div className={styles.skeleton}>
          <div className={styles.skeletonRow}>
            <div className={styles.skeletonLabel} />
            <div className={styles.skeletonValue} />
          </div>
          <div className={styles.skeletonRow}>
            <div className={styles.skeletonLabel} />
            <div className={styles.skeletonValue} style={{ width: '120px' }} />
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div className={styles.row}>
            <span className={styles.label}>Next meeting</span>
            {next ? (
              <div className={styles.value}>
                <span className={styles.date}>{formatYmd(next.meeting_date)}</span>
                <div className={styles.nextActions}>
                  <button
                    className={styles.icalLink}
                    onClick={() => handleIcal(next)}
                    disabled={icalBusy}
                    title="Download an iCal (.ics) calendar invite"
                  >
                    {icalBusy ? 'Preparing…' : '📅 Add to calendar'}
                  </button>
                  <button
                    className={styles.packLink}
                    onClick={() => navigate(`/meetings/${next.id}/pack`)}
                    title="View your personalised meeting pack"
                  >
                    📋 View your pack →
                  </button>
                </div>
              </div>
            ) : (
              <span className={styles.muted}>None scheduled</span>
            )}
          </div>

          {needsUpdate > 0 && (
            <button
              className={styles.updateAlert}
              onClick={() => navigate('/actions?mine=1')}
              title="Open your security actions and log progress before the meeting"
            >
              <span className={styles.updateIcon}>⚠</span>
              <span className={styles.updateText}>
                Update required on {needsUpdate} security action{needsUpdate !== 1 ? 's' : ''}
              </span>
              <span className={styles.updateArrow}>→</span>
            </button>
          )}

          <div className={styles.row}>
            <span className={styles.label}>Latest minutes</span>
            {latest ? (
              <button
                className={styles.minutesLink}
                onClick={() => navigate(`/swg/minutes/${latest.id}`)}
              >
                {formatYmd(latest.meeting_date)} →
              </button>
            ) : (
              <span className={styles.muted}>No minutes issued yet</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
