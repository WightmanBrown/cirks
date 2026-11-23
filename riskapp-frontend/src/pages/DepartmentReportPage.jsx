// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDepartmentReport, getDepartments } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { PanelQuestions } from '../components/PanelQuestions';
import { RiskAnswerRow, RiskOpener, useRiskUnfold } from '../components/RiskAnswer';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { HeatMap, TrendLine } from '../components/BoardCharts';
import { scoreLevel } from '../utils/riskColors';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';

// The Information Asset Owner's report — My department (docs/reporting-iao.md).
// Written for someone who is not a security specialist: every number is a
// sentence, says what to do, and opens the rows behind it. An IAO or IAM sees
// their own department; admin, CISO and SIRO choose one. Risks on systems other
// departments own are shown read only, with the owning department's IAO named.

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const month = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const FIRST = 8;

const ANSWER = { treated: ['Security action planned', rep.good], accepted: ['Formally accepted', rep.warn], nothing: ['No security action planned', rep.bad] };
const WHY = { direct_edit: 'Assessment changed', action_verified: 'Security action completed', corrective_action: 'Corrective action' };

function Panel({ title, helpKey, children, id }) {
  // `id`: an address to land on (My Tasks links to #obligations, 2026-11-18).
  useEffect(() => {
    if (!id || window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [id]);
  return (
    <section className={styles.panel} id={id} style={id ? { scrollMarginTop: 80 } : undefined}>
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
  if (value == null) return <span className={styles.note}>—</span>;
  return <span className={`${rep.score} ${rep[`band_${scoreLevel(value)}`]}`}>{value}</span>;
}

function Answer({ a }) {
  const [word, tone] = ANSWER[a];
  return <span className={`${rep.state} ${tone}`}>{word}</span>;
}

// A list that shows its first few rows and the rest on request.
function Some({ rows, render, empty }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className={styles.note}>{empty}</p>;
  const shown = all ? rows : rows.slice(0, FIRST);
  return <>
    <ul className={own.list}>{shown.map(render)}</ul>
    {rows.length > FIRST && (
      <button type="button" className={styles.linkBtn} onClick={() => setAll((v) => !v)}>
        {all ? 'Show fewer' : `Show all ${rows.length}`}
      </button>
    )}
  </>;
}

// "your" for the department's own IAO or IAM; "the department's" for admin, the
// CISO or the SIRO reading another department.
const whose = (r) => (r.can_choose ? 'the department\u2019s' : 'your');

function Headlines({ r }) {
  const h = r.headline;
  const w = whose(r);
  const t = r.thresholds.action;
  const answered = h.answered.treated + h.answered.accepted;
  return (
    <div className={styles.tiles}>
      <Tile value={answered} of={h.at_or_above_action}
        label={`of ${w} risks scoring ${t} or higher have a security action planned or have been formally accepted`}
        detail={h.answered.nothing ? `${plural(h.answered.nothing, 'risk has', 'risks have')} neither yet.` : 'Every one has.'} />
      <Tile value={h.obligations_met} of={h.obligations_total}
        label={`of ${w} security obligations are met`}
        detail={`The record keeps this checklist${r.can_choose ? '' : ' for you'}; each open item below says what to do.`} />
      <Tile value={h.shared_at_or_above_action}
        label={`risks scoring ${t} or higher on systems other departments own that ${w} services use`}
        detail={`Across ${plural(r.shared.systems.filter((s) => s.at_or_above_action > 0).length, 'system')}. ${r.can_choose ? 'They are not the department\u2019s to fix, but it should know about them.' : 'They are not yours to fix, but they are yours to know about.'}`} />
      <Tile value={h.actions_need_you}
        label={`security action${h.actions_need_you === 1 ? ' needs' : 's need'} ${r.can_choose ? 'the department' : 'you'}`}
        detail="Waiting to be accepted, or past their target date." />
    </div>
  );
}

function Glance({ r }) {
  const h = r.headline;
  const t = r.thresholds.action;
  return (
    <Panel title="Your risk picture" helpKey="dept.glance">
      <div className={rep.split}>
        <HeatMap grid={r.heat_map.current} label="now" />
        <HeatMap grid={r.heat_map.target} label="after committed work" />
        <div>
          <CompletenessRing size={96} complete={h.answered.treated + h.answered.accepted} missing={h.answered.nothing}
            labels={{ complete: 'security action planned or formally accepted', missing: 'no security action planned' }} of={`risks scoring ${t} or higher`} />
          <p className={styles.note}>
            {plural(h.risks, 'risk')} on {whose(r) === 'your' ? 'your department\u2019s' : 'the department\u2019s'} systems; {h.at_or_above_action} score {t} or higher, which means they must be treated or accepted
            ({h.answered.treated} being treated, {h.answered.accepted} accepted).
            {h.above_owner_max > 0 && <> {plural(h.above_owner_max, 'risk scores', 'risks score')} above {r.thresholds.owner_max}: only the CISO, SIRO or admin may accept {h.above_owner_max === 1 ? 'it' : 'them'}.</>}
          </p>
        </div>
      </div>
      <PanelQuestions questions={[
        { label: 'Which of these risks need a decision, and from whom?', to: `/reporting/decisions?dept=${r.department.id}` },
        { label: 'Which of the systems carry the most risk?', to: `/reporting/exposure?by=system&dept=${r.department.id}` },
        { label: 'Which controls are missing on the systems?', to: `/reporting/coverage?by=system&dept=${r.department.id}` },
      ]} />
    </Panel>
  );
}

// Compliance gaps (owner, 2026-11-16): control objectives the Statement of
// Applicability says apply, with no active implementation on the department's
// systems or for the organisation as a whole. Systems with most gaps first.
const IMPL = { not_implemented: 'not implemented', partial: 'partly implemented', planned: 'planned' };
const objLabel = (o) => `${o.ref ? `${o.ref.replace(/^CIRKS1\./, '')} ` : ''}${o.title}`;

function ComplianceGaps({ r }) {
  const g = r.compliance_gaps;
  const [open, setOpen] = useState(null);
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(g.systems, { accessors: {
    system: (x) => x.system_name, gaps: (x) => x.objectives.length,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <Panel title="Compliance gaps" helpKey="dept.compliance_gaps">
      <p className={styles.note}>
        Control objectives the Statement of Applicability says apply, with nothing in place to deliver them:
        {' '}{plural(g.system_gaps, 'gap')} on {plural(g.systems.length, 'system')} of {r.can_choose ? r.department.name : 'your department'},
        and {plural(g.organisation.length, 'objective')} delivered for the whole organisation not yet implemented.
      </p>
      {g.systems.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <SortableTh column="system" {...sort} helpKey="col.system">System</SortableTh>
              <SortableTh column="gaps" {...sort} className={styles.num} helpKey="dept.col.gaps">Objectives not in place</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((x) => (
              <Fragment key={x.system_id}>
                <tr>
                  <td><Link to={`/reporting/systems/${x.system_id}`}>{x.system_name}</Link></td>
                  <td className={styles.num}>
                    <button type="button" className={styles.linkBtn} aria-expanded={open === x.system_id}
                      onClick={() => setOpen(open === x.system_id ? null : x.system_id)}>
                      {x.objectives.length} {open === x.system_id ? '▾' : '▸'}
                    </button>
                  </td>
                </tr>
                {open === x.system_id && (
                  <tr><td colSpan={2}>
                    <ul className={own.list}>
                      {x.objectives.map((o) => (
                        <li key={o.control_id}><Link to={`/controls/${o.control_id}`}>{objLabel(o)}</Link>
                          <span className={styles.note}> — {o.status === 'unknown' ? 'state unknown' : 'not in place'}</span></li>
                      ))}
                    </ul>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {g.organisation.length > 0 && <>
        <h3 className={own.groupTitle}>Delivered for the whole organisation, not yet implemented ({g.organisation.length})</h3>
        <p className={styles.note}>These are not your department&apos;s to deliver, but every one of your systems relies on them.</p>
        <ul className={own.list}>
          {g.organisation.map((o) => (
            <li key={o.control_id}><Link to={`/controls/${o.control_id}`}>{objLabel(o)}</Link>
              <span className={styles.note}> — {IMPL[o.status] || o.status}{o.delivery === 'group' ? ', for a group of systems' : ''}</span></li>
          ))}
        </ul>
      </>}
      <PanelQuestions questions={[
        { label: 'Which of the systems is weakest, and why?', to: `/reporting/coverage?by=system&dept=${r.department.id}` },
      ]} />
    </Panel>
  );
}

function Obligations({ r }) {
  return (
    <Panel title="Your security obligations" helpKey="dept.obligations" id="obligations">
      <ul className={own.obligations}>
        {r.obligations.map((o) => (
          <li key={o.key}>
            <div className={own.obligationHead}>
              <span className={`${rep.state} ${o.open.length ? rep.bad : rep.good}`}>{o.open.length ? 'Open' : 'Met'}</span>
              <span>{o.label}</span>
              <span className={own.count}>{o.total === 0 ? 'nothing to do' : `${o.met} of ${o.total}`}</span>
            </div>
            {o.open.length > 0 && (
              <Some rows={o.open} render={(x) => (
                <li key={x.link + x.why}><Link to={x.link}>{x.label}</Link> <span className={styles.note}>— {x.why}</span></li>
              )} />
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const GROUP = { needs_you: 'Needs you', in_hand: 'In hand', done: 'Done in the last year' };

function Actions({ r }) {
  const t = r.thresholds.action;
  if (!r.actions.length) {
    return (
      <Panel title="Your security actions" helpKey="dept.actions">
        <p className={styles.note}>
          No security action touches your department.
          {r.headline.answered.nothing > 0 && <> {r.can_choose ? 'The department has' : 'You have'} {plural(r.headline.answered.nothing, 'risk')} scoring {t} or higher.
            {r.headline.answered.nothing === 1 ? ' It should have a security action in place, but there is none' : ' These should have security actions in place, but there are none'}:
            an action is built from the risk&apos;s page, or the risk is formally accepted.</>}
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Your security actions" helpKey="dept.actions">
      {Object.entries(GROUP).map(([g, word]) => {
        const rows = r.actions.filter((a) => a.group === g);
        if (!rows.length) return null;
        return (
          <div key={g} className={own.group}>
            <h3 className={own.groupTitle}>{word} ({rows.length})</h3>
            <ul className={own.list}>
              {rows.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>{' '}
                  <span className={styles.note}>
                    {a.status === 'proposed' ? 'awaiting acceptance' : a.status.replace('_', ' ')}
                    {a.target_date && <>, target {day(a.target_date)}</>}
                    {a.overdue && <span className={`${rep.state} ${rep.bad}`}>overdue</span>}
                    {a.owner_name && <>, owned by {a.owner_name}</>}
                    {!a.ours && <>, another department&apos;s action with work for your people</>}
                  </span>
                  {a.risks.length > 0 && (
                    <div className={styles.note}>
                      Lowers {a.risks.map((x, i) => <span key={x.risk_id}>{i ? ', ' : ''}{a.ours ? <Link to={`/risks/${x.risk_id}`}>{x.system_name} — {x.threat_name}</Link> : `${x.system_name} — ${x.threat_name}`} (<Score value={x.score} />)</span>)}
                    </div>
                  )}
                  {a.items.length > 0 && (
                    <div className={styles.note}>
                      {a.items.map((i) => `${i.element} on ${i.system_name} (${i.status.replace('_', ' ')}${i.owner_name ? `, ${i.owner_name}` : ''})`).join('; ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Panel>
  );
}

function Shared({ r }) {
  const t = r.thresholds.action;
  const rows = r.shared.systems;
  return (
    <Panel title="Risk from systems outside your control" helpKey="dept.shared">
      {rows.length === 0 ? <p className={styles.note}>Your services use no system another department owns.</p> : <>
        <p className={styles.note}>
          Your services use {plural(rows.length, 'system')} that another department owns. Their risks are that department&apos;s to treat;
          here is who to talk to, and what is already answered.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>System <HelpDot k="dept.col.system" placement="bottom" /></th>
              <th>Owned by <HelpDot k="dept.col.owned_by" placement="bottom" /></th>
              <th>Your services <HelpDot k="dept.col.services" placement="bottom" /></th>
              <th className={styles.num}>Scoring {t} or higher <HelpDot k="dept.col.shared_risks" placement="bottom" /></th>
              <th className={styles.num}>Action planned or accepted <HelpDot k="dept.col.answered" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.system_id}>
                <td>{s.system_name}
                  {s.risks.map((x) => (
                    <div key={x.risk_id} className={styles.note}>{x.threat_name} <Score value={x.score} /> <Answer a={x.answer} /></div>
                  ))}
                </td>
                <td>{s.owner_department_name || 'No department'}<div className={styles.note}>{s.owner_names || 'no IAO named'}</div></td>
                <td className={styles.note}>{s.services.join(', ')}</td>
                <td className={styles.num}>{s.at_or_above_action}</td>
                <td className={styles.num}>{s.at_or_above_action ? `${s.answered} of ${s.at_or_above_action}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}
    </Panel>
  );
}

function Reputation({ r }) {
  const [openId, toggle] = useRiskUnfold();
  const rr = r.reputation;
  return (
    <Panel title="Your reputational risks" helpKey="dept.reputation">
      {rr.tables_marked === 0 ? (
        <p className={styles.note}>
          No impact table is marked as reputational yet, so CIRKS cannot tell which risks touch your reputation.
          The CISO or admin marks one on its Impact Tables page.
        </p>
      ) : rr.risks.length === 0 ? (
        <p className={styles.note}>None of your systems, or the shared systems you use, hold information rated on {rr.table_names.join(' or ')}.</p>
      ) : <>
        <p className={styles.note}>Risks on systems holding information rated on {rr.table_names.join(' or ')}, highest first.</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk <HelpDot k="dept.col.risk" placement="bottom" /></th>
              <th className={styles.num}>Score <HelpDot k="dept.col.score" placement="bottom" /></th>
              <th>Information at stake <HelpDot k="dept.col.information" placement="bottom" /></th>
              <th>Whose <HelpDot k="dept.col.whose" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {rr.risks.slice(0, 25).map((x) => (
              <Fragment key={x.risk_id}>
              <tr>
                <td>{x.own ? <RiskOpener open={openId === x.risk_id} onToggle={() => toggle(x.risk_id)}>{x.system_name} — {x.threat_name}</RiskOpener> : `${x.system_name} — ${x.threat_name}`}</td>
                <td className={styles.num}><Score value={x.score} /></td>
                <td className={styles.note}>{x.ratings.map((g) => `${g.asset_name} (${g.table_name}, level ${g.level})`).join('; ')}</td>
                <td>{x.own ? 'Yours' : x.department_name}</td>
              </tr>
              {openId === x.risk_id && <RiskAnswerRow colSpan={4} riskId={x.risk_id} lead="score" />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </>}
    </Panel>
  );
}

function Improvement({ r }) {
  const [openId, toggle] = useRiskUnfold();
  const t = r.thresholds.action;
  const imp = r.improvement;
  const points = imp.trend.map((s) => ({ period: s.period, v: s.summary.at_or_above_action }));
  const now = r.generated_at.slice(0, 7);
  if (!points.some((p) => p.period === now)) points.push({ period: now, v: r.headline.at_or_above_action });
  const down = imp.changes.filter((c) => c.direction === 'down');
  return (
    <Panel title="Improvement, with evidence" helpKey="dept.improvement">
      {points.length < 2 ? (
        <p className={styles.note}>
          The monthly line starts in {month(points[0].period)}: CIRKS keeps your department&apos;s figures once a month,
          and the line appears from the second month. Today: {plural(r.headline.at_or_above_action, 'risk')} scoring {t} or higher.
        </p>
      ) : (
        <TrendLine series={[{ key: 'at', label: `scoring ${t} or higher`, tone: 'series1', points: points.map((p) => ({ period: p.period, value: p.v })) }]} />
      )}
      <p className={styles.note}>
        In the last year {plural(imp.changes.length, 'risk score')} changed on your systems: {down.length} went down and {imp.changes.length - down.length} went up.
      </p>
      {imp.changes.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When <HelpDot k="dept.col.when" placement="bottom" /></th>
              <th>Risk <HelpDot k="dept.col.risk" placement="bottom" /></th>
              <th className={styles.num}>Score <HelpDot k="dept.col.change" placement="bottom" /></th>
              <th>Why <HelpDot k="dept.col.why" placement="bottom" /></th>
              <th>By <HelpDot k="dept.col.by" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {imp.changes.slice(0, 25).map((c) => (
              <Fragment key={c.id}>
              <tr>
                <td>{day(c.changed_at)}</td>
                <td><RiskOpener open={openId === c.id} onToggle={() => toggle(c.id)}>{c.system_name} — {c.threat_name}</RiskOpener></td>
                <td className={styles.num}><Score value={c.before} /> → <Score value={c.after} /></td>
                <td className={styles.note}>{c.action_title || WHY[c.source] || c.source}{c.notes ? `: ${c.notes}` : ''}</td>
                <td className={styles.note}>{c.changed_by_name || '—'}</td>
              </tr>
              {openId === c.id && <RiskAnswerRow colSpan={5} riskId={c.risk_id} lead="why" />}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <PanelQuestions questions={[{ label: 'What moved each score, across the department?', to: `/reporting/changes?days=365&dept=${r.department.id}` }]} />
    </Panel>
  );
}

function Gaps({ r }) {
  const g = r.gaps;
  return (
    <Panel title="What nobody has looked at" helpKey="dept.gaps">
      <div className={rep.pair}>
        <div>
          <h3 className={own.groupTitle}>Threats identified, not yet assessed ({g.unassessed.length})</h3>
          <Some rows={g.unassessed} empty="None: every threat identified on your systems has been assessed."
            render={(u) => <li key={u.system_id + u.threat_id}><Link to={`/systems/${u.system_id}`}>{u.system_name}</Link> — {u.threat_name}</li>} />
        </div>
        <div>
          <h3 className={own.groupTitle}>Systems with no threat identified ({g.systems_without_threats.length})</h3>
          <Some rows={g.systems_without_threats} empty="None: every system has at least one threat identified."
            render={(s) => <li key={s.system_id}><Link to={`/systems/${s.system_id}`}>{s.system_name}</Link></li>} />
        </div>
        <div>
          <h3 className={own.groupTitle}>Information assets on no system ({g.assets_on_no_system.length})</h3>
          <Some rows={g.assets_on_no_system} empty="None: every asset is held on a system."
            render={(a) => <li key={a.asset_id}><Link to={`/assets/${a.asset_id}`}>{a.asset_name}</Link></li>} />
        </div>
        <div>
          <h3 className={own.groupTitle}>Information assets not yet rated ({g.assets_not_rated.length})</h3>
          <Some rows={g.assets_not_rated} empty="None: every asset has been rated."
            render={(a) => <li key={a.asset_id}><Link to={`/assets/${a.asset_id}`}>{a.asset_name}</Link></li>} />
        </div>
      </div>
    </Panel>
  );
}

export function DepartmentReportPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.department');
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState(params.get('department_id') || '');
  const [r, setR] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    setError(null);
    getDepartmentReport(chosen || undefined)
      .then(setR)
      .catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed, chosen]);

  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.department" feature="read the department report" /></Shell>;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{r?.can_choose ? 'Department report' : 'My department'} <HelpDot k="dept.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              {r ? <>{r.department.name}{r.department.owner_names && <>, risk owner {r.department.owner_names}</>}. As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register.</>
                : 'Your department’s information risk, actions and obligations, and the shared systems it depends on.'}
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
        {r && <>
          <Headlines r={r} />
          <div className={rep.stack}>
            <Glance r={r} />
            <Obligations r={r} />
            <ComplianceGaps r={r} />
            <Actions r={r} />
            <Shared r={r} />
            <Reputation r={r} />
            <Improvement r={r} />
            <Gaps r={r} />
          </div>
        </>}
      </div>
    </Shell>
  );
}
