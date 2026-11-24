// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRiskAnswer } from '../api';
import { HelpDot } from './HelpDot';
import { RatingChip } from './RatingChip';
import { probabilityLabel, impactLabel } from '../utils/ratingScale';
import styles from './RiskAnswer.module.css';

// THE risk answer (docs/insights-drilldown.md, owner 2026-11-13): four short
// answers about one risk — how bad, why, what is being done, who decided — from
// GET /risks/:id/answer. It unfolds under a risk in every report's list of
// risks, so a reader can go down the list without leaving it, and each answer
// links to its section of the risk page. `lead` puts first the answer the list
// is about (the CISO's agreement list leads with the decision).
//
// In a table: const [openId, toggle] = useRiskUnfold(); the name cell holds
// <RiskOpener open={openId === id} onToggle={() => toggle(id)}>…</RiskOpener>,
// and the row is followed by {openId === id && <RiskAnswerRow colSpan={n} riskId={id} lead="…" />}.

const DIM = { c: 'confidentiality', i: 'integrity', a: 'availability' };
const TREATMENT = { mitigate: 'Mitigate', accept: 'Accept', transfer: 'Transfer', avoid: 'Avoid' };
const ORDER = ['score', 'why', 'work', 'decision'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const name = (o) => (o.ref ? `${o.ref.replace(/^CIRKS1\./, '')} ${o.title}` : o.title);

export function useRiskUnfold() {
  const [openId, setOpenId] = useState(null);
  return [openId, (id) => setOpenId((cur) => (cur === id ? null : id))];
}

export function RiskOpener({ open, onToggle, children }) {
  return (
    <button type="button" className={styles.opener} aria-expanded={open} onClick={onToggle}>
      <span className={styles.caret} aria-hidden="true">{open ? '▾' : '▸'}</span>{children}
    </button>
  );
}

export function RiskAnswerRow({ colSpan, riskId, lead }) {
  return (
    <tr className={styles.answerRow}>
      <td colSpan={colSpan}><RiskAnswer riskId={riskId} lead={lead} /></td>
    </tr>
  );
}

function Card({ section, lead, title, helpKey, headline, tone, children, to, more }) {
  return (
    <div className={`${styles.card} ${lead ? styles.lead : ''}`}>
      <span className={styles.question}>{title} <HelpDot k={helpKey} placement="bottom" /></span>
      <span className={`${styles.headline} ${tone ? styles[tone] : ''}`}>{headline}</span>
      <span className={styles.detail}>{children}</span>
      <Link className={styles.more} to={`${to}#${section}`}>{more} →</Link>
    </div>
  );
}

function Score({ a, to, lead }) {
  const s = a.score;
  const d = s.driving[0];
  return (
    <Card section="score" lead={lead} title="How bad is it?" helpKey="risk_answer.score" to={to} more="Score and history"
      headline={<RatingChip value={s.now} scale="risk" />}>
      On {s.driving.map((x) => DIM[x]).join(' and ')}: likelihood {probabilityLabel(s.probability[d])}, impact {impactLabel(s.impact[d])}.{' '}
      {s.target == null ? 'No committed work, so no target.' : s.target < s.now ? `Committed work brings it to ${s.target}.` : 'Committed work does not lower it.'}
    </Card>
  );
}

function Why({ a, to, lead }) {
  const w = a.why;
  const c = w.counts;
  const inPlace = c.operational + c.degraded;
  const dim = DIM[w.setting.dimension];
  let headline; let tone; let body;
  if (c.total === 0) {
    headline = 'No objective counters this threat'; tone = 'bad';
    body = <>The control library links no objective to this threat, so nothing can lower its likelihood here.</>;
  } else if (w.setting.by.length) {
    headline = `Set by ${name(w.setting.by[0])}`;
    body = <>{inPlace} of {plural(c.total, 'objective')} against this threat are in place. {w.setting.by.length > 1 ? `${w.setting.by.length} of them hold` : 'It holds'} the {dim} likelihood at {w.setting.probability}, down from the threat&rsquo;s own {w.setting.threat_probability}.</>;
  } else {
    headline = inPlace ? 'Nothing in place lowers it' : `${c.total - c.not_applicable} of ${c.total} objectives not in place`;
    tone = 'bad';
    body = <>
      {inPlace > 0 && <>{inPlace} of {plural(c.total, 'objective')} against this threat are in place
        {w.in_place_no_effect > 0 && <>; {w.in_place_no_effect} judged not to lower {dim}</>}
        {w.in_place_unjudged > 0 && <>; {w.in_place_unjudged} not judged</>}. </>}
      The score is the threat&rsquo;s own {dim} likelihood ({w.setting.threat_probability}).
    </>;
  }
  return (
    <Card section="why" lead={lead} title="Why this score?" helpKey="risk_answer.why" to={to} more="The objectives" headline={headline} tone={tone}>
      {body}{' '}
      {w.best_fix
        ? <>Putting <b>{name(w.best_fix)}</b> in place would bring it to {w.best_fix.score_if_fixed}.</>
        : w.not_in_place.length > 0 && (inPlace > 0 || w.setting.by.length
          ? <>{plural(w.not_in_place.length, 'objective')} not in place{w.fixes_unjudged ? '; nobody has judged what they would remove' : ''}.</>
          : w.fixes_unjudged > 0 && <>Nobody has judged what putting them in place would remove.</>)}
    </Card>
  );
}

function Work({ a, to, lead }) {
  const k = a.work;
  const live = k.actions.filter((x) => !['completed', 'verified', 'rejected', 'deferred'].includes(x.status));
  const first = live[0];
  const accepting = a.decision.treatment_decision === 'accept';
  const headline = first ? plural(k.open, 'security action') + ' open'
    : k.actions.length ? 'All its actions are finished' : accepting ? 'None needed: accepted' : 'No security action';
  const tone = first ? (k.overdue ? 'warn' : null) : (!k.actions.length && !accepting ? 'bad' : null);
  return (
    <Card section="work" lead={lead} title="What is being done?" helpKey="risk_answer.work" to={to} more="The work" headline={headline} tone={tone}>
      {first ? <>
        &ldquo;{first.title}&rdquo;: {first.items_done} of {plural(first.items, 'item')} done
        {first.accepted ? '' : ', awaiting acceptance'}
        {first.target_date && <>, due {day(first.target_date)}{first.overdue ? ' (overdue)' : ''}</>}
        {first.owner_name && <>; {first.owner_name} is accountable</>}.
      </> : k.actions.length ? <>{plural(k.actions.length, 'action')} recorded, none open.</>
        : accepting ? <>The treatment decided is to accept the risk.</>
        : a.decision.treatment_decision ? <>The treatment is {a.decision.treatment_decision}, but no action has been built.</>
        : <>No treatment has been decided yet.</>}
    </Card>
  );
}

function Decision({ a, to, lead }) {
  const d = a.decision;
  const t = TREATMENT[d.treatment_decision];
  const headline = d.agreement === 'agreed' ? `${t || 'Agreed'}: agreed by the business`
    : d.agreement === 'decided_not_agreed' ? `${t}, not agreed`
    : d.validation_status !== 'validated' ? 'Not yet validated' : 'No treatment decided';
  const tone = d.agreement === 'agreed' ? 'good' : 'warn';
  return (
    <Card section="decision" lead={lead} title="Who decided what?" helpKey="risk_answer.decision" to={to} more="The decision record" headline={headline} tone={tone}>
      Risk owner: {d.owner_names || 'nobody'}{d.owner_is_siro_fallback ? ' (the SIRO, as the department has no Information Asset Owner)' : ''}.{' '}
      {d.minuted && <>Minuted {day(d.minuted.meeting_date)}{d.minuted.about === 'security_action' ? ' on its action' : ''}: &ldquo;{d.minuted.decision_text}&rdquo;. </>}
      {!d.minuted && d.owner_act && <>{d.owner_act.kind === 'acceptance' ? 'Accepted' : 'Its action accepted'} by {d.owner_act.by}, {day(d.owner_act.at)}. </>}
      {d.agreement === 'decided_not_agreed' && <>Agreement needs a minuted Security Working Group decision, or the owner accepting it or its action. </>}
      {d.acceptance && <>Accepted by {d.acceptance.by} until {day(d.acceptance.expires_at)}. </>}
      {a.score.now > d.owner_max && <>Above {d.owner_max}: beyond the risk owner&rsquo;s authority to accept.</>}
    </Card>
  );
}

const PARTS = { score: Score, why: Why, work: Work, decision: Decision };

// `answer` passes one already read (the risk page reads it once for its diagram
// too); `omit` leaves out answers the page shows another way (the risk page
// draws How bad is it? as a diagram).
export function RiskAnswer({ riskId, lead = 'score', answer = null, omit = [] }) {
  const [a, setA] = useState(answer);
  const [error, setError] = useState('');
  useEffect(() => {
    if (answer) { setA(answer); return undefined; }
    let live = true;
    setA(null); setError('');
    getRiskAnswer(riskId).then((x) => { if (live) setA(x); })
      .catch((e) => { if (live) setError(e?.response?.status === 403 ? 'This risk is outside your department.' : 'Could not load the answer.'); });
    return () => { live = false; };
  }, [riskId, answer]);
  if (error) return <p className={styles.note} role="alert">{error}</p>;
  if (!a) return <p className={styles.note}>Working it out…</p>;
  const to = `/risks/${riskId}`;
  // A section with no answer of its own (#about, from the risk page's address)
  // leads with none: the four answers stay in their usual order.
  const order = (PARTS[lead] ? [lead, ...ORDER.filter((k) => k !== lead)] : ORDER).filter((k) => !omit.includes(k));
  return (
    <div className={styles.answer} aria-label={`${a.system_name}, ${a.threat_name}: the answer`}>
      {order.map((k) => {
        const Part = PARTS[k];
        return <Fragment key={k}><Part a={a} to={to} lead={k === lead} /></Fragment>;
      })}
    </div>
  );
}
