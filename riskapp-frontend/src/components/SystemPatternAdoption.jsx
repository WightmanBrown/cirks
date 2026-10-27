// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { previewSystemBuild, applySystemBuild } from '../api';
import { PatternChip } from './PatternChip';
import { HelpDot } from './HelpDot';
import { componentTypeShort } from '../utils/componentTypes';
import styles from './SystemPatternAdoption.module.css';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The systems architecture template on one system: each group it must answer,
// with what it records or a visible blank (owner, 2026-10-06).
//
// A blank is answered where it is seen (2026-10-12): pick one of the group's
// components and say what state it is in here — the same three answers the
// security solutions below ask for a part that is not recorded. A component
// that exists once for the organisation has one state everywhere, so it is
// only recorded, never given a state here.
export function TemplateStrip({ memberships, canEdit = false, onAnswer }) {
  const [picked, setPicked] = useState({});
  // group id -> the name being recorded. It stays until the page's refreshed
  // record shows the group answered, not just until the save returns: the
  // refresh takes a few seconds, and a picker that came back to life in that
  // gap looked as if nothing had happened and invited a second click.
  const [recording, setRecording] = useState({});
  if (!memberships || memberships.length === 0) return null;

  async function answer(group, component, status) {
    setRecording(r => ({ ...r, [group.id]: component.name }));
    let saved = false;
    try { saved = (await onAnswer(component.id, status)) !== false; } catch { saved = false; }
    if (!saved) setRecording(r => { const { [group.id]: _gone, ...rest } = r; return rest; });
  }

  return (
    <div className={styles.slots}>
      {memberships.map(g => {
        const canAnswer = !g.answered && !recording[g.id] && canEdit && onAnswer && g.members.length > 0;
        const chosen = g.members.find(m => m.id === picked[g.id]);
        return (
          <div key={g.id} className={`${styles.slot} ${g.answered ? '' : styles.slotEmpty}`}>
            <span className={styles.slotGroup}>{g.name}</span>
            <span className={styles.slotValue}>
              {g.answered ? g.recorded.map(r => r.name).join(', ')
                : recording[g.id] ? recording[g.id] : 'Nothing recorded'}
            </span>
            {!g.answered && recording[g.id] && (
              <span className={styles.slotHint} role="status">Recording it on this system…</span>
            )}
            {!g.answered && !canAnswer && !recording[g.id] && g.members.length > 0 && (
              <span className={styles.slotHint}>One of the {plural(g.members.length, 'component')} in this group should be recorded here.</span>
            )}
            {!g.answered && g.members.length === 0 && (
              <span className={styles.slotHint}>This group has no components to choose from yet.</span>
            )}
            {canAnswer && (
              <div className={styles.slotAnswer}>
                <select className={styles.slotSelect} value={picked[g.id] || ''}
                  aria-label={`Which ${g.name} component this system has`}
                  onChange={e => setPicked(p => ({ ...p, [g.id]: e.target.value }))}>
                  <option value="">Which one does this system have?</option>
                  {g.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {chosen && chosen.instantiation === 'organisational' && (<>
                  <span className={styles.slotHint}>It exists once for the organisation, so its state is shared and is not set here.</span>
                  <div className={styles.slotButtons}>
                    <button type="button" className={styles.slotPrimary}
                      onClick={() => answer(g, chosen, null)}>Record it on this system</button>
                  </div>
                </>)}
                {chosen && chosen.instantiation !== 'organisational' && (<>
                  <span className={styles.slotHint}>What state is it in on this system?</span>
                  <div className={styles.slotButtons}>
                    <button type="button" className={styles.slotPrimary}
                      onClick={() => answer(g, chosen, 'operational')}>Working</button>
                    <button type="button" className={styles.slotSecondary}
                      onClick={() => answer(g, chosen, 'degraded')}>Degraded</button>
                  </div>
                </>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const STATE_WORD = { adding: 'adding now', on: 'on this system', would: 'would be added' };

// A pattern drawn as what it is: one named set fanning out to its components,
// each marked as on the system, being added, or what adopting would add.
export function PatternDiagram({ name, components }) {
  const W = 660, top = 26, step = 34;
  const H = top * 2 + step * Math.max(components.length - 1, 0);
  const cy = H / 2;
  const label = name.length > 26 ? [name.slice(0, name.lastIndexOf(' ', 26)), name.slice(name.lastIndexOf(' ', 26) + 1)] : [name];
  return (
    <div className={styles.scroll}>
      <svg className={styles.diagram} viewBox={`0 0 ${W} ${Math.max(H, 80)}`} role="img"
        aria-label={`The pattern ${name} and its ${plural(components.length, 'component')}: which are on this system and which adopting it would add`}>
        {components.map((c, i) => {
          const y = top + i * step;
          return <path key={c.id} className={c.state === 'would' ? styles.edgeWould : styles.edge}
            d={`M196 ${cy} C 250 ${cy}, 250 ${y}, 300 ${y}`} />;
        })}
        <text className={styles.eyebrow} x="16" y={cy - 34}>ARCHITECTURE PATTERN</text>
        <rect className={styles.patternBox} x="16" y={cy - 26} width="180" height="52" rx="8" />
        {label.map((line, i) => (
          <text key={i} className={styles.patternName} x="106" textAnchor="middle"
            y={cy + (label.length === 1 ? 4 : i === 0 ? -3 : 14)}>{line}</text>
        ))}
        {components.map((c, i) => {
          const y = top + i * step;
          return (
            <g key={c.id} className={styles[c.state]}>
              {c.state === 'adding' && <circle className={styles.ring} cx="308" cy={y} r="11.5" />}
              <circle className={styles.node} cx="308" cy={y} r="7" />
              <text className={styles.nodeName} x="326" y={y + 4}>{c.name}</text>
              <text className={styles.nodeState} x={W - 8} y={y + 4} textAnchor="end">{STATE_WORD[c.state]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Offered when a component being added belongs to a pattern, or when someone
// asks to adopt one directly. Adopting copies the pattern's components on, in a
// state the person must give — there is no default, because a component that is
// not operational becomes a remediation candidate on the system's risks.
export function PatternAdoptionPanel({ systemId, builds, component, onAddOnly, onAdopted, onClose }) {
  const [buildId, setBuildId] = useState(builds[0].id);
  const [preview, setPreview] = useState(null);
  const [view,    setView]    = useState('picture');
  const [status,  setStatus]  = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const build = builds.find(b => b.id === buildId) || builds[0];

  useEffect(() => {
    let live = true;
    setPreview(null); setError('');
    previewSystemBuild(systemId, build.id)
      .then(p => { if (live) setPreview(p); })
      .catch(err => { if (live) setError(err?.response?.data?.error || 'Could not work out what this pattern would add.'); });
    return () => { live = false; };
  }, [systemId, build.id]);

  const rows = (preview?.components || []).map(c => ({
    ...c, state: c.already ? 'on' : component && c.id === component.id ? 'adding' : 'would',
  }));
  const adding = preview?.adding ?? 0;
  const cand = preview?.candidates_if_not_operational;

  async function adopt() {
    setBusy(true); setError('');
    try { onAdopted(await applySystemBuild(systemId, build.id, status), build); }
    catch (err) { setError(err?.response?.data?.error || 'The pattern was not adopted.'); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.panel} aria-label={`Adopt the pattern ${build.name}`}>
      <div className={styles.panelHead}>
        <div className={styles.row}>
          <PatternChip kind="pattern" />
          {builds.length === 1
            ? <b>{build.name}</b>
            : (
              <select className={styles.select} value={build.id} aria-label="Which pattern"
                onChange={e => setBuildId(e.target.value)}>
                {builds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          <HelpDot k="pattern_adoption.title" placement="bottom" />
        </div>
        <div className={styles.seg} role="group" aria-label="View of the pattern">
          <button type="button" aria-pressed={view === 'picture'} onClick={() => setView('picture')}>Picture</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      <p className={styles.lead}>
        {component
          ? <><b>{component.name}</b> is part of {builds.length === 1 ? 'a system architecture pattern' : `${builds.length} system architecture patterns`}. Adopting a pattern records its whole set of components on this system in one step.</>
          : <>Adopting this pattern records its whole set of components on this system in one step.</>}
        {' '}It is a copy: changing the pattern later does not change this system.{' '}
        <Link to="/architecture-patterns">About patterns</Link>
      </p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!preview && !error && <p className={styles.muted}>Working out what it would add…</p>}

      {preview && view === 'picture' && (
        <figure className={styles.figure}>
          <PatternDiagram name={build.name} components={rows} />
          <figcaption className={styles.legend}>
            <span><i className={styles.swOn} />on this system</span>
            {component && <span><i className={styles.swAdding} />adding now</span>}
            <span><i className={styles.swWould} />adopting the pattern would add it</span>
          </figcaption>
        </figure>
      )}
      {preview && view === 'list' && (
        <table className={styles.table}>
          <thead><tr>
            <th>Component <HelpDot k="col.component" placement="bottom" /></th>
            <th>Type <HelpDot k="pattern_adoption.col.type" placement="bottom" /></th>
            <th>On this system <HelpDot k="pattern_adoption.col.on_system" placement="bottom" /></th>
          </tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className={styles.muted}>{componentTypeShort(c.component_type)}</td>
                <td><span className={`${styles.state} ${styles[c.state]}`}>{STATE_WORD[c.state]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {preview && adding === 0 && (
        <p className={styles.muted}>Every component of this pattern is already recorded on this system. There is nothing to adopt.</p>
      )}
      {preview && adding > 0 && (
        <label className={styles.field}>
          <span>State of the {plural(adding, 'component')} being added (required)</span>
          <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Choose their state…</option>
            <option value="operational">Operational: in place and working</option>
            <option value="degraded">Degraded: in place, not working properly</option>
            <option value="missing">Missing: should be here, not yet in place</option>
            <option value="unknown">Unknown: nobody has checked</option>
          </select>
          {cand && cand.pairs > 0 && (
            <span className={status && status !== 'operational' ? styles.warn : styles.hint}>
              Recorded as anything but operational, {plural(cand.components, 'of them becomes', 'of them become')} remediation
              work on {plural(cand.risks, 'risk')} for this system.
            </span>
          )}
        </label>
      )}

      <div className={styles.row}>
        {component && <button type="button" className={styles.secondary} onClick={() => onAddOnly(component)}>Add {component.name} only</button>}
        {adding > 0 && (
          <button type="button" className={styles.primary} disabled={!status || busy} onClick={adopt}
            title={status ? undefined : 'Choose the state of the components first'}>
            {busy ? 'Adopting…' : `Adopt the pattern (adds ${plural(adding, 'component')})`}
          </button>
        )}
        <button type="button" className={styles.linkBtn} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
