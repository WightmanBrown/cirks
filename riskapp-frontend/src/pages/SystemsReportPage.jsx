// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSystemsReport, getDepartments } from '../api';
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

// The Information Asset Manager's report — My systems (docs/reporting-iam.md):
// M1 every system at a glance, worst first; M10 who relies on them; M9 the
// person's own record. "My systems" is the department's systems (decision 2);
// "managed by me" narrows it where a system names this person as its manager.

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

function Score({ value }) {
  if (value == null) return <span className={styles.note}>—</span>;
  return <span className={`${rep.score} ${rep[`band_${scoreLevel(value)}`]}`}>{value}</span>;
}

function Since({ s }) {
  if (!s.since) return <span className={styles.note}>—</span>;
  const d = s.at_or_above_action - s.since.at_or_above_action;
  if (d === 0) return <span className={styles.note}>no change</span>;
  return <span className={`${rep.state} ${d < 0 ? rep.good : rep.bad}`}>{d < 0 ? `${-d} fewer` : `${d} more`}</span>;
}

function SystemsTable({ r, mineOnly }) {
  const t = r.thresholds.action;
  const rows = mineOnly ? r.systems.filter((s) => s.managed_by_me) : r.systems;
  if (!rows.length) return <p className={styles.note}>{mineOnly ? 'No system names you as its manager.' : 'The department has no systems.'}</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>System <HelpDot k="iam.systems.col.system" placement="bottom" /></th>
          <th className={styles.num}>Highest <HelpDot k="iam.systems.col.highest" placement="bottom" /></th>
          <th className={styles.num}>Scoring {t} or more <HelpDot k="iam.systems.col.at_or_above" placement="bottom" /></th>
          <th>Objectives in place <HelpDot k="iam.systems.col.objectives" placement="bottom" /></th>
          <th>Record <HelpDot k="iam.systems.col.record" placement="bottom" /></th>
          <th>Compliance <HelpDot k="iam.systems.col.compliance" placement="bottom" /></th>
          <th className={styles.num}>Open actions <HelpDot k="iam.systems.col.actions" placement="bottom" /></th>
          <th>Since last month <HelpDot k="iam.systems.col.since" placement="bottom" /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.system_id}>
            <td><Link to={`/reporting/systems/${s.system_id}`}>{s.system_name}</Link>
              <div className={styles.note}>{s.managed_by_name ? `managed by ${s.managed_by_name}` : 'no manager named'}</div>
            </td>
            <td className={styles.num}><Score value={s.max_score} /></td>
            <td className={styles.num}>
              {s.at_or_above_action}
              {s.at_or_above_action > 0 && <div className={styles.note}>{s.answered} answered</div>}
            </td>
            <td>
              <CompletenessRing size={34} complete={s.objectives.operational} partial={s.objectives.degraded} missing={s.objectives.missing}
                labels={{ complete: 'in place', partial: 'degraded', missing: 'not in place' }} of="control objectives" />
            </td>
            <td>{s.record_complete
              ? <span className={`${rep.state} ${rep.good}`}>Complete</span>
              : <span className={`${rep.state} ${rep.bad}`}>{s.record_missing ? `${plural(s.record_missing, 'part')} missing` : 'Incomplete'}</span>}</td>
            <td className={styles.note}>{s.compliance.length
              ? s.compliance.map((c) => <div key={c.code}>{c.name}: {c.met} of {c.applies} met</div>)
              : 'no standard applies'}</td>
            <td className={styles.num}>{s.open_actions}</td>
            <td><Since s={s} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Record({ rec }) {
  const lines = [
    [rec.items_completed, 'security action item', 'completed'],
    [rec.items_open, 'action item', 'assigned to you and still open'],
    [rec.score_changes, 'risk assessment', 'changed'],
    [rec.assets_rated, 'information asset rating', 'recorded'],
    [rec.actions_raised, 'security action', 'raised'],
    [rec.meetings_attended, 'Security Working Group meeting', 'attended'],
    [rec.recorded_changes, 'change', 'recorded in the audit log under your name'],
  ];
  const nothing = lines.every(([n]) => n === 0);
  return (
    <Panel title="My record" helpKey="iam.systems.record">
      {nothing ? (
        <p className={styles.note}>
          CIRKS has nothing recorded under your name in the last year. As you complete action items, rate assets and attend
          meetings, they appear here: the evidence your objectives are measured against.
        </p>
      ) : <>
        <ul className={styles.facts}>
          {lines.map(([n, one, what]) => <li key={one}><strong>{n}</strong>{plural(n, one).replace(/^\d+ /, '')} {what}</li>)}
          {rec.median_days_to_complete != null && <li><strong>{rec.median_days_to_complete}</strong>days, typically, from an action being accepted to your item being done</li>}
        </ul>
        {rec.completed.length > 0 && (
          <ul className={own.list}>
            {rec.completed.map((i) => <li key={i.id}>{day(i.completed_at)}: {i.element} on {i.system_name} <span className={styles.note}>({i.action_title})</span></li>)}
          </ul>
        )}
      </>}
      <p className={styles.note}>In the last {rec.days} days, from what CIRKS records with a name and a date.</p>
    </Panel>
  );
}

