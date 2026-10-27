// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAgenda, generateAgenda, addAgendaItem,
  updateAgendaItem, deleteAgendaItem, reorderAgendaItems,
  recordDecision,
} from '../api/index';
import styles from './AgendaSection.module.css';
import { ReadOnlyBadge } from './ReadOnlyBadge';
import { HelpDot } from './HelpDot';

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  opening:          'Opening',
  previous_minutes: 'Previous Minutes & Actions Arising',
  change_briefing:  'Change Briefings',
  cycle_overview:   'Cycle Overview',
  isms_objectives:  'ISMS Objectives & Interested Parties',
  threat_identification: 'Identified Exposures Awaiting Assessment',
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

const CATEGORY_PHASE = {
  opening:          'Procedural',
  previous_minutes: 'Procedural',
  change_briefing:  'Change Briefings',
  cycle_overview:   'Change Briefings',
  isms_objectives:  'Change Briefings',
  threat_identification: 'Change Briefings',
  new_risks:        'Change Briefings',
  action_progress:  'Change Briefings',
  sap_health:       'Change Briefings',
  assurance:        'Assurance Reports',
  risk_validation:  'Decisions',
  action_adoption:  'Decisions',
  exceptions:       'Decisions',
  verification:     'Decisions',
  aob:              'Procedural',
  close:            'Procedural',
};

const CATEGORY_ORDER = [
  'opening', 'previous_minutes',
  'change_briefing', 'cycle_overview', 'isms_objectives',
  'threat_identification', 'new_risks', 'action_progress', 'sap_health',
  'assurance',
  'risk_validation', 'action_adoption', 'exceptions', 'verification',
  'aob', 'close',
];

const PHASE_ORDER = ['Procedural', 'Change Briefings', 'Assurance Reports', 'Decisions'];

// Help for each fixed phase and category heading (literal keys, so the help
// drafts test can find them).
const PHASE_HELP = {
  'Procedural':        { helpKey: 'agenda.phase.procedural' },
  'Change Briefings':  { helpKey: 'agenda.phase.change_briefings' },
  'Assurance Reports': { helpKey: 'agenda.phase.assurance_reports' },
  'Decisions':         { helpKey: 'agenda.phase.decisions' },
};

const CATEGORY_HELP = {
  opening:          { helpKey: 'agenda.category.opening' },
  previous_minutes: { helpKey: 'agenda.category.previous_minutes' },
  change_briefing:  { helpKey: 'agenda.category.change_briefing' },
  cycle_overview:   { helpKey: 'agenda.category.cycle_overview' },
  isms_objectives:  { helpKey: 'agenda.category.isms_objectives' },
  threat_identification: { helpKey: 'agenda.category.threat_identification' },
  new_risks:        { helpKey: 'agenda.category.new_risks' },
  action_progress:  { helpKey: 'agenda.category.action_progress' },
  sap_health:       { helpKey: 'agenda.category.sap_health' },
  assurance:        { helpKey: 'agenda.category.assurance' },
  risk_validation:  { helpKey: 'agenda.category.risk_validation' },
  action_adoption:  { helpKey: 'agenda.category.action_adoption' },
  exceptions:       { helpKey: 'agenda.category.exceptions' },
  verification:     { helpKey: 'agenda.category.verification' },
  aob:              { helpKey: 'agenda.category.aob' },
  close:            { helpKey: 'agenda.category.close' },
};

const ALL_CATEGORIES = CATEGORY_ORDER;

// ── Helpers ───────────────────────────────────────────────────────────────────

// An assurance finding is a SET (every asset not fully rated), so its agenda
// line names the finding in entity_type and carries no entity_id. Both go to
// the findings page, which every attendee can open (findings.read); the SoA
// itself needs controls.read, which the SIRO and the secretary do not hold.
const FINDING_LINK = {
  'finding:rating_incomplete': '/findings',
  'finding:soa':               '/findings',
  'finding:component_record':  '/findings',
  'finding:document_review':   '/findings',
  'finding:supplier_assurance': '/findings',
  'finding:objective_solution': '/findings',
};

function entityLink(item) {
  if (FINDING_LINK[item.entity_type]) return FINDING_LINK[item.entity_type];
  if (!item.entity_type || !item.entity_id) return null;
  switch (item.entity_type) {
    case 'risk':            return `/risks/${item.entity_id}`;
    case 'security_action': return null; // no standalone action page yet
    case 'risk_exception':  return null;
    case 'review_cycle':    return null;
    default:                return null;
  }
}

