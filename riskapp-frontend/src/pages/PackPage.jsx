// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/PackPage.jsx
 *
 * Standalone meeting pack page for roles that are invited attendees but don't
 * have access to the full MeetingDetailPage (information_asset_owner, IAM,
 * security_consultant).
 *
 * Also usable by full-access roles as a clean read-only pack view without the
 * management chrome of MeetingDetailPage.
 *
 * Route: /meetings/:id/pack
 */
import { useParams }      from 'react-router-dom';
import { Shell }          from '../components/Shell';
import { BackButton }     from '../components/BackButton';
import { PackView }       from '../components/PackView';
import { useAuth }        from '../context/AuthContext';
import styles             from './PackPage.module.css';

export function PackPage() {
  const { id }        = useParams();
  const { user }      = useAuth();

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/meetings" />
        <div className={styles.header}>
          <h1 className={styles.title}>Meeting Pack</h1>
          <p className={styles.subtitle}>
            Your personalised view for this Security Working Group meeting.
          </p>
        </div>
        <PackView meetingId={id} userRole={user?.role} />
      </div>
    </Shell>
  );
}
