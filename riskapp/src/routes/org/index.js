'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { query }    = require('../../db/pool');
const { refreshFromDb, requireCapability } = require('../../auth/permissions');

const router = Router();
router.use(authenticate);

// ── GET /org/phase ──────────────────────────────────────────────────────────────
// Setup-vs-operational state. Readable by any authenticated user so the UI can
// reflect the phase (and the security_consultant can see/flip it). Returns the
// org name for context.
router.get('/phase', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT org_name, setup_phase_active, setup_completed_at FROM org_config LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Org config not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /org/go-operational ──────────────────────────────────────────────────
// One-way transition from setup to operational. Consultant-only by design (the
// security_consultant owns onboarding); after this the consultant's exception
// authority drops to risk_analyst level. Idempotency is enforced inside
// go_operational() — a second call raises 'already operational' → 409.
router.post('/go-operational', async (req, res, next) => {
  try {
    if (req.user.role !== 'security_consultant') {
      return res.status(403).json({
        error: 'Only the security consultant can move the organisation to operational.',
      });
    }
    await query(`SELECT go_operational($1)`, [req.user.id]);
    // Refresh the in-memory permission cache so setup-phase-only capabilities
    // (e.g. the consultant's write authority) lapse immediately, without a restart.
    await refreshFromDb();
    const { rows } = await query(
      `SELECT org_name, setup_phase_active, setup_completed_at FROM org_config LIMIT 1`
    );
    res.status(200).json(rows[0]);
  } catch (err) {
    if ((err.message || '').toLowerCase().includes('already operational')) {
      return res.status(409).json({ error: 'The organisation is already operational.' });
    }
    next(err);
  }
});

// ── Risk appetite (v171) ────────────────────────────────────────────────────────
// The action threshold (a risk scoring this or more must be treated) and the two
// acceptance limits, set by the SIRO or admin (risk_appetite.write) with a reason.
// GET also gives the active risks by score, so the page can say what a new
// threshold would mean before it is saved.
const canSetAppetite = requireCapability('risk_appetite.write');

const APPETITE_SQL = `
  SELECT o.mandatory_action_score AS action_threshold,
         o.exception_accept_analyst_max AS analyst_max,
         o.exception_accept_owner_max AS owner_max,
         o.risk_appetite_reason AS reason, o.risk_appetite_set_at AS set_at,
         u.full_name AS set_by_name
    FROM org_config o LEFT JOIN users u ON u.id = o.risk_appetite_set_by LIMIT 1`;

// Risks marked "no action required" that a threshold of $1 would catch.
const CONFLICTS_SQL = `
  SELECT r.id AS risk_id, r.risk_score AS score, s.name AS system_name, t.name AS threat_name
    FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
   WHERE r.is_active AND r.no_action_required AND r.risk_score >= $1
   ORDER BY r.risk_score DESC, s.name, t.name`;

const describeAppetite = (a) =>
  `action threshold ${a.action_threshold}, analyst accepts up to ${a.analyst_max}, risk owner up to ${a.owner_max}`;

router.get('/risk-appetite', canSetAppetite, async (req, res, next) => {
  try {
    const [{ rows: [appetite] }, { rows: byScore }] = await Promise.all([
      query(APPETITE_SQL),
      query(`SELECT risk_score AS score, count(*)::int AS risks,
                    count(*) FILTER (WHERE no_action_required)::int AS no_action_required
               FROM risks WHERE is_active GROUP BY risk_score ORDER BY risk_score`),
    ]);
    if (!appetite) return res.status(404).json({ error: 'Org config not found.' });
    res.json({ appetite, by_score: byScore });
  } catch (err) { next(err); }
});

router.put('/risk-appetite', canSetAppetite, async (req, res, next) => {
  try {
    const { action_threshold, analyst_max, owner_max, reason } = req.body || {};
    const want = { action_threshold: Number(action_threshold), analyst_max: Number(analyst_max), owner_max: Number(owner_max) };
    if (Object.values(want).some((v) => !Number.isInteger(v) || v < 1 || v > 25)) {
      return res.status(400).json({ error: 'Each number must be a whole risk score from 1 to 25.' });
    }
    if (want.analyst_max >= want.action_threshold) {
      return res.status(400).json({ error: 'A risk analyst may accept only risks below the action threshold.' });
    }
    if (want.owner_max < want.action_threshold) {
      return res.status(400).json({ error: 'A risk owner must be able to accept at least up to the action threshold.' });
    }
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Say why the risk appetite is being changed.' });

    const { rows: [before] } = await query(APPETITE_SQL);
    // Refused, naming the risks, while any marked "no action required" would sit
    // at or above the new threshold (owner, 2026-11-04). The check is inside the
    // UPDATE so a risk marked between check and write cannot slip through.
    const { rowCount } = await query(
      `UPDATE org_config SET mandatory_action_score = $1, exception_accept_analyst_max = $2,
              exception_accept_owner_max = $3, risk_appetite_reason = $4,
              risk_appetite_set_by = $5, risk_appetite_set_at = now(), updated_at = now()
        WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.is_active AND r.no_action_required AND r.risk_score >= $1)`,
      [want.action_threshold, want.analyst_max, want.owner_max, String(reason).trim(), req.user.id]);
    if (!rowCount) {
      const { rows: conflicts } = await query(CONFLICTS_SQL, [want.action_threshold]);
      return res.status(409).json({
        error: `${conflicts.length === 1 ? 'One risk is' : `${conflicts.length} risks are`} marked "no action required" and would be at or above the new threshold. Give each a treatment decision first.`,
        conflicts,
      });
    }
    const { rows: [after] } = await query(APPETITE_SQL);
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_label, human_narrative)
       VALUES ($1, 'update', 'org_config', 'risk appetite', $2)`,
      [req.user.id, `Risk appetite: ${describeAppetite(before)} → ${describeAppetite(after)}. Reason: ${after.reason}`]);
    res.json({ appetite: after });
  } catch (err) { next(err); }
});

module.exports = router;
