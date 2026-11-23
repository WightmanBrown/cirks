// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTeamService } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { RiskAnswer, RiskOpener, useRiskUnfold } from '../components/RiskAnswer';
import { CapabilityGate } from '../components/CapabilityGate';
import { scoreLevel } from '../utils/riskColors';
import { roleLabel } from '../utils/roles';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';
import local from './OwnersReportPage.module.css';

// The security team's service — the CISO's C6 (docs/reporting-ciso.md): what
// the business is waiting on security for, how fast the team turns work round,
// where its time goes, and the risk its completed work has removed.

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const share = (n, total) => { const pc = (n / total) * 100; return pc > 0 && pc < 1 ? '<1%' : `${Math.round(pc)}%`; };
const days = (d) => (d == null ? '—' : `${d} ${d === 1 ? 'day' : 'days'}`);
const GROUP_WORD = { validation: 'a risk waiting for validation', acceptance: 'an action waiting to be accepted', expiring: 'an expired exception' };

function Tile({ value, label, detail }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {detail && <span className={styles.tileDelta}>{detail}</span>}
    </div>
  );
}

// A row about a risk unfolds its answer in place (RiskAnswer); others link on.
function WaitRow({ g, x, opener }) {
  if (g === 'validation') {
    return (
      <>{opener(`${x.system_name} — ${x.threat_name}`)}{' '}
        <span className={`${rep.score} ${rep[`band_${scoreLevel(x.score)}`]}`}>{x.score}</span>
        <span className={styles.note}> — waiting {days(x.days)}{x.department_name ? `; ${x.department_name}` : ''}</span></>
    );
  }
  if (g === 'acceptance') {
    return (
      <>{x.risk_id ? opener(x.title) : <Link to="/acceptance-queue">{x.title}</Link>}
        <span className={styles.note}> — waiting {days(x.days)}{x.subject_type !== 'risk' ? '; raised from a finding' : ''}</span></>
    );
  }
  return (
    <>{x.risk_id ? opener(x.label) : <Link to="/findings">{x.label}</Link>}
      <span className={styles.note}> — {x.status === 'expired' ? `expired ${days(x.days)} ago` : `expires in ${days(-x.days)}`}</span></>
  );
}

