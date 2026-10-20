'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Assurance findings — things the ISMS should not be, that no risk explains
// (docs/assurance-findings.md). A finding is DERIVED, never stored: it closes
// itself when the underlying fact changes. What is stored is the response — a
// security action whose subject is the thing the finding is about and whose
// origin says which finding raised it (v133).
//
// Two responses, mirroring risk treatment: ACT (a security action) or ACCEPT (a
// time-bounded exception with a reason — v136 generalised risk_exceptions into
// `exceptions`). They are alternatives: a finding with an open action cannot be
// accepted, and an accepted one cannot have an action raised, so the finding
// always has exactly one answer, or none.
//
// Each finding kind is CONFIGURATION below — a view, a subject, and its words —
// so the second finding did not copy the first and the third will not either.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const uuidParam    = require('../../middleware/uuidParam');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { isDeptScoped, getUserDepartment, assertWriteScope } = require('../../auth/scoping');
const { query }    = require('../../db/pool');

const VALID_CADENCES = new Set(['monthly', 'quarterly', 'annual']);
const OPEN_ACTION = `status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;

// kind (URL segment) → how that finding is derived and answered.
//   view      the derived finding, one row per subject, keyed on `key`
//   subject   security_actions / exceptions subject_type; `table` holds it
//   owner     the column naming the subject's accountable person — the default
//             action owner (default owner_user_id)
//   ownerSql  instead of `owner`, an SQL expression (alias t) for a DERIVED
//             owner — a supplier relationship's is its department's IAO
//   active    SQL (alias t) for "this subject row is live" (default t.is_active)
//   seat      false for a subject with no department (a document): the seat
//             gate cannot apply, so department-scoped roles do not raise for it
const FINDINGS = {
  // v134 — an information asset not rated against every mandatory impact table.
  'rating-incomplete': {
    origin: 'rating_incomplete', subject: 'asset', table: 'information_assets',
    view: 'v_asset_rating_findings', key: 'asset_id',
    order: 'f.missing_count DESC, d.name, f.asset_name',
    label: 'incomplete-rating',
    fixed: 'This asset is rated against every mandatory impact table',
    title: (f) => `Rate ${f.asset_name} against every mandatory impact table`,
    describe: (f) => `Not yet rated against: ${f.missing_table_names.join(', ')}. Until it is, its impact — and every risk score on the systems holding it — can only be understated.`,
  },
  // v138 — a system missing components its own controls need, counting only
  // components stated to exist on each system (§5, v137). v148 adds what the
  // security architecture asks of it: a membership group not answered, an
  // objective it wants with no record, an objective needing a solution chosen.
  'component-record': {
    origin: 'component_record', subject: 'system', table: 'systems',
    view: 'v_system_component_findings', key: 'system_id',
    // v150: settle what is complete in place before listing what needs a choice.
    settle: 'SELECT settle_system_security()',
    // Which objectives need a solution chosen or are in conflict — named, so the
    // row can link to them instead of giving a count (owner, 2026-10-06).
    extra: `,
             (SELECT COALESCE(json_agg(json_build_object('id', wc.id, 'title', wc.title, 'reference_code', wc.reference_code)
                                       ORDER BY wc.title), '[]')
                FROM v_system_wanted_objectives w JOIN controls wc ON wc.id = w.control_id
               WHERE w.system_id = f.system_id AND w.state = 'needs_solution') AS needs_solution_objectives,
             (SELECT COALESCE(json_agg(json_build_object('id', wc.id, 'title', wc.title, 'reference_code', wc.reference_code)
                                       ORDER BY wc.title), '[]')
                FROM v_system_wanted_objectives w JOIN controls wc ON wc.id = w.control_id
               WHERE w.system_id = f.system_id AND w.state = 'conflict') AS conflict_objectives`,
    order: `cardinality(f.missing_membership_names) DESC, f.missing_count DESC,
            f.needs_solution_count + f.conflict_count DESC, d.name, f.system_name`,
    label: 'incomplete component record',
    fixed: 'This system records everything its controls and the security architecture need, and has a security solution for every objective that needs one',
    title: (f) => `Complete the component record of ${f.system_name}`,
    describe: (f) => componentRecordReasons(f).join(' ')
      + ' Until it is complete, CIRKS cannot say what security this system should have, and the controls that depend on what is missing read as incomplete on every risk here.',
  },
  // v140 — a Published policy, standard or procedure past its review date.
  'document-review': {
    origin: 'document_review', subject: 'component', table: 'control_components',
    view: 'v_document_review_findings', key: 'component_id',
    owner: 'document_owner_id', active: "t.component_type = 'information'", seat: false,
    order: 'f.days_overdue DESC, f.document_name',
    label: 'overdue-review',
    fixed: 'This document is not past its review date',
    title: (f) => `Review ${f.document_name}`,
    describe: (f) => `Past its review date (${f.next_review}, ${f.days_overdue} day${f.days_overdue === 1 ? '' : 's'} ago), so it reads as Under review on every system that relies on it. Review it and record the next review date.`,
  },
  // v144 — a live supplier relationship with an expected objective not met by
  // current evidence (a report or contract terms). Owned by the contracting
  // department: its IAO raises, the CISO/SIRO accepts (decision 2).
  'supplier-assurance': {
    origin: 'supplier_assurance', subject: 'supplier_relationship', table: 'supplier_relationships',
    view: 'v_supplier_assurance_findings', key: 'relationship_id',
    ownerSql: '(SELECT dro.owner_user_ids[1] FROM v_department_risk_owner dro WHERE dro.department_id = t.department_id)',
    active: "t.status IN ('active', 'exiting')",
    order: 'f.max_impact DESC NULLS LAST, f.unmet_count DESC, f.supplier_name',
    label: 'incomplete supplier assurance',
    fixed: 'Every objective expected of this relationship is covered by current evidence',
    title: (f) => `Obtain assurance from ${f.supplier_name} (${f.touches})`,
    describe: (f) => `${f.unmet_count} of ${f.expected_count} objectives expected of this relationship are not covered by a current report or contract terms`
      + (f.reason === 'expired' ? ', and evidence it relied on has expired' : '')
      + `: ${f.unmet_refs.join(', ')}. Obtain the evidence, or record it if it is already held.`,
  },
  // v153 — a control objective no security solution delivers, and the SoA has
  // not ruled out. The owner's rule: every objective has a solution or is not
  // applicable. Organisation-wide, like a document: no department, so no seat.
  'objective-solution': {
    origin: 'objective_solution', subject: 'control', table: 'controls',
    view: 'v_objective_solution_findings', key: 'control_id',
    active: 'TRUE', seat: false,
    order: 'f.systems_count DESC, f.judged_count DESC, f.objective_title',
    label: 'no security solution',
    fixed: 'This control objective has a security solution, or is ruled not applicable',
    title: (f) => `Build a security solution for ${f.reference ? `${f.reference} ` : ''}${f.objective_title}`,
    describe: (f) => 'No security solution delivers this control objective, so nothing says which components deliver it or where they must be.'
      + (f.systems_count ? ` It is recorded on ${f.systems_count} system${f.systems_count === 1 ? '' : 's'}.` : '')
      + ' Build a solution and identify its components, or rule the objective not applicable in the Statement of Applicability.',
  },
};
const KINDS = Object.keys(FINDINGS).join('|');

// The component-record finding's reasons, in the owner's words (v148, §5). A
// missing membership comes first: without it the architecture cannot apply at
// all, so a blank must read as a blank (§8, dragon 3).
function componentRecordReasons(f) {
  const out = [];
  for (const g of f.missing_membership_names || []) out.push(`Nothing recorded for ${g}.`);
  if (f.missing_count > 0) out.push(`Not recorded on this system, though its controls need them: ${f.missing_component_names.join(', ')}.`);
  if ((f.unrecorded_objective_names || []).length) {
    out.push(`Implied by the security architecture but not recorded on the system: ${f.unrecorded_objective_names.join(', ')}.`);
  }
  if (f.needs_solution_count > 0) {
    out.push(`${f.needs_solution_count} control objective${f.needs_solution_count === 1 ? '' : 's'} a threat here calls for ${f.needs_solution_count === 1 ? 'has' : 'have'} no security solution chosen.`);
  }
  if (f.conflict_count > 0) {
    out.push(`${f.conflict_count} control objective${f.conflict_count === 1 ? ' is' : 's are'} delivered by two security solutions the architecture requires — choose one.`);
  }
  return out;
}

const router = Router();
router.use(authenticate);
for (const [name, guard] of uuidParam('subjectId', 'exceptionId')) router.param(name, guard);

// ── GET /findings/soa-summary ─────────────────────────────────────────────────
// Counts of the Statement of Applicability findings (v130), by type. The rows
// themselves live on the SoA page, behind controls.read; the counts are what the
// SWG is asked about, so every findings.read holder sees them.
router.get('/soa-summary', requireCapability('findings.read'), async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT finding_type, COUNT(*)::int AS count, COUNT(DISTINCT control_id)::int AS objectives
        FROM v_soa_findings GROUP BY finding_type ORDER BY finding_type`);
    const { rows: [t] } = await query(`
      SELECT COUNT(*)::int AS total, COUNT(DISTINCT control_id)::int AS objectives FROM v_soa_findings`);
    res.json({ total: t.total, objectives: t.objectives, by_type: rows });
  } catch (err) { next(err); }
});

