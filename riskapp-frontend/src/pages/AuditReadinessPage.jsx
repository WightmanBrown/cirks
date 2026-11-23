// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAuditReadiness } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';
import local from './AuditReadinessPage.module.css';

// Compliance as a by-product — the CISO's C7 (docs/reporting-ciso.md): the
// evidence an auditor will ask for, each line naming its ISO/IEC 27001 clause,
// each derived from the record and never ticked by hand.

const STATE = {
  complete: ['Complete', rep.good],
  part: ['Partly', rep.warn],
  none: ['Not yet', rep.bad],
  na: ['Nothing to measure', ''],
};

export function AuditReadinessPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    getAuditReadiness().then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="read audit readiness" /></Shell>;

  const counted = r ? r.lines.filter((l) => l.state !== 'na') : [];
  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Audit readiness <HelpDot k="audit.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Is the evidence an auditor will ask for already there, because normal work produced it? Each line names the ISO/IEC 27001 clause it supports and is worked out from the record, never ticked by hand.
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
              <div className={rep.split}>
                <CompletenessRing
                  complete={counted.filter((l) => l.state === 'complete').length}
                  partial={counted.filter((l) => l.state === 'part').length}
                  missing={counted.filter((l) => l.state === 'none').length}
                  labels={{ complete: 'complete', partial: 'partly there', missing: 'not yet started' }}
                  of="pieces of audit evidence" size={96} showCounts />
                <p className={styles.note}>
                  {r.headline.complete} of {r.headline.lines} pieces of evidence are complete.
                  {!r.headline.soa_approved && <> The Statement of Applicability has never been approved: that is the first thing an auditor asks for.</>}
                  {' '}What is not complete is the work still to do before the audit.
                </p>
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>The evidence <HelpDot k="audit.lines" placement="bottom" /></h2>
              <ul className={own.obligations}>
                {r.lines.map((l) => {
                  const [word, cls] = STATE[l.state];
                  const rows = l.rows || [];
                  return (
                    <li key={l.key}>
                      <div className={own.obligationHead}>
                        <span className={`${rep.state} ${cls}`}>{word}</span>
                        <span className={rep.ref}>{l.clause}</span>
                        <span>{l.title}</span>
                        {l.of > 0 && <span className={`${own.count} ${local.tally}`}>{l.met} of {l.of}</span>}
                      </div>
                      <div className={styles.note}>
                        {l.detail}{' '}
                        <Link to={l.link} data-print="hide">Open →</Link>
                        {rows.length > 0 && (
                          <>{' '}<button type="button" className={styles.linkBtn} data-print="hide" onClick={() => setOpen(open === l.key ? null : l.key)}>
                            {open === l.key ? 'Hide' : 'Which'}
                          </button></>
                        )}
                      </div>
                      {open === l.key && (
                        <ul className={own.list}>
                          {rows.map((x) => <li key={x.id}>{x.name}<span className={styles.note}> — {x.why.join(', ')}</span></li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
