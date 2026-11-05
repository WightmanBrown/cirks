// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAnalystReport } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { scoreLevel } from '../utils/riskColors';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';

// The Risk Analyst's report — My work (docs/reporting-analyst.md): what to work
// on next (R1), my security actions (R2), the quality of what I created (R3), my
// record (R7), where control changes bring the greatest benefit (R6, the CISO's
// ranking), and where to build relationships (R8). Where unknown risk hides (R5)
// is its own page, shared with the CISO. The CISO and admin see the team or one
// analyst.

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Panel({ title, helpKey, children }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{title} <HelpDot k={helpKey} placement="bottom" /></h2>
      {children}
    </section>
  );
}

function Tile({ value, of, label, detail }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}{of != null && <span className={styles.tileOf}> of {of}</span>}</span>
      <span className={styles.tileLabel}>{label}</span>
      {detail && <span className={styles.tileDelta}>{detail}</span>}
    </div>
  );
}

function Score({ value }) {
  if (value == null) return null;
  return <span className={`${rep.score} ${rep[`band_${scoreLevel(value)}`]}`}>{value}</span>;
}

function Work({ r }) {
  const groups = r.work.filter((g) => g.count > 0);
  return (
    <Panel title="What to work on next" helpKey="analyst.work">
      {groups.length === 0 ? <p className={styles.note}>Nothing waiting on this work: every risk is validated, in date and judged.</p> : groups.map((g) => (
        <div key={g.key} className={own.group}>
          <h3 className={own.groupTitle}>{g.label} ({g.count})</h3>
          <ul className={own.list}>
            {g.rows.map((x, i) => (
              <li key={x.risk_id || i}>
                {x.link ? <Link to={x.link}>{x.label}</Link> : x.label} <Score value={x.score} />{' '}
                <span className={styles.note}>— {x.why}</span>
                {x.overdue && <> <span className={`${rep.state} ${rep.bad}`}>overdue</span></>}
              </li>
            ))}
          </ul>
          {g.count > g.rows.length && <p className={styles.note}>and {g.count - g.rows.length} more.</p>}
        </div>
      ))}
      {r.findings.total > 0 && (
        <p className={styles.note}>
          Also {plural(r.findings.total, 'assurance finding')} open across the organisation, which analysts can act on: <Link to="/findings">Assurance findings</Link>.
        </p>
      )}
    </Panel>
  );
}

function Actions({ r }) {
  const open = r.actions.filter((a) => a.open);
  const done = r.actions.filter((a) => !a.open && a.completed_at);
  return (
    <Panel title="Security actions built" helpKey="analyst.actions">
      {r.actions.length === 0 ? <p className={styles.note}>No security action has been built from this work yet.</p> : <>
        <p className={styles.note}>
          {plural(r.actions.length, 'action')} built: {open.length} open{open.filter((a) => a.overdue).length ? `, ${open.filter((a) => a.overdue).length} overdue` : ''}, {done.length} completed
          {done.length > 0 && <>, taking {done.reduce((n, a) => n + a.points_removed, 0)} points off risk scores</>}.
        </p>
        <ul className={own.list}>
          {open.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>{' '}
              <span className={styles.note}>
                {a.status === 'proposed' ? 'awaiting acceptance' : a.status.replace('_', ' ')}, {a.items_done} of {a.items} items done
                {a.target_date && <>, target {day(a.target_date)}</>}
              </span>
              {a.overdue && <> <span className={`${rep.state} ${rep.bad}`}>overdue</span></>}
              {a.risks.length > 0 && <div className={styles.note}>Lowers {a.risks.map((x) => `${x.system_name} — ${x.threat_name} (${x.score})`).join('; ')}</div>}
            </li>
          ))}
        </ul>
      </>}
    </Panel>
  );
}