function entitySummary(item) {
  if (item.risk_data) {
    const d = item.risk_data;
    return `${d.threat_name} on ${d.system_name}${d.department ? ` (${d.department})` : ''}`;
  }
  if (item.action_data) {
    return `Action · ${item.action_data.status}`;
  }
  if (item.exception_data) {
    const d = item.exception_data;
    const exp = d.expires_at ? ` · expires ${new Date(d.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
    return `${d.threat_name} on ${d.system_name}${exp}`;
  }
  return null;
}

function totalTimebox(sectionTimeboxes, categories) {
  return categories.reduce((sum, cat) => sum + (sectionTimeboxes[cat] ?? 0), 0);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimeboxChip({ minutes }) {
  if (!minutes) return null;
  return <span className={styles.timeboxChip}>{minutes}m</span>;
}

function SectionTimeboxInput({ category, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  }

  function commit() {
    const mins = draft.trim() === '' ? null : parseInt(draft, 10);
    onChange(category, (mins > 0 ? mins : null));
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number"
        min="1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={styles.sectionTimeboxInput}
        autoFocus
        placeholder="min"
        title="Section time budget (minutes)"
      />
    );
  }

  return (
    <button
      className={styles.sectionTimeboxBtn}
      onClick={startEdit}
      title="Set time budget for this section"
    >
      {value > 0 ? `${value}m` : '+ time'}
    </button>
  );
}

function SourceBadge({ source }) {
  return (
    <span className={`${styles.sourceBadge} ${source === 'pinned' ? styles.pinned : styles.auto}`}>
      {source === 'pinned' ? 'pinned' : 'auto'}
    </span>
  );
}

function AgendaItem({ item, isSecretary, isClosed, minutesIssued, meetingId, onChanged, index, total }) {
  const navigate = useNavigate();
  const [editing,        setEditing]        = useState(false);
  const [editingDecision, setEditingDecision] = useState(false);
  const [notes, setNotes]                   = useState(item.notes ?? '');
  const [timebox, setTimebox]               = useState(item.suggested_timebox_min ?? '');
  const [decisionText,   setDecisionText]   = useState(item.decision_text ?? '');
  const [secretaryNotes, setSecretaryNotes] = useState(item.secretary_notes ?? '');
  const [saving,        setSaving]          = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const link = entityLink(item);
  const summary = entitySummary(item);

  async function handleSave() {
    setSaving(true);
    try {
      await updateAgendaItem(meetingId, item.id, {
        notes:                 notes || null,
        suggested_timebox_min: timebox !== '' ? Number(timebox) : null,
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDecision() {
    setSavingDecision(true);
    try {
      await recordDecision(meetingId, item.id, {
        decision_text:   decisionText  || null,
        secretary_notes: secretaryNotes || null,
      });
      setEditingDecision(false);
      onChanged();
    } finally {
      setSavingDecision(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove this agenda item?')) return;
    await deleteAgendaItem(meetingId, item.id);
    onChanged();
  }

  async function handleMove(direction) {
    // Simple move: swap order_index with neighbour — handled by parent via reorder
    onChanged('move', item.id, direction);
  }

  return (
    <div className={styles.agendaItem}>
      <div className={styles.itemMain}>
        <span className={styles.itemIndex}>{index}</span>
        <div className={styles.itemContent}>
          <div className={styles.itemTitle}>
            {link ? (
              <button className={styles.btnLink} onClick={() => navigate(link)}>
                {item.title}
              </button>
            ) : (
              <span>{item.title}</span>
            )}
            <TimeboxChip minutes={item.suggested_timebox_min} />
            <SourceBadge source={item.source} />
          </div>
          {summary && <div className={styles.itemSummary}>{summary}</div>}
          {isClosed && item.source_diverged && (
            <div className={styles.divergeWarning}>
              ⚠ Source entity was modified after the meeting was closed
            </div>
          )}
          {item.notes && !editing && (
            <div className={styles.itemNotes}>{item.notes}</div>
          )}

          {/* Closed-state decision display / edit */}
          {isClosed && (
            <div className={styles.activityRow}>
              {item.discussed_at && (
                <span className={`${styles.activityChip} ${styles.chipDiscussed}`}>✓ Discussed</span>
              )}
              {item.decision_text ? (
                <span className={`${styles.activityChip} ${styles.chipDecision}`} title={item.decision_text}>
                  Decision: {item.decision_text.length > 40 ? item.decision_text.slice(0, 40) + '…' : item.decision_text}
                </span>
              ) : (
                <span className={`${styles.activityChip} ${styles.chipMissing}`}>No decision</span>
              )}
              {item.secretary_notes && (
                <span className={`${styles.activityChip} ${styles.chipNotes}`} title={item.secretary_notes}>Notes</span>
              )}
            </div>
          )}

          {isClosed && (item.decision_text || item.secretary_notes) && !editingDecision && (
            <div className={styles.decisionBlock}>
              {item.decision_text && (
                <div className={styles.decisionRow}>
                  <span className={styles.decisionLabel}>Decision</span>
                  <span className={styles.decisionText}>{item.decision_text}</span>
                </div>
              )}
              {item.secretary_notes && (
                <div className={styles.decisionRow}>
                  <span className={styles.decisionLabel}>Notes</span>
                  <span className={styles.decisionText}>{item.secretary_notes}</span>
                </div>
              )}
            </div>
          )}
          {isClosed && isSecretary && !minutesIssued && editingDecision && (
            <div className={styles.editForm}>
              <label className={styles.editLabel}>Decision text</label>
              <textarea
                className={styles.textarea}
                value={decisionText}
                onChange={e => setDecisionText(e.target.value)}
                placeholder="What did the SWG formally decide?"
                rows={3}
              />
              <label className={styles.editLabel}>Secretary notes (internal)</label>
              <textarea
                className={styles.textarea}
                value={secretaryNotes}
                onChange={e => setSecretaryNotes(e.target.value)}
                placeholder="Internal notes — not shown in minutes."
                rows={2}
              />
              <div className={styles.editRow}>
                <button className={styles.btnSave} onClick={handleSaveDecision} disabled={savingDecision}>
                  {savingDecision ? '…' : 'Save'}
                </button>
                <button className={styles.btnCancel} onClick={() => setEditingDecision(false)}>Cancel</button>
              </div>
            </div>
          )}

          {editing && (
            <div className={styles.editForm}>
              <textarea
                className={styles.textarea}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
              />
              <div className={styles.editRow}>
                <label className={styles.timeboxLabel}>
                  Timebox (min)
                  <input
                    type="number"
                    min="0"
                    className={styles.timeboxInput}
                    value={timebox}
                    onChange={e => setTimebox(e.target.value)}
                  />
                </label>
                <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
                  {saving ? '…' : 'Save'}
                </button>
                <button className={styles.btnCancel} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {isSecretary && !isClosed && (
          <div className={styles.itemActions}>
            {index > 1    && <button className={styles.btnMove} onClick={() => handleMove('up')}   title="Move up">↑</button>}
            {index < total && <button className={styles.btnMove} onClick={() => handleMove('down')} title="Move down">↓</button>}
            <button className={styles.btnEdit} onClick={() => { setEditing(e => !e); }}>Edit</button>
            <button className={styles.btnDelete} onClick={handleDelete}>✕</button>
          </div>
        )}
        {isSecretary && isClosed && !minutesIssued && (
          <div className={`${styles.itemActions} ${styles.itemActionsAlways}`}>
            <button className={styles.btnEdit} onClick={() => setEditingDecision(d => !d)}>
              {editingDecision ? 'Cancel' : 'Edit decisions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AgendaSection ────────────────────────────────────────────────────────

export function AgendaSection({ meetingId, isSecretary, isClosed, minutesIssued, sectionTimeboxes = {}, onSectionTimeboxChange, targetDurationMin = null }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState(null);

  // Add item form
  const [showAdd, setShowAdd]     = useState(false);
  const [addCategory, setAddCategory] = useState('change_briefing');
  const [addTitle, setAddTitle]   = useState('');
  const [addNotes, setAddNotes]   = useState('');
  const [addTimebox, setAddTimebox] = useState('');
  const [adding, setAdding]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getAgenda(meetingId);
      setItems(d.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateAgenda(meetingId);
      await load();
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!addTitle.trim()) return;
    setAdding(true);
    try {
      await addAgendaItem(meetingId, {
        category:              addCategory,
        title:                 addTitle.trim(),
        notes:                 addNotes || null,
        suggested_timebox_min: addTimebox ? Number(addTimebox) : null,
      });
      setAddTitle('');
      setAddNotes('');
      setAddTimebox('');
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setAdding(false);
    }
  }

  // Handle move up/down: swap order_index with neighbour in flat list
  async function handleMove(itemId, direction) {
    const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(i => i.id === itemId);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    await reorderAgendaItems(meetingId, [
      { id: a.id, order_index: b.order_index },
      { id: b.id, order_index: a.order_index },
    ]);
    await load();
  }

  function handleChanged(action, itemId, direction) {
    if (action === 'move') {
      handleMove(itemId, direction);
    } else {
      load();
    }
  }

  // ── Group items by phase → category ──────────────────────────────────────
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);

  const byCategory = {};
  for (const item of sorted) {
    const cat = item.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const byPhase = {};
  for (const cat of CATEGORY_ORDER) {
    if (!byCategory[cat]?.length) continue;
    const phase = CATEGORY_PHASE[cat] ?? 'Other';
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(cat);
  }

  // Global sequential numbering across all items
  let globalIndex = 0;
  const indexMap = {};
  for (const item of sorted) {
    globalIndex++;
    indexMap[item.id] = globalIndex;
  }

  const allCats = Object.keys(byCategory);
  const totalMins = totalTimebox(sectionTimeboxes, allCats);
  const hasItems = items.length > 0;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Agenda <HelpDot k="agenda.title" placement="bottom" /></h2>
        <div className={styles.headerActions}>
          {hasItems && (targetDurationMin > 0 ? (
            <span
              className={`${styles.totalTimebox} ${totalMins > targetDurationMin ? styles.totalTimeboxOver : ''}`}
              title={totalMins > targetDurationMin
                ? `Sections are allocated ${totalMins - targetDurationMin} min over the ${targetDurationMin} min target`
                : `${targetDurationMin - totalMins} min of the ${targetDurationMin} min target still unallocated`}
            >
              {totalMins} / {targetDurationMin} min allocated
              {totalMins > targetDurationMin
                ? ` · ${totalMins - targetDurationMin} over`
                : totalMins < targetDurationMin
                  ? ` · ${targetDurationMin - totalMins} left`
                  : ''}
            </span>
          ) : totalMins > 0 && (
            <span className={styles.totalTimebox}>~{totalMins} min total</span>
          ))}
          {isClosed && <ReadOnlyBadge reason={minutesIssued ? 'Minutes issued — agenda is sealed.' : 'Meeting closed — agenda is locked.'} />}
          {isSecretary && !isClosed && (
            <>
              <button
                className={styles.btnGenerate}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? 'Generating…' : hasItems ? '↻ Regenerate' : '⚡ Generate Agenda'}
              </button>
              <button
                className={styles.btnAddItem}
                onClick={() => setShowAdd(s => !s)}
              >
                + Add Item
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.empty}>Loading agenda…</p>}

      {/* Add item form */}
      {showAdd && isSecretary && !isClosed && (
        <form className={styles.addForm} onSubmit={handleAddItem}>
          <div className={styles.addFormRow}>
            <select
              value={addCategory}
              onChange={e => setAddCategory(e.target.value)}
              className={styles.select}
            >
              {ALL_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Item title"
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              className={styles.input}
              required
            />
            <input
              type="number"
              placeholder="Min"
              min="0"
              value={addTimebox}
              onChange={e => setAddTimebox(e.target.value)}
              className={styles.timeboxInputSmall}
              title="Suggested timebox (minutes)"
            />
            <button type="submit" className={styles.btnSave} disabled={adding}>
              {adding ? '…' : 'Add'}
            </button>
            <button type="button" className={styles.btnCancel} onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={addNotes}
            onChange={e => setAddNotes(e.target.value)}
            className={styles.textarea}
            rows={2}
          />
        </form>
      )}

      {!loading && !hasItems && (
        <div className={styles.emptyState}>
          <p className={styles.empty}>No agenda items yet.</p>
          {isSecretary && !isClosed && (
            <button className={styles.btnGenerate} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : '⚡ Generate Agenda'}
            </button>
          )}
        </div>
      )}

      {/* Agenda grouped by phase and category */}
      {!loading && hasItems && PHASE_ORDER.map(phase => {
        const cats = byPhase[phase];
        if (!cats?.length) return null;

        return (
          <div key={phase} className={styles.phase}>
            <div className={styles.phaseHeader}>
              {phase}
              {PHASE_HELP[phase] && <HelpDot k={PHASE_HELP[phase].helpKey} placement="bottom" />}
            </div>

            {cats.map(cat => {
              const catItems = byCategory[cat] ?? [];
              const catTimebox = sectionTimeboxes[cat] ?? null;
              const canEditTimebox = isSecretary && !minutesIssued && !!onSectionTimeboxChange;
              return (
                <div key={cat} className={styles.category}>
                  <div className={styles.categoryHeader}>
                    <span className={styles.categoryLabel}>
                      {CATEGORY_LABELS[cat] ?? cat}
                      {CATEGORY_HELP[cat] && <HelpDot k={CATEGORY_HELP[cat].helpKey} placement="bottom" />}
                    </span>
                    {canEditTimebox ? (
                      <SectionTimeboxInput
                        category={cat}
                        value={catTimebox}
                        onChange={onSectionTimeboxChange}
                      />
                    ) : catTimebox > 0 ? (
                      <span className={styles.categoryTimebox}>{catTimebox}m</span>
                    ) : null}
                  </div>
                  {catItems.map(item => (
                    <AgendaItem
                      key={item.id}
                      item={item}
                      isSecretary={isSecretary}
                      isClosed={isClosed}
                      minutesIssued={minutesIssued}
                      meetingId={meetingId}
                      onChanged={handleChanged}
                      index={indexMap[item.id]}
                      total={items.length}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
