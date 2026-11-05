// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSystemReport, recordDecisionView } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { HeatMap, TrendLine } from '../components/BoardCharts';
import { scoreLevel } from '../utils/riskColors';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';

// One system's report for its Information Asset Manager (docs/reporting-iam.md):
// M2 risks, information and who is affected; M3 actions helping it; M4
// compliance on this system; M5 value of spend and what to fund next; M7 risk
// reduction over time; M8 the decision record. Printable.

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const month = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const money = (v) => (v == null ? null : Number(v).toLocaleString('en-GB'));
const ANSWER = { treated: ['Being treated', rep.good], accepted: ['Accepted', rep.warn], nothing: ['Nothing answering it', rep.bad] };
const STATE = { met: ['Met', rep.good], partial: ['Partly met', rep.warn], gap: ['Not met', rep.bad] };
const WHY = { direct_edit: 'Assessment changed', action_verified: 'Security action completed', corrective_action: 'Corrective action' };
const KIND = { validated: 'Validated', minuted: 'Minuted decision', accepted: 'Risk accepted', action_accepted: 'Action accepted' };

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

function Chip({ map, k }) {
  const [word, tone] = map[k];
  return <span className={`${rep.state} ${tone}`}>{word}</span>;
}

function costWords(c) {
  if (!c) return 'Not known';
  const parts = [c.one_off != null && `${money(c.one_off)} one-off`, c.annual != null && `${money(c.annual)} a year`].filter(Boolean);
  return `${parts.join(', ')}${c.basis === 'organisation' ? ' (for the organisation)' : ''}`;
}

