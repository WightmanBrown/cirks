// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';

// "Who decided what?" as a picture (owner, 2026-11-19; docs/relation-diagrams.md):
//
//   Risk owner ──▶ Validated ──▶ Treatment ──▶ Agreed? ──▶ Accepted until … / Security actions
//
// The chain of decisions about the risk, left to right, each box saying who
// and when in words: who owns it, whether the CISO validated it, the treatment
// decided, whether the business agreed it (a minuted Security Working Group
// decision or the owner's own act, the CISO report's rule), and what follows:
// the acceptance and when it runs out, or the work. A step not yet taken is
// drawn dashed and red. Every box opens Who decided what? (or the section it
// belongs to) at that record.
//
// `a` is GET /risks/:id/answer; `risk` is GET /risks/:id.

const TREATMENT = { mitigate: 'Mitigate', accept: 'Accept', transfer: 'Transfer', avoid: 'Avoid' };
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ROLE = { ciso: 'CISO', siro: 'SIRO', admin: 'administrator', information_asset_owner: 'risk owner' };

export function decisionNodes(a, risk, onGo = () => {}, today = new Date()) {
  const d = a.decision;
  const nodes = [];
  const links = [];
  const chain = (id) => { if (nodes.length) links.push({ from: nodes[nodes.length - 1].id, to: id }); };
  // The titles here are a word or two, so each detail may take two lines.
  const add = (n) => { chain(n.id); nodes.push({ ...n, col: nodes.length, row: 0, detailLines: 2 }); };

  add({
    id: 'owner', tag: 'Risk owner', title: d.owner_names || 'Nobody', tone: d.owner_names ? null : 'bad',
    detail: d.owner_is_siro_fallback ? 'the SIRO: no Information Asset Owner' : a.department_name,
    onClick: () => onGo('about', 'risk-owner'),
  });

  const validated = d.validation_status === 'validated';
  add({
    id: 'validated', tag: 'Validation', tone: validated ? 'good' : 'bad',
    title: validated ? 'Validated' : d.validation_status === 'returned' ? 'Returned for rework' : 'Not yet validated',
    detail: validated
      ? [risk?.validated_by_name ? `by ${risk.validated_by_name}` : null, day(risk?.validated_at)].filter(Boolean).join(', ') || null
      : 'awaiting the CISO',
    onClick: () => onGo('decision', 'risk-validation'),
  });

  const noAction = !!risk?.no_action_required;
  const t = d.treatment_decision;
  add({
    id: 'treatment', tag: 'Treatment', tone: noAction || t ? null : 'bad',
    title: noAction ? 'No action required' : TREATMENT[t] || 'Not decided',
    detail: noAction ? 'current controls judged enough' : t ? null : `decision owed at score ${a.score.now}`,
    onClick: () => onGo('decision', 'risk-section-treatment-decision'),
  });

  const agreed = d.agreement === 'agreed';
  add({
    id: 'agreed', tag: 'The business', tone: agreed ? 'good' : d.agreement === 'decided_not_agreed' ? 'warn' : 'quiet',
    title: agreed ? 'Agreed' : d.agreement === 'decided_not_agreed' ? 'Not agreed' : 'Not asked yet',
    detail: d.minuted ? `minuted ${day(d.minuted.meeting_date)}`
      : d.owner_act ? `${d.owner_act.kind === 'acceptance' ? 'accepted' : 'action accepted'} by ${d.owner_act.by}`
      : d.agreement === 'decided_not_agreed' ? 'needs a minuted decision or the owner' : null,
    onClick: () => onGo('decision', 'risk-section-treatment-decision'),
  });

  const beyond = a.score.now > d.owner_max;
  if (t === 'accept') {
    const acc = d.acceptance;
    const left = acc ? Math.ceil((new Date(acc.expires_at) - today) / 86400000) : null;
    add(acc ? {
      id: 'accepted', tag: `Accepted${beyond ? ` · above ${d.owner_max}` : ''}`,
      tone: left < 0 ? 'bad' : left <= 30 || beyond ? 'warn' : 'good',
      title: left < 0 ? `Ran out ${day(acc.expires_at)}` : `Until ${day(acc.expires_at)}`,
      detail: beyond ? 'beyond the risk owner’s authority' : `by ${acc.by}${ROLE[acc.role] ? ` (${ROLE[acc.role]})` : ''}`,
      onClick: () => onGo('decision', 'risk-section-exceptions'),
    } : {
      id: 'accepted', tag: 'Acceptance', tone: 'bad', title: 'No exception recorded',
      detail: 'accepting needs a time-bounded exception', onClick: () => onGo('decision', 'risk-section-exceptions'),
    });
  } else if (t && !noAction) {
    const w = a.work;
    add({
      id: 'work', tag: 'Security actions', tone: w.open ? (w.overdue ? 'warn' : null) : 'bad',
      title: w.open ? `${plural(w.open, 'action')} open` : w.actions.length ? 'All finished' : 'None built',
      detail: w.overdue ? `${w.overdue} overdue` : null,
      onClick: () => onGo('work', 'risk-section-actions'),
    });
  }

  const label = `Risk owner ${d.owner_names || 'nobody'}; ${validated ? 'validated' : 'not validated'}; `
    + `treatment ${noAction ? 'no action required' : TREATMENT[t] || 'not decided'}; `
    + `${agreed ? 'agreed by the business' : 'not agreed by the business'}`
    + `${t === 'accept' && d.acceptance ? `; accepted until ${day(d.acceptance.expires_at)}` : ''}.`;
  return { nodes, links, label };
}

export function DecisionDiagram({ answer, risk, onGo }) {
  const { nodes, links, label } = decisionNodes(answer, risk, onGo);
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
