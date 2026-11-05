// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCisoReport } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { Scatter } from '../components/BoardCharts';
import { scoreLevel } from '../utils/riskColors';
import styles from './BoardSummaryPage.module.css';
import own from './CisoReportPage.module.css';

// The CISO's reports (docs/reporting-ciso.md): the budget story end to end —
// what the business has agreed (C2), where the money goes furthest (C1), and
// which departments share risk, for joint cases (C5). Pictures first, then the
// lists behind them; every row opens the thing it counts.

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const n = (v) => Number(v).toLocaleString('en-GB');
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

const STATE_WORD = { agreed: 'Agreed', decided_not_agreed: 'Decided, not agreed', not_decided: 'Not decided' };
const STATE_TONE = { agreed: own.good, decided_not_agreed: own.warn, not_decided: own.bad };

function Panel({ title, helpKey, wide, children }) {
  return (
    <section className={`${styles.panel} ${wide ? styles.wide : ''}`}>
      <h2 className={styles.panelTitle}>{title} <HelpDot k={helpKey} placement="bottom" /></h2>
      {children}
    </section>
  );
}

// A headline number: the label says what is counted, the detail says what it
// means, so the tile reads on its own without the panels below.
function Tile({ value, of, label, detail }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}{of != null && <span className={styles.tileOf}> of {of}</span>}</span>
      <span className={styles.tileLabel}>{label}</span>
      {detail && <span className={styles.tileDelta}>{detail}</span>}
    </div>
  );
}

function Headlines({ r, action }) {
  const h = r.headline;
  const top = r.investment.fixes[0];
  const notAgreed = h.at_or_above_action - h.agreed;
  return (
    <div className={styles.tiles}>
      <Tile value={h.agreed} of={h.at_or_above_action}
        label={`risks scoring ${action} or more have a treatment the business has agreed`}
        detail={`Agreed means the Security Working Group minuted a decision, or the risk owner accepted the risk or the action to treat it. ${notAgreed === 0 ? 'None is' : `${n(notAgreed)} ${notAgreed === 1 ? 'is' : 'are'}`} still to agree.`} />
      {top ? (
        <Tile value={top.points_removed}
          label="points the best single fix would take off risk scores"
          detail={`Putting ${top.reference || top.title} in place would lower ${plural(top.risks, 'risk')} scoring ${action} or more by ${top.points_removed} points between them, bringing ${top.risks_brought_below_action} below ${action}.`} />
      ) : (
        <Tile value={0} label="points the best single fix would take off risk scores"
          detail="No fix yet has a judged effect on a risk." />
      )}
      <Tile value={h.joint_fixes}
        label="fixes that would lower risks in more than one department"
        detail={`Control objectives not yet in place that counter risks scoring ${action} or more in two or more departments: the basis for a case the departments can make together.`} />
      <Tile value={h.shared_systems_at_risk} of={r.shared.systems_total}
        label={`systems shared between departments carry a risk scoring ${action} or more`}
        detail="A system used by several departments: one incident there would affect them all." />
    </div>
  );
}

function Score({ value }) {
  if (value == null) return <span className={styles.note}>—</span>;
  return <span className={`${own.score} ${own[`band_${scoreLevel(value)}`]}`}>{value}</span>;
}

// How the business agreed a risk, in words.
function AgreedBy({ r }) {
  if (r.minuted) {
    const m = r.minuted;
    return (
      <span>
        Minuted {day(m.meeting_date)}{m.about === 'security_action' ? ' (its action)' : ''}: “{m.decision_text}”
        {!m.department_present && <span className={styles.note}> — the department&apos;s IAO and IAM were not recorded present</span>}
      </span>
    );
  }
  if (r.owner_act) return <span>{r.owner_act.kind === 'acceptance' ? 'Accepted' : 'Action accepted'} by {r.owner_act.by}, {day(r.owner_act.at)}</span>;
  return <span className={styles.note}>Not agreed by the business</span>;
}