function Quality({ r }) {
  const q = r.quality;
  return (
    <Panel title="The quality of what was created" helpKey="analyst.quality">
      {q.risks === 0 ? <p className={styles.note}>No risk identified yet.</p> : (
        <div className={rep.pair}>
          <div>
            <h3 className={own.groupTitle}>Complete</h3>
            <CompletenessRing size={70} complete={q.completeness.fully_judged} missing={q.risks - q.completeness.fully_judged}
              labels={{ complete: 'every objective judged', missing: 'an objective not judged' }} of="risks identified" />
            <p className={styles.note}>
              {plural(q.completeness.objectives_unjudged, 'objective')} counter{q.completeness.objectives_unjudged === 1 ? 's' : ''} a risk without a judgement of what {q.completeness.objectives_unjudged === 1 ? 'it achieves' : 'they achieve'}.
              {q.completeness.impact_known < q.risks && <> {plural(q.risks - q.completeness.impact_known, 'risk')} sit on systems with no information asset, so their impact is unknown.</>}
            </p>
          </div>
          <div>
            <h3 className={own.groupTitle}>Accepted by the CISO</h3>
            <CompletenessRing size={70} complete={q.acceptance.first_time} partial={q.acceptance.validated - q.acceptance.first_time}
              missing={q.acceptance.returned_now + q.acceptance.pending}
              labels={{ complete: 'validated first time', partial: 'validated after rework', missing: 'returned or waiting' }} of="risks identified" />
          </div>
          <div>
            <h3 className={own.groupTitle}>In date</h3>
            <p className={styles.note}>
              {q.timeliness.past_review === 0 ? 'No risk is past its review date.' : `${plural(q.timeliness.past_review, 'risk is', 'risks are')} past the review date.`}
              {q.timeliness.median_days_since_assessed != null && <> A risk was last changed {q.timeliness.median_days_since_assessed} days ago, typically.</>}
            </p>
          </div>
          <div>
            <h3 className={own.groupTitle}>Consistent</h3>
            <ul className={own.list}>
              <li>{plural(q.consistency.soa_findings, 'Statement of Applicability finding')} <Link to="/soa">(SoA)</Link></li>
              <li>{plural(q.consistency.objective_solution, 'control objective')} with no security solution <Link to="/findings">(findings)</Link></li>
              <li>{plural(q.consistency.component_scope, 'component')} whose scope is not stated</li>
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Record({ r }) {
  const x = r.record;
  const lines = [
    [x.risks_identified, 'risk', 'identified and still active'],
    [x.judgements_set, 'judgement', 'of what a control objective achieves on a risk'],
    [x.scores_lowered, 'risk score', `lowered, taking ${x.points_removed} points off`],
    [x.scores_raised, 'risk score', 'raised'],
    [x.actions_built, 'security action', 'built'],
    [x.actions_completed, 'security action', 'completed'],
    [x.findings_acted, 'assurance finding', 'acted on'],
    [x.meetings_attended, 'Security Working Group meeting', 'attended'],
  ];
  return (
    <Panel title="The record: the difference made" helpKey="analyst.record">
      <ul className={styles.facts}>
        {lines.map(([n, one, what]) => <li key={one + what}><strong>{n}</strong>{plural(n, one).replace(/^\d+ /, '')} {what}</li>)}
      </ul>
      <p className={styles.note}>In the last {x.days} days (risks identified: all still active), from what CIRKS records with a name and a date.</p>
    </Panel>
  );
}

function Benefit({ r }) {
  const f = r.benefit.fixes;
  return (
    <Panel title="Where control changes bring the greatest benefit" helpKey="analyst.benefit">
      {f.length === 0 ? <p className={styles.note}>No objective not in place has a judged effect yet.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Control objective <HelpDot k="analyst.col.objective" placement="bottom" /></th>
              <th className={styles.num}>Points removed <HelpDot k="analyst.col.points" placement="bottom" /></th>
              <th className={styles.num}>Risks <HelpDot k="analyst.col.risks" placement="bottom" /></th>
              <th className={styles.num}>Systems <HelpDot k="analyst.col.systems" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {f.map((x) => (
              <tr key={x.control_id}>
                <td><Link to={`/controls/${x.control_id}`}>{x.reference && <span className={rep.ref}>{x.reference}</span>}{x.title}</Link></td>
                <td className={styles.num}>{x.points_removed}</td>
                <td className={styles.num}>{x.risks}</td>
                <td className={styles.num}>{x.systems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={styles.note}>
        The top {f.length} of the CISO&apos;s ranking; {r.benefit.unjudged} more objectives would help but nobody has judged by how much.
        The full list, with costs, is on the <Link to="/reporting/ciso">CISO report</Link>.
      </p>
    </Panel>
  );
}

function Relationships({ r }) {
  const t = r.thresholds.action;
  return (
    <Panel title="Where to build relationships" helpKey="analyst.relationships">
      <p className={styles.note}>Each department&apos;s open and unknown risk, and the people to work with there. Where departments share a risk, the <Link to="/reporting/ciso">CISO report</Link> lists the joint cases.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Department <HelpDot k="analyst.col.department" placement="bottom" /></th>
            <th className={styles.num}>Unanswered, scoring {t} or more <HelpDot k="analyst.col.unanswered" placement="bottom" /></th>
            <th className={styles.num}>Unknown <HelpDot k="analyst.col.unknown" placement="bottom" /></th>
            <th className={styles.num}>Others&apos; systems used <HelpDot k="analyst.col.shared" placement="bottom" /></th>
            <th>People to work with <HelpDot k="analyst.col.people" placement="bottom" /></th>
          </tr>
        </thead>
        <tbody>
          {r.relationships.map((d) => (
            <tr key={d.department_id}>
              <td><Link to={`/reporting/department?department_id=${d.department_id}`}>{d.department_name}</Link></td>
              <td className={styles.num}>{d.unanswered}</td>
              <td className={styles.num}>{d.unknown}</td>
              <td className={styles.num}>{d.shared_systems_used}</td>
              <td className={styles.note}>{[d.owner_names && `IAO ${d.owner_names}`, d.iam_names && `IAM ${d.iam_names}`].filter(Boolean).join('; ') || 'none named'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export function AnalystReportPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('risks.write');
  const [pick, setPick] = useState('team');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    setError(null);
    getAnalystReport(pick).then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed, pick]);

  if (!allowed) return <Shell><CapabilityGate capability="risks.write" feature="read the risk analyst's report" /></Shell>;

  const who = r?.who;
  const title = !who ? 'My work' : who.kind === 'self' ? 'My work' : who.kind === 'team' ? 'Risk analysts’ work' : `${who.name}’s work`;
  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{title} <HelpDot k="analyst.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              The register work: what to do next, its quality, and the difference it has made.
              {r && <> As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register.</>}
              {' '}<Link to="/reporting/unknown" data-print="hide">Where unknown risk is hiding →</Link>
            </p>
          </div>
          <div className={own.controls} data-print="hide">
            {who?.can_choose && (
              <label className={styles.field}>Whose work
                <select value={pick} onChange={(e) => { setR(null); setPick(e.target.value); }}>
                  <option value="team">All risk analysts</option>
                  {who.analysts.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!r}>Print</button>
          </div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Producing the report…</p>}
        {r && <>
          <div className={styles.tiles}>
            <Tile value={r.headline.to_do} label="risks waiting on this work" detail="Returned, waiting for validation, past review, or with an objective nobody has judged." />
            <Tile value={r.headline.first_time} of={r.headline.validated} label="validated risks were accepted first time" detail="The rest were returned for rework before the CISO validated them." />
            <Tile value={r.record.points_removed} label="points taken off risk scores in the last year" detail={`From ${plural(r.record.scores_lowered, 'assessment')} recorded under this name.`} />
            <Tile value={r.headline.risks_identified} label="risks identified and still active" detail={`${r.headline.at_or_above_action} of them score ${r.thresholds.action} or more.`} />
          </div>
          <div className={rep.stack}>
            <Work r={r} />
            <Actions r={r} />
            <Quality r={r} />
            <Record r={r} />
            <Benefit r={r} />
            <Relationships r={r} />
          </div>
        </>}
      </div>
    </Shell>
  );
}