function Shared({ r }) {
  const rel = r.shared.relied_on;
  return (
    <Panel title="Shared interests" helpKey="iam.systems.shared">
      {rel.length === 0 ? <p className={styles.note}>No other department&apos;s services use these systems.</p> : <>
        <p className={styles.note}>Other departments rely on these systems: the people to bring with you when you argue for them.</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>System <HelpDot k="iam.systems.col.system" placement="bottom" /></th>
              <th>Relied on by <HelpDot k="iam.systems.col.relied_on" placement="bottom" /></th>
              <th>Their services <HelpDot k="iam.systems.col.their_services" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {rel.map((x) => (
              <tr key={x.system_id + x.department_id}>
                <td>{x.system_name}</td>
                <td>{x.department_name}<div className={styles.note}>{x.owner_names || 'no IAO named'}</div></td>
                <td className={styles.note}>{x.services.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}
      <p className={styles.note}>
        The department&apos;s services also use {plural(r.shared.depends_on, 'system')} other departments own;
        their risks, and the department&apos;s reputational risk, are on <Link to="/reporting/department">My department</Link>.
      </p>
    </Panel>
  );
}

export function SystemsReportPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.department');
  const [chosen, setChosen] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [r, setR] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    setError(null);
    getSystemsReport(chosen || undefined).then(setR)
      .catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed, chosen]);
  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.department" feature="read the systems report" /></Shell>;

  const mine = r ? r.systems.filter((s) => s.managed_by_me).length : 0;
  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{r?.can_choose ? 'Systems report' : 'My systems'} <HelpDot k="iam.systems.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              {r ? <>{r.department.name}: {plural(r.systems.length, 'system')}. As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register. Open a system for its full report.</>
                : 'The state of the department’s systems, and your own record.'}
            </p>
          </div>
          <div className={own.controls} data-print="hide">
            {r?.can_choose && (
              <label className={styles.field}>Department
                <select value={chosen || r.department.id} onChange={(e) => { setR(null); setChosen(e.target.value); }}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!r}>Print</button>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Producing the report…</p>}
        {r && (
          <div className={rep.stack}>
            <Panel title="The systems at a glance" helpKey="iam.systems.glance">
              {mine > 0 && (
                <div className={rep.filters} data-print="hide">
                  <button type="button" className={mineOnly ? rep.off : rep.on} onClick={() => setMineOnly(false)}>All the department&apos;s ({r.systems.length})</button>
                  <button type="button" className={mineOnly ? rep.on : rep.off} onClick={() => setMineOnly(true)}>Managed by me ({mine})</button>
                </div>
              )}
              <SystemsTable r={r} mineOnly={mineOnly} />
            </Panel>
            {!r.can_choose && <Record rec={r.record} />}
            <Shared r={r} />
          </div>
        )}
      </div>
    </Shell>
  );
}
