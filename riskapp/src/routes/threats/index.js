'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query, withActor } = require('../../db/pool');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));

const VALID_CATEGORIES = new Set(['accidental', 'deliberate', 'environmental']);
const VALID_SOURCES    = new Set(['internal', 'external', 'natural']);

const canView  = requireCapability('threats.read');
const canWrite = requireCapability('threats.write');
// Editing the control↔threat catalogue is governed by controls.write — the same
// capability that gates the control-side linking (POST /controls/:id/threats),
// so the catalogue has one owner regardless of which side you curate it from.
const canWriteControlLink = requireCapability('controls.write');
// Identifying that a threat applies to a system is a RISK-REGISTER act, not
// catalogue curation — it declares an exposure that someone will have to
// assess. Gated on risks.write accordingly, not threats.write.
const canIdentify = requireCapability('risks.write');

// ── helpers ──────────────────────────────────────────────────────────────────

function validateProbability(p) {
  if (p === undefined || p === null || p === '') return null;
  const n = parseInt(p);
  if (isNaN(n) || n < 1 || n > 5) return undefined;
  return n;
}

// ── GET /threats?q=&category= ────────────────────────────────────────────────

router.get('/', canView, async (req, res, next) => {
  try {
    const { q, category } = req.query;
    const conditions = ['t.is_active = TRUE'];
    const params     = [];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`t.threat_category = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT t.id, t.name, t.description, t.threat_category, t.source,
              t.reference_code,
              t.probability_c, t.probability_i, t.probability_a,
              t.default_baseline_probability,
              t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM risks r
                WHERE r.threat_id = t.id AND r.is_active = TRUE)::int AS usage_count
       FROM threats t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.threat_category, t.name`,
      params
    );

    res.json({ threats: rows });
  } catch (err) { next(err); }
});

// ── GET /threats/:id ─────────────────────────────────────────────────────────

router.get('/:id', canView, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.name, t.description, t.threat_category, t.source,
              t.reference_code, t.parent_threat_id,
              t.probability_c, t.probability_i, t.probability_a,
              t.default_baseline_probability,
              t.probability_notes,
              t.probability_set_at,
              u_p.full_name AS probability_set_by_name,
              t.is_active, t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM risks r
                WHERE r.threat_id = t.id AND r.is_active = TRUE)::int AS usage_count
       FROM threats t
       LEFT JOIN users u_p ON u_p.id = t.probability_set_by
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Threat not found.' });

    // The systems this threat is IDENTIFIED against, each with its assessment
    // state. `assessed` is derived (an active risk exists for the pair), never
    // stored — see docs/threat-identification.md. `stale` compares the age of
    // the identification against the organisation's own longest acceptable gap
    // between SWG reviews: an exposure that has outlived a full cycle without
    // being assessed can no longer be explained as "we haven't met yet".
    // `can_unlink` mirrors the DELETE guard so the UI can hide the button
    // rather than offer an action the API will refuse.
    const { rows: systems } = await query(
      `SELECT sys.id, sys.name, sys.is_shared,
              d.name        AS department_name,
              st.added_at,
              au.full_name  AS added_by_name,
              r.id          AS risk_id,
              r.risk_score,
              r.validation_status,
              (r.id IS NOT NULL) AS assessed,
              (r.id IS NULL
                AND st.added_at < now() - make_interval(days => oc.meeting_max_interval_days)) AS stale,
              NOT EXISTS (SELECT 1 FROM risks rr
                           WHERE rr.system_id = sys.id AND rr.threat_id = st.threat_id) AS can_unlink
         FROM system_threats st
         JOIN systems sys ON sys.id = st.system_id AND sys.is_active = TRUE
         LEFT JOIN departments d ON d.id = sys.department_id
         LEFT JOIN users au ON au.id = st.added_by
         LEFT JOIN risks r ON r.system_id = st.system_id
                          AND r.threat_id = st.threat_id AND r.is_active = TRUE
         CROSS JOIN org_config oc
        WHERE st.threat_id = $1
        ORDER BY (r.id IS NOT NULL), sys.name`,
      [req.params.id]
    );

    res.json({ ...rows[0], systems });
  } catch (err) { next(err); }
});

// ── GET /threats/:id/controls ─────────────────────────────────────────────────
// The control "catalogue" for a threat: every control linked to it via
// control_threats. This is the threat→control knowledge built up as analysts
// attach controls to risks (POST /risks/:id/controls writes both system_controls
// and control_threats). Reusable as a source of suggestions in the risk-detail
// mitigating-controls dialog and as a "what are my options?" view on the threat.
router.get('/:id/controls', canView, async (req, res, next) => {
  try {
    const { rows: t } = await query('SELECT id FROM threats WHERE id = $1', [req.params.id]);
    if (!t.length) return res.status(404).json({ error: 'Threat not found.' });

    const { rows } = await query(
      `SELECT c.id, c.title, c.control_type,
              c.effectiveness, (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS status, c.is_baseline,
              (SELECT s.code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
               JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework,
              (SELECT sc2.ref_code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
               JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
              ct.id AS link_id, ct.notes
       FROM control_threats ct
       JOIN controls c ON c.id = ct.control_id
       WHERE ct.threat_id = $1
       ORDER BY c.title ASC`,
      [req.params.id]
    );
    res.json({ controls: rows });
  } catch (err) { next(err); }
});

