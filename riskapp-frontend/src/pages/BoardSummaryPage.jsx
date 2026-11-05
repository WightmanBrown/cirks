// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBoardSummary, setTolerance, clearTolerance } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { HeatMap, StackedBar, TrendLine } from '../components/BoardCharts';
import styles from './BoardSummaryPage.module.css';

// The board summary (docs/reporting-siro.md, report 9): the position on one
// page, in pictures, for a board that will not read the lists. The SIRO report
// holds the detail behind every figure here.

const pct = (n, d) => (d ? Math.floor((100 * n) / d) : null);
const month = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Panel({ title, helpKey, wide, children }) {
  return (
    <section className={`${styles.panel} ${wide ? styles.wide : ''}`}>
      <h2 className={styles.panelTitle}>{title} <HelpDot k={helpKey} placement="bottom" /></h2>
      {children}
    </section>
  );
}

const RAG_WORD = { green: 'Within tolerance', amber: 'Near the limit', red: 'Outside tolerance' };

// A tolerance the SIRO sets for one tile (v169): green up to one number, amber
// up to another, red above, with the reason. Clearing it returns the tile to
// "no tolerance set".
function ToleranceDialog({ tile, label, onClose, onSaved }) {
  const t = tile.tolerance;
  const [green, setGreen] = useState(t ? String(t.green_max) : '');
  const [amber, setAmber] = useState(t ? String(t.amber_max) : '');
  const [reason, setReason] = useState(t?.reason || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await setTolerance(tile.key, { green_max: Number(green), amber_max: Number(amber), reason });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'The tolerance was not saved.');
      setBusy(false);
    }
  }
  async function clear() {
    if (!window.confirm('Clear this tolerance? The figure will no longer be rated.')) return;
    setBusy(true); setError('');
    try { await clearTolerance(tile.key); onSaved(); }
    catch (err) { setError(err.response?.data?.error || 'The tolerance was not cleared.'); setBusy(false); }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Set tolerance">
        <h2 className={styles.modalTitle}>Tolerance <HelpDot k="board.tolerance" placement="bottom" /></h2>
        <p className={styles.note}>For: {label}. Today: <strong>{tile.value}</strong>.</p>
        <form onSubmit={save} className={styles.form}>
          <label className={styles.field}>Green up to
            <input type="number" min="0" step="1" required value={green} onChange={(e) => setGreen(e.target.value)} />
          </label>
          <label className={styles.field}>Amber up to
            <input type="number" min="0" step="1" required value={amber} onChange={(e) => setAmber(e.target.value)} />
          </label>
          <p className={styles.note}>Above the amber limit the figure is red.</p>
          <label className={styles.field}>Why this tolerance
            <textarea rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className={styles.errorText} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            {t && <button type="button" className={styles.danger} onClick={clear} disabled={busy}>Clear tolerance</button>}
            <button type="button" className={styles.secondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Tile({ tile, of, label, previous, canSet, onSet }) {
  const { value, tolerance: t, rag } = tile;
  // Direction of travel against the previous monthly capture, when there is one.
  const delta = previous == null ? null : value - previous;
  return (
    <div className={`${styles.tile} ${rag ? styles[rag] : ''}`}>
      <span className={styles.tileValue}>{value}{of != null && <span className={styles.tileOf}> / {of}</span>}</span>
      <span className={styles.tileLabel}>{label}</span>
      {rag
        ? <span className={`${styles.rag} ${styles[`rag_${rag}`]}`}>{RAG_WORD[rag]}</span>
        : <span className={styles.tileDelta}>No tolerance set</span>}
      {t && <span className={styles.tileDelta}>Green up to {t.green_max}, amber up to {t.amber_max}</span>}
      {delta != null && (
        <span className={styles.tileDelta}>
          {delta === 0 ? 'no change' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}`} since last month
        </span>
      )}
      {canSet && (
        <button type="button" className={styles.linkBtn} onClick={onSet} data-print="hide">
          {t ? 'Change tolerance' : 'Set tolerance'}
        </button>
      )}
      {t && <span className={styles.setBy}>Set by {t.set_by_name}, {new Date(t.set_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
    </div>
  );
}

const TILE_LABEL = {
  'exposure.at_or_above_action': (t) => `risks scoring ${t.action} or more, which must be treated`,
  'exposure.above_owner_max': (t) => `above ${t.owner_max}: only the CISO, SIRO or admin may accept`,
  'exposure.decided_not_delivered': () => 'decided, with nothing carrying it out',
  'exposure.acceptances_expired': () => 'acceptances expired with the risk still open',
};

function Headline({ b, prev, canSet, onSet }) {
  return (
    <div className={styles.tiles}>
      {b.tiles.map((tile) => {
        const field = tile.key.split('.')[1];
        const label = TILE_LABEL[tile.key](b.thresholds);
        return (
          <Tile key={tile.key} tile={tile} label={label}
                of={field === 'at_or_above_action' ? b.exposure.total : null}
                previous={prev?.exposure?.[field]}
                canSet={canSet} onSet={() => onSet(tile, label)} />
        );
      })}
    </div>
  );
}

function Trend({ b }) {
  const points = b.trend.map((s) => ({ period: s.period, e: s.summary.exposure }));
  const now = b.generated_at.slice(0, 7);
  if (!points.some((p) => p.period === now)) points.push({ period: now, e: b.exposure });
  if (points.length < 2) {
    return (
      <p className={styles.note}>
        The trend starts in {month(points[0].period)}: CIRKS keeps the board's figures once a month,
        and a line appears from the second month. Today: {b.exposure.at_or_above_action} risks scoring
        {b.thresholds.action} or more, {b.exposure.above_owner_max} above {b.thresholds.owner_max}.
      </p>
    );
  }
  return (
    <TrendLine series={[
      { key: 'at', label: `scoring ${b.thresholds.action} or more`, tone: 'series1', points: points.map((p) => ({ period: p.period, value: p.e.at_or_above_action })) },
      { key: 'above', label: `above ${b.thresholds.owner_max}`, tone: 'series2', points: points.map((p) => ({ period: p.period, value: p.e.above_owner_max })) },
    ]} />
  );
}

export function BoardSummaryPage() {
  const { hasCapability } = useAuth();
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const allowed = hasCapability('reports.read');
  const canSet = hasCapability('reports.tolerances');

  const load = () => getBoardSummary().then(setB).catch(() => setError('The summary could not be produced.'));
  useEffect(() => { if (allowed) load(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps -- load once per permission

  if (!allowed) return <CapabilityGate capability="reports.read" feature="read the board summary" />;

  const prev = b?.trend?.filter((s) => s.period < b.generated_at.slice(0, 7)).slice(-1)[0]?.summary;

  return (
    <Shell>
      <div className={styles.page}>
        <div data-print="hide"><BackButton /></div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Board summary <HelpDot k="board.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Information risk on one page.
              {b && <> As at {new Date(b.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, from the live register. </>}
              <Link to="/reporting/siro" data-print="hide">The detail behind every figure is in the SIRO report →</Link>
            </p>
          </div>
          <div data-print="hide">
            <button type="button" className={styles.secondary} onClick={() => window.print()} disabled={!b}>Print</button>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {!b && !error && <p className={styles.note}>Producing the summary…</p>}
        {b && <>
          <Headline b={b} prev={prev} canSet={canSet} onSet={(tile, label) => setEditing({ tile, label })} />
          {editing && (
            <ToleranceDialog tile={editing.tile} label={editing.label} onClose={() => setEditing(null)}
                             onSaved={() => { setEditing(null); load(); }} />
          )}

          <div className={styles.grid}>
            <Panel title="Where the risks sit" helpKey="board.heat" wide>
              <div className={styles.heats}>
                <HeatMap grid={b.heat_map.current} label="now" />
                <HeatMap grid={b.heat_map.target} label="after committed work" />
              </div>
              <p className={styles.note}>Each square counts risks by likelihood and impact; colour is the risk band.</p>
            </Panel>

            <Panel title={`Is every risk scoring ${b.thresholds.action} or more answered?`} helpKey="board.answered">
              <CompletenessRing size={96}
                complete={b.exposure.answered_by_action} partial={b.exposure.answered_by_acceptance} missing={b.exposure.unanswered}
                labels={{ complete: 'being treated', partial: 'accepted', missing: 'nothing answering' }} of={`risks scoring ${b.thresholds.action} or more`} />
            </Panel>

            <Panel title="Risk trend" helpKey="board.trend">
              <Trend b={b} />
            </Panel>

            <Panel title="Compliance with standards" helpKey="board.compliance">
              {b.compliance.length === 0 && (
                <p className={styles.note}>No standard is switched on under Objectives &amp; Standards.</p>
              )}
              {b.compliance.map((s) => {
                if (!s.loaded) {
                  return (
                    <div key={s.code} className={styles.std}>
                      <div className={styles.stdHead}>
                        <span className={styles.stdName}>{s.name}</span>
                        <span className={styles.stdPct}>—</span>
                      </div>
                      <p className={styles.note}>
                        Switched on, but its requirements are not loaded, so compliance cannot be measured yet.
                        Upload them under Objectives &amp; Standards.
                      </p>
                    </div>
                  );
                }
                const counted = s.requirements - s.excluded;
                return (
                  <div key={s.code} className={styles.std}>
                    <div className={styles.stdHead}>
                      <span className={styles.stdName}>{s.name}</span>
                      <span className={styles.stdPct}>{pct(s.covered, counted) ?? '—'}%</span>
                    </div>
                    <StackedBar of="requirements" parts={[
                      { label: 'met', value: s.covered, tone: 'good' },
                      { label: 'partly met', value: s.partial, tone: 'warn' },
                      { label: 'not met', value: s.gap, tone: 'bad' },
                    ]} />
                    {s.excluded > 0 && <p className={styles.note}>{s.excluded} excluded as not applicable.</p>}
                  </div>
                );
              })}
            </Panel>

            <Panel title="Statement of Applicability" helpKey="board.soa">
              <CompletenessRing size={96}
                complete={b.controls.soa.implemented} partial={b.controls.soa.under_way} missing={b.controls.soa.not_implemented}
                labels={{ complete: 'implemented', partial: 'under way', missing: 'not implemented' }} of="applicable control objectives" />
              {b.controls.soa.not_decided > 0 && (
                <p className={styles.note}>{b.controls.soa.not_decided} control objectives have no applicability decision yet.</p>
              )}
            </Panel>

            <Panel title="Control coverage on systems" helpKey="board.coverage">
              <CompletenessRing size={96}
                complete={b.controls.on_systems.operational} partial={b.controls.on_systems.degraded} missing={b.controls.on_systems.missing}
                labels={{ complete: 'in place', partial: 'degraded', missing: 'not in place' }} of="control objectives on systems" />
              {b.controls.findings.objective_without_solution > 0 && (
                <p className={styles.note}>{b.controls.findings.objective_without_solution} control objectives have no security solution to deliver them.</p>
              )}
            </Panel>

            <Panel title="Control quality" helpKey="board.quality">
              <StackedBar of="applicable control objectives" parts={[
                { label: 'strong (4–5)', value: b.controls.effectiveness[3] + b.controls.effectiveness[4], tone: 'good' },
                { label: 'adequate (3)', value: b.controls.effectiveness[2], tone: 'warn' },
                { label: 'weak (1–2)', value: b.controls.effectiveness[0] + b.controls.effectiveness[1], tone: 'bad' },
                { label: 'not rated', value: b.controls.effectiveness_not_rated, tone: 'neutral' },
              ]} />
              <ul className={styles.facts}>
                <li><strong>{b.controls.findings.component_record}</strong> systems with an incomplete component record</li>
                <li><strong>{b.controls.findings.document_review}</strong> policies past their review date</li>
                <li><strong>{b.controls.findings.supplier_assurance}</strong> supplier relationships without full assurance</li>
              </ul>
            </Panel>

            <Panel title="Remediation" helpKey="board.remediation">
              <StackedBar of="items of work" parts={[
                { label: 'completed', value: b.efficiency.items_completed, tone: 'good' },
                { label: 'open', value: b.efficiency.items_open, tone: 'warn' },
                { label: 'withdrawn', value: b.efficiency.items_withdrawn, tone: 'neutral' },
              ]} />
              <ul className={styles.facts}>
                <li><strong>{b.efficiency.risk_points_removed}</strong> risk points removed by completed actions, on {b.efficiency.risks_reduced} {b.efficiency.risks_reduced === 1 ? 'risk' : 'risks'}</li>
                <li><strong>{b.efficiency.median_days_to_complete ?? '—'}</strong> days, median, from accepting an action to completing it</li>
                <li><strong>{b.efficiency.actions_overdue}</strong> of {b.efficiency.actions_open} open actions past their target date</li>
              </ul>
            </Panel>

            <Panel title="Departments" helpKey="board.departments" wide>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Department <HelpDot k="col.department" placement="bottom" /></th>
                    <th>Scoring {b.thresholds.action} or more <HelpDot k="board.col.at_or_above" placement="bottom" /></th>
                    <th className={styles.num}>Nothing answering <HelpDot k="board.col.unanswered" placement="bottom" /></th>
                    <th className={styles.num}>Open findings <HelpDot k="board.col.findings" placement="bottom" /></th>
                  </tr>
                </thead>
                <tbody>
                  {b.departments.map((d) => {
                    const widest = Math.max(1, ...b.departments.map((x) => x.risks));
                    return (
                      <tr key={d.department_id || 'none'}>
                        <td>{d.department_name}</td>
                        <td>
                          <span className={styles.inlineBar}>
                            <span className={styles.inlineFill} style={{ width: `${(100 * d.at_or_above_action) / widest}%` }} />
                            <span className={styles.inlineRest} style={{ width: `${(100 * (d.risks - d.at_or_above_action)) / widest}%` }} />
                          </span>
                          <span className={styles.inlineText}>{d.at_or_above_action} of {d.risks}</span>
                        </td>
                        <td className={`${styles.num} ${d.unanswered ? styles.badText : ''}`}>{d.unanswered}</td>
                        <td className={styles.num}>{d.findings}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </div>
        </>}
      </div>
    </Shell>
  );
}
