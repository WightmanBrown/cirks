// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublishedMinutes } from '../api/index';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import styles from './PublishedMinutesPage.module.css';

function formatYmd(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatStamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PublishedMinutesPage() {
  const { id } = useParams();
  const [minutes, setMinutes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    getPublishedMinutes(id)
      .then(d => setMinutes(d.minutes))
      .catch(e => setError(e.response?.data?.error || 'Could not load minutes.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.title}>SWG Minutes</h1>
        </div>

        {loading && <p className={styles.muted}>Loading…</p>}
        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && minutes && (
          <div className={styles.card}>
            <div className={styles.meta}>
              <span className={styles.meetingDate}>Meeting of {formatYmd(minutes.meeting_date)}</span>
              <span className={styles.issued}>Issued {formatStamp(minutes.minutes_issued_at)}</span>
              <span className={styles.sealedBadge}>Sealed — formal record</span>
            </div>
            <pre className={styles.body}>{minutes.minutes_body || '(No minutes text recorded.)'}</pre>
          </div>
        )}
      </div>
    </Shell>
  );
}