export function TeamServicePage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [openRow, toggleRow] = useRiskUnfold();

  useEffect(() => {
    if (!allowed) return;
    getTeamService().then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="read the security team's service" /></Shell>;

  const h = r?.headline;
  const cq = r?.quarters[0];
  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>The security team’s service <HelpDot k="team.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              How the business experiences the security function: what it is waiting for, how fast work is turned round, where the team’s time goes, and the risk its work has removed.
              {r && <> As at {new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register.</>}
            </p>
          </div>
          <div data-print="hide">
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!r}>Print</button>
          </div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Producing the report…</p>}
        {r && (
          <div className={rep.stack}>
            <div className={styles.tiles}>
              <Tile value={h.waiting} label="things the business is waiting on security for"
                detail="Risks waiting for validation, actions waiting to be accepted, and exceptions that have expired." />
              <Tile value={days(h.oldest_days)} label="the longest wait"
                detail={h.oldest_group ? `The oldest is ${GROUP_WORD[h.oldest_group]}.` : 'Nothing is waiting.'} />
              <Tile value={days(h.validation_median_days)} label={`to validate a risk, the middle case in ${cq.label}`}
                detail={cq.validation.n ? `From the risk being recorded to its validation; ${plural(cq.validation.n, 'risk')} validated this quarter.` : 'No risk has been validated this quarter.'} />
              <Tile value={h.points_removed_quarter} label={`risk points removed by work completed in ${cq.label}`}
                detail={h.heads ? `${cq.points_per_head} per member of the security team (${h.heads}).` : 'Nobody holds a security role.'} />
            </div>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Waiting on security <HelpDot k="team.waiting" placement="bottom" /></h2>
              <ul className={own.obligations}>
                {r.waiting.map((g) => (
                  <li key={g.key}>
                    <div className={own.obligationHead}>
                      <span className={`${rep.state} ${g.count ? rep.warn : rep.good}`}>{g.count ? g.count : 'None'}</span>
                      <span>{g.label}</span>
                      {g.count > 0 && (
                        <button type="button" className={`${styles.linkBtn} ${own.count}`} data-print="hide" onClick={() => setOpen(open === g.key ? null : g.key)}>
                          {open === g.key ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    <div className={styles.note}>
                      Who can put it right: {g.who}.{g.oldest_days != null && g.oldest_days >= 0 && <> The oldest has waited {days(g.oldest_days)}.</>}
                    </div>
                    {open === g.key && (
                      <ul className={own.list}>
                        {g.rows.map((x, i) => {
                          const k = `${g.key}:${i}`;
                          const opener = (label) => <RiskOpener open={openRow === k} onToggle={() => toggleRow(k)}>{label}</RiskOpener>;
                          return (
                            <li key={i}>
                              <WaitRow g={g.key} x={x} opener={opener} />
                              {openRow === k && <RiskAnswer riskId={x.risk_id} lead={g.key === 'acceptance' ? 'work' : 'decision'} />}
                            </li>
                          );
                        })}
                        {g.count > g.rows.length && <li className={styles.note}>and {g.count - g.rows.length} more.</li>}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Turnaround and delivery, by quarter <HelpDot k="team.quarters" placement="bottom" /></h2>
              <div className={local.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Quarter <HelpDot k="team.col.quarter" placement="bottom" /></th>
                      <th className={styles.num}>Risks validated <HelpDot k="team.col.validated" placement="bottom" /></th>
                      <th className={styles.num}>Actions accepted <HelpDot k="team.col.accepted" placement="bottom" /></th>
                      <th className={styles.num}>Actions completed <HelpDot k="team.col.completed" placement="bottom" /></th>
                      <th className={styles.num}>Points removed <HelpDot k="team.col.points" placement="bottom" /></th>
                      <th className={styles.num}>Per head <HelpDot k="team.col.per_head" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.quarters.map((q) => (
                      <tr key={q.label}>
                        <td>{q.label}{q.current && <span className={styles.note}> (so far)</span>}</td>
                        <td className={styles.num}>{q.validation.n}{q.validation.n ? ` (${days(q.validation.median_days)})` : ''}</td>
                        <td className={styles.num}>{q.acceptance.n}{q.acceptance.n ? ` (${days(q.acceptance.median_days)})` : ''}</td>
                        <td className={styles.num}>{q.completed}{q.delivery.n ? ` (${days(q.delivery.median_days)})` : ''}</td>
                        <td className={styles.num}>{q.points_removed}</td>
                        <td className={styles.num}>{q.points_per_head ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Where the work goes <HelpDot k="team.work" placement="bottom" /></h2>
              <p className={styles.note}>
                {plural(r.work.total, 'change')} made through CIRKS by the security team in the last {r.work.days} days
                {r.work.top_share != null && r.work.people[0]?.total > 0 && <>; {r.work.people[0].name} made {r.work.top_share}% of them</>}.
              </p>
              <div className={rep.pair}>
                <div className={local.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Person <HelpDot k="owners.col.person" placement="bottom" /></th>
                        <th className={styles.num}>Changes <HelpDot k="team.col.changes" placement="bottom" /></th>
                        <th>Mostly <HelpDot k="team.col.mostly" placement="bottom" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.work.people.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}<span className={styles.note}> — {p.roles.map(roleLabel).join(', ')}</span></td>
                          <td className={styles.num}>{p.total}</td>
                          <td>{Object.entries(p.areas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a).join(', ') || <span className={styles.note}>Nothing recorded</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={local.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Area <HelpDot k="team.col.area" placement="bottom" /></th>
                        <th className={styles.num}>Changes <HelpDot k="team.col.changes" placement="bottom" /></th>
                        <th className={styles.num}>Share <HelpDot k="team.col.share" placement="bottom" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.work.areas.map((a) => (
                        <tr key={a.area}>
                          <td>{a.area}</td>
                          <td className={styles.num}>{a.n}</td>
                          <td className={styles.num}>{share(a.n, r.work.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
