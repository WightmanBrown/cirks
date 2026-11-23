// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSiroReport } from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
import { RiskAnswerRow, RiskOpener, useRiskUnfold } from '../components/RiskAnswer';
import { PanelQuestions } from '../components/PanelQuestions';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlState } from '../hooks/useUrlState';
import { CapabilityGate } from '../components/CapabilityGate';
import styles from './SiroReportPage.module.css';

// The SIRO's report (docs/reporting-siro.md): decisions for the SIRO (report 2)
// and exposure against the thresholds (report 1). Live, derived on read, and
// printable from the browser. Every row opens the thing it counts.

const TREATMENT = { mitigate: 'Mitigate', accept: 'Accept', avoid: 'Avoid', transfer: 'Transfer' };
const ROLE = {
  admin: 'Admin', ciso: 'CISO', siro: 'SIRO', risk_analyst: 'Risk analyst',
  information_asset_owner: 'IAO', security_consultant: 'Security consultant',
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Section({ title, helpKey, intro, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title} <HelpDot k={helpKey} placement="bottom" /></h2>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </section>
  );
}

function Stat({ value, of, label, warn, active, onClick }) {
  const body = (<>
    <span className={`${styles.statValue} ${warn ? styles.statWarn : ''}`}>
      {value}{of != null && <span className={styles.statOf}> of {of}</span>}
    </span>
    <span className={styles.statLabel}>{label}</span>
  </>);
  if (!onClick) return <div className={styles.stat}>{body}</div>;
  return (
    <button type="button" className={`${styles.stat} ${styles.statButton} ${active ? styles.statActive : ''}`}
            aria-pressed={!!active} onClick={onClick}>{body}</button>
  );
}

function Owner({ r }) {
  // owner_names is the department's accountable people, already joined (v_department_risk_owner).
  if (!r.owner_names) return <span className={styles.muted}>—</span>;
  return <>{r.owner_names}{r.owner_is_siro_fallback && <span className={styles.note}>SIRO: no IAO</span>}</>;
}

function Score({ value, isExpert }) {
  if (value == null) return <span className={styles.muted}>—</span>;
  return <RatingChip value={value} scale="risk" variant={isExpert ? 'number' : 'word'} />;
}

