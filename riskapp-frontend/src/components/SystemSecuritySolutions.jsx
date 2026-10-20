// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PatternChip } from './PatternChip';
import styles from './SystemSecuritySolutions.module.css';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A part's state on this system, in the three words the picture uses. A part
// nobody has recorded, one marked missing and one nobody has checked are all
// gaps: the ideal is not covered.
export function partState(part) {
  if (part.status === 'operational') return 'ok';
  if (part.status === 'degraded') return 'degraded';
  return 'gap';
}
const GAP_WORD = (part) => (part.status == null ? 'not recorded' : part.status === 'unknown' ? 'state unknown' : 'missing');
const STATE_WORD = (part) => ({ ok: 'in place', degraded: 'degraded', gap: GAP_WORD(part) }[partState(part)]);

export function solutionState(solution) {
  const states = solution.parts.map(partState);
  const gaps = states.filter(s => s === 'gap').length;
  if (gaps) return { tone: 'warn', word: plural(gaps, 'gap') };
  if (states.includes('degraded')) return { tone: 'warn', word: 'degraded' };
  return { tone: 'ok', word: 'complete' };
}

const laneOf = (p) => (p.location === 'on_system' ? 'On this system'
  : p.location === 'service' ? `On a security system: ${p.service_system_name || 'not placed'}`
  : 'Once for the organisation');

// Only the solutions a recorded component triggers. One chosen for an objective
// a threat calls for belongs to the risk workflow, not to this tab (owner, 2026-10-06).
export const triggeredSolutions = (solutions) => (solutions || [])
  .map(s => ({ ...s, triggers: [...new Set(s.reasons.filter(r => r.reason === 'architecture').map(r => r.trigger_component_name))] }))
  .filter(s => s.triggers.length > 0);