// ── GET /findings/component-instantiation ─────────────────────────────────────
// Every component that system controls imply on MORE THAN ONE system, with how
// far it fans out and whether anyone has said what it is (v137, §5): does it
// exist once for the organisation, or once per system? This is the moment the
// question has consequences — the component-record finding fans out per system —
// so it is asked here, once per component, and the answer is stored on the
// catalogue. It is never defaulted: the InfoSec Team is linked to 27 systems and
// is one team, so neither type nor count is an honest guess.
router.get('/component-instantiation', requireCapability('findings.read'), async (req, res, next) => {
  try {
    const { rows } = await query(`
      WITH implied AS (
        SELECT DISTINCT syc.system_id, ccl.component_id
          FROM system_controls syc
          JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
          JOIN control_component_links ccl ON ccl.control_id = syc.control_id
         WHERE syc.status <> 'not_applicable'
      )
      SELECT cc.id AS component_id, cc.name, cc.component_type, cc.status AS catalogue_status,
             cc.instantiation,
             COUNT(*)::int                                            AS implied_on,
             COUNT(DISTINCT s.department_id)::int                     AS departments,
             COUNT(x.system_id)::int                                  AS recorded_on
        FROM implied i
        JOIN control_components cc ON cc.id = i.component_id
        JOIN systems s ON s.id = i.system_id AND s.is_active
        LEFT JOIN system_components x ON x.system_id = i.system_id AND x.component_id = i.component_id
       GROUP BY cc.id
      HAVING COUNT(*) > 1
       ORDER BY (cc.instantiation IS NOT NULL), COUNT(*) DESC, cc.name
    `);
    res.json({
      unstated: rows.filter(r => !r.instantiation).length,
      components: rows,
    });
  } catch (err) { next(err); }
});

