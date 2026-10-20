// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { planMeeting, getAvailableCycles, getAvailableUsers, addAttendee } from '../api/index';
import { BackButton } from '../components/BackButton';
import styles from './PlanMeetingPage.module.css';
import { personLabel } from '../utils/roles';
import { DateField } from '../components/DateField';

const ROLES_AT_MEETING = ['chair', 'secretary', 'presenter', 'member', 'observer'];

export function PlanMeetingPage() {
  const navigate = useNavigate();

  // Form state
  const [meetingDate, setMeetingDate] = useState('');
  const [chairId, setChairId]         = useState('');
  const [cycleId, setCycleId]         = useState('');
  const [targetDuration, setTargetDuration] = useState(90); // default SWG slot; sections divide this

  // Attendee builder
  const [attendees, setAttendees]     = useState([]);
  const [attendeeUserId, setAttendeeUserId]     = useState('');
  const [attendeeRole, setAttendeeRole]         = useState('member');
  const [namedName, setNamedName]               = useState('');
  const [addMode, setAddMode]                   = useState('user'); // 'user' | 'named'

  // Reference data
  const [cycles, setCycles]   = useState([]);
  const [users, setUsers]     = useState([]);

  // UI state
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    getAvailableCycles().then(d => setCycles(d.cycles)).catch(() => {});
    getAvailableUsers().then(d => setUsers(d.users)).catch(() => {});
  }, []);

  function addAttendeeToList() {
    if (addMode === 'user') {
      if (!attendeeUserId) return;
      const u = users.find(u => u.id === attendeeUserId);
      if (!u) return;
      if (attendees.some(a => a.user_id === attendeeUserId)) return;
      setAttendees(prev => [...prev, { user_id: u.id, label: u.full_name, email: u.email, role_at_meeting: attendeeRole }]);
      setAttendeeUserId('');
    } else {
      if (!namedName.trim()) return;
      setAttendees(prev => [...prev, { named_name: namedName.trim(), label: namedName.trim(), role_at_meeting: attendeeRole }]);
      setNamedName('');
    }
    setAttendeeRole('member');
  }

  function removeAttendee(idx) {
    setAttendees(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!meetingDate) { setError('Meeting date is required.'); return; }

    setSaving(true);
    try {
      const result = await planMeeting({
        meeting_date:    meetingDate,
        chaired_by:      chairId || null,
        linked_cycle_id: cycleId || null,
        target_duration_min: Number(targetDuration) > 0 ? Number(targetDuration) : null,
      });
      const newId = result.meeting.id;

      // Add attendees sequentially
      for (const a of attendees) {
        const body = { role_at_meeting: a.role_at_meeting };
        if (a.user_id)    body.user_id    = a.user_id;
        if (a.named_name) body.named_name = a.named_name;
        await addAttendee(newId, body);
      }

      navigate(`/meetings/${newId}`);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Failed to plan meeting.');
      setSaving(false);
    }
  }

  const selectedUserIds = new Set(attendees.filter(a => a.user_id).map(a => a.user_id));
  const availableToAdd = users.filter(u => !selectedUserIds.has(u.id));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <BackButton />
        <h1 className={styles.title}>Plan a Meeting</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>

        {/* Step 1 — Date */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Meeting date</h2>
          <p className={styles.hint}>
            Calendar co-ordination happens outside the system — confirm the date before planning.
          </p>
          <label className={styles.label}>
            Date
            <DateField
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              className={styles.input}
              required
            />
          </label>
          <label className={styles.label}>
            Target duration (minutes)
            {/* min must sit ON the step ladder: with min="1" step="5" the valid
                values are 1, 6, 11 … so the default 90 failed HTML5 validation
                and the form silently refused to submit (no message, no request).
                min="5" makes the ladder 5, 10, 15 … which is what "step 5" means
                here. */}
            <input
              type="number"
              min="5"
              step="5"
              value={targetDuration}
              onChange={e => setTargetDuration(e.target.value)}
              className={styles.input}
            />
          </label>
          <p className={styles.hintSmall}>
            The overall time budget. Each agenda section gets a default split of this
            when you generate the agenda; you can adjust per section on the meeting page.
          </p>
        </section>

        {/* Step 2 — Cycle link */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Link to a review cycle <span className={styles.optional}>(optional)</span></h2>
          <p className={styles.hint}>
            Linking allows the agenda to be auto-populated from the cycle's pending items.
          </p>
          <label className={styles.label}>
            Review cycle
            <select
              value={cycleId}
              onChange={e => setCycleId(e.target.value)}
              className={styles.select}
            >
              <option value="">— None —</option>
              {cycles.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {cycles.length === 0 && (
            <p className={styles.hintSmall}>No reviewable cycles without an open meeting found.</p>
          )}
        </section>

        {/* Step 3 — Chair */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Chair <span className={styles.optional}>(optional)</span></h2>
          <label className={styles.label}>
            Chair
            <select
              value={chairId}
              onChange={e => setChairId(e.target.value)}
              className={styles.select}
            >
              <option value="">— Select —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {personLabel(u)}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Step 4 — Attendees */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Attendees</h2>
          <p className={styles.hint}>
            Add system users or named external attendees (e.g. HR rep, auditor).
          </p>

          {attendees.length > 0 && (
            <ul className={styles.attendeeList}>
              {attendees.map((a, idx) => (
                <li key={idx} className={styles.attendeeItem}>
                  <span className={styles.attendeeLabel}>{a.label}</span>
                  {a.email && <span className={styles.attendeeEmail}>{a.email}</span>}
                  <span className={styles.attendeeRoleBadge}>{a.role_at_meeting}</span>
                  <button
                    type="button"
                    className={styles.btnRemove}
                    onClick={() => removeAttendee(idx)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.addAttendeeRow}>
            <div className={styles.addModeToggle}>
              <button
                type="button"
                className={addMode === 'user' ? styles.modeActive : styles.modeBtn}
                onClick={() => setAddMode('user')}
              >
                System user
              </button>
              <button
                type="button"
                className={addMode === 'named' ? styles.modeActive : styles.modeBtn}
                onClick={() => setAddMode('named')}
              >
                Named external
              </button>
            </div>

            {addMode === 'user' ? (
              <select
                value={attendeeUserId}
                onChange={e => setAttendeeUserId(e.target.value)}
                className={styles.select}
              >
                <option value="">— Select user —</option>
                {availableToAdd.map(u => (
                  <option key={u.id} value={u.id}>
                    {personLabel(u)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="External attendee name"
                value={namedName}
                onChange={e => setNamedName(e.target.value)}
                className={styles.input}
              />
            )}

            <select
              value={attendeeRole}
              onChange={e => setAttendeeRole(e.target.value)}
              className={styles.selectRole}
            >
              {ROLES_AT_MEETING.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <button
              type="button"
              className={styles.btnAdd}
              onClick={addAttendeeToList}
            >
              Add
            </button>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={() => navigate('/meetings')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnSave}
            disabled={saving}
          >
            {saving ? 'Planning…' : 'Plan Meeting'}
          </button>
        </div>

      </form>
    </div>
  );
}
