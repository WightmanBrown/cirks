// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSiroReport } from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
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

function Stat({ value, of, label, warn }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${warn ? styles.statWarn : ''}`}>
        {value}{of != null && <span className={styles.statOf}> of {of}</span>}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
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
function RiskTable({ rows, isExpert, empty, showStages = false }) {
  if (!rows.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Risk <HelpDot k="siro.col.risk" placement="bottom" /></th>
          <th>Department <HelpDot k="col.department" placement="bottom" /></th>
          <th>Owner <HelpDot k="siro.col.owner" placement="bottom" /></th>
          <th>Current <HelpDot k="siro.col.current" placement="bottom" /></th>
          {showStages && <th>Target <HelpDot k="siro.col.target" placement="bottom" /></th>}
          <th>Treatment <HelpDot k="siro.col.treatment" placement="bottom" /></th>
          <th>Review by <HelpDot k="siro.col.review" placement="bottom" /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.risk_id}>
            <td>
              <Link className={styles.name} to={`/risks/${r.risk_id}`}>{r.threat_name}</Link>
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
        ))}
      </tbody>
    </table>
  );
}

function Decisions({ d, t, isExpert }) {
  const needAnswer = d.decided_not_delivered.length + d.accept_not_recorded.length + d.no_decision.length;
  const outside = d.acceptances.filter((e) => !e.within_authority_now);
  const expiring = d.acceptances.filter((e) => e.expiring_soon);
  return (
    <Section title="Decisions for the SIRO" helpKey="siro.decisions"
      intro={`Who may accept a risk, what has been accepted, and the risks scoring ${t.action} or more that nothing is answering yet.`}>
      <div className={styles.stats}>
        <Stat value={needAnswer} label={`scoring ${t.action} or more, with no action and no acceptance`} warn={needAnswer > 0} />
        <Stat value={d.decided_not_delivered.length} label="decided, with nothing carrying it out" warn={d.decided_not_delivered.length > 0} />
        <Stat value={d.above_owner_max.length} label={`above ${t.owner_max}: CISO, SIRO or admin to accept`} />
        <Stat value={d.acceptances.length} label="acceptances in force" />
        <Stat value={d.breaches.length} label="acceptances expired, risk still open" warn={d.breaches.length > 0} />
        <Stat value={d.signoff_pending.length} label="actions awaiting SIRO sign-off" warn={d.signoff_pending.length > 0} />
      </div>

      <h3 className={styles.subTitle}>Who may accept a risk <HelpDot k="siro.authority" placement="bottom" /></h3>
      <table className={styles.table}>
        <tbody>
          <tr><td>Risk analyst</td><td>up to a score of <strong>{t.analyst_max}</strong></td></tr>
          <tr><td>Information asset owner</td><td>up to a score of <strong>{t.owner_max}</strong></td></tr>
          <tr><td>CISO, SIRO or admin</td><td>any score</td></tr>
          <tr><td>Longest an acceptance may last</td><td><strong>{t.max_exception_days}</strong> days</td></tr>
        </tbody>
      </table>
      <p className={styles.note}>Set by the organisation; last changed {date(t.config_updated_at)}.</p>

      <h3 className={styles.subTitle}>Decided, with nothing carrying it out <HelpDot k="siro.decided_not_delivered" placement="bottom" /></h3>
      <p className={styles.intro}>A treatment was decided for these risks, and no security action is open for any of them.</p>
      <RiskTable rows={d.decided_not_delivered} isExpert={isExpert} empty="None: every decided treatment has an action carrying it out." />

      {d.accept_not_recorded.length > 0 && <>
        <h3 className={styles.subTitle}>Decided to accept, with no acceptance recorded <HelpDot k="siro.accept_not_recorded" placement="bottom" /></h3>
        <RiskTable rows={d.accept_not_recorded} isExpert={isExpert} empty="" />
      </>}

      {d.no_decision.length > 0 && <>
        <h3 className={styles.subTitle}>No treatment decided <HelpDot k="siro.no_decision" placement="bottom" /></h3>
        <RiskTable rows={d.no_decision} isExpert={isExpert} empty="" />
      </>}

      <h3 className={styles.subTitle}>Above {t.owner_max}: only the CISO, SIRO or admin may accept <HelpDot k="siro.above_owner" placement="bottom" /></h3>
      <RiskTable rows={d.above_owner_max} isExpert={isExpert} empty={`No risk scores above ${t.owner_max}.`} />

      <h3 className={styles.subTitle}>Acceptances in force <HelpDot k="siro.acceptances" placement="bottom" /></h3>
      {(outside.length > 0 || expiring.length > 0) && (
        <p className={styles.warnText}>
          {outside.length > 0 && <>{plural(outside.length, 'acceptance')} now outside the accepter's authority. </>}
          {expiring.length > 0 && <>{plural(expiring.length, 'acceptance')} expiring within {t.expiring_days} days.</>}
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
              <tr key={e.exception_id}>
                <td>
                  <Link className={styles.name} to={`/risks/${e.risk_id}`}>{e.threat_name}</Link>
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
            ))}
          </tbody>
        </table>
      )}

      {d.breaches.length > 0 && <>
        <h3 className={styles.subTitle}>Expired acceptances, risk still open <HelpDot k="siro.breaches" placement="bottom" /></h3>
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
              <tr key={e.exception_id}>
                <td>
                  <Link className={styles.name} to={`/risks/${e.risk_id}`}>{e.threat_name}</Link>
                  <span className={styles.note}>{e.system_name}</span>
                </td>
                <td>{e.department_name || '—'}</td>
                <td><Score value={e.risk_score} isExpert={isExpert} /></td>
                <td className={styles.overdue}>{date(e.expires_at)}<span className={styles.note}>{plural(e.days_overdue, 'day')} ago</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {d.signoff_pending.length > 0 && <>
        <h3 className={styles.subTitle}>Actions awaiting SIRO sign-off <HelpDot k="siro.signoff" placement="bottom" /></h3>
        <ul className={styles.list}>
          {d.signoff_pending.map((a) => (
            <li key={a.id}>{a.title} <span className={styles.muted}>— {a.owner_name || 'no owner'}, raised {date(a.created_at)}</span></li>
          ))}
        </ul>
      </>}
    </Section>
  );
}

function Exposure({ x, t, isExpert }) {
  return (
    <Section title="Exposure against the thresholds" helpKey="siro.exposure"
      intro={`Each risk's score against two limits: a risk scoring ${t.action} or more must be treated, and one scoring more than ${t.owner_max} may be accepted only by the CISO, SIRO or admin.`}>
      <div className={styles.stats}>
        <Stat value={x.current.at_or_above_action} of={x.total} label={`active risks scoring ${t.action} or more`} warn={x.current.at_or_above_action > 0} />
        <Stat value={x.current.above_owner_max} of={x.total} label={`above ${t.owner_max}`} warn={x.current.above_owner_max > 0} />
      </div>

      <h3 className={styles.subTitle}>Now, and after committed work <HelpDot k="siro.stages" placement="bottom" /></h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            <th>Current <HelpDot k="siro.col.current" placement="bottom" /></th>
            <th>Target <HelpDot k="siro.col.target" placement="bottom" /></th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Scoring {t.action} or more</td><td>{x.current.at_or_above_action}</td><td>{x.target.at_or_above_action}</td></tr>
          <tr><td>Above {t.owner_max}</td><td>{x.current.above_owner_max}</td><td>{x.target.above_owner_max}</td></tr>
        </tbody>
      </table>
      <p className={styles.note}>
        Target counts a risk at its current score unless an open security action will lower it;
        {' '}{plural(x.with_target, 'risk has', 'risks have')} committed work that does.
      </p>

      <h3 className={styles.subTitle}>By department <HelpDot k="siro.by_department" placement="bottom" /></h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Department <HelpDot k="col.department" placement="bottom" /></th>
            <th>Owner <HelpDot k="siro.col.owner" placement="bottom" /></th>
            <th className={styles.num}>Scoring {t.action} or more <HelpDot k="siro.col.at_or_above" placement="bottom" /></th>
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
      </table>

      <h3 className={styles.subTitle}>Top risks <HelpDot k="siro.top_risks" placement="bottom" /></h3>
      <RiskTable rows={x.top_risks} isExpert={isExpert} showStages empty="No active risks." />

      <h3 className={styles.subTitle}>Where risks concentrate <HelpDot k="siro.concentration" placement="bottom" /></h3>
      <p className={styles.intro}>Systems carrying more than one risk scoring {t.action} or more: one incident there could realise several of them together.</p>
      {x.concentration.length === 0 ? <p className={styles.empty}>No system carries more than one.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>System <HelpDot k="col.system" placement="bottom" /></th>
              <th>Department <HelpDot k="col.department" placement="bottom" /></th>
              <th className={styles.num}>Scoring {t.action} or more <HelpDot k="siro.col.at_or_above" placement="bottom" /></th>
              <th>Highest <HelpDot k="siro.col.highest" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {x.concentration.map((s) => (
              <tr key={s.system_id}>
                <td><Link to={`/systems/${s.system_id}`}>{s.system_name}</Link></td>
                <td>{s.department_name || '—'}</td>
                <td className={styles.num}>{s.count}</td>
                <td><Score value={s.max_score} isExpert={isExpert} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
              what needs a decision, and how the risks stand against the thresholds.
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
          <Exposure x={report.exposure} t={report.thresholds} isExpert={viewMode.isExpert} />
        </>}
      </div>
    </Shell>
  );
}