// ── GET /findings/:kind ───────────────────────────────────────────────────────
// Every subject the finding holds for, with the open action or the active
// acceptance answering it. findings.read (v135) — the exceptions.read audience,
// since the SWG reviews both. A dept-scoped role sees its own department's rows
// and shared ones.
router.get(`/:kind(${KINDS})`, requireCapability('findings.read'), async (req, res, next) => {
  const k = FINDINGS[req.params.kind];
  try {
    if (k.settle) await query(k.settle);
    const params = [];
    let scope = '';
    if (isDepartmentIsolationEnabled() && isDeptScoped(req.user.role)) {
      params.push(await getUserDepartment(req.user.id));
      scope = `WHERE (f.department_id = $1 OR f.is_shared)`;
    }
    const { rows } = await query(`
      SELECT f.*, d.name AS department_name, ou.full_name AS owner_name,
             sa.id AS action_id, sa.status AS action_status,
             ex.id AS exception_id, ex.expires_at AS exception_expires_at,
             ex.justification AS exception_justification, xu.full_name AS exception_accepted_by_name${k.extra || ''}
        FROM ${k.view} f
        LEFT JOIN departments d ON d.id = f.department_id
        LEFT JOIN users ou      ON ou.id = f.owner_user_id
        LEFT JOIN security_actions sa
               ON sa.origin = '${k.origin}' AND sa.subject_type = '${k.subject}'
              AND sa.subject_id = f.${k.key} AND sa.${OPEN_ACTION}
        LEFT JOIN exceptions ex
               ON ex.origin = '${k.origin}' AND ex.subject_type = '${k.subject}'
              AND ex.subject_id = f.${k.key} AND ex.status = 'active'
        LEFT JOIN users xu ON xu.id = ex.accepted_by
        ${scope}
       ORDER BY ${k.order}
    `, params);
    res.json({ count: rows.length, findings: rows });
  } catch (err) { next(err); }
});