// A list of risks, the same columns wherever it appears.
function RiskTable({ rows: given, isExpert, empty, showStages = false }) {
  const [openId, toggle] = useRiskUnfold();
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    risk: (r) => r.threat_name, dept: (r) => r.department_name, owner: (r) => r.owner_names, current: (r) => r.score,
    target: (r) => r.target_score, treatment: (r) => r.treatment_decision, review: (r) => (r.review_date ? new Date(r.review_date).getTime() : null),
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  if (!given.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="risk" {...sort} helpKey="siro.col.risk">Risk</SortableTh>
          <SortableTh column="dept" {...sort} helpKey="col.department">Department</SortableTh>
          <SortableTh column="owner" {...sort} helpKey="siro.col.owner">Owner</SortableTh>
          <SortableTh column="current" {...sort} helpKey="siro.col.current">Current</SortableTh>
          {showStages && <SortableTh column="target" {...sort} helpKey="siro.col.target">Target</SortableTh>}
          <SortableTh column="treatment" {...sort} helpKey="siro.col.treatment">Treatment</SortableTh>
          <SortableTh column="review" {...sort} helpKey="siro.col.review">Review by</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.risk_id}>
          <tr>
            <td>
              <RiskOpener open={openId === r.risk_id} onToggle={() => toggle(r.risk_id)}><span className={styles.name}>{r.threat_name}</span></RiskOpener>
              <span className={styles.note}>{r.system_name}</span>
            </td>
            <td>{r.department_name || '—'}</td>
            <td><Owner r={r} /></td>
            <td><Score value={r.score} isExpert={isExpert} /></td>
            {showStages && <td><Score value={r.target_score} isExpert={isExpert} /></td>}
            <td>
              {TREATMENT[r.treatment_decision] || <span className={styles.muted}>not decided</span>}
              {r.has_open_action && <span className={styles.note}>action open</span>}
              {r.has_active_exception && <span className={styles.note}>accepted</span>}
            </td>
            <td className={r.review_date && new Date(r.review_date) < new Date() ? styles.overdue : ''}>
              {date(r.review_date)}
            </td>
          </tr>
          {openId === r.risk_id && <RiskAnswerRow colSpan={showStages ? 7 : 6} riskId={r.risk_id} lead="decision" />}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

// Each headline box filters the lists below to the risks it counts, and says
// where its number comes from (tester's review, 2026-11-16). The choice is held
// in the address (?show=), so Back returns to the same list and it can be shared.
const SHOW = ['need', 'decided', 'above', 'active', 'expired', 'signoff'];

function Decisions({ d, t, isExpert }) {
  const [openId, toggle] = useRiskUnfold();
  const [rawShow, setShow] = useUrlState('show', '');
  const show = SHOW.includes(rawShow) ? rawShow : '';
  const needAnswer = d.decided_not_delivered.length + d.accept_not_recorded.length + d.no_decision.length;
  const outside = d.acceptances.filter((e) => !e.within_authority_now);
  const expiring = d.acceptances.filter((e) => e.expiring_soon);
  const pick = (k) => () => setShow(show === k ? '' : k);
  const see = (...keys) => !show || keys.includes(show);
  const why = {
    need: `${plural(needAnswer, 'risk scores', 'risks score')} ${t.action} or higher with no open security action and no exception: `
      + `${d.decided_not_delivered.length} with a treatment decided but no security action, `
      + `${d.accept_not_recorded.length} decided to accept with no exception recorded, and `
      + `${d.no_decision.length} with no treatment decided.`,
    decided: `${plural(d.decided_not_delivered.length, 'risk scores', 'risks score')} ${t.action} or higher with a treatment of mitigate, avoid or transfer decided, but no open security action and no exception.`,
    above: `${plural(d.above_owner_max.length, 'risk scores', 'risks score')} more than ${t.owner_max}, the most an information asset owner may accept. Only the CISO, SIRO or admin may accept ${d.above_owner_max.length === 1 ? 'it' : 'them'}.`,
    active: `${plural(d.acceptances.length, 'exception is', 'exceptions are')} active: a risk accepted, for a stated reason, until an expiry date.`,
    expired: `${plural(d.breaches.length, 'exception has', 'exceptions have')} passed ${d.breaches.length === 1 ? 'its' : 'their'} expiry date while the risk is still open, and nothing has replaced ${d.breaches.length === 1 ? 'it' : 'them'}.`,
    signoff: `${plural(d.signoff_pending.length, 'security action is', 'security actions are')} waiting for the SIRO to sign ${d.signoff_pending.length === 1 ? 'it' : 'them'} off.`,
  };
  return (
    <Section title="Decisions for the SIRO" helpKey="siro.decisions"
      intro={`Who may accept a risk, what has been accepted, and the risks scoring ${t.action} or higher with no security action planned and no exception. Select a box to list the risks behind its number.`}>
      <div className={styles.stats}>
        <Stat value={needAnswer} label={`scoring ${t.action} or higher, with no action and no exception`} warn={needAnswer > 0} active={show === 'need'} onClick={pick('need')} />
        <Stat value={d.decided_not_delivered.length} label="treatment decided, but no security action" warn={d.decided_not_delivered.length > 0} active={show === 'decided'} onClick={pick('decided')} />
        <Stat value={d.above_owner_max.length} label={`above ${t.owner_max}: CISO, SIRO or admin to accept`} active={show === 'above'} onClick={pick('above')} />
        <Stat value={d.acceptances.length} label="active exceptions" active={show === 'active'} onClick={pick('active')} />
        <Stat value={d.breaches.length} label="exceptions expired, risk still open" warn={d.breaches.length > 0} active={show === 'expired'} onClick={pick('expired')} />
        <Stat value={d.signoff_pending.length} label="actions awaiting SIRO sign-off" warn={d.signoff_pending.length > 0} active={show === 'signoff'} onClick={pick('signoff')} />
      </div>
      {show && (
        <div className={styles.showing} role="status">
          <span><strong>Where this number comes from.</strong> {why[show]}</span>
          <button type="button" className={styles.secondary} data-print="hide" onClick={() => setShow('')}>Show everything</button>
        </div>
      )}

      {!show && <>
      <h3 className={styles.subTitle}>Who may accept a risk <HelpDot k="siro.authority" placement="bottom" /></h3>
      <table className={styles.table}>
        <tbody>
          <tr><td>Risk analyst</td><td>up to a score of <strong>{t.analyst_max}</strong></td></tr>
          <tr><td>Information asset owner</td><td>up to a score of <strong>{t.owner_max}</strong></td></tr>
          <tr><td>CISO, SIRO or admin</td><td>any score</td></tr>
          <tr><td>Longest an exception may last</td><td><strong>{t.max_exception_days}</strong> days</td></tr>
        </tbody>
      </table>
      <p className={styles.note}>Set by the organisation; last changed {date(t.config_updated_at)}.</p>
      </>}

      {see('need', 'decided') && <>
        <h3 className={styles.subTitle}>Risks with a treatment decided but no security action <HelpDot k="siro.decided_not_delivered" placement="bottom" /></h3>
        <p className={styles.intro}>A treatment was decided for these risks, and no security action is open for any of them.</p>
        <RiskTable rows={d.decided_not_delivered} isExpert={isExpert} empty="None: every decided treatment has a security action." />
      </>}

      {see('need') && (show === 'need' || d.accept_not_recorded.length > 0) && <>
        <h3 className={styles.subTitle}>Decided to accept, with no exception recorded <HelpDot k="siro.accept_not_recorded" placement="bottom" /></h3>
        <RiskTable rows={d.accept_not_recorded} isExpert={isExpert} empty="None." />
      </>}

      {see('need') && (show === 'need' || d.no_decision.length > 0) && <>
        <h3 className={styles.subTitle}>No treatment decided <HelpDot k="siro.no_decision" placement="bottom" /></h3>
        <RiskTable rows={d.no_decision} isExpert={isExpert} empty="None." />
      </>}

      {see('above') && <>
        <h3 className={styles.subTitle}>Above {t.owner_max}: only the CISO, SIRO or admin may accept <HelpDot k="siro.above_owner" placement="bottom" /></h3>
        <RiskTable rows={d.above_owner_max} isExpert={isExpert} empty={`No risk scores above ${t.owner_max}.`} />
      </>}

      {see('active') && <>
      <h3 className={styles.subTitle}>Active exceptions <HelpDot k="siro.acceptances" placement="bottom" /></h3>
      {(outside.length > 0 || expiring.length > 0) && (
        <p className={styles.warnText}>
          {outside.length > 0 && <>{plural(outside.length, 'exception')} now outside the accepter's authority. </>}
          {expiring.length > 0 && <>{plural(expiring.length, 'exception')} expiring within {t.expiring_days} days.</>}
        </p>
      )}
      {d.acceptances.length === 0 ? <p className={styles.empty}>No risk is accepted.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk <HelpDot k="siro.col.risk" placement="bottom" /></th>
              <th>Department <HelpDot k="col.department" placement="bottom" /></th>
              <th>Current <HelpDot k="siro.col.current" placement="bottom" /></th>
              <th>Accepted by <HelpDot k="siro.col.accepted_by" placement="bottom" /></th>
              <th>Within authority <HelpDot k="siro.col.within_authority" placement="bottom" /></th>
              <th>Expires <HelpDot k="siro.col.expires" placement="bottom" /></th>
              <th>Renewed <HelpDot k="siro.col.renewed" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {d.acceptances.map((e) => (
              <Fragment key={e.exception_id}>
              <tr>
                <td>
                  <RiskOpener open={openId === e.risk_id} onToggle={() => toggle(e.risk_id)}><span className={styles.name}>{e.threat_name}</span></RiskOpener>
                  <span className={styles.note}>{e.system_name}</span>
                </td>
                <td>{e.department_name || '—'}</td>
                <td><Score value={e.risk_score} isExpert={isExpert} /></td>
                <td>{e.accepted_by_name}<span className={styles.note}>{ROLE[e.accepted_role] || e.accepted_role}, {date(e.accepted_at)}</span></td>
                <td>{e.within_authority_now ? 'Yes' : <span className={styles.warnText}>No: the risk has risen</span>}</td>
                <td className={e.expiring_soon ? styles.overdue : ''}>
                  {date(e.expires_at)}
                  {e.days_until_expiry != null && <span className={styles.note}>in {plural(e.days_until_expiry, 'day')}</span>}
                </td>
                <td>{e.renewals > 0 ? plural(e.renewals, 'time') : 'No'}</td>
              </tr>
              {openId === e.risk_id && <RiskAnswerRow colSpan={7} riskId={e.risk_id} lead="decision" />}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      </>}

      {see('expired') && (show === 'expired' || d.breaches.length > 0) && <>
        <h3 className={styles.subTitle}>Expired exceptions, risk still open <HelpDot k="siro.breaches" placement="bottom" /></h3>
        {d.breaches.length === 0 ? <p className={styles.empty}>None.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk <HelpDot k="siro.col.risk" placement="bottom" /></th>
              <th>Department <HelpDot k="col.department" placement="bottom" /></th>
              <th>Current <HelpDot k="siro.col.current" placement="bottom" /></th>
              <th>Expired <HelpDot k="siro.col.expired" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {d.breaches.map((e) => (
              <Fragment key={e.exception_id}>
              <tr>
                <td>
                  <RiskOpener open={openId === e.risk_id} onToggle={() => toggle(e.risk_id)}><span className={styles.name}>{e.threat_name}</span></RiskOpener>
                  <span className={styles.note}>{e.system_name}</span>
                </td>
                <td>{e.department_name || '—'}</td>
                <td><Score value={e.risk_score} isExpert={isExpert} /></td>
                <td className={styles.overdue}>{date(e.expires_at)}<span className={styles.note}>{plural(e.days_overdue, 'day')} ago</span></td>
              </tr>
              {openId === e.risk_id && <RiskAnswerRow colSpan={4} riskId={e.risk_id} lead="decision" />}
              </Fragment>
            ))}
          </tbody>
        </table>
        )}
      </>}

      {see('signoff') && (show === 'signoff' || d.signoff_pending.length > 0) && <>
        <h3 className={styles.subTitle}>Actions awaiting SIRO sign-off <HelpDot k="siro.signoff" placement="bottom" /></h3>
        {d.signoff_pending.length === 0 && <p className={styles.empty}>None.</p>}
        <ul className={styles.list}>
          {d.signoff_pending.map((a) => (
            <li key={a.id}>{a.title} <span className={styles.muted}>— {a.owner_name || 'no owner'}, raised {date(a.created_at)}</span></li>
          ))}
        </ul>
      </>}
      <PanelQuestions questions={[
        { label: 'Which risks are awaiting decision, from whom, and for how long?', to: '/reporting/decisions' },
        { label: 'Which exceptions run out soon?', to: '/reporting/decisions?by=expiring' },
      ]} />
    </Section>
  );
}

// Exposure by department. The headline counts, the now-and-after table and the
// top risks repeated what the decisions above already show (tester's review,
// 2026-11-16); the department summary stays, and the rest is one question away.
function Exposure({ x, t }) {
  return (
    <Section title="Risk by department" helpKey="siro.exposure"
      intro={`Each department's active risks against the two limits: a risk scoring ${t.action} or higher must be treated, and one scoring more than ${t.owner_max} may be accepted only by the CISO, SIRO or admin.`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Department <HelpDot k="col.department" placement="bottom" /></th>
            <th>Owner <HelpDot k="siro.col.owner" placement="bottom" /></th>
            <th className={styles.num}>Scoring {t.action} or higher <HelpDot k="siro.col.at_or_above" placement="bottom" /></th>
            <th className={styles.num}>Above {t.owner_max} <HelpDot k="siro.col.above_owner" placement="bottom" /></th>
            <th className={styles.num}>Active risks <HelpDot k="siro.col.active_risks" placement="bottom" /></th>
          </tr>
        </thead>
        <tbody>
          {x.by_department.map((d) => (
            <tr key={d.department_id || 'none'}>
              <td>{d.department_id ? <Link to={`/departments/${d.department_id}`}>{d.department_name}</Link> : d.department_name}</td>
              <td><Owner r={d} /></td>
              <td className={styles.num}>{d.at_or_above_action}</td>
              <td className={styles.num}>{d.above_owner_max}</td>
              <td className={styles.num}>{d.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>All departments</td><td />
            <td className={styles.num}>{x.current.at_or_above_action}</td>
            <td className={styles.num}>{x.current.above_owner_max}</td>
            <td className={styles.num}>{x.total}</td>
          </tr>
        </tfoot>
      </table>
      <PanelQuestions questions={[
        { label: 'Which departments carry the most risk, and what will committed work move?', to: `/reporting/exposure?by=department&min=${t.action}` },
        { label: `Which systems carry several risks scoring ${t.action} or higher?`, to: `/reporting/exposure?by=system&min=${t.action}` },
        { label: 'Which threats recur across systems?', to: `/reporting/exposure?by=threat&min=${t.action}` },
        { label: `Where do the risks above ${t.owner_max} sit?`, to: `/reporting/exposure?by=risks&min=${t.owner_max + 1}` },
      ]} />
    </Section>
  );
}

export function SiroReportPage() {
  const { hasCapability } = useAuth();
  const viewMode = useViewMode();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const allowed = hasCapability('reports.read');

  useEffect(() => {
    if (!allowed) return;
    getSiroReport().then(setReport).catch(() => setError('The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <CapabilityGate capability="reports.read" feature="read the SIRO's report" />;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>SIRO report <HelpDot k="siro.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              The organisation's information risk position for the Senior Information Risk Owner:
              what needs a decision, and how each department's risks stand against the thresholds.
              {report && <> Produced {new Date(report.generated_at).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })} from the live register.</>}
            </p>
          </div>
          <div className={styles.actions} data-print="hide">
            <ViewModeToggle {...viewMode} />
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!report}>Print</button>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {!report && !error && <p className={styles.muted}>Producing the report…</p>}
        {report && <>
          <Decisions d={report.decisions} t={report.thresholds} isExpert={viewMode.isExpert} />
          <Exposure x={report.exposure} t={report.thresholds} />
        </>}
      </div>
    </Shell>
  );
}
