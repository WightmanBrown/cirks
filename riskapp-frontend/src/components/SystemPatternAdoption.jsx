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

// (The system profile strip that stood here was retired in v178: a system's
// questions are its pattern's slots, answered in SystemPatternSection.)

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
        aria-label={`The standard build ${name} and its ${plural(components.length, 'component')}: which are on this system and which adopting it would add`}>
        {components.map((c, i) => {
          const y = top + i * step;
          return <path key={c.id} className={c.state === 'would' ? styles.edgeWould : styles.edge}
            d={`M196 ${cy} C 250 ${cy}, 250 ${y}, 300 ${y}`} />;
        })}
        <text className={styles.eyebrow} x="16" y={cy - 34}>STANDARD BUILD</text>
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
  const [confirmed, setConfirmed] = useState(false);
  const [takePattern, setTakePattern] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const build = builds.find(b => b.id === buildId) || builds[0];

  useEffect(() => {
    let live = true;
    setPreview(null); setError(''); setConfirmed(false); setTakePattern(false);
    previewSystemBuild(systemId, build.id)
      .then(p => { if (live) setPreview(p); })
      .catch(err => { if (live) setError(err?.response?.data?.error || 'Could not work out what this standard build would add.'); });
    return () => { live = false; };
  }, [systemId, build.id]);

  const rows = (preview?.components || []).map(c => ({
    ...c, state: c.already ? 'on' : component && c.id === component.id ? 'adding' : 'would',
  }));
  const adding = preview?.adding ?? 0;
  const cand = preview?.candidates_if_not_operational;
  const overlaps = preview?.overlaps || [];
  const needsConfirm = overlaps.length > 0 && !confirmed;
  const pattern = preview?.pattern;
  const mismatch = pattern?.state === 'mismatch';

  async function adopt() {
    setBusy(true); setError('');
    try {
      onAdopted(await applySystemBuild(systemId, build.id, status, {
        confirmOverlap: overlaps.length > 0 && confirmed,
        setPattern: pattern?.state === 'offer' && takePattern,
      }), build);
    } catch (err) {
      const d = err?.response?.data;
      // Declining the offered pattern can change which questions count once;
      // the API then names the overlaps, and they are confirmed here like any other.
      if (d?.code === 'build_overlaps') { setPreview(p => ({ ...p, overlaps: d.overlaps })); setConfirmed(false); }
      setError(d?.error || 'The standard build was not adopted.');
    }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.panel} aria-label={`Adopt the standard build ${build.name}`}>
      <div className={styles.panelHead}>
        <div className={styles.row}>
          <PatternChip kind="pattern" />
          {builds.length === 1
            ? <b>{build.name}</b>
            : (
              <select className={styles.select} value={build.id} aria-label="Which standard build"
                onChange={e => setBuildId(e.target.value)}>
                {builds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          <HelpDot k="pattern_adoption.title" placement="bottom" />
        </div>
        <div className={styles.seg} role="group" aria-label="View of the standard build">
          <button type="button" aria-pressed={view === 'picture'} onClick={() => setView('picture')}>Picture</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      <p className={styles.lead}>
        {component
          ? <><b>{component.name}</b> is part of {builds.length === 1 ? 'a standard build' : `${builds.length} standard builds`}. Adopting a standard build records its whole set of components on this system in one step.</>
          : <>Adopting this standard build records its whole set of components on this system in one step.</>}
        {' '}It is a copy: changing the standard build later does not change this system.{' '}
        <Link to="/architecture-patterns">About standard builds</Link>
      </p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!preview && !error && <p className={styles.muted}>Working out what it would add…</p>}

      {preview && view === 'picture' && (
        <figure className={styles.figure}>
          <PatternDiagram name={build.name} components={rows} />
          <figcaption className={styles.legend}>
            <span><i className={styles.swOn} />on this system</span>
            {component && <span><i className={styles.swAdding} />adding now</span>}
            <span><i className={styles.swWould} />adopting the standard build would add it</span>
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
        <p className={styles.muted}>Every component of this standard build is already recorded on this system. There is nothing to adopt.</p>
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

      {mismatch && (
        <div className={styles.mismatch} role="alert">
          <p>
            <b>This standard build follows {pattern.build.code} {pattern.build.name}; this system follows
            {' '}{pattern.system.code} {pattern.system.name}.</b>
            <HelpDot k="pattern_adoption.mismatch" placement="bottom" />
          </p>
          <p className={styles.muted}>
            One of them is wrong. Change the system&apos;s pattern, or choose a build that follows {pattern.system.code}, before adopting it.
          </p>
        </div>
      )}
      {preview && adding > 0 && pattern?.state === 'offer' && (
        <label className={styles.check}>
          <input type="checkbox" checked={takePattern} onChange={e => setTakePattern(e.target.checked)} />
          {' '}This system states no pattern. Set it to {pattern.build.code} {pattern.build.name}, the pattern this standard build follows
          <HelpDot k="pattern_adoption.offer" placement="bottom" />
        </label>
      )}
      {preview && adding > 0 && pattern?.state === 'build_none' && (
        <p className={styles.warn}>
          This standard build states no pattern. It can still be adopted, but nothing checks that it suits this system.
          {' '}<Link to="/architecture-patterns">Say which pattern it follows</Link>
        </p>
      )}

      {preview && adding > 0 && !mismatch && overlaps.length > 0 && (
        <div className={styles.overlap} role="alert">
          <p>
            <b>This system already answers {overlaps.length === 1 ? 'a question' : 'questions'} this standard build answers again.</b>
            <HelpDot k="pattern_adoption.overlap" placement="bottom" />
          </p>
          <ul>
            {overlaps.map(o => (
              <li key={o.slot}>
                <b>{o.label}:</b> {o.recorded.map(c => c.name).join(', ')} is recorded;
                {' '}adopting would add {o.adding.map(c => c.name).join(', ')}.
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            A system usually has one. A second changes which security solutions it needs, and often means the
            record is really two systems: consider recording the second part as a system of its own.
          </p>
          <label className={styles.check}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            {' '}This system really has both
          </label>
        </div>
      )}

      <div className={styles.row}>
        {component && <button type="button" className={styles.secondary} onClick={() => onAddOnly(component)}>Add {component.name} only</button>}
        {adding > 0 && !mismatch && (
          <button type="button" className={styles.primary} disabled={!status || needsConfirm || busy} onClick={adopt}
            title={!status ? 'Choose the state of the components first' : needsConfirm ? 'Confirm the second answer first' : undefined}>
            {busy ? 'Adopting…' : `Adopt the standard build (adds ${plural(adding, 'component')})`}
          </button>
        )}
        <button type="button" className={styles.linkBtn} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
