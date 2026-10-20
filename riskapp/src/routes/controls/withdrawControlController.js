'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Withdrawing a control from use — one act, with a reason and a preview (v131).
//
// Backing out a control that turns out to be wrong took a threat unlink, then one
// deletion per system (15 calls for ID.RA-09, 22 for PR.DS-10), then the SoA
// decision — with no reason recorded anywhere and no warning that a risk was
// about to rise. Removing ID.RA-09 would have taken Power Generation from 10 to
// 20, because it was the only judged control holding it down.
//
// So: `POST /controls/:id/withdraw` does all of it under one reason, and
// `GET /controls/:id/withdrawal` answers "what would that do?" first.
//
// THREE THINGS GO, and the third is the one that is easy to miss:
//   • the threat links       — which is what removes it from every risk
//   • the per-system rows    — where it was recorded as deployed
//   • the JUDGED RESIDUALS   — `risk_control_probability`, someone's assessment
//     of what this control reduces a risk to. They outlive the link: inert while
//     nothing points at them, silently resurrected if the control is ever linked
//     to that threat again. PR.DS-10 still carries 15 of them today.
// Open work planned against it is withdrawn by the v119/v121 triggers as the
// links go, with a note; nothing is deleted from the record.
//
// NOT touched: the SoA decision (does this objective apply at all?) and the
// control's components. Withdrawing our implementation is not the same statement
// as "this objective does not apply", and conflating them would give the SoA two
// ways to be decided. A control delivered organisation-wide or for a group is
// REFUSED for exactly that reason: it counts wherever the objective applies, so
// withdrawing it *is* the SoA decision, and the caller is told so.
//
// The preview runs the real thing and rolls back (`withRollback`), so it cannot
// drift from the act the way a second implementation of the arithmetic would.

const { query, withActor, withRollback } = require('../../db/pool');

const REF_SQL = `
  COALESCE((SELECT sc.ref_code FROM control_mappings cm
              JOIN standard_controls sc ON sc.id = cm.standard_control_id
              JOIN standards st ON st.id = sc.standard_id
             WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
           c.reference_code)`;

