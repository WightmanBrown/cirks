// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Assurance findings — what the ISMS should not be, that no risk explains
// (docs/assurance-findings.md). Derived, so a row disappears the moment the fact
// behind it is fixed. The SWG agenda's assurance lines link here.
//
// First finding (v134): information assets not rated against every mandatory
// impact table. The other finding CIRKS derives today — SoA contradictions — has
// its own panel on the Statement of Applicability, linked below.
import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { getFindings, raiseFindingAction, getSoaFindingSummary, revokeFindingAcceptance,
         getComponentInstantiation, updateComponent } from '../api';
import { FindingAcceptForm } from '../components/FindingAcceptForm';
import { useAuth } from '../context/AuthContext';
import { seatCanWrite } from '../utils/seatScope';
import { componentRecordReasonItems } from '../utils/componentRecord';
import { FindingReason } from '../components/FindingReason';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import { HelpDot } from '../components/HelpDot';
import styles from './FindingsPage.module.css';
import { componentTypeShort } from '../utils/componentTypes';

const SOA_TYPE_LABEL = {
  deployed_where_not_applicable:  'deployed on a system where it was ruled not applicable',
  not_applicable_counters_threat: 'ruled not applicable while countering a threat',
  not_applicable_without_reason:  'ruled not applicable with no reason recorded',
};

const STATUS_WORD = {
  proposed: 'awaiting acceptance', planned: 'accepted', in_progress: 'in progress', deferred: 'deferred',
};

const fmtDate = d => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

// Once for the organisation, or on each system (v137, §5)? Asked here because this
// is where the answer has consequences: a component implied on 32 systems is
// either one piece of work or 32. Asked once per component and stored on it;
// never guessed from its type or how many systems it is on.
function InstantiationSection({ data, canAnswer, onAnswered }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr]   = useState('');
  const [showAnswered, setShowAnswered] = useState(false);
  const unstated = data.components.filter(c => !c.instantiation);
  const answered = data.components.filter(c => c.instantiation);

  async function answer(c, value) {
    setBusy(c.component_id); setErr('');
    try { await updateComponent(c.component_id, { instantiation: value }); await onAnswered(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not save the answer.'); }
    finally { setBusy(null); }
  }

  const row = (c) => (
    <tr key={c.component_id}>
      <td><Link to={`/components/${c.component_id}`}>{c.name}</Link></td>
      <td className={styles.mono}>{componentTypeShort(c.component_type)}</td>
      <td>{c.implied_on} systems in {c.departments} department{c.departments !== 1 ? 's' : ''}
        <span className={styles.muted}> · recorded on {c.recorded_on}</span></td>
      <td>
        {c.instantiation ? (
          <span>{c.instantiation === 'organisational' ? 'once for the organisation' : 'once per system'}</span>
        ) : canAnswer ? (
          <div className={styles.buttons}>
            <button className={styles.btnGhost} disabled={busy === c.component_id}
              onClick={() => answer(c, 'organisational')}>Once for the organisation</button>
            <button className={styles.btnGhost} disabled={busy === c.component_id}
              onClick={() => answer(c, 'per_system')}>Once per system</button>
          </div>
        ) : <span className={styles.muted}>not stated</span>}
      </td>
    </tr>
  );

  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>
        Scope: once for the organisation, or once per system? <span className={styles.count}>{unstated.length}</span>
        <HelpDot k="findings.instantiation" placement="bottom" />
      </h2>
      <p className={styles.sub}>
        These components are needed on more than one system. A policy, a team or a server room exists
        once — its state is recorded once and every system shares it. An agent or an operating system
        exists on each system and is recorded there. Until someone says which, each is treated as
        existing on each system, so a single policy reads as missing dozens of times.
      </p>
      {err && <p className={styles.err}>{err}</p>}
      {unstated.length === 0 ? (
        <p className={styles.empty}>Every component used on more than one system has been answered.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>
              <th>Component <HelpDot k="col.component" placement="bottom" /></th>
              <th>Type <HelpDot k="findings.instantiation.col.type" placement="bottom" /></th>
              <th>Needed on <HelpDot k="findings.instantiation.col.needed_on" placement="bottom" /></th>
              <th>Scope <HelpDot k="findings.instantiation.col.scope" placement="bottom" /></th>
            </tr></thead>
            <tbody>{unstated.map(row)}</tbody>
          </table>
        </div>
      )}
      {answered.length > 0 && (
        <p className={styles.sub}>
          <button className={styles.btnLink} onClick={() => setShowAnswered(v => !v)}>
            {showAnswered ? 'Hide' : 'Show'} the {answered.length} already answered
          </button>
        </p>
      )}
      {showAnswered && (
        <div className={styles.tableWrap}>
          <table className={styles.table}><tbody>{answered.map(row)}</tbody></table>
        </div>
      )}
    </section>
  );
}

