// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMeetingPack, listAttachments, uploadAttachment, downloadAttachment, deleteAttachment } from '../api/index';
import styles from './PackView.module.css';

const CATEGORY_LABELS = {
  opening:          'Opening',
  previous_minutes: 'Previous Minutes & Actions Arising',
  change_briefing:  'Change Briefings',
  cycle_overview:   'Cycle Overview',
  isms_objectives:  'ISMS Objectives & Interested Parties',
  new_risks:        'New Risks and Incidents Requiring Action',
  action_progress:  'Action Progress',
  sap_health:       'SAP Health',
  assurance:        'Assurance Reports',
  risk_validation:  'Risk Validation',
  action_adoption:  'Action Adoption',
  exceptions:       'Exceptions',
  verification:     'Verification of Completed Actions',
  aob:              'Any Other Business',
  close:            'Close',
};

function formatBytes(n) {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function entityLink(item) {
  if (!item.entity_type || !item.entity_id) return null;
  if (item.entity_type === 'risk') return `/risks/${item.entity_id}`;
  return null;
}

function entitySummary(item) {
  if (item.risk_data) {
    const d = item.risk_data;
    return `${d.threat_name} on ${d.system_name}${d.department ? ` (${d.department})` : ''}`;
  }
  if (item.action_data)    return `Action · ${item.action_data.status}`;
  if (item.exception_data) {
    const d = item.exception_data;
    const exp = d.expires_at
      ? ` · expires ${new Date(d.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : '';
    return `${d.threat_name} on ${d.system_name}${exp}`;
  }
  return null;
}

// ── AttachmentsPanel ──────────────────────────────────────────────────────────

function AttachmentsPanel({ meetingId, item, canUpload, isMeetingClosed }) {
  const [attachments, setAttachments] = useState([]);
  const [expanded,    setExpanded]    = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const loadAttachments = useCallback(async () => {
    try {
      const d = await listAttachments(meetingId, item.id);
      setAttachments(d.attachments);
    } catch (_) {}
  }, [meetingId, item.id]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('agenda_item_id', item.id);
      fd.append('label', file.name);
      await uploadAttachment(meetingId, fd);
      await loadAttachments();
    } catch (err) {
      setUploadError(err.response?.data?.error ?? err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDownload(att) {
    try {
      const blob = await downloadAttachment(meetingId, att.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.label;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {}
  }

  async function handleDelete(attId) {
    if (!window.confirm('Remove this attachment?')) return;
    try {
      await deleteAttachment(meetingId, attId);
      setAttachments(prev => prev.filter(a => a.id !== attId));
    } catch (err) {
      alert(err.response?.data?.error ?? err.message);
    }
  }

  if (attachments.length === 0 && !canUpload) return null;

  return (
    <div className={styles.attachPanel}>
      <button
        className={styles.attachToggle}
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? '▾' : '▸'} Attachments
        {attachments.length > 0 && <span className={styles.attachCount}>{attachments.length}</span>}
      </button>

      {expanded && (
        <div className={styles.attachList}>
          {attachments.length === 0 && (
            <p className={styles.attachEmpty}>No files attached yet.</p>
          )}
          {attachments.map(att => (
            <div key={att.id} className={styles.attachRow}>
              <span className={styles.attachLabel}>{att.label}</span>
              <span className={styles.attachMeta}>{formatBytes(att.size_bytes)}</span>
              <button className={styles.btnDownload} onClick={() => handleDownload(att)}>Download</button>
              {canUpload && (
                <button className={styles.btnDeleteAtt} onClick={() => handleDelete(att.id)}>✕</button>
              )}
            </div>
          ))}
          {canUpload && !isMeetingClosed && (
            <label className={styles.uploadLabel}>
              <input
                type="file"
                className={styles.fileInput}
                onChange={handleUpload}
                disabled={uploading}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.rtf,.csv,.tsv,.json,.xml,.md,.markdown"
              />
              {uploading ? 'Uploading…' : '+ Attach file'}
            </label>
          )}
          {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
        </div>
      )}
    </div>
  );
}

// ── PackItem ──────────────────────────────────────────────────────────────────

function PackItem({ item, meetingId, canUpload, isMeetingClosed }) {
  const navigate = useNavigate();
  const link     = entityLink(item);
  const summary  = entitySummary(item);

  return (
    <div className={`${styles.packItem} ${item.is_presenter ? styles.packItemPresenter : ''}`}>
      <div className={styles.packItemHeader}>
        <span className={styles.packItemCat}>{CATEGORY_LABELS[item.category] ?? item.category}</span>
        {item.is_presenter && <span className={styles.presenterBadge}>Presenting</span>}
        {item.suggested_timebox_min && (
          <span className={styles.timeboxChip}>{item.suggested_timebox_min}m</span>
        )}
      </div>

      <div className={styles.packItemTitle}>
        {link ? (
          <button className={styles.btnLink} onClick={() => navigate(link)}>{item.title}</button>
        ) : (
          <span>{item.title}</span>
        )}
      </div>

      {summary && <div className={styles.packItemSummary}>{summary}</div>}
      {item.notes && <div className={styles.packItemNotes}>{item.notes}</div>}

      <AttachmentsPanel
        meetingId={meetingId}
        item={item}
        canUpload={canUpload}
        isMeetingClosed={isMeetingClosed}
      />
    </div>
  );
}

// ── PackSection ───────────────────────────────────────────────────────────────

function PackSection({ title, description, items, meetingId, canUploadFor, isMeetingClosed, collapsible }) {
  const [open, setOpen] = useState(!collapsible);
  if (items.length === 0) return null;

  return (
    <section className={styles.packSection}>
      <div className={styles.sectionHeader} onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={collapsible ? { cursor: 'pointer' } : {}}>
        <div className={styles.sectionTitleRow}>
          {collapsible && <span className={styles.chevron}>{open ? '▾' : '▸'}</span>}
          <h2 className={styles.sectionTitle}>{title}</h2>
          <span className={styles.sectionCount}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        {description && <p className={styles.sectionDesc}>{description}</p>}
      </div>

      {open && (
        <div className={styles.sectionItems}>
          {items.map(item => (
            <PackItem
              key={item.id}
              item={item}
              meetingId={meetingId}
              canUpload={canUploadFor(item)}
              isMeetingClosed={isMeetingClosed}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── PackView (main export) ────────────────────────────────────────────────────

export function PackView({ meetingId }) {
  const [pack,    setPack]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    getMeetingPack(meetingId)
      .then(d  => { setPack(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [meetingId]);

  if (loading) return <div className={styles.loading}>Loading your pack…</div>;
  if (error)   return <div className={styles.error}>{error}</div>;
  if (!pack)   return null;

  const { your_prep, read_in_advance, full_agenda } = pack;
  const isMeetingClosed = !!pack.meeting.closed_at;

  // A user can upload attachments to items they're presenting
  function canUploadFor(item) {
    return item.is_presenter && !pack.meeting.minutes_issued_at;
  }

  const allEmpty = your_prep.length === 0 && read_in_advance.length === 0 && full_agenda.length === 0;

  return (
    <div className={styles.packView}>
      {allEmpty && (
        <p className={styles.emptyMsg}>
          No agenda items have been generated for this meeting yet.
        </p>
      )}

      <PackSection
        title="Your prep"
        description="Items you are presenting — please prepare materials in advance."
        items={your_prep}
        meetingId={meetingId}
        canUploadFor={canUploadFor}
        isMeetingClosed={isMeetingClosed}
        collapsible={false}
      />

      <PackSection
        title="Read in advance"
        description="Items relevant to your role — review before the meeting."
        items={read_in_advance}
        meetingId={meetingId}
        canUploadFor={canUploadFor}
        isMeetingClosed={isMeetingClosed}
        collapsible={false}
      />

      <PackSection
        title="Full agenda"
        description={null}
        items={full_agenda}
        meetingId={meetingId}
        canUploadFor={canUploadFor}
        isMeetingClosed={isMeetingClosed}
        collapsible={true}
      />
    </div>
  );
}
