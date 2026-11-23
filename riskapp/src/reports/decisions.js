'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Decisions owed, a question part (docs/insights-drilldown.md step 3): the
// question page behind the board's "is every risk scoring 12 or higher
// answered?", the SIRO's decisions and the CISO's agreement. Which risks at or
// above the action threshold still need a decision, who owes it, and how long
// it has waited; and which acceptances run out soon.
//
// The stage a risk is at follows the chain the CISO report uses (C2):
// validated → treatment decided → agreed by the business. Whoever owes the next
// step is named: the CISO to validate, the analyst to correct a returned risk
// or decide its treatment, the risk owner (or the Security Working Group) to
// agree it. Agreement is the CISO report's rule (agreementState). Derived on
// read; nothing stored.

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { agreementState, MINUTED_SQL, OWNER_ACTS_SQL } = require('./ciso');

const EXPIRING_DAYS = 30;
const DAY = 86400000;

const STAGE = {
  validate: { order: 0, who: 'The CISO', act: 'validate it' },
  correct:  { order: 1, who: 'The risk analyst', act: 'correct it after the CISO returned it' },
  treat:    { order: 2, who: 'The risk analyst', act: 'decide its treatment' },
  agree:    { order: 3, who: 'The risk owner, or the Security Working Group', act: 'agree the treatment' },
};

async function computeDecisions(departmentId = null) {
  const [{ rows: [cfg] }, { rows: risks }, { rows: facts }, { rows: minuted }, { rows: ownerActs }, { rows: expiring }] = await Promise.all([
    query('SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1'),
    query(RISKS_SQL),
    query(`SELECT id, validation_status, validated_at, created_at, updated_at FROM risks WHERE is_active`),
    query(MINUTED_SQL), query(OWNER_ACTS_SQL),
    // Acceptances in force running out within the window, and those already
    // expired with the risk still open (the board tile's v_escalated_exceptions).
    query(`SELECT e.id AS exception_id, e.risk_id, e.expires_at, (e.expires_at - CURRENT_DATE)::int AS days_left,
                  u.full_name AS accepted_by, e.accepted_role
             FROM exceptions e LEFT JOIN users u ON u.id = e.accepted_by
            WHERE e.status = 'active' AND e.risk_id IS NOT NULL
              AND e.expires_at <= CURRENT_DATE + $1::int
           UNION ALL
           SELECT v.exception_id, v.risk_id, v.expires_at, (v.expires_at - CURRENT_DATE)::int, v.accepted_by_name, v.accepted_role
             FROM v_escalated_exceptions v WHERE v.risk_id IS NOT NULL`, [EXPIRING_DAYS]),
  ]);
  const action = cfg.mandatory_action_score;
  const factBy = new Map(facts.map((f) => [f.id, f]));
  const minutedBy = new Map(minuted.map((m) => [m.risk_id, m]));
  const ownerBy = new Map(ownerActs.map((o) => [o.risk_id, o]));
  const now = Date.now();
  const days = (d) => (d ? Math.max(0, Math.floor((now - new Date(d).getTime()) / DAY)) : null);
  const inScope = (r) => !departmentId || r.department_id === departmentId;

  const owed = [];
  let answered = 0;
  for (const r of risks.filter((x) => x.score >= action && inScope(x))) {
    const f = factBy.get(r.id);
    const o = ownerBy.get(r.id);
    const ownerAct = o?.acceptance || o?.accepted_action || null;
    const validated = f.validation_status === 'validated';
    const state = agreementState({ validated, treatment_decision: r.treatment_decision, minuted: minutedBy.get(r.id), ownerAct });
    if (state === 'agreed') { answered += 1; continue; }
    // The next step, and since when it has been waiting.
    let stage; let since;
    if (f.validation_status === 'returned') { stage = 'correct'; since = f.updated_at; }
    else if (!validated) { stage = 'validate'; since = f.created_at; }
    else if (!r.treatment_decision) { stage = 'treat'; since = f.validated_at; }
    else { stage = 'agree'; since = f.validated_at; }
    owed.push({
      risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
      department_id: r.department_id, department_name: r.department_name,
      score: r.score, treatment_decision: r.treatment_decision,
      stage, who: stage === 'agree' && r.owner_names ? `${r.owner_names}${r.owner_is_siro_fallback ? ' (SIRO)' : ''}, or the Security Working Group` : STAGE[stage].who,
      act: STAGE[stage].act, waiting_days: days(since),
      above_owner_max: r.score > cfg.exception_accept_owner_max,
    });
  }
  // Longest waiting first within each stage; stages in the order of the chain.
  owed.sort((a, b) => STAGE[a.stage].order - STAGE[b.stage].order || (b.waiting_days ?? 0) - (a.waiting_days ?? 0) || b.score - a.score);

  const riskBy = new Map(risks.map((r) => [r.id, r]));
  const acceptances = expiring
    .map((e) => ({ ...e, risk: riskBy.get(e.risk_id) }))
    .filter((e) => e.risk && inScope(e.risk))
    .map((e) => ({
      exception_id: e.exception_id, risk_id: e.risk_id, system_name: e.risk.system_name, threat_name: e.risk.threat_name,
      department_name: e.risk.department_name, score: e.risk.score, expires_at: e.expires_at, days_left: e.days_left,
      accepted_by: e.accepted_by, accepted_role: e.accepted_role,
      who: e.risk.owner_names ? `${e.risk.owner_names}${e.risk.owner_is_siro_fallback ? ' (SIRO)' : ''}` : 'The risk owner',
    }))
    .sort((a, b) => a.days_left - b.days_left);

  const byStage = Object.keys(STAGE).map((k) => ({ stage: k, who: STAGE[k].who, act: STAGE[k].act,
    count: owed.filter((x) => x.stage === k).length }));
  const deptMap = new Map();
  for (const x of owed) {
    const k = x.department_id || 'none';
    if (!deptMap.has(k)) deptMap.set(k, { department_id: x.department_id, name: x.department_name || 'No department', count: 0, longest_days: 0 });
    const d = deptMap.get(k);
    d.count += 1; d.longest_days = Math.max(d.longest_days, x.waiting_days ?? 0);
  }

  return {
    thresholds: { action, owner_max: cfg.exception_accept_owner_max },
    department_id: departmentId,
    total: owed.length + answered,
    answered,
    owed,
    by_stage: byStage,
    by_department: [...deptMap.values()].sort((a, b) => b.count - a.count || b.longest_days - a.longest_days),
    expiring_within_days: EXPIRING_DAYS,
    acceptances,
  };
}

module.exports = { computeDecisions };