// The ideal solution as an underlay (a faint outline for every part), the
// trigger highlighted, what this system has laid over it, and the gaps left bare.
function SolutionDiagram({ solution }) {
  const W = 800;
  const rows = []; let y = 12; let lane = null;
  solution.parts.forEach(p => {
    const l = laneOf(p);
    if (l !== lane) { if (lane) y += 6; rows.push({ lane: l, y }); y += 20; lane = l; }
    rows.push({ part: p, y }); y += 40;
  });
  const trigH = solution.triggers.length * 46 - 6;
  const H = Math.max(y + 4, trigH + 60, 130);
  const cy = H / 2;
  const trigTop = cy - trigH / 2;
  return (
    <div className={styles.scroll}>
      <svg className={styles.diagram} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${solution.triggers.join(' and ')} ${solution.triggers.length === 1 ? 'triggers' : 'trigger'} the security solution ${solution.pattern_name}. Its parts: ${solution.parts.map(p => `${p.component_name}, ${STATE_WORD(p)}`).join('; ')}`}>
        {solution.triggers.map((t, i) => (
          <path key={t} className={styles.edge} d={`M198 ${trigTop + i * 46 + 20} C 228 ${trigTop + i * 46 + 20}, 228 ${cy}, 258 ${cy}`} />
        ))}
        {rows.filter(r => r.part).map(r => (
          <path key={r.part.component_id + r.part.location} className={partState(r.part) === 'gap' ? styles.edgeGap : styles.edge}
            d={`M448 ${cy} C 480 ${cy}, 480 ${r.y + 16}, 512 ${r.y + 16}`} />
        ))}
        <text className={styles.eyebrow} x="8" y={trigTop - 8}>{solution.triggers.length === 1 ? 'TRIGGER' : 'TRIGGERS'}</text>
        {solution.triggers.map((t, i) => (
          <g key={t}>
            <rect className={styles.trigger} x="8" y={trigTop + i * 46} width="190" height="40" rx="8" />
            <text className={styles.boxName} x="103" y={trigTop + i * 46 + 24} textAnchor="middle">{t}</text>
          </g>
        ))}
        <text className={styles.eyebrow} x="258" y={cy - 32}>SECURITY SOLUTION</text>
        <rect className={styles.solution} x="258" y={cy - 24} width="190" height="48" rx="8" />
        <text className={styles.boxName} x="353" y={cy + 4} textAnchor="middle">{solution.pattern_name}</text>
        {rows.map(r => {
          if (r.lane) return <text key={r.lane} className={styles.eyebrow} x="512" y={r.y + 12}>{r.lane.toUpperCase()}</text>;
          const st = partState(r.part);
          return (
            <g key={r.part.component_id + r.part.location} className={styles[st]}>
              <rect className={styles.ideal} x="512" y={r.y} width="280" height="32" rx="6" />
              <rect className={styles.have} x="512" y={r.y} width="280" height="32" rx="6" />
              <text className={styles.partName} x="522" y={r.y + 20}>{r.part.component_name}</text>
              {st !== 'ok' && <text className={styles.partState} x="784" y={r.y + 20} textAnchor="end">{STATE_WORD(r.part).toUpperCase()}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function SystemSecuritySolutions({ solutions, canEdit, onRecord }) {
  const wanted = triggeredSolutions(solutions);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('picture');
  if (wanted.length === 0) {
    return <p className={styles.muted}>No component recorded on this system triggers a security solution.</p>;
  }
  const s = wanted.find(x => x.pattern_id === selected) || wanted.find(x => solutionState(x).tone === 'warn') || wanted[0];
  const unrecorded = s.parts.filter(p => p.location === 'on_system' && p.status == null);

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="group" aria-label="Security solutions triggered on this system">
        {wanted.map(x => {
          const st = solutionState(x);
          return (
            <button key={x.pattern_id} type="button" className={styles.tab} aria-pressed={x.pattern_id === s.pattern_id}
              onClick={() => setSelected(x.pattern_id)}>
              <PatternChip kind="solution" iconOnly />
              <span>{x.pattern_name}</span>
              <span className={`${styles.state} ${styles[st.tone]}`}>{st.word}</span>
            </button>
          );
        })}
      </div>

      <section className={styles.panel} aria-label={`Security solution ${s.pattern_name}`}>
        <div className={styles.panelHead}>
          <p className={styles.lead}>
            <b>{s.triggers.join(', ')}</b> {s.triggers.length === 1 ? 'triggers' : 'trigger'}{' '}
            <Link to={`/security-solutions/${s.pattern_id}`}>{s.pattern_name}</Link>
            {s.objectives.length > 0 && <>, which delivers {s.objectives.map(o => o.reference_code || o.title).join(', ')}</>}.
          </p>
          <div className={styles.seg} role="group" aria-label="View of the security solution">
            <button type="button" aria-pressed={view === 'picture'} onClick={() => setView('picture')}>Picture</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
        </div>

        {s.parts.length === 0 && (
          <p className={styles.muted}>
            {s.kind === 'supplier'
              ? 'Provided by the supplier: it is met when the supplier hosting or operating this system has current evidence covering it.'
              : 'This security solution has no component parts yet.'}
          </p>
        )}
        {s.parts.length > 0 && view === 'picture' && (
          <figure className={styles.figure}>
            <SolutionDiagram solution={s} />
            <figcaption className={styles.legend}>
              <span><i className={styles.swTrigger} />the trigger</span>
              <span><i className={styles.swIdeal} />the ideal solution</span>
              <span><i className={styles.swOk} />in place</span>
              <span><i className={styles.swDegraded} />degraded</span>
              <span><i className={styles.swGap} />gap</span>
            </figcaption>
          </figure>
        )}
        {s.parts.length > 0 && view === 'list' && (
          <table className={styles.table}>
            <thead><tr><th>Part of the solution</th><th>Where</th><th>State</th></tr></thead>
            <tbody>
              {s.parts.map(p => (
                <tr key={p.component_id + p.location}>
                  <td>{p.component_name}</td>
                  <td className={styles.muted}>{laneOf(p)}</td>
                  <td><span className={`${styles.state} ${partState(p) === 'ok' ? styles.ok : styles.warn}`}>{STATE_WORD(p)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && unrecorded.map(p => (
          <div key={p.component_id} className={styles.record}>
            <span><b>{p.component_name}</b> is not recorded on this system.</span>
            <button type="button" className={styles.primary} onClick={() => onRecord(p.component_id, 'operational')}>It is here, working</button>
            <button type="button" className={styles.secondary} onClick={() => onRecord(p.component_id, 'degraded')}>Here, degraded</button>
            <button type="button" className={styles.secondary} onClick={() => onRecord(p.component_id, 'missing')}>Genuinely missing</button>
          </div>
        ))}
      </section>
    </div>
  );
}
