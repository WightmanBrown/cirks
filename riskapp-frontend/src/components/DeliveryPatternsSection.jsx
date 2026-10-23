// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { PatternChip } from './PatternChip';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createDeliveryPattern, deleteDeliveryPattern, chooseCirksForControl, addDeliveryPatternPart, removeDeliveryPatternPart,
  listComponents, listSecuritySolutions,
} from '../api';
import { COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import { partWhere } from '../utils/deliveryPatterns';
import { SolutionPartForm } from './SolutionPartForm';
import styles from './DeliveryPatternsSection.module.css';

// The security solutions that deliver a control objective (v145 delivery
// patterns; shared across objectives since v147), and how each system the
// objective is deployed on is actually delivered. Report only: the status someone
// set on each system is shown beside what the solutions say, never changed by them.
// `cirks`: CIRKS itself can deliver this objective ({ ref, reason, chosen }), from
// GET /controls/:id. Offered, never assumed: choosing it is a person's act.
export function DeliveryPatternsSection({ controlId, patterns, canEdit, onChanged, cirks = null }) {
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null); // null | 'existing' | 'new'
  const [existingId, setExistingId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('parts');
  const [components, setComponents] = useState(null);
  const [library, setLibrary] = useState(null);

  // The component picker is only needed while editing. Reloaded after a
  // component's scope is stated here, since the scope decides where it can be.
  const loadComponents = () => listComponents().then(setComponents).catch(() => setComponents([]));
  useEffect(() => {
    if (!canEdit || components) return;
    loadComponents();
  }, [canEdit, components]); // eslint-disable-line react-hooks/exhaustive-deps -- loads once

  // The library changes whenever a solution is added or removed here.
  useEffect(() => {
    if (!canEdit) return;
    listSecuritySolutions().then(setLibrary).catch(() => setLibrary([]));
  }, [canEdit, patterns]);

  const run = async (fn) => {
    setError('');
    try { onChanged(await fn()); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  const here = new Set(patterns.map(p => p.id));
  const available = (library || []).filter(p => !here.has(p.id));
  const librarySupplier = (library || []).some(p => p.kind === 'supplier');
  const close = () => { setAdding(null); setExistingId(''); setName(''); setKind('parts'); };

  return (
    <div className={styles.wrap}>
      <p className={styles.explain}>
        A <b>security solution</b> is one valid way of delivering this objective — for example
        <i> the Falcon agent on each system, reporting to the CrowdStrike console and SOC</i>. A system needs <b>one
        complete solution</b>. Alternatives are separate solutions, so parts from different solutions never combine.
        Each part says where it must be: on the system itself, on a named security service, or once for the
        organisation. One solution can deliver <b>several objectives</b> — CrowdStrike EDR monitors, logs and
        eradicates — so its parts are written once and shared. Solutions only <b>report</b> how each system is
        delivered; they do not change the status set on any system, or any risk score.
      </p>
      {cirks && !cirks.chosen && (
        <div className={styles.card} role="note" aria-label="CIRKS can deliver this objective">
          <p className={styles.explain}>
            <b>CIRKS itself can deliver this objective</b> ({cirks.ref}). {cirks.reason}
          </p>
          {canEdit && (
            <div className={styles.buttons}>
              <button className={styles.primary} type="button"
                onClick={() => run(() => chooseCirksForControl(controlId))}>
                Use CIRKS for this objective
              </button>
              <span className={styles.muted}>
                This records how the objective is delivered. Whether it is implemented is still for the Statement of Applicability to say.
              </span>
            </div>
          )}
        </div>
      )}
      {patterns.length === 0 && (
        <p className={styles.muted}>
          No security solutions deliver this objective yet. Until one does, every system this objective is on is
          expected to record all of its per-system components listed above.
        </p>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {patterns.map(p => (
        <PatternCard key={p.id} controlId={controlId} pattern={p} canEdit={canEdit}
          components={components} onScopeStated={loadComponents} run={run} setError={setError} />
      ))}

      {canEdit && adding === 'existing' && (
        <form className={styles.addForm} onSubmit={(e) => {
          e.preventDefault();
          run(async () => { const r = await createDeliveryPattern(controlId, { pattern_id: existingId }); close(); return r; });
        }}>
          <label className={styles.field}>
            <span>Security solution</span>
            <select value={existingId} onChange={e => setExistingId(e.target.value)} aria-label="Security solution">
              <option value="">Choose a security solution…</option>
              {available.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.objectives.length ? ` — delivers ${p.objectives.length} objective${p.objectives.length === 1 ? '' : 's'}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.buttons}>
            <button className={styles.primary} type="submit" disabled={!existingId}>Add to this objective</button>
            <button className={styles.secondary} type="button" onClick={close}>Cancel</button>
          </div>
        </form>
      )}

      {canEdit && adding === 'new' && (
        <form className={styles.addForm} onSubmit={(e) => {
          e.preventDefault();
          if (kind === 'parts' && !name.trim()) { setError('Give the security solution a name, e.g. "CrowdStrike EDR".'); return; }
          run(async () => { const r = await createDeliveryPattern(controlId, { name, kind }); close(); return r; });
        }}>
          <label className={styles.field}>
            <span>What delivers it</span>
            <select value={kind} onChange={e => setKind(e.target.value)} aria-label="What delivers it">
              <option value="parts">A set of parts (components)</option>
              {!librarySupplier && <option value="supplier">Provided by the supplier — met by the supplier&apos;s evidence</option>}
            </select>
          </label>
          {kind === 'parts' && (
            <label className={styles.field}>
              <span>Name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder='e.g. "CrowdStrike EDR"' aria-label="Security solution name" />
            </label>
          )}
          <div className={styles.buttons}>
            <button className={styles.primary} type="submit">Create and add to this objective</button>
            <button className={styles.secondary} type="button" onClick={close}>Cancel</button>
          </div>
        </form>
      )}

      {canEdit && !adding && (
        <div className={styles.buttons}>
          <button className={styles.secondary} onClick={() => setAdding('existing')} disabled={library !== null && available.length === 0}
            title={library !== null && available.length === 0 ? 'Every security solution in the library already delivers this objective' : undefined}>
            Add an existing security solution
          </button>
          <button className={styles.secondary} onClick={() => setAdding('new')}>Create a new security solution</button>
        </div>
      )}

    </div>
  );
}

function PatternCard({ controlId, pattern: p, canEdit, components, onScopeStated, run, setError }) {
  const others = (p.objectives || []).filter(o => o.id !== controlId);
  const shared = others.length > 0;
  // A change to a shared solution reaches every objective it delivers, so the
  // warning sits on the act itself, not only in the card's header.
  const sharedWarning = shared ? `This changes "${p.name}" for all ${others.length + 1} objectives it delivers.` : '';
  const confirmShared = (what) => !shared || window.confirm(`${what}\n\n${sharedWarning}`);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <PatternChip kind="solution" iconOnly />
        <Link className={styles.patternName} to={`/security-solutions/${p.id}`}>{p.name}</Link>
        {p.kind === 'supplier' && <span className={styles.sub}>Provided by the supplier: met when the supplier hosting or operating the system has current evidence covering this objective.</span>}
        {canEdit && (
          <button className={styles.linkBtn}
            title={others.length ? 'It still delivers its other objectives' : 'It delivers nothing else, so it is removed from the library'}
            onClick={() => run(() => deleteDeliveryPattern(controlId, p.id))}>Remove from this objective</button>
        )}
      </div>
      {shared && (
        <div className={styles.shared}>
          Also delivers {others.length === 1 ? 'one other objective' : `${others.length} other objectives`}:{' '}
          {others.map((o, i) => (
            <span key={o.id}>{i > 0 && '; '}<Link to={`/controls/${o.id}`}>{o.reference_code ? `${o.reference_code} ` : ''}{o.title}</Link></span>
          ))}
          {canEdit && p.kind === 'parts' && <>. <b>Changing its name or parts changes it for all {others.length + 1}.</b></>}
        </div>
      )}
      {p.kind === 'parts' && (
        p.parts.length === 0 ? <p className={styles.muted}>No parts yet — a solution with no parts delivers nothing.</p> : (
          <ul className={styles.parts}>
            {p.parts.map(part => (
              <li key={part.id}>
                <span className={styles.type}>{COMPONENT_TYPE_LABEL[part.component_type] || part.component_type}</span>
                <Link to={`/components/${part.component_id}`}>{part.component_name}</Link>
                <span className={styles.where}>{partWhere(part)}</span>
                {canEdit && <button className={styles.linkBtn} aria-label={`Remove ${part.component_name}`}
                  title={sharedWarning || undefined}
                  onClick={() => confirmShared(`Remove "${part.component_name}" from "${p.name}"?`)
                    && run(() => removeDeliveryPatternPart(controlId, p.id, part.id))}>Remove</button>}
              </li>
            ))}
          </ul>
        )
      )}
      {canEdit && p.kind === 'parts' && (
        <SolutionPartForm pattern={p} components={components} sharedWarning={sharedWarning}
          confirmShared={confirmShared} onScopeStated={onScopeStated} run={run} setError={setError}
          onAdd={(body) => addDeliveryPatternPart(controlId, p.id, body)} />
      )}
    </div>
  );
}