async function loadControl(db, id) {
  const { rows } = await db.query(
    `SELECT c.id, c.title, c.delivery, ${REF_SQL} AS ref,
            se.applicable, se.justification
       FROM controls c LEFT JOIN soa_entries se ON se.control_id = c.id
      WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

// Every active risk's probability, so "what moved" is measured rather than
// predicted. 204 rows on the largest instance: cheaper than reasoning about it.
async function probabilities(db) {
  const { rows } = await db.query(
    `SELECT id, probability_c AS c, probability_i AS i, probability_a AS a, risk_score AS score
       FROM risks WHERE is_active`);
  return new Map(rows.map(r => [r.id, r]));
}

function movement(before, after, detail) {
  const moved = [];
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a || (a.c === b.c && a.i === b.i && a.a === b.a)) continue;
    moved.push({
      risk_id: id,
      system: detail.get(id)?.system ?? null,
      threat: detail.get(id)?.threat ?? null,
      before: `${b.c}/${b.i}/${b.a}`, after: `${a.c}/${a.i}/${a.a}`,
      before_score: b.score, after_score: a.score,
    });
  }
  return moved.sort((x, y) => (y.after_score - y.before_score) - (x.after_score - x.before_score));
}

/**
 * Do the withdrawal. Used for real inside `withActor`, and for the preview inside
 * `withRollback` — the same code both times, which is the point.
 */
async function performWithdrawal(db, control, actorId, reason) {
  const before = await probabilities(db);
  const { rows: names } = await db.query(
    `SELECT r.id, s.name AS system, t.name AS threat
       FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
      WHERE r.is_active`);
  const detail = new Map(names.map(r => [r.id, r]));

  // What is there, recorded before it goes — an audit row per system, carrying
  // the status and provenance, so "what did we have on that system" survives.
  const { rows: deployments } = await db.query(
    `SELECT syc.system_id, s.name AS system_name, syc.status::text AS status,
            syc.provenance, syc.exclusion_reason, syc.created_at
       FROM system_controls syc JOIN systems s ON s.id = syc.system_id
      WHERE syc.control_id = $1 ORDER BY s.name`, [control.id]);
  const { rows: threats } = await db.query(
    `SELECT ct.threat_id, t.name FROM control_threats ct JOIN threats t ON t.id = ct.threat_id
      WHERE ct.control_id = $1 ORDER BY t.name`, [control.id]);
  const { rows: residuals } = await db.query(
    `SELECT risk_id, probability_c AS c, probability_i AS i, probability_a AS a
       FROM risk_control_probability WHERE control_id = $1`, [control.id]);
  const openItems = await db.query(
    `SELECT count(*)::int AS n FROM security_action_items i
       JOIN security_actions sa ON sa.id = i.action_id
      WHERE i.control_id = $1 AND i.element_type = 'control'
        AND i.status IN ('pending', 'in_progress') AND sa.status NOT IN ('completed', 'cancelled')`,
    [control.id]);

  const label = control.ref ? `${control.ref} — ${control.title}` : control.title;

  await db.query(
    `INSERT INTO audit_log (user_id, entity_type, entity_id, entity_label, action,
                            field_name, old_value, new_value, changes, human_narrative)
     VALUES ($1, 'control_objective', $2, $3, 'update', 'withdrawn', NULL, $4,
             $5::jsonb, $6)`,
    [actorId, control.id, control.title, reason,
     JSON.stringify({
       reason,
       systems: deployments.map(d => ({ id: d.system_id, name: d.system_name, status: d.status })),
       threats: threats.map(t => ({ id: t.threat_id, name: t.name })),
       judged_residuals: residuals,
     }),
     `"${label}" withdrawn from use: removed from ${deployments.length} system(s), `
     + `unlinked from ${threats.length} threat(s), and ${residuals.length} judged residual(s) `
     + `cleared. Reason: ${reason}`]);

  // Per-system rows, each recorded individually so a single system's history
  // reads correctly without unpacking the summary above.
  for (const d of deployments) {
    await db.query(
      `INSERT INTO audit_log (user_id, entity_type, entity_id, entity_label, action,
                              field_name, old_value, new_value, changes, human_narrative)
       VALUES ($1, 'system_controls', $2, $3, 'delete', 'control', $4, NULL, $5::jsonb, $6)`,
      [actorId, d.system_id, d.system_name, control.title,
       JSON.stringify({ control_id: control.id, ref: control.ref, status: d.status,
                        provenance: d.provenance, exclusion_reason: d.exclusion_reason,
                        created_at: d.created_at }),
       `"${label}" withdrawn from "${d.system_name}" (it was ${d.status} there). Reason: ${reason}`]);
  }

  // The threat links go FIRST: that is what removes the control from every risk,
  // and the v121 trigger withdraws the work planned against it as they go.
  await db.query(`DELETE FROM control_threats WHERE control_id = $1`, [control.id]);
  await db.query(`DELETE FROM system_controls WHERE control_id = $1`, [control.id]);
  await db.query(`DELETE FROM risk_control_probability WHERE control_id = $1`, [control.id]);

  const withdrawnNow = await db.query(
    `SELECT count(*)::int AS n FROM security_action_items
      WHERE control_id = $1 AND status = 'withdrawn' AND withdrawn_at > now() - interval '1 minute'`,
    [control.id]);

  const after = await probabilities(db);
  return {
    control: { id: control.id, ref: control.ref, title: control.title },
    removed: {
      systems: deployments.map(d => ({ id: d.system_id, name: d.system_name, status: d.status })),
      threats: threats.map(t => ({ id: t.threat_id, name: t.name })),
      judged_residuals: residuals.length,
      open_items: openItems.rows[0].n,
      items_withdrawn: withdrawnNow.rows[0].n,
    },
    risks_moved: movement(before, after, detail),
  };
}

// A control delivered organisation-wide or for a group counts wherever the
// objective applies, not where it is recorded, so there is nothing to withdraw
// until the SoA says it does not apply. Refusing is better than half-doing it.
function deliveryRefusal(control) {
  if (control.delivery !== 'organisation' && control.delivery !== 'group') return null;
  const mode = control.delivery === 'organisation' ? 'organisation-wide' : 'for a group';
  return `This control is delivered ${mode}, so it counts wherever the objective applies rather than `
       + 'where it is recorded. Withdrawing it is a Statement of Applicability decision: mark the '
       + 'objective not applicable, with a reason, on its Decision panel.';
}

// ── GET /controls/:id/withdrawal — what withdrawing it would do ───────────────
async function previewWithdrawal(req, res, next) {
  try {
    const control = await loadControl({ query }, req.params.id);
    if (!control) return res.status(404).json({ error: 'Control objective not found.' });
    const refusal = deliveryRefusal(control);
    if (refusal) return res.status(409).json({ error: refusal });

    const preview = await withRollback(req.user.id, (db) =>
      performWithdrawal(db, control, req.user.id, '(preview)'));
    res.json({ ...preview, preview: true });
  } catch (err) { next(err); }
}

// ── POST /controls/:id/withdraw — do it, with a reason ───────────────────────
async function withdrawControl(req, res, next) {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({
        error: 'A reason is required — say why this control is being withdrawn from use.' });
    }
    if (reason.length > 2000) {
      return res.status(400).json({ error: 'The reason must be 2000 characters or fewer.' });
    }
    const control = await loadControl({ query }, req.params.id);
    if (!control) return res.status(404).json({ error: 'Control objective not found.' });
    const refusal = deliveryRefusal(control);
    if (refusal) return res.status(409).json({ error: refusal });

    const result = await withActor(req.user.id, (db) =>
      performWithdrawal(db, control, req.user.id, reason));
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { previewWithdrawal, withdrawControl };