// ── POST /threats/:id/controls ────────────────────────────────────────────────
// Deliberately curate the catalogue from the threat side: declare that a control
// mitigates this threat (writes control_threats). Mirrors POST /controls/:id/threats.
// This is catalogue knowledge only — it does NOT deploy the control on any system.
router.post('/:id/controls', canWriteControlLink, async (req, res, next) => {
  try {
    const { control_id, notes } = req.body || {};
    if (!control_id) return res.status(400).json({ error: 'control_id is required.' });

    await query(
      `INSERT INTO control_threats (control_id, threat_id, notes, created_by)
       VALUES ($1, $2, $3, $4)`,
      [control_id, req.params.id, notes?.trim() || null, req.user.id]
    );

    const { rows } = await query(
      `SELECT c.id, c.title, c.control_type,
              c.effectiveness, (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS status, c.is_baseline,
              (SELECT s.code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
               JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework,
              (SELECT sc2.ref_code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
               JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
              ct.id AS link_id, ct.notes
       FROM control_threats ct
       JOIN controls c ON c.id = ct.control_id
       WHERE ct.threat_id = $1 AND ct.control_id = $2`,
      [req.params.id, control_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This control is already linked to the threat.' });
    if (err.code === '23503') return res.status(404).json({ error: 'Control or threat not found.' });
    next(err);
  }
});

// ── DELETE /threats/:id/controls/:controlId ───────────────────────────────────
// Remove a control from this threat's catalogue. NOTE: because a risk's mitigating
// controls are derived as system_controls ∩ control_threats, removing the link
// also stops the control surfacing as mitigating on risks for this threat.
router.delete('/:id/controls/:controlId', canWriteControlLink, async (req, res, next) => {
  try {
    // withActor so the 0121 trigger can attribute both the audit row and the
    // withdrawal of the planned work to the person who made the decision. With
    // a bare query() it fires as `unattributed`, which is exactly the outcome
    // that made the original unlink untraceable.
    const { rowCount } = await withActor(req.user.id, (db) => db.query(
      `DELETE FROM control_threats WHERE threat_id = $1 AND control_id = $2`,
      [req.params.id, req.params.controlId]
    ));
    if (!rowCount) return res.status(404).json({ error: 'Control–threat link not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /threats/:id/systems ────────────────────────────────────────────────
// IDENTIFY that this threat applies to a system, without assessing it. This is
// the act that used to be possible only as a by-product of raising a risk (see
// docs/threat-identification.md): a statement about exposure, typically made in
// bulk across several systems by someone who will not be scoring it.
// The pair becomes "identified, not yet assessed" until a risk exists for it.
router.post('/:id/systems', canIdentify, async (req, res, next) => {
  try {
    const { system_id } = req.body || {};
    if (!system_id) return res.status(400).json({ error: 'system_id is required.' });

    const { rows: t } = await query('SELECT 1 FROM threats WHERE id = $1', [req.params.id]);
    if (!t.length) return res.status(404).json({ error: 'Threat not found.' });
    const { rows: s } = await query(
      'SELECT id, name FROM systems WHERE id = $1 AND is_active = TRUE', [system_id]);
    if (!s.length) return res.status(404).json({ error: 'System not found.' });

    const { rowCount } = await query(
      `INSERT INTO system_threats (system_id, threat_id, added_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [system_id, req.params.id, req.user.id]
    );
    if (!rowCount) {
      return res.status(409).json({ error: 'This threat is already identified against that system.' });
    }
    res.status(201).json({ system_id, system_name: s[0].name, assessed: false });
  } catch (err) { next(err); }
});

// ── DELETE /threats/:id/systems/:systemId ────────────────────────────────────
// UN-identify. This has exactly one legitimate meaning — someone linked the
// wrong thing — so it is a hard delete, not a retirement: an erasure must not
// appear in management information as an outcome.
//
// The guard is what makes that safe. Once ANY risk has existed for the pair,
// active or inactive, deleting the link would orphan the history that refers to
// it. From that point the exposure can only be ended through the risk itself
// (POST /risks/:id/retire with 'no_longer_applies'), which keeps the trail
// coherent. The mistake path therefore stays open exactly as long as it is
// genuinely a mistake.
router.delete('/:id/systems/:systemId', canIdentify, async (req, res, next) => {
  try {
    const { rows: risks } = await query(
      `SELECT id, is_active FROM risks WHERE system_id = $1 AND threat_id = $2 LIMIT 1`,
      [req.params.systemId, req.params.id]
    );
    if (risks.length) {
      return res.status(409).json({
        error: risks[0].is_active
          ? 'This threat has been assessed on that system. Retire the risk instead — an assessed exposure ends through its risk, not by unlinking.'
          : 'A risk has previously existed for this pair, so the link is part of the audit trail and cannot be removed.',
        risk_id: risks[0].id,
      });
    }

    const { rowCount } = await query(
      `DELETE FROM system_threats WHERE system_id = $1 AND threat_id = $2`,
      [req.params.systemId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'This threat is not identified against that system.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /threats ────────────────────────────────────────────────────────────

router.post('/', canWrite, async (req, res, next) => {
  try {
    const {
      name, description,
      threat_category, source,
      reference_code,
      probability_c, probability_i, probability_a,
      default_baseline_probability,
      probability_notes,
    } = req.body || {};

    if (!name?.trim())                       return res.status(400).json({ error: 'name is required.' });
    if (!threat_category || !VALID_CATEGORIES.has(threat_category)) {
      return res.status(400).json({ error: `threat_category must be one of: ${[...VALID_CATEGORIES].join(', ')}.` });
    }
    const src = source || 'external';
    if (!VALID_SOURCES.has(src)) {
      return res.status(400).json({ error: `source must be one of: ${[...VALID_SOURCES].join(', ')}.` });
    }

    const pC = validateProbability(probability_c) ?? 3;
    const pI = validateProbability(probability_i) ?? 3;
    const pA = validateProbability(probability_a) ?? 3;
    if (pC === undefined || pI === undefined || pA === undefined) {
      return res.status(400).json({ error: 'Probabilities must be integers 1–5.' });
    }
    const baseline = validateProbability(default_baseline_probability);
    if (baseline === undefined) {
      return res.status(400).json({ error: 'default_baseline_probability must be 1–5 or empty.' });
    }

    const { rows } = await query(
      `INSERT INTO threats (
         name, description, threat_category, source, reference_code,
         probability_c, probability_i, probability_a,
         default_baseline_probability, probability_notes,
         probability_set_by, probability_set_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id`,
      [
        name.trim(),
        description?.trim() || null,
        threat_category,
        src,
        reference_code?.trim() || null,
        pC, pI, pA,
        baseline,
        probability_notes?.trim() || null,
        req.user.id,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A threat with this name already exists.' });
    }
    next(err);
  }
});

// ── PUT /threats/:id ─────────────────────────────────────────────────────────

router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const {
      name, description,
      threat_category, source,
      reference_code,
      probability_c, probability_i, probability_a,
      default_baseline_probability,
      probability_notes,
    } = req.body || {};

    if (!name?.trim())                       return res.status(400).json({ error: 'name is required.' });
    if (!threat_category || !VALID_CATEGORIES.has(threat_category)) {
      return res.status(400).json({ error: `threat_category must be one of: ${[...VALID_CATEGORIES].join(', ')}.` });
    }
    if (!VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: `source must be one of: ${[...VALID_SOURCES].join(', ')}.` });
    }

    const pC = validateProbability(probability_c) ?? 3;
    const pI = validateProbability(probability_i) ?? 3;
    const pA = validateProbability(probability_a) ?? 3;
    if (pC === undefined || pI === undefined || pA === undefined) {
      return res.status(400).json({ error: 'Probabilities must be integers 1–5.' });
    }
    const baseline = validateProbability(default_baseline_probability);
    if (baseline === undefined) {
      return res.status(400).json({ error: 'default_baseline_probability must be 1–5 or empty.' });
    }

    // Did probabilities change? If so, stamp probability_set_by/at.
    const { rows: existing } = await query(
      `SELECT probability_c, probability_i, probability_a FROM threats WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Threat not found.' });
    const probChanged = existing[0].probability_c !== pC
                     || existing[0].probability_i !== pI
                     || existing[0].probability_a !== pA;

    const { rowCount } = await query(
      `UPDATE threats SET
         name             = $2,
         description      = $3,
         threat_category  = $4,
         source           = $5,
         reference_code   = $6,
         probability_c    = $7,
         probability_i    = $8,
         probability_a    = $9,
         default_baseline_probability = $10,
         probability_notes = $11,
         probability_set_by = CASE WHEN $12 THEN $13 ELSE probability_set_by END,
         probability_set_at = CASE WHEN $12 THEN NOW()  ELSE probability_set_at END
       WHERE id = $1 AND is_active = TRUE`,
      [
        req.params.id,
        name.trim(),
        description?.trim() || null,
        threat_category,
        source,
        reference_code?.trim() || null,
        pC, pI, pA,
        baseline,
        probability_notes?.trim() || null,
        probChanged,
        req.user.id,
      ]
    );
    if (!rowCount) return res.status(404).json({ error: 'Threat not found.' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A threat with this name already exists.' });
    }
    next(err);
  }
});

// ── DELETE /threats/:id ──────────────────────────────────────────────────────
// Soft-delete (is_active = FALSE). Refuses if any active risks reference this
// threat — those risks would have to be archived first.

router.delete('/:id', canWrite, async (req, res, next) => {
  try {
    const { rows: usage } = await query(
      `SELECT COUNT(*)::int AS n FROM risks WHERE threat_id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (usage[0].n > 0) {
      return res.status(409).json({
        error: `Cannot archive: ${usage[0].n} active risk${usage[0].n !== 1 ? 's' : ''} reference this threat. Archive those first.`,
      });
    }

    const { rowCount } = await query(
      `UPDATE threats SET is_active = FALSE WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Threat not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