// ── C2 ────────────────────────────────────────────────────────────────────────
const FIRST = 15;

function Agreement({ a, action }) {
  const [show, setShow] = useState('not_agreed');
  const [all, setAll] = useState(false);
  const matching = a.risks.filter((r) => show === 'all' || (show === 'agreed' ? r.state === 'agreed' : r.state !== 'agreed'));
  const rows = all ? matching : matching.slice(0, FIRST);
  return (
    <Panel title={`What the business has agreed — risks scoring ${action} or more`} helpKey="ciso.agreement" wide>
      <div className={own.split}>
        <CompletenessRing size={96} complete={a.agreed} partial={a.decided_not_agreed} missing={a.not_decided}
          labels={{ complete: 'agreed by the business', partial: 'decided, not agreed', missing: 'not decided' }}
          of={`risks scoring ${action} or more`} />
        <p className={styles.note}>
          A risk is agreed when a Security Working Group decision on it (or on its security action) is minuted, or
          when its owner accepted it or accepted the action for it. The CISO validating it alone does not count.
          Every risk not yet agreed is a candidate for the next meeting&apos;s agenda.
        </p>
      </div>
      <div className={own.filters} data-print="hide" role="group" aria-label="Show">
        {[['not_agreed', `Not yet agreed (${a.decided_not_agreed + a.not_decided})`], ['agreed', `Agreed (${a.agreed})`], ['all', `All (${a.total})`]].map(([k, label]) => (
          <button key={k} type="button" className={show === k ? own.on : own.off} aria-pressed={show === k} onClick={() => { setShow(k); setAll(false); }}>{label}</button>
        ))}
      </div>
      {rows.length === 0 ? <p className={styles.note}>None.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk <HelpDot k="ciso.col.risk" placement="bottom" /></th>
              <th>Department <HelpDot k="col.department" placement="bottom" /></th>
              <th className={styles.num}>Score <HelpDot k="ciso.col.score" placement="bottom" /></th>
              <th>Agreement <HelpDot k="ciso.col.agreement" placement="bottom" /></th>
              <th>Agreed by <HelpDot k="ciso.col.agreed_by" placement="bottom" /></th>
              <th>In hand <HelpDot k="ciso.col.in_hand" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.risk_id}>
                <td><Link to={`/risks/${r.risk_id}`}>{r.system_name} — {r.threat_name}</Link></td>
                <td>{r.department_name || '—'}</td>
                <td className={styles.num}><Score value={r.score} /></td>
                <td><span className={`${own.state} ${STATE_TONE[r.state]}`}>{STATE_WORD[r.state]}</span>
                  {!r.validated && <div className={styles.note}>not validated</div>}
                  {r.validated && !r.treatment_decision && <div className={styles.note}>no treatment decided</div>}
                </td>
                <td><AgreedBy r={r} /></td>
                <td>{r.in_hand
                  ? (r.in_hand.kind === 'action'
                      ? <>Action accepted {day(r.in_hand.accepted_at)}</>
                      : <>Accepted by {r.in_hand.by} ({r.in_hand.role}) until {day(r.in_hand.expires_at)}</>)
                  : <span className={styles.badText}>Nothing in hand</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {matching.length > rows.length && (
        <button type="button" className={styles.linkBtn} data-print="hide" onClick={() => setAll(true)}>
          Show all {matching.length} (highest score first)
        </button>
      )}
    </Panel>
  );
}

// ── C1 ────────────────────────────────────────────────────────────────────────
function costWords(f) {
  if (!f.cost) return <span className={styles.note}>Not known: {f.cost_unknown_because}</span>;
  const c = f.cost;
  const parts = [c.one_off != null && `${n(c.one_off)} one-off`, c.annual != null && `${n(c.annual)} a year`].filter(Boolean);
  return <>{c.from ? 'From ' : ''}{parts.join(', ')}{c.from ? ` (${c.solution})` : ''}</>;
}

function Investment({ inv, action }) {
  const top = inv.fixes;
  return (
    <Panel title="Where the money goes furthest" helpKey="ciso.investment" wide>
      <p className={styles.note}>
        Control objectives not in place where they counter risks scoring {action} or more: what putting each in place
        would remove, in risk points, using the residual each risk was judged to fall to. A gain is for that objective
        alone — gains do not add up across objectives. {inv.costed} of {inv.objectives} {inv.objectives === 1 ? 'has' : 'have'} a
        cost estimated; costs are given on each security solution&apos;s page.
      </p>
      {inv.unjudged > 0 && (
        <p className={styles.note}>
          {plural(inv.unjudged, 'more objective')} {inv.unjudged === 1 ? 'counters' : 'counter'} risks scoring {action} or more where
          nobody has judged what putting {inv.unjudged === 1 ? 'it' : 'them'} in place would do; {inv.unjudged === 1 ? 'it is' : 'they are'} not ranked.
        </p>
      )}
      {top.length > 0 && (
        <Scatter corner="do these first" xLabel="systems to change" yLabel="risk points removed"
          points={top.map((f, i) => ({ key: f.control_id, x: f.systems, y: f.points_removed, label: f.reference || f.title, named: i < 5 }))} />
      )}
      {top.length === 0 ? <p className={styles.note}>Nothing: every objective that counters a risk scoring {action} or more is in place.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Control objective <HelpDot k="col.control" placement="bottom" /></th>
              <th className={styles.num}>Risks <HelpDot k="ciso.col.risks" placement="bottom" /></th>
              <th className={styles.num}>Points removed <HelpDot k="ciso.col.points" placement="bottom" /></th>
              <th className={styles.num}>Systems <HelpDot k="ciso.col.systems" placement="bottom" /></th>
              <th>Departments <HelpDot k="ciso.col.departments" placement="bottom" /></th>
              <th>Estimated cost <HelpDot k="ciso.col.cost" placement="bottom" /></th>
              <th className={styles.num}>Points per 1,000 <HelpDot k="ciso.col.per_thousand" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {top.map((f) => (
              <tr key={f.control_id}>
                <td><Link to={`/controls/${f.control_id}`}>{f.reference && <span className={own.ref}>{f.reference}</span>}{f.title}</Link>
                  {f.solutions.length > 0 && (
                    <div className={styles.note}>
                      {f.solutions.map((s, i) => <span key={s.solution_id}>{i > 0 && ', '}<Link to={`/security-solutions/${s.solution_id}`}>{s.name}</Link></span>)}
                    </div>
                  )}
                </td>
                <td className={styles.num}>
                  {f.risks}
                  <div className={styles.note}>{f.risks_agreed} agreed{f.risks_judged < f.risks ? `, ${f.risks - f.risks_judged} not judged` : ''}</div>
                </td>
                <td className={styles.num}>
                  {f.points_removed}
                  {f.risks_brought_below_action > 0 && <div className={styles.note}>{plural(f.risks_brought_below_action, 'risk')} below {action}</div>}
                </td>
                <td className={styles.num}>{f.systems}</td>
                <td title={f.departments.map((d) => d.name).join(', ')}>
                  {f.departments.length === 1 ? f.departments[0].name : <><strong>{f.departments.length}</strong> departments</>}
                </td>
                <td>{costWords(f)}</td>
                <td className={styles.num}>{f.points_per_thousand ?? <span className={styles.note}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// ── C5 ────────────────────────────────────────────────────────────────────────
// Departments down the side, shared systems along the top: a cell is filled
// where the department's services use the system, coloured by the system's
// highest risk, so a row of red across departments reads at a glance.
function SharedMatrix({ systems, action }) {
  const withRisk = systems.filter((s) => s.risks_at_or_above_action > 0).slice(0, 10);
  if (!withRisk.length) return <p className={styles.note}>No shared system carries a risk scoring {action} or more.</p>;
  const depts = [...new Map(withRisk.flatMap((s) => s.departments).map((d) => [d.id, d])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={own.matrixWrap}>
      <table className={own.matrix}>
        <thead>
          <tr><th />{withRisk.map((s) => <th key={s.system_id} className={own.colHead}><Link to={`/systems/${s.system_id}`}>{s.system_name}</Link></th>)}</tr>
        </thead>
        <tbody>
          {depts.map((d) => (
            <tr key={d.id}>
              <th className={own.rowHead}>{d.name}</th>
              {withRisk.map((s) => {
                const uses = s.departments.some((x) => x.id === d.id);
                return (
                  <td key={s.system_id} className={uses ? `${own.cell} ${own[`band_${scoreLevel(s.max_score)}`]}` : own.cell}
                      title={uses ? `${d.name} uses ${s.system_name}: ${plural(s.risks_at_or_above_action, 'risk')} scoring ${action} or more, highest ${s.max_score}` : undefined}>
                    {uses ? s.risks_at_or_above_action : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>A number is the risks scoring {action} or more on that system; its colour is the highest one&apos;s band. A blank square: the department does not use it.</p>
    </div>
  );
}

function Shared({ sh, action }) {
  return (<>
    <Panel title="Shared systems — one incident, several departments" helpKey="ciso.shared" wide>
      <p className={styles.note}>
        {sh.systems_total} {sh.systems_total === 1 ? 'system is' : 'systems are'} used by the business services of more than one department.
      </p>
      <SharedMatrix systems={sh.systems} action={action} />
    </Panel>
    <div className={own.pair}>
    <Panel title="Common threats" helpKey="ciso.common_threats">
      {sh.threats.length === 0 ? <p className={styles.note}>No threat sits behind risks scoring {action} or more in more than one department.</p> : (
        <ul className={styles.facts}>
          {sh.threats.map((t) => (
            <li key={t.threat_name}><strong>{t.departments.length}</strong>departments — {t.threat_name} ({plural(t.risks, 'risk')}, highest {t.max_score})</li>
          ))}
        </ul>
      )}
    </Panel>
    <Panel title="Joint cases for investment" helpKey="ciso.joint">
      {sh.joint_fixes.length === 0 ? <p className={styles.note}>No single fix answers risks in more than one department.</p> : (
        <ul className={styles.facts}>
          {sh.joint_fixes.map((f) => (
            <li key={f.control_id}>
              <strong>{f.departments.length}</strong>departments — <Link to={`/controls/${f.control_id}`}>{f.reference || f.title}</Link>:{' '}
              {plural(f.risks, 'risk')}, {f.points_removed} points, {plural(f.systems, 'system')}
            </li>
          ))}
        </ul>
      )}
    </Panel>
    </div>
  </>);
}

export function CisoReportPage() {
  const { hasCapability } = useAuth();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const allowed = hasCapability('reports.read');

  useEffect(() => {
    if (allowed) getCisoReport().then(setR).catch(() => setError('The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <CapabilityGate capability="reports.read" feature="read the CISO report" />;
  const action = r?.thresholds.action;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>CISO report <HelpDot k="ciso.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              What the business has agreed, where investment removes the most risk, and which departments share it.
              {' '}<Link to="/reporting/unknown" data-print="hide">Where unknown risk is hiding →</Link>
              {r && <> As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register.</>}
            </p>
          </div>
          <div data-print="hide">
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!r}>Print</button>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Producing the report…</p>}
        {r && <>
          <Headlines r={r} action={action} />
          <div className={own.stack}>
            <Agreement a={r.agreement} action={action} />
            <Investment inv={r.investment} action={action} />
            <Shared sh={r.shared} action={action} />
          </div>
        </>}
      </div>
    </Shell>
  );
}
