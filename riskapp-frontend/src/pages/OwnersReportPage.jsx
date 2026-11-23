// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOwnersReport } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { scoreLevel } from '../utils/riskColors';
import { roleLabel } from '../utils/roles';
import { supplierTypeLabel } from '../utils/supplierTypes';
import styles from './BoardSummaryPage.module.css';
import rep from './CisoReportPage.module.css';
import own from './DepartmentReportPage.module.css';
import local from './OwnersReportPage.module.css';

// Who owns what — the CISO's C4 (docs/reporting-ciso.md): every person's
// accountabilities, responsibilities and load, by department, and the gaps.
// Every row opens the record it names, so this is also "who do I ask about X".

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const workLink = (x) => (x.risk_id ? `/risks/${x.risk_id}` : '/remediation');

// Where each kind of gap row is put right.
const GAP_LINK = {
  siro_fallback: (x) => [`/departments/${x.department_id}`, x.department_name,
    [plural(x.risks, 'risk'), x.risks_at_threshold ? `${x.risks_at_threshold} at or above the threshold` : null, x.services ? plural(x.services, 'service') : null].filter(Boolean).join(', ')],
  inactive: (x) => [recordLink(x), x.name, `${x.as}: ${x.person_name}${x.department_name ? `; ${x.department_name}` : ''}`],
  no_owner: (x) => [recordLink(x), x.name, `${x.kind}, no ${x.missing.join(' and no ')}${x.department_name ? `; ${x.department_name}` : ''}`],
  controls: (x) => [`/controls/${x.id}`, `${x.ref ? `${x.ref} ` : ''}${x.title}`, null],
  documents: (x) => ['/policies-documents', x.name, x.document_kind],
  findings: (x) => ['/findings', x.name, [FINDING_KIND[x.kind], x.department_name].filter(Boolean).join('; ')],
  unassigned_work: (x) => [workLink(x), x.name, x.kind === 'item' ? 'item' : 'action'],
};
function recordLink(x) {
  switch (x.kind) {
    case 'system': return `/systems/${x.id}`;
    case 'asset': return `/assets/${x.id}`;
    case 'service': return `/services/${x.id}`;
    case 'control': return `/controls/${x.id}`;
    case 'document': return '/policies-documents';
    case 'department': return `/departments/${x.id}`;
    default: return workLink(x);
  }
}
const FINDING_KIND = {
  'rating-incomplete': 'asset not fully rated',
  'component-record': 'component record incomplete',
  'document-review': 'document overdue for review',
  'supplier-assurance': 'supplier assurance incomplete',
  'objective-solution': 'objective with no security solution',
};

function Records({ title, rows, render }) {
  if (!rows.length) return null;
  return (
    <div className={own.group}>
      <h4 className={own.groupTitle}>{title} ({rows.length})</h4>
      <ul className={own.list}>{rows.map((x, i) => <li key={`${x.id}-${i}`}>{render(x)}</li>)}</ul>
    </div>
  );
}