// Each finding kind the page lists: how its rows are keyed, named and linked,
// and what "missing" means for it. The response column is the same for all.
const KINDS = {
  'rating-incomplete': {
    key: 'asset_id', name: 'asset_name', path: '/assets', readCap: 'assets.read',
    heading: 'Information assets not fully rated',
    helpKey: 'findings.rating_incomplete',
    intro: 'Every information asset must be rated against every mandatory impact table. A missing one can only understate the asset’s impact — and every risk score on the systems holding it.',
    empty: 'None outstanding — every asset is rated against every mandatory table.',
    counts: (rows) => `${rows.filter(r => r.band === 'never_rated').length} never rated; `,
    cols: [
      { label: 'Asset', helpKey: 'findings.rating.col.asset' },
      { label: 'Department', helpKey: 'col.department' },
      { label: 'Owner', helpKey: 'findings.col.owner' },
      { label: 'Missing mandatory tables', helpKey: 'findings.rating.col.missing' },
      { label: 'Last rated', helpKey: 'findings.rating.col.last_rated' },
    ],
    missing: (r, styles) => (<>
      {r.band === 'never_rated' && <span className={styles.never}>never rated</span>}
      {r.missing_table_names.join(', ')}
    </>),
    extra: (r) => fmtDate(r.last_rated_at),
  },
  'component-record': {
    key: 'system_id', name: 'system_name', path: '/systems', readCap: 'systems.read',
    heading: 'Systems with an incomplete record',
    helpKey: 'findings.component_record',
    intro: 'A system’s controls are delivered by components, and one that exists on each system has to be recorded there with its state. The security architecture also asks every system to say what it is — its network zone, hosting, operating system and so on — and to have a security solution for each control objective a threat on it calls for. Until the record is complete, the controls that need what is missing read as incomplete on every risk for the system. Only components stated to exist on each system count — see “Scope” below for the ones not yet answered.',
    empty: 'None outstanding.',
    counts: () => '',
    cols: [
      { label: 'System', helpKey: 'col.system' },
      { label: 'Department', helpKey: 'col.department' },
      { label: 'Owner', helpKey: 'findings.col.owner' },
      { label: 'To record or decide', helpKey: 'findings.record.col.to_record' },
      { label: 'Components', helpKey: 'findings.record.col.components' },
    ],
    missing: (r) => componentRecordReasonItems(r).map((x, i) => (
      <span key={i}>{i > 0 && '; '}<FindingReason item={x} /></span>
    )),
    extra: (r) => (r.needed_count ? `${r.missing_count} of ${r.needed_count} missing` : '—'),
  },
  'document-review': {
    key: 'component_id', name: 'document_name', path: '/components', readCap: 'components.read',
    heading: 'Policies & documents overdue for review',
    helpKey: 'findings.document_review',
    intro: 'A published policy, standard or procedure past its review date reads as Under review on every system that relies on it; one with no review date at all would never be flagged. Review it and record the next review date — or accept the lapse until a date, for a reason. Guidelines are advisory and are not counted.',
    empty: 'None outstanding — every published policy, standard and procedure is within its review date.',
    counts: () => '',
    cols: [
      { label: 'Document', helpKey: 'findings.document.col.document' },
      { label: 'Applies to', helpKey: 'findings.col.applies_to' },
      { label: 'Owner', helpKey: 'findings.col.owner' },
      { label: 'Review was due', helpKey: 'findings.document.col.review_due' },
      { label: 'Overdue by', helpKey: 'findings.document.col.overdue_by' },
    ],
    dept: () => 'the organisation',
    missing: (r) => `${r.document_kind || 'document'}${r.document_version ? ` v${r.document_version}` : ''} · `
      + (r.reason === 'no_review_date' ? 'no review date set' : `due ${fmtDate(r.next_review)}`),
    extra: (r) => (r.reason === 'no_review_date' ? 'never scheduled' : `${r.days_overdue} day${r.days_overdue === 1 ? '' : 's'}`),
  },
  'objective-solution': {
    key: 'control_id', name: 'objective_title', path: '/controls', readCap: 'controls.read',
    heading: 'Control objectives with no security solution',
    helpKey: 'findings.objective_solution',
    intro: 'Every control objective must have a security solution, or be ruled not applicable. A security solution says which components deliver the objective and where each must be; without one, nothing can show whether the objective is in place on a system. Build a solution on the objective’s page and identify its components, or rule the objective not applicable in the Statement of Applicability.',
    empty: 'None outstanding — every control objective has a security solution or is ruled not applicable.',
    counts: (rows) => `${rows.filter(r => r.systems_count > 0).length} recorded on at least one system; `,
    cols: [
      { label: 'Control objective', helpKey: 'col.control' },
      { label: 'Applies to', helpKey: 'findings.col.applies_to' },
      { label: 'Owner', helpKey: 'findings.col.owner' },
      { label: 'How it is delivered', helpKey: 'findings.objective.col.delivery' },
      { label: 'Recorded on', helpKey: 'findings.objective.col.recorded_on' },
    ],
    dept: () => 'the organisation',
    missing: (r) => `${r.reference ? `${r.reference} · ` : ''}`
      + ({ system: 'on each system', organisation: 'once for the organisation', group: 'for a group' }[r.delivery] || 'delivery not stated')
      + (r.listed_components ? ` · ${r.listed_components} component${r.listed_components === 1 ? '' : 's'} listed against it` : ' · no components listed'),
    extra: (r) => (r.systems_count ? `${r.systems_count} system${r.systems_count === 1 ? '' : 's'}` : '—'),
  },
  'supplier-assurance': {
    key: 'relationship_id', name: 'supplier_name', path: '/suppliers', readCap: 'suppliers.read',
    link: (r) => `/suppliers/${r.supplier_id}?relationship=${r.relationship_id}`,
    heading: 'Supplier assurance incomplete',
    helpKey: 'findings.supplier_assurance',
    intro: 'Each live supplier relationship is expected to meet the objectives for its supplier type, and the supplier\'s objectives are met only by current evidence — an assurance report, or terms in the contract. A report expires on its date; contract terms end with the contract. Objectives delivered once for the organisation are ours, met by our own control in the Statement of Applicability, and are not counted here. Open a supplier to record the evidence for that relationship — or accept the gap until a date, for a reason.',
    empty: 'None outstanding — every live supplier relationship is covered by current evidence.',
    counts: (rows) => `${rows.filter(r => r.reason === 'expired').length} with evidence that has expired; `,
    cols: [
      { label: 'Supplier', helpKey: 'col.supplier' },
      { label: 'Department', helpKey: 'findings.supplier.col.department' },
      { label: 'Owner', helpKey: 'findings.col.owner' },
      { label: 'Not covered', helpKey: 'findings.supplier.col.not_covered' },
      { label: 'Covered', helpKey: 'findings.supplier.col.covered' },
    ],
    missing: (r) => `${r.touches} · ` + (r.reason === 'no_evidence' ? 'no current evidence'
      : r.reason === 'expired' ? 'evidence expired' : 'partly covered') + ` — ${r.unmet_refs.join(', ')}`,
    extra: (r) => `${r.met_count} of ${r.expected_count}`,
  },
};

