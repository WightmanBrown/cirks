// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMeeting, addAttendee, removeAttendee, getAvailableUsers,
  getAgenda, assignPresenter,
  listAttachments, uploadAttachment, downloadAttachment, deleteAttachment,
  closeMeeting, updateMinutes, issueMinutes, updateSectionTimeboxes, patchMeeting,
} from '../api/index';
import { AgendaSection } from '../components/AgendaSection';
import { PackView }      from '../components/PackView';
import { BackButton }    from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { Shell }         from '../components/Shell';
import styles from './MeetingDetailPage.module.css';
import { personLabel } from '../utils/roles';

const STATE_LABELS = {
  draft:          'Draft',
  planned:        'Planned',
  closed:         'Closed',
  minutes_issued: 'Minutes Issued',
};

const ROLE_ORDER    = { chair: 1, secretary: 2, presenter: 3, member: 4, observer: 5 };
const MEETING_ROLES = ['chair', 'secretary', 'presenter', 'member', 'observer'];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatBytes(n) {
  if (!n) return '';
  if (n < 1024)         return `${n} B`;
  if (n < 1024 * 1024)  return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Meeting-level attachments panel (secretary view) ─────────────────────────

function MeetingAttachmentsPanel({ meetingId, minutesIssued }) {
  const [attachments, setAttachments] = useState([]);
  const [open,        setOpen]        = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await listAttachments(meetingId);
      setAttachments(d.attachments);
    } catch (_) {}
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', file.name);
      await uploadAttachment(meetingId, fd);
      await load();
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
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
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

  return (
    <section className={styles.section}>
      <button className={styles.attachSectionToggle} onClick={() => setOpen(o => !o)}>
        <span>{open ? '▾' : '▸'}</span>
        <h2 className={styles.sectionTitle} style={{ display: 'inline' }}>Meeting Attachments</h2>
        {attachments.length > 0 && (
          <span className={styles.attachBadge}>{attachments.length}</span>
        )}
      </button>

      {open && (
        <div className={styles.attachBody}>
          {attachments.length === 0 && (
            <p className={styles.empty}>No attachments yet.</p>
          )}
          {attachments.map(att => (
            <div key={att.id} className={styles.attachRow}>
              <span className={styles.attachLabel}>{att.label}</span>
              {att.attached_to_agenda_item_id && (
                <span className={styles.attachItemBadge}>item</span>
              )}
              <span className={styles.attachMeta}>{formatBytes(att.size_bytes)}</span>
              <span className={styles.attachMeta}>{att.uploaded_by_name ?? '—'}</span>
              <button className={styles.btnDownload} onClick={() => handleDownload(att)}>Download</button>
              {!minutesIssued && (
                <button className={styles.btnDeleteAtt} onClick={() => handleDelete(att.id)}>✕</button>
              )}
            </div>
          ))}
          {!minutesIssued && (
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
    </section>
  );
}

// ── Close Meeting Modal ───────────────────────────────────────────────────────

function CloseMeetingModal({ meetingId, onClosed, onCancel }) {
  const [quorate,     setQuorate]     = useState(false);
  const [quorateNotes, setQuorateNotes] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await closeMeeting(meetingId, { quorate, quorate_notes: quorateNotes });
      onClosed();
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Close Meeting</h3>
        <p className={styles.modalDesc}>
          Closing the meeting freezes the agenda, attendee list, and attachments.
          You will still be able to edit decision text and write the minutes.
        </p>

        <div className={styles.modalField}>
          <label className={styles.modalCheckLabel}>
            <input
              type="checkbox"
              checked={quorate}
              onChange={e => setQuorate(e.target.checked)}
            />
            Meeting was quorate
          </label>
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Quorum notes (optional)</label>
          <textarea
            className={styles.modalTextarea}
            rows={2}
            value={quorateNotes}
            onChange={e => setQuorateNotes(e.target.value)}
            placeholder="e.g. Chair, Secretary and 3 of 5 members present"
          />
        </div>

        {error && <p className={styles.modalError}>{error}</p>}

        <div className={styles.modalActions}>
          <button className={styles.btnDanger} onClick={handleClose} disabled={saving}>
            {saving ? 'Closing…' : 'Close Meeting'}
          </button>
          <button className={styles.btnSecondary} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Minutes Editor ────────────────────────────────────────────────────────────

function MinutesEditor({ meetingId, initialBody, agendaItems, onIssued }) {
  const [body,    setBody]    = useState(initialBody ?? '');
  const [saving,  setSaving]  = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState(null);

  function buildDraft() {
    const decided = agendaItems.filter(i => i.decision_text);
    if (!decided.length) return '— No decisions recorded —\n';
    return decided.map((item, idx) =>
      `${idx + 1}. ${item.title}\n   Decision: ${item.decision_text.trim()}`
    ).join('\n\n') + '\n';
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateMinutes(meetingId, body);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    if (!window.confirm('Issue minutes? This will seal the meeting and cannot be undone.')) return;
    setIssuing(true);
    setError(null);
    try {
      await updateMinutes(meetingId, body);
      await issueMinutes(meetingId);
      onIssued();
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.minutesHeader}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Minutes</h2>
        <button
          className={styles.btnDraftGenerate}
          onClick={() => setBody(buildDraft())}
          type="button"
        >
          Auto-fill from decisions
        </button>
      </div>
      <p className={styles.minutesHint}>
        Write the formal minutes here. Once issued, this text is sealed and cannot be changed.
      </p>
      <textarea
        className={styles.minutesTextarea}
        rows={16}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write meeting minutes here…"
      />
      {error && <p className={styles.addError}>{error}</p>}
      <div className={styles.minutesActions}>
        <button className={styles.btnAdd} onClick={handleSave} disabled={saving || issuing}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save draft'}
        </button>
        <button
          className={styles.btnIssueMinutes}
          onClick={handleIssue}
          disabled={saving || issuing || !body.trim()}
        >
          {issuing ? 'Issuing…' : 'Issue Minutes'}
        </button>
      </div>
    </section>
  );
}


// ── MeetingDetailPage ─────────────────────────────────────────────────────────

export function MeetingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [meeting,   setMeeting]   = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [agendaItems, setAgendaItems] = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Attendee add state
  const [addMode,      setAddMode]      = useState('user');
  const [newUserId,    setNewUserId]    = useState('');
  const [newNamedName, setNewNamedName] = useState('');
  const [newRole,      setNewRole]      = useState('member');
  const [addError,     setAddError]     = useState(null);
  const [adding,       setAdding]       = useState(false);

  // Presenter assignment
  const [presenterBusy, setPresenterBusy] = useState(new Set());

  // Close modal
  const [showCloseModal, setShowCloseModal] = useState(false);

  const isSecretary = user?.role === 'meeting_secretary';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dMeeting, dAgenda] = await Promise.all([
        getMeeting(id),
        isSecretary ? getAgenda(id).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      setMeeting(dMeeting.meeting);
      setAttendees(dMeeting.attendees);
      setAgendaItems(dAgenda.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, isSecretary]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isSecretary) getAvailableUsers().then(d => setUsers(d.users)).catch(() => {});
  }, [isSecretary]);

  const isClosed       = !!meeting?.closed_at;
  const minutesIssued  = !!meeting?.minutes_issued_at;
  const state          = meeting?.state ?? 'draft';

  async function handleSectionTimeboxChange(category, minutes) {
    const updated = { ...(meeting.section_timeboxes ?? {}), [category]: minutes };
    if (minutes === null || minutes === undefined) delete updated[category];
    try {
      const result = await updateSectionTimeboxes(id, updated);
      setMeeting(m => ({ ...m, section_timeboxes: result.section_timeboxes }));
    } catch {/* ignore */ }
  }

  async function handleTargetDurationChange(minutes) {
    const val = Number(minutes);
    if (!Number.isInteger(val) || val < 1) return;
    try {
      const result = await patchMeeting(id, { target_duration_min: val });
      setMeeting(m => ({ ...m, target_duration_min: result.meeting.target_duration_min }));
    } catch {/* ignore */ }
  }

  async function handleAddAttendee() {
    if (addMode === 'user' && !newUserId)              { setAddError('Select a user.'); return; }
    if (addMode === 'named' && !newNamedName.trim())   { setAddError('Enter a name.'); return; }
    setAddError(null);
    setAdding(true);
    try {
      const body = { role_at_meeting: newRole };
      if (addMode === 'user')  body.user_id    = newUserId;
      else                     body.named_name = newNamedName.trim();
      await addAttendee(id, body);
      setNewUserId('');
      setNewNamedName('');
      setNewRole('member');
      await load();
    } catch (e) {
      setAddError(e.response?.data?.error ?? e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveAttendee(aid) {
    try {
      await removeAttendee(id, aid);
      await load();
    } catch (e) {
      alert(e.response?.data?.error ?? e.message);
    }
  }

  async function handlePresenterChange(attendeeId, agendaItemId) {
    setPresenterBusy(prev => new Set([...prev, attendeeId]));
    try {
      await assignPresenter(id, attendeeId, agendaItemId || null);
      await load();
    } catch (e) {
      alert(e.response?.data?.error ?? e.message);
    } finally {
      setPresenterBusy(prev => { const n = new Set(prev); n.delete(attendeeId); return n; });
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.loading}>Loading…</p></div>;
  if (error)   return <div className={styles.page}><p className={styles.error}>{error}</p></div>;
  if (!meeting) return null;

  const alreadyAdded   = new Set(attendees.filter(a => a.user_id).map(a => a.user_id));
  const availableUsers = users.filter(u => !alreadyAdded.has(u.id));

  return (
    <Shell>
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <BackButton fallback="/meetings" />
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>SWG Meeting — {formatDate(meeting.meeting_date)}</h1>
          <span className={`${styles.stateBadge} ${styles[`state_${state}`]}`}>
            {STATE_LABELS[state] ?? state}
          </span>
          {minutesIssued && <ReadOnlyBadge reason="Minutes have been issued — this record is sealed." />}
          {isClosed && !minutesIssued && <ReadOnlyBadge reason="This meeting is closed — the agenda is locked." />}
        </div>
        <div className={styles.headerActions}>
          {(state === 'planned' || state === 'closed') &&
            (user?.role === 'meeting_secretary' || user?.role === 'ciso' || user?.role === 'siro' || user?.role === 'admin') && (
            <button
              className={styles.btnRunMeeting}
              onClick={() => navigate(`/meetings/${id}/run`)}
            >
              ▶ Run meeting
            </button>
          )}
          {state === 'planned' && isSecretary && (
            <button
              className={styles.btnClose}
              onClick={() => setShowCloseModal(true)}
            >
              Close meeting
            </button>
          )}
        </div>
      </div>

      {showCloseModal && (
        <CloseMeetingModal
          meetingId={id}
          onClosed={() => { setShowCloseModal(false); load(); }}
          onCancel={() => setShowCloseModal(false)}
        />
      )}

      {/* Metadata card */}
      <div className={styles.metaCard}>
        <dl className={styles.metaGrid}>
          <dt>Date</dt>          <dd>{formatDate(meeting.meeting_date)}</dd>
          <dt>Chair</dt>         <dd>{meeting.chaired_by_name ?? '—'}</dd>
          <dt>Secretary</dt>     <dd>{meeting.secretary_name ?? '—'}</dd>
          <dt>Review cycle</dt>  <dd>{meeting.cycle_name ?? '—'}</dd>
          <dt>Target duration</dt>
          <dd>
            {isSecretary && !isClosed ? (
              <span className={styles.durationEdit}>
                {/* min="5" keeps the default 90 on the step ladder — see the note
                    on PlanMeetingPage; min="1" step="5" makes 90 invalid. */}
                <input
                  type="number"
                  min="5"
                  step="5"
                  defaultValue={meeting.target_duration_min ?? 90}
                  className={styles.durationInput}
                  onBlur={e => handleTargetDurationChange(e.target.value)}
                  aria-label="Target meeting duration in minutes"
                />
                <span className={styles.durationUnit}>min</span>
              </span>
            ) : (
              `${meeting.target_duration_min ?? 90} min`
            )}
          </dd>
          <dt>Planned</dt>       <dd>{formatDateTime(meeting.planned_at)}</dd>
          {meeting.closed_at && (
            <>
              <dt>Closed</dt>
              <dd>
                {formatDateTime(meeting.closed_at)}
                {meeting.quorate !== null && meeting.quorate !== undefined && (
                  <span className={meeting.quorate ? styles.quorateBadge : styles.notQuorateBadge}>
                    {meeting.quorate ? 'Quorate' : 'Not quorate'}
                  </span>
                )}
                {meeting.quorate_notes && (
                  <span className={styles.quorateNotes}> — {meeting.quorate_notes}</span>
                )}
              </dd>
            </>
          )}
          {meeting.minutes_issued_at && <><dt>Minutes issued</dt><dd>{formatDateTime(meeting.minutes_issued_at)}</dd></>}
        </dl>
      </div>

      {/* Secretary: full builder view */}
      {isSecretary ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Attendees</h2>

            {attendees.length === 0 ? (
              <p className={styles.empty}>No attendees added yet.</p>
            ) : (
              <table className={styles.attendeeTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Email</th>
                    <th>Meeting role</th>
                    <th>Presenting item</th>
                    <th>Pack viewed</th>
                    <th>Present</th>
                    {!isClosed && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {[...attendees]
                    .sort((a, b) => (ROLE_ORDER[a.role_at_meeting] ?? 9) - (ROLE_ORDER[b.role_at_meeting] ?? 9))
                    .map(a => (
                      <tr key={a.id}>
                        <td className={styles.tdName}>
                          {a.user_full_name ?? a.named_name}
                          {a.user_role && <span className={styles.systemRoleBadge}>{a.user_role.replace(/_/g, ' ')}</span>}
                          {!a.user_id && <span className={styles.externalBadge}>external</span>}
                        </td>
                        <td className={styles.tdDept}>{a.department_name ?? '—'}</td>
                        <td className={styles.tdEmail}>{a.user_email ?? '—'}</td>
                        <td><span className={styles.roleBadge}>{a.role_at_meeting}</span></td>
                        <td className={styles.tdPresenting}>
                          {a.user_id && !isClosed ? (
                            <select
                              className={styles.presenterSelect}
                              value={a.presenting_agenda_item_id ?? ''}
                              disabled={presenterBusy.has(a.id)}
                              onChange={e => handlePresenterChange(a.id, e.target.value)}
                            >
                              <option value="">— none —</option>
                              {agendaItems.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.title?.slice(0, 60)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={styles.presentingTitle}>
                              {a.presenting_item_title ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className={styles.tdViewed}>
                          {a.last_viewed_pack_at
                            ? formatDateTime(a.last_viewed_pack_at)
                            : <span className={styles.notViewed}>not viewed</span>}
                        </td>
                        <td className={styles.tdPresent}>{a.present ? '✓' : '—'}</td>
                        {!isClosed && (
                          <td>
                            <button className={styles.btnRemove} onClick={() => handleRemoveAttendee(a.id)}>
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {!isClosed && (
              <div className={styles.addRow}>
                <div className={styles.modeToggle}>
                  <button type="button" className={addMode === 'user' ? styles.modeActive : styles.modeBtn} onClick={() => setAddMode('user')}>System user</button>
                  <button type="button" className={addMode === 'named' ? styles.modeActive : styles.modeBtn} onClick={() => setAddMode('named')}>External</button>
                </div>
                {addMode === 'user' ? (
                  <select value={newUserId} onChange={e => setNewUserId(e.target.value)} className={styles.select}>
                    <option value="">— Select user —</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {personLabel(u)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" placeholder="Name" value={newNamedName} onChange={e => setNewNamedName(e.target.value)} className={styles.input} />
                )}
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={styles.selectRole}>
                  {MEETING_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" className={styles.btnAdd} disabled={adding} onClick={handleAddAttendee}>
                  {adding ? '…' : 'Add'}
                </button>
                {addError && <span className={styles.addError}>{addError}</span>}
              </div>
            )}
          </section>

          <AgendaSection
            meetingId={id}
            isSecretary={true}
            isClosed={isClosed}
            minutesIssued={minutesIssued}
            sectionTimeboxes={meeting?.section_timeboxes ?? {}}
            onSectionTimeboxChange={handleSectionTimeboxChange}
            targetDurationMin={meeting?.target_duration_min ?? null}
          />

          <MeetingAttachmentsPanel meetingId={id} isClosed={isClosed} minutesIssued={minutesIssued} />

          {/* Minutes editor — available once closed, sealed after issue */}
          {isClosed && !minutesIssued && (
            <MinutesEditor
              meetingId={id}
              initialBody={meeting.minutes_body}
              agendaItems={agendaItems}
              onIssued={load}
            />
          )}

          {minutesIssued && meeting.minutes_body && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Minutes (issued)</h2>
              <pre className={styles.minutesReadonly}>{meeting.minutes_body}</pre>
            </section>
          )}
        </>
      ) : (
        /* Non-secretary: personalised pack view */
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Attendees</h2>
            {attendees.length === 0 ? (
              <p className={styles.empty}>No attendees added yet.</p>
            ) : (
              <table className={styles.attendeeTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Email</th>
                    <th>Meeting role</th>
                    <th>Present</th>
                  </tr>
                </thead>
                <tbody>
                  {[...attendees]
                    .sort((a, b) => (ROLE_ORDER[a.role_at_meeting] ?? 9) - (ROLE_ORDER[b.role_at_meeting] ?? 9))
                    .map(a => (
                      <tr key={a.id}>
                        <td className={styles.tdName}>
                          {a.user_full_name ?? a.named_name}
                          {a.user_role && <span className={styles.systemRoleBadge}>{a.user_role.replace(/_/g, ' ')}</span>}
                          {!a.user_id && <span className={styles.externalBadge}>external</span>}
                        </td>
                        <td className={styles.tdDept}>{a.department_name ?? '—'}</td>
                        <td className={styles.tdEmail}>{a.user_email ?? '—'}</td>
                        <td><span className={styles.roleBadge}>{a.role_at_meeting}</span></td>
                        <td className={styles.tdPresent}>{a.present ? '✓' : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Meeting Pack</h2>
            <PackView meetingId={id} userRole={user?.role} />
          </section>

          {minutesIssued && meeting.minutes_body && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Minutes</h2>
              <pre className={styles.minutesReadonly}>{meeting.minutes_body}</pre>
            </section>
          )}
        </>
      )}
    </div>
    </Shell>
  );
}