function PersonDetail({ p, action }) {
  const a = p.accountable;
  const r = p.responsible;
  const m = p.manages;
  return (
    <div className={local.detail}>
      <div>
        <h3 className={local.detailTitle}>Accountable for</h3>
        {a.risks_count > 0 && (
          <Records title={`Risks needing the owner, of ${a.risks_count}`} rows={a.risks} render={(x) => (
            <><Link to={`/risks/${x.id}`}>{x.system_name} — {x.threat_name}</Link>{' '}
              <span className={`${rep.score} ${rep[`band_${scoreLevel(x.score)}`]}`}>{x.score}</span>
              <span className={styles.note}> — {[x.score >= action ? `scoring ${action} or higher` : null, x.past_review ? 'past review' : null].filter(Boolean).join(', ')}</span></>
          )} />
        )}
        <Records title="Systems" rows={a.systems} render={(x) => <Link to={`/systems/${x.id}`}>{x.name}</Link>} />
        <Records title="Information assets" rows={a.assets} render={(x) => <Link to={`/assets/${x.id}`}>{x.name}</Link>} />
        <Records title="Business services" rows={a.services} render={(x) => <Link to={`/services/${x.id}`}>{x.name}</Link>} />
        <Records title="Supplier relationships" rows={a.suppliers} render={(x) => (
          <><Link to={`/suppliers/${x.supplier_id}`}>{x.name}</Link>
            <span className={styles.note}> — {[supplierTypeLabel(x.relationship_type), x.touches].filter(Boolean).join(', ')}</span></>
        )} />
        <Records title="Manages: systems" rows={m.systems} render={(x) => <Link to={`/systems/${x.id}`}>{x.name}</Link>} />
        <Records title="Manages: information assets" rows={m.assets} render={(x) => <Link to={`/assets/${x.id}`}>{x.name}</Link>} />
        <Records title="Manages: business services" rows={m.services} render={(x) => <Link to={`/services/${x.id}`}>{x.name}</Link>} />
      </div>
      <div>
        <h3 className={local.detailTitle}>Responsible for</h3>
        <Records title="Security actions" rows={r.actions} render={(x) => (
          <><Link to={workLink(x)}>{x.title}</Link>
            {x.target_date && <span className={styles.note}> — due {date(x.target_date)}{x.overdue ? ', overdue' : ''}</span>}</>
        )} />
        <Records title="Action items" rows={r.items} render={(x) => (
          <><Link to={workLink(x)}>{x.element_name || 'Item'}{x.system_name ? ` on ${x.system_name}` : ''}</Link>
            <span className={styles.note}> — {x.title}{x.overdue ? ', overdue' : ''}</span></>
        )} />
        <Records title="Control objectives" rows={r.controls} render={(x) => <Link to={`/controls/${x.id}`}>{x.ref ? `${x.ref} ` : ''}{x.title}</Link>} />
        <Records title="Policies and documents" rows={r.documents} render={(x) => <Link to="/policies-documents">{x.name}</Link>} />
        <Records title="Findings to answer" rows={r.findings} render={(x) => (
          <><Link to="/findings">{x.name}</Link><span className={styles.note}> — {FINDING_KIND[x.kind]}</span></>
        )} />
        {!r.actions.length && !r.items.length && !r.controls.length && !r.documents.length && !r.findings.length && (
          <p className={styles.note}>Nothing named to them.</p>
        )}
      </div>
    </div>
  );
}