// The subject row and, if the finding holds for it, the finding's row.
async function subjectAndFinding(k, id) {
  const { rows } = await query(
    `SELECT f.*, ${k.ownerSql || `t.${k.owner || 'owner_user_id'}`} AS subject_owner, (f.${k.key} IS NOT NULL) AS holds
       FROM ${k.table} t
       LEFT JOIN ${k.view} f ON f.${k.key} = t.id
      WHERE t.id = $1 AND ${k.active || 't.is_active'}`, [id]);
  return rows[0] || null;
}

// ── POST /findings/:kind/:subjectId/actions ───────────────────────────────────
// Raise a security action against the finding on one subject. Body (all
// optional): { owner_user_id, target_date, description }. Owner defaults to the
// subject's owner, else the caller. The action is PROPOSED; accepting it is a
// governance act (POST /actions/:id/accept).
router.post(`/:kind(${KINDS})/:subjectId/actions`, requireCapability('findings.act'), async (req, res, next) => {
  const k = FINDINGS[req.params.kind];
  try {
    const id = req.params.subjectId;
    // Seat gate: an IAM/IAO raises actions for their own department's subjects.
    // A subject with no department (a document) has no seat to match, so under
    // isolation a department-scoped role does not raise for it.
    if (k.seat === false) {
      if (isDepartmentIsolationEnabled() && isDeptScoped(req.user.role)) {
        return res.status(403).json({ error: 'This finding is organisation-wide; it is raised by the CISO or a risk analyst.' });
      }
    } else {
      await assertWriteScope(req, { table: k.table, id });
    }

    const f = await subjectAndFinding(k, id);
    if (!f) return res.status(404).json({ error: 'Not found.' });
    if (!f.holds) return res.status(409).json({ error: `${k.fixed} — there is nothing to act on.` });

    const { rows: accepted } = await query(
      `SELECT 1 FROM exceptions
        WHERE origin = $1 AND subject_type = $2 AND subject_id = $3 AND status = 'active'`,
      [k.origin, k.subject, id]);
    if (accepted.length) {
      return res.status(409).json({ error: 'This finding has been accepted — revoke the acceptance before raising an action.' });
    }

    const { owner_user_id, target_date, description } = req.body || {};
    const ownerId = owner_user_id || f.subject_owner || req.user.id;
    const { rows: owner } = await query(`SELECT 1 FROM users WHERE id = $1 AND is_active`, [ownerId]);
    if (!owner.length) return res.status(400).json({ error: 'The owner must be an active user.' });

    const desc = (typeof description === 'string' && description.trim()) || k.describe(f);
    try {
      const { rows } = await query(`
        INSERT INTO security_actions (subject_type, subject_id, origin, title, description,
                                      treatment_type, primary_owner_user_id, status,
                                      target_date, created_by)
        VALUES ($1, $2, $3, $4, $5, 'mitigate', $6, 'proposed', $7, $8)
        RETURNING id, status`,
        [k.subject, id, k.origin, k.title(f), desc, ownerId, target_date || null, req.user.id]);
      res.status(201).json({ action_id: rows[0].id, status: rows[0].status });
    } catch (err) {
      if (err.code === '23505') {
        const { rows: open } = await query(
          `SELECT id FROM security_actions
            WHERE origin = $1 AND subject_type = $2 AND subject_id = $3 AND ${OPEN_ACTION}`,
          [k.origin, k.subject, id]);
        return res.status(409).json({
          error: 'An action is already open for this finding.', action_id: open[0]?.id ?? null });
      }
      throw err;
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── POST /findings/:kind/:subjectId/exceptions ────────────────────────────────
// Accept the finding on one subject until a date, for a reason. The same
// governance act as accepting a risk (exceptions.accept — admin, CISO, SIRO;
// v107), in the same table with the same lifecycle, SoD rule and expiry sweep.
// Body: { justification, expires_at, review_cadence, notes? }
router.post(`/:kind(${KINDS})/:subjectId/exceptions`, requireCapability('exceptions.accept'), async (req, res, next) => {
  const k = FINDINGS[req.params.kind];
  try {
    const id = req.params.subjectId;
    const { justification, expires_at, review_cadence, notes } = req.body || {};
    if (!justification?.trim()) return res.status(400).json({ error: 'justification is required.' });
    if (!expires_at)            return res.status(400).json({ error: 'expires_at is required.' });
    if (!VALID_CADENCES.has(review_cadence)) {
      return res.status(400).json({ error: `review_cadence must be one of: ${[...VALID_CADENCES].join(', ')}.` });
    }
    const expDate = new Date(expires_at);
    if (isNaN(expDate.getTime()) || expDate < new Date()) {
      return res.status(400).json({ error: 'expires_at must be a future date.' });
    }

    const f = await subjectAndFinding(k, id);
    if (!f) return res.status(404).json({ error: 'Not found.' });
    if (!f.holds) return res.status(409).json({ error: `${k.fixed} — there is nothing to accept.` });

    const { rows: open } = await query(
      `SELECT id FROM security_actions
        WHERE origin = $1 AND subject_type = $2 AND subject_id = $3 AND ${OPEN_ACTION}`,
      [k.origin, k.subject, id]);
    if (open.length) {
      return res.status(409).json({
        error: 'An action is open for this finding — it is being acted on, so it cannot also be accepted.',
        action_id: open[0].id });
    }

    try {
      const { rows } = await query(`
        INSERT INTO exceptions (subject_type, subject_id, origin, justification, accepted_by,
                                accepted_role, expires_at, review_cadence, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, status, accepted_at, expires_at, review_cadence`,
        [k.subject, id, k.origin, justification.trim(), req.user.id, req.user.role, expires_at,
         review_cadence, notes?.trim() || null]);
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'This finding is already accepted.' });
      if (/^SoD\[/.test(err.message)) return res.status(403).json({ error: err.message });
      throw err;
    }
  } catch (err) { next(err); }
});

// ── PATCH /findings/exceptions/:exceptionId/revoke ────────────────────────────
// Withdraw the acceptance of a finding: it becomes unanswered again. A risk
// exception is revoked on its risk, which also clears the treatment decision.
// Body: { notes? }
router.patch('/exceptions/:exceptionId/revoke', requireCapability('exceptions.revoke'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.id, e.subject_type, e.origin, e.status,
              COALESCE(ia.name, s.name, cc.name, sp.name) AS subject_name
         FROM exceptions e
         LEFT JOIN information_assets ia ON ia.id = e.subject_id AND e.subject_type = 'asset'
         LEFT JOIN systems s             ON s.id  = e.subject_id AND e.subject_type = 'system'
         LEFT JOIN control_components cc ON cc.id = e.subject_id AND e.subject_type = 'component'
         LEFT JOIN supplier_relationships sr ON sr.id = e.subject_id AND e.subject_type = 'supplier_relationship'
         LEFT JOIN suppliers sp          ON sp.id = sr.supplier_id
        WHERE e.id = $1`, [req.params.exceptionId]);
    if (!rows.length) return res.status(404).json({ error: 'Exception not found.' });
    const ex = rows[0];
    if (ex.subject_type === 'risk') {
      return res.status(409).json({ error: 'A risk exception is revoked on its risk.' });
    }
    if (ex.status !== 'active') return res.status(409).json({ error: 'Only an active acceptance can be revoked.' });

    const label = Object.values(FINDINGS).find(k => k.origin === ex.origin)?.label || ex.origin;
    const notes = req.body?.notes?.trim() || null;
    const { rows: [who] } = await query(`SELECT full_name FROM users WHERE id = $1`, [req.user.id]);
    const { rows: updated } = await query(`
      UPDATE exceptions
         SET status = 'revoked', revoked_at = now(), revoked_by = $2,
             notes = COALESCE($3, notes), updated_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING id, status, revoked_at`, [ex.id, req.user.id, notes]);
    await query(`
      INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
      VALUES ($1, $2, $3, 'exceptions', $4, 'update', $5)`,
      [req.user.id, req.user.role, who?.full_name || 'unknown', ex.id,
       `${who?.full_name || 'Someone'} revoked the acceptance of the ${label} finding on "${ex.subject_name}"`
         + (notes ? `: ${notes}` : '.')]);
    res.json(updated[0]);
  } catch (err) { next(err); }
});

module.exports = router;
