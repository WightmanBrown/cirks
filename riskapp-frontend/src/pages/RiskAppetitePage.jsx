// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getRiskAppetite, setRiskAppetite } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import styles from './BoardSummaryPage.module.css';
import own from './RiskAppetitePage.module.css';

// The organisation's risk appetite (v171): the action threshold and the two
// acceptance limits, set by the SIRO or admin with a reason. Before saving, the
// page says what the new numbers would mean, from the active risks by score; a
// change that would catch a risk marked "no action required" is refused by the
// server, and the risks it names are listed here.

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const atOrAbove = (byScore, t) => byScore.filter((s) => s.score >= t).reduce((n, s) => n + s.risks, 0);
const markedAtOrAbove = (byScore, t) => byScore.filter((s) => s.score >= t).reduce((n, s) => n + s.no_action_required, 0);

// What the numbers being typed would break, in words; empty when they are fine.
function problems(f) {
  const v = [f.action_threshold, f.analyst_max, f.owner_max].map(Number);
  if (v.some((x) => !Number.isInteger(x) || x < 1 || x > 25)) return ['Each number must be a whole risk score from 1 to 25.'];
  const [action, analyst, owner] = v;
  const out = [];
  if (analyst >= action) out.push('A risk analyst may accept only risks below the action threshold.');
  if (owner < action) out.push('A risk owner must be able to accept at least up to the action threshold.');
  return out;
}

function ChangeForm({ appetite, byScore, onSaved, onCancel }) {
  const [form, setForm] = useState({
    action_threshold: appetite.action_threshold, analyst_max: appetite.analyst_max, owner_max: appetite.owner_max, reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const wrong = problems(form);
  const t = Number(form.action_threshold);
  const total = byScore.reduce((n, s) => n + s.risks, 0);
  const marked = wrong.length ? 0 : markedAtOrAbove(byScore, t);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(null); setConflicts(null);
    try {
      const { appetite: saved } = await setRiskAppetite({
        action_threshold: Number(form.action_threshold), analyst_max: Number(form.analyst_max),
        owner_max: Number(form.owner_max), reason: form.reason,
      });
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.error || 'The risk appetite could not be saved.');
      setConflicts(err.response?.data?.conflicts || null);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className={`${styles.form} ${own.form}`}>
      <label className={styles.field}>Action threshold: a risk scoring this or more must be treated
        <input type="number" min="1" max="25" step="1" required value={form.action_threshold} onChange={set('action_threshold')} />
      </label>
      <label className={styles.field}>A risk analyst may accept risks scoring up to
        <input type="number" min="1" max="25" step="1" required value={form.analyst_max} onChange={set('analyst_max')} />
      </label>
      <label className={styles.field}>A risk owner may accept risks scoring up to (above this, only the CISO, SIRO or admin)
        <input type="number" min="1" max="25" step="1" required value={form.owner_max} onChange={set('owner_max')} />
      </label>

      {wrong.length > 0 ? wrong.map((w) => <p key={w} className={styles.errorText}>{w}</p>) : (
        <p className={styles.note}>
          With a threshold of {t}, {plural(atOrAbove(byScore, t), 'risk')} of {total} would have to be treated
          {t !== appetite.action_threshold && <> (now {atOrAbove(byScore, appetite.action_threshold)})</>}.
          {marked > 0 && <> {plural(marked, 'risk')} marked &ldquo;no action required&rdquo; would be at or above it, so the change will be refused until each has a treatment decision.</>}
        </p>
      )}

      <label className={styles.field}>Why the risk appetite is changing
        <textarea rows={3} required value={form.reason} onChange={set('reason')} />
      </label>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {conflicts?.length > 0 && (
        <ul className={own.conflicts}>
          {conflicts.map((c) => (
            <li key={c.risk_id}><Link to={`/risks/${c.risk_id}`}>{c.system_name} — {c.threat_name}</Link> (scores {c.score})</li>
          ))}
        </ul>
      )}

      <div className={styles.modalActions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.primary} disabled={busy || wrong.length > 0}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export function RiskAppetitePage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('risk_appetite.write');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    getRiskAppetite().then(setData).catch((err) => setError(err.response?.data?.error || 'The risk appetite could not be loaded.'));
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) return <Shell><CapabilityGate capability="risk_appetite.write" feature="set the organisation's risk appetite" /></Shell>;

  const a = data?.appetite;
  const byScore = data?.by_score || [];
  const total = byScore.reduce((n, s) => n + s.risks, 0);
  // The scores that occur: a score is impact × likelihood, so only some do, and
  // the thresholds between them all give the same answer.
  const steps = byScore.map((s) => ({ score: s.score, risks: atOrAbove(byScore, s.score) }));

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Risk appetite <HelpDot k="appetite.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              The score at which a risk must be treated, and how high a risk analyst and a risk owner may accept a risk.
              CIRKS uses these numbers everywhere: the risk register, the reports, and who may accept a risk.
            </p>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {!a && !error && <p className={styles.note}>Loading…</p>}
        {a && <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>The organisation&apos;s risk appetite <HelpDot k="appetite.current" placement="bottom" /></h2>
            {editing ? (
              <ChangeForm appetite={a} byScore={byScore} onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); load(); }} />
            ) : <>
              <ul className={styles.facts}>
                <li><strong>{a.action_threshold}</strong> a risk scoring this or more must be treated ({plural(atOrAbove(byScore, a.action_threshold), 'risk')} of {total} today)</li>
                <li><strong>{a.analyst_max}</strong> a risk analyst may accept risks scoring up to this</li>
                <li><strong>{a.owner_max}</strong> a risk owner may accept risks scoring up to this; above it, only the CISO, SIRO or admin</li>
              </ul>
              <p className={styles.setBy}>
                {a.set_at ? <>Set by {a.set_by_name} on {day(a.set_at)}: {a.reason}</> : 'The values CIRKS ships with; never changed.'}
              </p>
              <div><button type="button" className={styles.secondary} onClick={() => setEditing(true)}>Change</button></div>
            </>}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>What each threshold would mean <HelpDot k="appetite.steps" placement="bottom" /></h2>
            <p className={styles.note}>
              A score is impact × likelihood, so only some scores occur. These are the scores your active risks have, and how many would have to be treated with the threshold at each.
            </p>
            <table className={`${styles.table} ${own.steps}`}>
              <thead>
                <tr>
                  <th>Threshold <HelpDot k="appetite.col.threshold" placement="bottom" /></th>
                  <th className={styles.num}>Risks to treat <HelpDot k="appetite.col.risks" placement="bottom" /></th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.score} className={s.score === a.action_threshold ? own.current : undefined}>
                    <td>{s.score}{s.score === a.action_threshold && ' (now)'}</td>
                    <td className={styles.num}>{s.risks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>}
      </div>
    </Shell>
  );
}
