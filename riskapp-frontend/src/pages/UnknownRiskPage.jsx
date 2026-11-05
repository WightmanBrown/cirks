// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getUnknownRisk } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { scoreLevel } from '../utils/riskColors';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';

// Where unknown risk is hiding (docs/reporting-analyst.md R5; the CISO's C3,
// docs/reporting-ciso.md): organisation-wide, everything CIRKS cannot yet
// measure, each with who can put it right and a link to where it is done.

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

// Where each kind of row is put right.
const LINK = {
  unjudged: (x) => [`/risks/${x.risk_id}`, `${x.system_name} — ${x.threat_name}`],
  unassessed: (x) => [`/systems/${x.system_id}`, `${x.system_name} — ${x.threat_name}`],
  no_threats: (x) => [`/systems/${x.system_id}`, x.system_name],
  no_assets: (x) => [`/systems/${x.system_id}`, x.system_name],
  ratings: (x) => [`/assets/${x.asset_id}`, x.asset_name],
  unrated_controls: (x) => [`/controls/${x.control_id}`, `${x.ref ? `${x.ref} ` : ''}${x.title}`],
  component_scope: (x) => [null, `${x.name} (${x.component_type})`],
  review: (x) => [`/risks/${x.risk_id}`, `${x.system_name} — ${x.threat_name}`],
  pending: (x) => [`/risks/${x.risk_id}`, `${x.system_name} — ${x.threat_name}`],
};
const DETAIL = {
  unjudged: (x) => `${plural(x.objectives, 'objective')} not judged`,
  no_assets: (x) => (x.risks ? `${plural(x.risks, 'risk')} scored at the lowest impact` : null),
  ratings: (x) => `${plural(x.missing_count, 'mandatory table')} not rated`,
};

export function UnknownRiskPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    getUnknownRisk().then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="read where unknown risk is hiding" /></Shell>;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Where unknown risk is hiding <HelpDot k="unknown.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Everything CIRKS cannot yet measure, organisation-wide: risk that may be there but is not in the scores.
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
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>What nobody has looked at <HelpDot k="unknown.groups" placement="bottom" /></h2>
            {r.high_unjudged > 0 && (
              <p className={styles.note}>{plural(r.high_unjudged, 'risk')} scoring {r.thresholds.action} or more {r.high_unjudged === 1 ? 'has' : 'have'} an objective whose effect nobody has judged: start there.</p>
            )}
            <ul className={own.obligations}>
              {r.groups.map((g) => (
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
                  <div className={styles.note}>Who can put it right: {g.who}.</div>
                  {open === g.key && (
                    <ul className={own.list}>
                      {g.rows.map((x, i) => {
                        const [to, text] = LINK[g.key](x);
                        const detail = DETAIL[g.key]?.(x);
                        return (
                          <li key={i}>
                            {to ? <Link to={to}>{text}</Link> : text}
                            {x.score != null && <> <span className={`${rep.score} ${rep[`band_${scoreLevel(x.score)}`]}`}>{x.score}</span></>}
                            {(detail || x.department_name) && <span className={styles.note}> — {[detail, x.department_name].filter(Boolean).join('; ')}</span>}
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
          </div>
        )}
      </div>
    </Shell>
  );
}