function Picture({ r }) {
  const t = r.thresholds.action;
  const h = r.headline;
  return (
    <Panel title="Risks on this system" helpKey="iam.system.risks">
      <div className={rep.split}>
        <HeatMap grid={r.heat_map.current} label="now" />
        <HeatMap grid={r.heat_map.target} label="after committed work" />
        <div>
          <CompletenessRing size={90} complete={h.answered.treated + h.answered.accepted} missing={h.answered.nothing}
            labels={{ complete: 'being treated or accepted', missing: 'nothing answering' }} of={`risks scoring ${t} or more`} />
          <p className={styles.note}>{plural(h.risks, 'risk')}; {h.at_or_above_action} score {t} or more and must be treated or accepted.</p>
        </div>
      </div>
      {r.risks.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Threat <HelpDot k="iam.system.col.threat" placement="bottom" /></th>
              <th className={styles.num}>Score <HelpDot k="iam.system.col.score" placement="bottom" /></th>
              <th className={styles.num}>After work <HelpDot k="iam.system.col.target" placement="bottom" /></th>
              <th>Answered <HelpDot k="iam.system.col.answered" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {r.risks.map((x) => (
              <tr key={x.risk_id}>
                <td><Link to={`/risks/${x.risk_id}`}>{x.threat_name}</Link>
                  {x.explanation && <div className={styles.note}>{x.explanation}</div>}</td>
                <td className={styles.num}><Score value={x.score} /></td>
                <td className={styles.num}><Score value={x.target_score} /></td>
                <td>{x.at_or_above_action ? <Chip map={ANSWER} k={x.answer} /> : <span className={styles.note}>below {t}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Affected({ r }) {
  return (
    <Panel title="Who and what is affected" helpKey="iam.system.affected">
      <div className={rep.pair}>
        <div>
          <h3 className={own.groupTitle}>Information held ({r.assets.length})</h3>
          {r.assets.length === 0 ? <p className={styles.note}>No information asset is recorded on this system.</p> : (
            <ul className={own.list}>
              {r.assets.map((a) => (
                <li key={a.asset_id}><Link to={`/assets/${a.asset_id}`}>{a.asset_name}</Link>{' '}
                  <span className={styles.note}>({a.department_name}{a.owner_name ? `, ${a.owner_name}` : ''})</span>
                  {a.ratings.slice(0, 3).map((g) => (
                    <div key={g.table} className={styles.note}>{g.table}, level {g.level}{g.statement ? `: ${g.statement}` : ''}</div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className={own.groupTitle}>Services that use it ({r.services.length})</h3>
          {r.services.length === 0 ? <p className={styles.note}>No business service uses this system.</p> : (
            <ul className={own.list}>
              {r.services.map((s) => <li key={s.service_id}>{s.service_name}{!s.ours && <span className={styles.note}> — {s.department_name}</span>}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Actions({ r }) {
  return (
    <Panel title="Security actions helping this system" helpKey="iam.system.actions">
      {r.actions.length === 0 ? <p className={styles.note}>No security action touches this system.</p> : (
        <ul className={own.list}>
          {r.actions.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>{' '}
              <span className={styles.note}>
                {a.status === 'proposed' ? 'awaiting acceptance' : a.status.replace('_', ' ')}
                {a.target_date && <>, target {day(a.target_date)}</>}{a.owner_name && <>, owned by {a.owner_name}</>}
              </span>{' '}
              {a.overdue && <span className={`${rep.state} ${rep.bad}`}>overdue</span>}
              {a.items.length > 0 && (
                <div className={styles.note}>
                  {a.items.filter((i) => i.status === 'completed').length} of {a.items.length} items done:{' '}
                  {a.items.map((i) => `${i.element}${i.here ? '' : ` on ${i.system_name}`} (${i.status.replace('_', ' ')})`).join('; ')}
                </div>
              )}
              {a.risks.length > 0 && <div className={styles.note}>Lowers {a.risks.map((x) => `${x.threat_name} (${x.score})`).join(', ')}</div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Compliance({ r }) {
  const [open, setOpen] = useState(null);
  if (!r.compliance.length) {
    return <Panel title="Compliance on this system" helpKey="iam.system.compliance"><p className={styles.note}>No requirement of a standard switched on applies to this system.</p></Panel>;
  }
  return (
    <Panel title="Compliance on this system" helpKey="iam.system.compliance">
      {r.compliance.map((st) => (
        <div key={st.code} className={own.group}>
          <div className={rep.split}>
            <CompletenessRing size={70} complete={st.met} partial={st.partial} missing={st.gap}
              labels={{ complete: 'met', partial: 'partly met', missing: 'not met' }} of={`${st.name} requirements that apply here`} />
            <p className={styles.note}>
              <strong>{st.name}</strong>: of the {st.applies} requirements that apply on this system, {st.met} are met here.
              A requirement is met only when every control objective it maps to is in place.{' '}
              <button type="button" className={styles.linkBtn} data-print="hide" onClick={() => setOpen(open === st.code ? null : st.code)}>
                {open === st.code ? 'Hide the requirements' : 'Show the requirements not met'}
              </button>
            </p>
          </div>
          {open === st.code && (
            <ul className={own.list}>
              {st.requirements.filter((q) => q.state !== 'met').map((q) => (
                <li key={q.id}><Chip map={STATE} k={q.state} /> <strong>{q.ref}</strong> {q.title}
                  <div className={styles.note}>{q.shortfalls.map((o) => `${o.ref ? `${o.ref} ` : ''}${o.title} (${o.status})`).join('; ')}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Value({ r }) {
  const v = r.value;
  const judged = v.to_fund.filter((f) => f.points > 0);
  const unjudged = v.to_fund.length - judged.length;
  return (
    <Panel title="Value of what was spent, and what to fund next" helpKey="iam.system.value">
      <h3 className={own.groupTitle}>Done</h3>
      {v.made.length === 0 ? <p className={styles.note}>No completed security action has lowered a risk on this system yet.</p> : (
        <p className={styles.note}>Completed actions took {v.removed} points off this system&apos;s risk scores: {v.made.map((m) => `${m.title} (${m.threat_name} ${m.before} → ${m.now})`).join('; ')}.</p>
      )}
      <p className={styles.note}>
        {plural(v.in_place.length, 'security solution')} deliver{v.in_place.length === 1 ? 's' : ''} objectives here.
        {v.in_place.some((s) => s.cost_basis) ? ' Estimated costs: ' + [...new Map(v.in_place.filter((s) => s.cost_basis).map((s) => [s.pattern_id, s])).values()]
          .map((s) => `${s.name}, ${costWords({ one_off: s.cost_one_off, annual: s.cost_annual, basis: s.cost_basis })}`).join('; ') + '.'
          : ' None has an estimated cost yet; give one on the solution’s page.'}
      </p>
      <h3 className={own.groupTitle}>To fund next</h3>
      {judged.length === 0 ? (
        <p className={styles.note}>
          {v.to_fund.length === 0 ? 'Every objective that counters a risk here is in place.'
            : `${plural(v.to_fund.length, 'objective')} not in place here ${v.to_fund.length === 1 ? 'counters' : 'counter'} its risks, but nobody has judged how far ${v.to_fund.length === 1 ? 'it' : 'they'} would lower them, so none can be ranked.`}
        </p>
      ) : <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Control objective <HelpDot k="iam.system.col.objective" placement="bottom" /></th>
              <th className={styles.num}>Points removed <HelpDot k="iam.system.col.points" placement="bottom" /></th>
              <th>Estimated cost <HelpDot k="iam.system.col.cost" placement="bottom" /></th>
              <th className={styles.num}>Per 1,000 <HelpDot k="iam.system.col.per_thousand" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {judged.map((f) => (
              <tr key={f.control_id}>
                <td>{f.reference && <span className={rep.ref}>{f.reference}</span>}{f.title}
                  <div className={styles.note}>{plural(f.risks, 'risk')}{f.below ? `, ${f.below} below ${r.thresholds.action}` : ''}</div></td>
                <td className={styles.num}>{f.points}</td>
                <td className={styles.note}>{f.cost ? `${f.from ? 'from ' : ''}${costWords(f.cost)}` : 'Not known'}</td>
                <td className={styles.num}>{f.points_per_thousand ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {unjudged > 0 && <p className={styles.note}>{plural(unjudged, 'more objective')} would help, but nobody has judged by how much.</p>}
      </>}
    </Panel>
  );
}

function Improvement({ r }) {
  const t = r.thresholds.action;
  const imp = r.improvement;
  const points = imp.trend.map((s) => ({ period: s.period, v: s.summary.at_or_above_action }));
  const now = r.generated_at.slice(0, 7);
  if (!points.some((p) => p.period === now)) points.push({ period: now, v: r.headline.at_or_above_action });
  const down = imp.changes.filter((c) => c.direction === 'down').length;
  return (
    <Panel title="Risk reduction over time" helpKey="iam.system.improvement">
      {points.length < 2 ? (
        <p className={styles.note}>The monthly line starts in {month(points[0].period)}; it appears from the second month. Today: {plural(r.headline.at_or_above_action, 'risk')} scoring {t} or more.</p>
      ) : <TrendLine series={[{ key: 'at', label: `scoring ${t} or more`, tone: 'series1', points: points.map((p) => ({ period: p.period, value: p.v })) }]} />}
      <p className={styles.note}>In the last year {plural(imp.changes.length, 'risk score')} changed here: {down} down, {imp.changes.length - down} up.</p>
      {imp.changes.length > 0 && (
        <ul className={own.list}>
          {imp.changes.slice(0, 20).map((c) => (
            <li key={c.id}>{day(c.changed_at)}: {c.threat_name} <Score value={c.before} /> → <Score value={c.after} />{' '}
              <span className={styles.note}>{c.action_title || WHY[c.source] || c.source}{c.changed_by_name ? `, ${c.changed_by_name}` : ''}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// A recorded view on a decision (v173, decision 5): dated and signed, never
// changes the decision, and cannot be edited or removed — a correction is a
// new view. Offered to the department's IAO and IAM.
function Views({ d, canRecord, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await recordDecisionView(d.risk_id, { decision_kind: d.kind, decision_ref: d.ref, body });
      setOpen(false); setBody('');
      onRecorded();
    } catch (err) {
      setError(err.response?.data?.error || 'Your view could not be recorded.');
    } finally { setBusy(false); }
  }
  return <>
    {d.views.map((v) => (
      <div key={v.id} className={own.view}>
        <strong>Recorded view</strong> — {v.written_by_name} ({v.written_role.replace(/_/g, ' ')}), {day(v.written_at)}: {v.body}
      </div>
    ))}
    {canRecord && !open && (
      <div data-print="hide"><button type="button" className={styles.linkBtn} onClick={() => setOpen(true)}>Record my view</button></div>
    )}
    {open && (
      <form onSubmit={save} className={styles.form} data-print="hide">
        <label className={styles.field}>Your view on this decision (it does not change the decision, and cannot be edited or removed once recorded)
          <textarea rows={3} required value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Recording…' : 'Record'}</button>
        </div>
      </form>
    )}
  </>;
}

function Decisions({ r, canRecord, onRecorded }) {
  return (
    <Panel title="The decision record" helpKey="iam.system.decisions">
      {r.decisions.length === 0 ? <p className={styles.note}>No decision has been recorded on this system&apos;s risks.</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When <HelpDot k="iam.system.col.when" placement="bottom" /></th>
              <th>Risk <HelpDot k="iam.system.col.threat" placement="bottom" /></th>
              <th>Decision <HelpDot k="iam.system.col.decision" placement="bottom" /></th>
              <th>By <HelpDot k="iam.system.col.by" placement="bottom" /></th>
            </tr>
          </thead>
          <tbody>
            {r.decisions.map((d, i) => (
              <tr key={`${d.kind}${d.risk_id}${i}`}>
                <td>{d.at ? day(d.at) : '—'}</td>
                <td>{d.threat_name}</td>
                <td><strong>{KIND[d.kind]}</strong>{d.on && <> on {d.on}</>}{d.words && <>: {d.words}</>}
                  {d.kind === 'minuted' && <div className={styles.note}>{d.department_present.length ? `Present for the department: ${d.department_present.join(', ')}` : 'Nobody from the department was recorded present'}</div>}
                  {d.kind === 'accepted' && <div className={styles.note}>{d.status === 'active' ? `In force until ${d.expires_at ? day(d.expires_at) : 'no date'}` : d.status}{d.within_authority_now === false ? '; today\u2019s score is above what the accepter may accept' : ''}</div>}
                  <Views d={d} canRecord={canRecord} onRecorded={onRecorded} />
                </td>
                <td className={styles.note}>{d.by || '—'}{d.role ? ` (${d.role.replace(/_/g, ' ')})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// M6: the people needed to run the system — the estimated effort of the
// security solutions in use (v173), the people its record names, and the open
// work by person. Effort for the organisation is shown apart, never added in.
function People({ r }) {
  const p = r.people;
  const perSystem = p.solutions.filter((x) => x.basis === 'per_system');
  return (
    <Panel title="People needed to run it" helpKey="iam.system.people">
      <p className={styles.note}>
        {perSystem.length > 0
          ? <>The security solutions in use here take an estimated <strong>{p.hours_here} hours a month</strong> on this system: {perSystem.map((x) => `${x.name}, ${x.hours} hours`).join('; ')}.</>
          : 'No security solution in use here has an estimated effort for each system yet.'}
        {p.shared.length > 0 && <> Shared with other systems, for the organisation: {p.shared.map((x) => `${x.name} ${x.hours} hours a month`).join(', ')}.</>}
        {p.not_known > 0 && <> {plural(p.not_known, 'solution')} in use here {p.not_known === 1 ? 'has' : 'have'} no estimate; give one on the solution&apos;s page.</>}
      </p>
      <div className={rep.pair}>
        <div>
          <h3 className={own.groupTitle}>People the record names ({p.named.length})</h3>
          {p.named.length === 0 ? <p className={styles.note}>No people or group is recorded on this system.</p>
            : <ul className={own.list}>{p.named.map((x) => <li key={x.component_id}>{x.name}</li>)}</ul>}
        </div>
        <div>
          <h3 className={own.groupTitle}>Open action items here, by person</h3>
          {p.open_items.length === 0 ? <p className={styles.note}>No open security action item on this system.</p>
            : <ul className={own.list}>{p.open_items.map((x) => <li key={x.owner_name}>{x.owner_name}: {plural(x.items, 'item')}</li>)}</ul>}
        </div>
      </div>
    </Panel>
  );
}

export function SystemReportPage() {
  const { id } = useParams();
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.department');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  const load = () => getSystemReport(id).then(setR)
    .catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  useEffect(() => {
    if (!allowed) return;
    setR(null); setError(null);
    load();
  }, [allowed, id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on identity only

  if (!allowed) return <Shell><CapabilityGate capability="reports.department" feature="read the system report" /></Shell>;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{r ? r.system.name : 'System report'} — system report <HelpDot k="iam.system.title" placement="bottom" /></h1>
            {r && (
              <p className={styles.desc}>
                {r.system.department_name}{r.system.managed_by_name && <>, managed by {r.system.managed_by_name}</>}{r.system.owner_names && <>, risk owner {r.system.owner_names}</>}.
                {' '}As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register.
                {' '}<Link to={`/systems/${r.system.id}`} data-print="hide">Open the system →</Link>
              </p>
            )}
          </div>
          <div data-print="hide">
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!r}>Print</button>
          </div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Producing the report…</p>}
        {r && (
          <div className={rep.stack}>
            <Picture r={r} />
            <Affected r={r} />
            <Actions r={r} />
            <Compliance r={r} />
            <Value r={r} />
            <People r={r} />
            <Improvement r={r} />
            <Decisions r={r} canRecord={hasCapability('decisions.record_view')} onRecorded={load} />
          </div>
        )}
      </div>
    </Shell>
  );
}
