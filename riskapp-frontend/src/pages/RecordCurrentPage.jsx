// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRecordCurrent } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { roleLabel } from '../utils/roles';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';
import local from './OwnersReportPage.module.css';

// Is the record current and trusted? — the CISO's C8 (docs/reporting-ciso.md):
// whether systems, services, assets and components are written down, whether
// they are kept up to date, and whether the business reads CIRKS.

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Tile({ value, of, label, detail }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}{of != null && <span className={styles.tileOf}> of {of}</span>}</span>
      <span className={styles.tileLabel}>{label}</span>
      {detail && <span className={styles.tileDelta}>{detail}</span>}
    </div>
  );
}

const recordLink = (k, x) => (k.page ? <Link to={`${k.page}${x.id}`}>{x.name}</Link> : x.name);

export function RecordCurrentPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    getRecordCurrent().then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="read whether the record is current" /></Shell>;

  const h = r?.headline;
  const toggle = (key) => setOpen(open === key ? null : key);
  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Is the record current and trusted? <HelpDot k="record.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Can someone new, or someone asking, rely on what CIRKS says? Whether the estate is written down, kept up to date, and read by the business.
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
              <Tile value={h.written_complete} of={h.records} label="records fully written down"
                detail="Systems, business services, information assets and components with a description, their owner and manager, and their links." />
              <Tile value={h.changed} of={h.records} label={`changed in the last ${r.kinds[0]?.current.months ?? 12} months`}
                detail="Edited, or something recorded against them, through CIRKS." />
              <Tile value={h.untouched} of={h.records} label="never changed since they were recorded"
                detail="Loaded or created and not touched since: the first place to check whether they still hold." />
              <Tile value={h.readers} of={h.people_active} label={`people read CIRKS in the last ${r.used.days} days`}
                detail="Of the active accounts. Evidence that the business asks CIRKS, not the CISO’s inbox." />
            </div>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Written down <HelpDot k="record.written" placement="bottom" /></h2>
              <div className={local.kinds}>
                {r.kinds.map((k) => (
                  <div key={k.kind} className={local.kind}>
                    <h3 className={local.detailTitle}>{k.label} ({k.total})</h3>
                    <div className={rep.split}>
                      <CompletenessRing complete={k.written.complete} partial={k.written.partial} missing={k.written.missing}
                        labels={{ complete: 'complete', partial: 'partly', missing: 'nothing' }} of={k.label.toLowerCase()} size={72} showCounts={false} />
                      <ul className={own.list}>
                        {k.written.checks.map((c) => <li key={c.key}>{c.have} of {k.total} have {c.words}</li>)}
                      </ul>
                    </div>
                    {k.written.gaps_count > 0 && (
                      <button type="button" className={styles.linkBtn} data-print="hide" onClick={() => toggle(`w:${k.kind}`)}>
                        {open === `w:${k.kind}` ? 'Hide' : `Show the ${k.written.gaps_count} not complete`}
                      </button>
                    )}
                    {open === `w:${k.kind}` && (
                      <ul className={own.list}>
                        {k.written.gaps.map((x) => <li key={x.id}>{recordLink(k, x)}<span className={styles.note}> — missing {x.lacks.join(', ')}</span></li>)}
                        {k.written.gaps_count > k.written.gaps.length && <li className={styles.note}>and {k.written.gaps_count - k.written.gaps.length} more.</li>}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Kept up to date <HelpDot k="record.current" placement="bottom" /></h2>
              <div className={local.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Records <HelpDot k="record.col.kind" placement="bottom" /></th>
                      <th className={styles.num}>Changed in 12 months <HelpDot k="record.col.changed" placement="bottom" /></th>
                      <th className={styles.num}>Never changed <HelpDot k="record.col.untouched" placement="bottom" /></th>
                      <th>Longest unchanged <HelpDot k="record.col.stalest" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.kinds.map((k) => (
                      <Fragment key={k.kind}>
                        <tr>
                          <td>{k.label}</td>
                          <td className={styles.num}>{k.current.changed} of {k.total}</td>
                          <td className={styles.num}>{k.current.untouched}</td>
                          <td>
                            {k.current.stalest[0] ? <>{recordLink(k, k.current.stalest[0])}<span className={styles.note}> — since {day(k.current.stalest[0].last_change)}</span></> : '—'}
                            {k.current.stalest.length > 1 && (
                              <>{' '}<button type="button" className={styles.linkBtn} data-print="hide" onClick={() => toggle(`c:${k.kind}`)}>
                                {open === `c:${k.kind}` ? 'Hide' : 'More'}
                              </button></>
                            )}
                          </td>
                        </tr>
                        {open === `c:${k.kind}` && (
                          <tr><td colSpan={4}>
                            <ul className={own.list}>
                              {k.current.stalest.map((x) => <li key={x.id}>{recordLink(k, x)}<span className={styles.note}> — last changed {day(x.last_change)}</span></li>)}
                            </ul>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Read by the business <HelpDot k="record.used" placement="bottom" /></h2>
              <p className={styles.note}>
                In the last {r.used.days} days CIRKS answered {plural(r.used.searches, 'search', 'searches')} and {plural(r.used.enrichments, 'SOC lookup')}
                {r.used.by_machine ? ` (${r.used.by_machine} by a machine key)` : ''}.
              </p>
              {r.used.readers.length === 0 ? <p className={styles.note}>Nobody has read CIRKS in that time.</p> : (
                <div className={local.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Role <HelpDot k="col.role" placement="bottom" /></th>
                        <th className={styles.num}>People <HelpDot k="record.col.people" placement="bottom" /></th>
                        <th className={styles.num}>Pages and lookups <HelpDot k="record.col.reads" placement="bottom" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.used.readers.map((x) => (
                        <tr key={x.role}>
                          <td>{roleLabel(x.role)}</td>
                          <td className={styles.num}>{x.people}</td>
                          <td className={styles.num}>{x.reads}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