export function OwnersReportPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [openGap, setOpenGap] = useState(null);
  const [openPerson, setOpenPerson] = useState(null);
  const [show, setShow] = useState('load');
  const [dept, setDept] = useState('');

  useEffect(() => {
    if (!allowed) return;
    getOwnersReport().then(setR).catch((err) => setError(err.response?.data?.error || 'The report could not be produced.'));
  }, [allowed]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="read who owns what" /></Shell>;

  const action = r?.thresholds.action;
  const people = (r?.people || [])
    .filter((p) => show === 'all' || (show === 'load' ? p.load.total > 0 : !p.is_active))
    .filter((p) => !dept || p.department_id === dept);
  const loadText = (l) => [
    l.risks_at_threshold ? `${plural(l.risks_at_threshold, 'risk')} scoring ${action} or higher` : null,
    l.risks_past_review ? `${l.risks_past_review} past review` : null,
    l.actions_overdue + l.items_overdue ? `${l.actions_overdue + l.items_overdue} overdue` : null,
    l.findings ? plural(l.findings, 'finding') : null,
  ].filter(Boolean).join('; ');

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Who owns what <HelpDot k="owners.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              When it goes wrong, whose is it? Each person’s accountabilities and responsibilities, the load in them, and the gaps where nobody is named.
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
              <h2 className={styles.panelTitle}>Where nobody is named <HelpDot k="owners.gaps" placement="bottom" /></h2>
              <ul className={own.obligations}>
                {r.gaps.map((g) => (
                  <li key={g.key}>
                    <div className={own.obligationHead}>
                      <span className={`${rep.state} ${g.count ? rep.warn : rep.good}`}>{g.count ? g.count : 'None'}</span>
                      <span>{g.label}</span>
                      {g.count > 0 && (
                        <button type="button" className={`${styles.linkBtn} ${own.count}`} data-print="hide" onClick={() => setOpenGap(openGap === g.key ? null : g.key)}>
                          {openGap === g.key ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    <div className={styles.note}>Who can put it right: {g.who}.</div>
                    {openGap === g.key && (
                      <ul className={own.list}>
                        {g.rows.map((x, i) => {
                          const [to, text, detail] = GAP_LINK[g.key](x);
                          return (
                            <li key={i}>
                              <Link to={to}>{text}</Link>
                              {detail && <span className={styles.note}> — {detail}</span>}
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
              <h2 className={styles.panelTitle}>People <HelpDot k="owners.people" placement="bottom" /></h2>
              <div className={local.toolbar} data-print="hide">
                <div className={rep.filters} role="group" aria-label="Show">
                  {[['load', 'With something needing them'], ['all', 'Everyone named'], ['inactive', 'Inactive accounts']].map(([k, label]) => (
                    <button key={k} type="button" className={show === k ? rep.on : rep.off} aria-pressed={show === k} onClick={() => setShow(k)}>{label}</button>
                  ))}
                </div>
                <label className={local.deptPick}>Department{' '}
                  <select value={dept} onChange={(e) => setDept(e.target.value)}>
                    <option value="">All departments</option>
                    {r.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              </div>
              {people.length === 0 ? <p className={styles.note}>Nobody.</p> : (
                <div className={local.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Person <HelpDot k="owners.col.person" placement="bottom" /></th>
                      <th>Department <HelpDot k="col.department" placement="bottom" /></th>
                      <th className={styles.num}>Risks <HelpDot k="owners.col.risks" placement="bottom" /></th>
                      <th className={styles.num}>Records <HelpDot k="owners.col.records" placement="bottom" /></th>
                      <th className={styles.num}>Work <HelpDot k="owners.col.work" placement="bottom" /></th>
                      <th>Needing them <HelpDot k="owners.col.load" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => {
                      const a = p.accountable;
                      const records = a.systems.length + a.assets.length + a.services.length + a.suppliers.length
                        + p.manages.systems.length + p.manages.assets.length + p.manages.services.length;
                      const res = p.responsible;
                      const work = res.actions.length + res.items.length + res.controls.length + res.documents.length;
                      const isOpen = openPerson === p.id;
                      return (
                        <Fragment key={p.id}>
                          <tr>
                            <td>
                              <button type="button" className={styles.linkBtn} aria-expanded={isOpen} onClick={() => setOpenPerson(isOpen ? null : p.id)}>
                                {p.name}
                              </button>
                              <span className={styles.note}> — {p.roles.map(roleLabel).join(', ')}</span>
                              {!p.is_active && <> <span className={`${rep.state} ${rep.bad}`}>inactive</span></>}
                            </td>
                            <td>{p.department_name || '—'}</td>
                            <td className={styles.num}>{a.risks_count || '—'}</td>
                            <td className={styles.num}>{records || '—'}</td>
                            <td className={styles.num}>{work || '—'}</td>
                            <td>{loadText(p.load) || <span className={styles.note}>Nothing</span>}</td>
                          </tr>
                          {isOpen && (
                            <tr><td colSpan={6}><PersonDetail p={p} action={action} /></td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>By department <HelpDot k="owners.departments" placement="bottom" /></h2>
              <div className={local.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Department <HelpDot k="col.department" placement="bottom" /></th>
                    <th>Risk owner <HelpDot k="owners.col.risk_owner" placement="bottom" /></th>
                    <th>Information Asset Manager <HelpDot k="owners.col.manager" placement="bottom" /></th>
                    <th className={styles.num}>Risks <HelpDot k="owners.col.dept_risks" placement="bottom" /></th>
                    <th className={styles.num}>Systems <HelpDot k="owners.col.systems" placement="bottom" /></th>
                    <th className={styles.num}>Assets <HelpDot k="owners.col.assets" placement="bottom" /></th>
                    <th className={styles.num}>Services <HelpDot k="owners.col.services" placement="bottom" /></th>
                  </tr>
                </thead>
                <tbody>
                  {r.departments.map((d) => (
                    <tr key={d.id}>
                      <td><Link to={`/departments/${d.id}`}>{d.name}</Link></td>
                      <td>
                        {d.owner_names || '—'}
                        {d.is_siro_fallback && <> <span className={`${rep.state} ${rep.warn}`}>SIRO, no IAO</span></>}
                      </td>
                      <td>{d.manager_names || <span className={`${rep.state} ${rep.warn}`}>none</span>}</td>
                      <td className={styles.num}>{d.risks}{d.risks_at_threshold ? ` (${d.risks_at_threshold} ≥ ${action})` : ''}</td>
                      <td className={styles.num}>{d.systems}</td>
                      <td className={styles.num}>{d.assets}</td>
                      <td className={styles.num}>{d.services}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
