// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSystemPatterns, setSystemPattern, setSystemComponentSlot } from '../api';
import { HelpDot } from './HelpDot';
import { PatternDiagram } from './PatternDiagram';
import { ComponentModal } from './ComponentModal';
import shared from '../pages/ScopesPage.module.css';
import styles from './SolutionPatternSection.module.css';

// A system against its pattern (v177, v178), at the top of its Components tab.
// The pattern's slots ARE the record's questions (the system profile strip that
// stood below this was retired in v178):
//   * the system drawn in its pattern's shape;
//   * each unanswered slot answered by choosing a component that can play its
//     role (a component's roles say what it can answer), or by creating one
//     there that plays it — the component dialog opens with the role chosen;
//   * the slots no role answers — the application, the service, the control
//     system — filled by choosing which recorded component they are;
//   * everything else recorded, with the security solutions that use it.
// With no pattern, nothing is asked: its components are listed by role, and a
// business system is named in the component-record finding.
const STATUSES = [
  ['operational', 'Operational: in place and working'],
  ['degraded', 'Degraded: in place, not working properly'],
  ['missing', 'Missing: should be here, not yet in place'],
  ['unknown', 'Unknown: nobody has checked'],
];

// The kind of component a slot takes, from its description ("Technology ·
// network", "People · team", "Facility"); technology when it names none.
const TYPES = ['technology', 'people', 'process', 'facility', 'information'];
export function slotComponentType(slot) {
  const word = String(slot.kind || '').split(/[\s·]/)[0].toLowerCase();
  return TYPES.includes(word) ? word : 'technology';
}