function FindingSection({ kind }) {
  const k = KINDS[kind];
  const { user, hasCapability, departmentIsolation } = useAuth();
  const [rows, setRows]       = useState(null);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(null);
  const [rowErr, setRowErr]   = useState({});
  const [accepting, setAccepting] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await getFindings(kind)).findings); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Failed to load findings.'); }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const canRaise  = (r) => hasCapability('findings.act') && seatCanWrite(user, departmentIsolation, r.department_id);
  const canAccept = hasCapability('exceptions.accept');

  async function run(r, fn, failure) {
    const id = r[k.key];
    setBusy(id); setRowErr(e => ({ ...e, [id]: null }));
    try { await fn(); await load(); }
    catch (e) { setRowErr(x => ({ ...x, [id]: e.response?.data?.error || failure })); }
    finally { setBusy(null); }
  }

  if (error) return <p className={styles.err}>{error}</p>;
  if (!rows) return <Spinner />;
  const acted    = rows.filter(r => r.action_id).length;
  const accepted = rows.filter(r => r.exception_id).length;

  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{k.heading} <span className={styles.count}>{rows.length}</span><HelpDot k={k.helpKey} placement="bottom" /></h2>
      <p className={styles.sub}>
        {k.intro}
        {rows.length > 0 && <> {k.counts(rows)}{acted} with an action raised, {accepted} accepted.</>}
      </p>
      {rows.length === 0 ? (
        <p className={styles.empty}>{k.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>{k.cols.map(c => <th key={c.label}>{c.label} <HelpDot k={c.helpKey} placement="bottom" /></th>)}<th>Response <HelpDot k="findings.col.response" placement="bottom" /></th></tr></thead>
            <tbody>
              {rows.map(r => {
                const id = r[k.key];
                return (
                  <Fragment key={id}>
                    <tr>
                      <td>
                        {/* The SIRO and the secretary read findings but not every entity page. */}
                        {hasCapability(k.readCap) ? <Link to={k.link ? k.link(r) : `${k.path}/${id}`}>{r[k.name]}</Link> : r[k.name]}
                      </td>
                      <td>{k.dept ? k.dept(r) : (r.department_name || '—')}</td>
                      <td>{r.owner_name || '—'}</td>
                      <td>{k.missing(r, styles)}</td>
                      <td className={styles.mono}>{k.extra(r)}</td>
                      <td>
                        {r.exception_id ? (
                          <div title={r.exception_justification}>
                            <span className={styles.acceptedWord}>accepted</span> until {fmtDate(r.exception_expires_at)}
                            {hasCapability('exceptions.revoke') && (
                              <button className={styles.btnLink} disabled={busy === id}
                                onClick={() => run(r, () => revokeFindingAcceptance(r.exception_id), 'Could not revoke.')}>
                                revoke
                              </button>
                            )}
                          </div>
                        ) : r.action_id ? (
                          <Link to={`/actions/${r.action_id}`}>{STATUS_WORD[r.action_status] || r.action_status}</Link>
                        ) : (canRaise(r) || canAccept) ? (
                          <div className={styles.buttons}>
                            {canRaise(r) && (
                              <button className={styles.btn} disabled={busy === id}
                                onClick={() => run(r, () => raiseFindingAction(kind, id), 'Could not raise the action.')}>
                                {busy === id ? 'Raising…' : 'Raise action'}
                              </button>
                            )}
                            {canAccept && accepting !== id && (
                              <button className={styles.btnGhost} onClick={() => setAccepting(id)}>Accept…</button>
                            )}
                          </div>
                        ) : <span className={styles.muted}>none</span>}
                        {rowErr[id] && <div className={styles.err}>{rowErr[id]}</div>}
                      </td>
                    </tr>
                    {accepting === id && (
                      <tr>
                        <td colSpan={k.cols.length + 1}>
                          <FindingAcceptForm kind={kind} subjectId={id}
                            onDone={async () => { setAccepting(null); await load(); }}
                            onCancel={() => setAccepting(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function FindingsPage() {
  const { hasCapability } = useAuth();
  const [soa, setSoa]   = useState(null);
  const [inst, setInst] = useState(null);

  useEffect(() => { getSoaFindingSummary().then(setSoa).catch(() => {}); }, []);
  const loadInst = useCallback(() => getComponentInstantiation().then(setInst).catch(() => {}), []);
  useEffect(() => { loadInst(); }, [loadInst]);

  return (
    <Shell>
      <BackButton />
      <h1 className={styles.title}>Assurance findings <HelpDot k="findings.title" placement="bottom" /></h1>
      <p className={styles.sub}>
        Places where the ISMS is not in the state it should be, and no risk explains it. Each is
        worked out from the register, so it disappears once the underlying fact is fixed. The
        response is a security action — raised here, accepted by the SWG, and completed only when
        the finding no longer holds — or accepted until a date, for a reason, by the same people who
        accept risks. When an acceptance expires, the finding is unanswered again.
      </p>

      <FindingSection kind="rating-incomplete" />
      <FindingSection kind="component-record" />
      <FindingSection kind="document-review" />
      <FindingSection kind="objective-solution" />
      <FindingSection kind="supplier-assurance" />

      {inst && inst.components.length > 0 && (
        <InstantiationSection data={inst} canAnswer={hasCapability('components.write')} onAnswered={loadInst} />
      )}

      {soa && (
        <section className={styles.section}>
          <h2 className={styles.h2}>
            Statement of Applicability contradictions <span className={styles.count}>{soa.total}</span>
            <HelpDot k="findings.soa" placement="bottom" />
          </h2>
          {soa.total === 0 ? (
            <p className={styles.empty}>None outstanding.</p>
          ) : (
            <ul className={styles.soaList}>
              {soa.by_type.map(t => (
                <li key={t.finding_type}>
                  <strong>{t.count}</strong> — a control objective {SOA_TYPE_LABEL[t.finding_type] || t.finding_type}
                  {' '}({t.objectives} objective{t.objectives !== 1 ? 's' : ''})
                </li>
              ))}
            </ul>
          )}
          <p className={styles.sub}>
            {hasCapability('controls.read')
              ? <>Listed and resolved on the <Link to="/soa">Statement of Applicability</Link>.</>
              : <>Listed and resolved on the Statement of Applicability by those who manage control objectives.</>}
          </p>
        </section>
      )}
    </Shell>
  );
}