function AnswerSlot({ slot, members, onAnswer, canCreate, onNew }) {
  const [pick, setPick] = useState('');
  const [status, setStatus] = useState('');
  const chosen = members.find(m => m.id === pick);
  // A component recorded once per system has its own state here, which is
  // stated, never assumed; one that exists once for the organisation keeps its own.
  const needsStatus = chosen && chosen.instantiation !== 'organisational';
  return (
    <div className={styles.slotRow}>
      <span className={styles.slotName}>{slot.label}{slot.required ? '' : ' (optional)'}</span>
      <select className={shared.input} value={pick} onChange={e => { setPick(e.target.value); setStatus(''); }}
        aria-label={`Answer ${slot.label.toLowerCase()}`}>
        <option value="">{members.length ? 'Choose what answers it…' : 'Nothing can answer it yet'}</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <span className={styles.slotChosen}>
        {needsStatus && (
          <select className={shared.input} value={status} onChange={e => setStatus(e.target.value)} aria-label={`State of ${chosen.name} here`}>
            <option value="">Its state here…</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        {chosen && (
          <button type="button" className={shared.primary} disabled={needsStatus && !status}
            onClick={async () => { if (await onAnswer(chosen.id, needsStatus ? status : null)) { setPick(''); setStatus(''); } }}>
            Record it
          </button>
        )}
        {!chosen && canCreate && (
          <button type="button" className={shared.secondary} onClick={() => onNew(slot)}
            aria-label={`New ${slot.label.toLowerCase()}`}>
            + New {slot.label.toLowerCase()}…
          </button>
        )}
      </span>
    </div>
  );
}

export function SystemPatternSection({ system, canEdit, onChanged, onAnswer, canCreateAnswer = false, solutions = [] }) {
  const [patterns, setPatterns] = useState(null);
  const [newFor, setNewFor] = useState(null);   // the slot a new component is being created to answer
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    getSystemPatterns().then(d => { setPatterns(d.patterns); setRoles(d.roles || []); }).catch(() => setPatterns([]));
  }, []);
  if (!patterns || !patterns.length) return null;

  const fit = system.pattern_fit;
  const pattern = patterns.find(p => p.code === system.system_pattern) || null;
  const recorded = (system.components || []).filter(c => c.recorded);
  const save = (fn) => fn().then(() => { setError(''); onChanged(); })
    .catch(e => setError(e?.response?.data?.error || 'Could not save.'));
  const choosePattern = (code) => save(() => setSystemPattern(system.id, code || null));
  const fillSlot = (componentId, key) => save(() => setSystemComponentSlot(system.id, componentId, key));
  const byHand = pattern ? pattern.slots.filter(s => s.fill === 'explicit') : [];
  const unanswered = pattern ? fit.slots.filter(s => s.fill === 'role' && s.state !== 'recorded') : [];
  const membersOf = (key) => (roles.find(r => r.key === key)?.members || []).filter(m => !recorded.some(c => c.id === m.id));
  // Which security solutions use a component: a part of a solution implied here.
  const usedBy = (name) => solutions.filter(s => (s.parts || []).some(p => p.component_name === name)).map(s => s.pattern_name);
  const roleLabel = (k) => roles.find(r => r.key === k)?.labels[0] || k;

  return (
    <section className={styles.systemPattern}>
      <h3 className={shared.sectionTitle}>System pattern <HelpDot k="system_detail.pattern" placement="bottom" /></h3>
      <div className={styles.implements}>
        <span className={shared.muted}>Follows</span>
        {pattern
          ? <Link className={styles.patternLink} to={`/system-patterns#${pattern.code}`}>{pattern.code} · {pattern.name}</Link>
          : <span className={shared.muted}>no pattern stated</span>}
        {canEdit && (
          <select className={shared.input} aria-label="The pattern this system follows" value={system.system_pattern || ''}
            onChange={e => choosePattern(e.target.value)}>
            <option value="">Not stated</option>
            {patterns.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
          </select>
        )}
      </div>
      {error && <p className={shared.error} role="alert">{error}</p>}

      {!pattern && (<>
        <p className={`${styles.banner} ${styles.info}`} role="status">
          {system.is_security_system
            ? <>No pattern stated, so nothing is asked of its record. As a security system it is described by the security solutions it provides.</>
            : <>No pattern stated, so CIRKS cannot say what this system&rsquo;s record should hold, and asks nothing. It is named in the
                component-record finding until a pattern is chosen. Choose one of the <Link to="/system-patterns">system patterns</Link> to see what is missing.</>}
        </p>
        {recorded.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={shared.table}>
              <thead><tr><th>Can answer <HelpDot k="system_detail.by_role" /></th><th>Recorded</th></tr></thead>
              <tbody>
                {roles.filter(r => recorded.some(c => (c.roles || []).includes(r.key))).map(r => (
                  <tr key={r.key}>
                    <td>{r.labels.join(' / ')}</td>
                    <td>{recorded.filter(c => (c.roles || []).includes(r.key)).map(c => c.name).join(', ')}</td>
                  </tr>
                ))}
                {recorded.some(c => !(c.roles || []).length) && (
                  <tr>
                    <td className={shared.muted}>No role</td>
                    <td>{recorded.filter(c => !(c.roles || []).length).map(c => c.name).join(', ')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </>)}

      {pattern && (<>
        <p className={`${styles.banner} ${styles[fit.state === 'complete' ? 'good' : 'bad']}`} role="status">
          {fit.state === 'complete'
            ? 'Complete against its pattern: every question it requires is answered.'
            : `Incomplete against its pattern. Missing: ${fit.missing.join(', ')}.`}
        </p>
        <h4 className={styles.sub}>{system.name}, in the shape of {pattern.code} {pattern.name}</h4>
        <PatternDiagram pattern={pattern} fit={fit} label={`${system.name} against ${pattern.name}`}
          asQuestions answerHint={canEdit && onAnswer ? 'Answer it under Unanswered below.' : null} />

        {canEdit && onAnswer && unanswered.length > 0 && (
          <div className={styles.byHand}>
            <h4 className={styles.sub}>Unanswered <HelpDot k="system_detail.pattern_answer" placement="bottom" /></h4>
            <p className={shared.note}>{canCreateAnswer
              ? <>Choose a component that can answer each question, or create one here: it is recorded on this system and
                  answers the question straight away.</>
              : <>Choose a component that can answer each question. Creating a new one that answers needs the architecture
                  permission (risk analyst, CISO, administrator or Security Architect), so ask one of them if none fits.</>}</p>
            {unanswered.map(slot => <AnswerSlot key={slot.key} slot={slot} members={membersOf(slot.key)} onAnswer={onAnswer}
              canCreate={canCreateAnswer} onNew={setNewFor} />)}
          </div>
        )}
        {newFor && (
          <ComponentModal
            componentType={slotComponentType(pattern.slots.find(d => d.key === newFor.key) || newFor)}
            defaultRoles={[newFor.key]}
            onClose={() => setNewFor(null)}
            onSaved={async (created) => { setNewFor(null); await onAnswer(created.id, null); }}
          />
        )}

        {byHand.length > 0 && (
          <div className={styles.byHand}>
            <h4 className={styles.sub}>Filled by hand <HelpDot k="system_detail.pattern_slots" placement="bottom" /></h4>
            <p className={shared.note}>No role says which component these are, so choose them from what is recorded. They name the system&rsquo;s subject; none is required.</p>
            {byHand.map(slot => {
              const chosen = recorded.filter(c => c.slot_key === slot.key);
              const options = recorded.filter(c => c.slot_key !== slot.key && (!slot.types || slot.types.includes(c.component_type)));
              return (
                <div key={slot.key} className={styles.slotRow}>
                  <span className={styles.slotName}>{slot.label}</span>
                  <span className={styles.slotChosen}>
                    {chosen.length === 0 && <span className={shared.muted}>none chosen</span>}
                    {chosen.map(c => (
                      <span key={c.id} className={styles.slotChip}>
                        {c.name}
                        {canEdit && (
                          <button type="button" className={styles.slotRemove} onClick={() => fillSlot(c.id, null)}
                            aria-label={`${c.name} is not ${slot.label.toLowerCase()}`}>×</button>
                        )}
                      </span>
                    ))}
                  </span>
                  {canEdit && (
                    <select className={shared.input} value="" onChange={e => e.target.value && fillSlot(e.target.value, slot.key)}
                      aria-label={`Choose a recorded component as ${slot.label.toLowerCase()}`}>
                      <option value="">{options.length ? 'Choose a recorded component…' : 'Nothing recorded of the right kind'}</option>
                      {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {fit.also.length > 0 && (
          <div className={styles.byHand}>
            <h4 className={styles.sub}>Everything else recorded <HelpDot k="system_detail.also_recorded" placement="bottom" /></h4>
            <div className={styles.tableWrap}>
              <table className={shared.table}>
                <thead><tr><th>Component</th><th>Can answer</th><th>Used by</th></tr></thead>
                <tbody>
                  {fit.also.map(c => {
                    const comp = recorded.find(x => x.id === c.id);
                    const uses = usedBy(c.name);
                    return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{(comp?.roles || []).length ? comp.roles.map(roleLabel).join(', ') : <span className={shared.muted}>no role</span>}</td>
                        <td>{uses.length ? uses.join(', ') : <span className={shared.muted}>no security solution here</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {pattern.variants && <p className={shared.note}>{pattern.variants}</p>}
      </>)}
    </section>
  );
}
