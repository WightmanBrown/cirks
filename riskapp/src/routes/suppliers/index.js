'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Suppliers (v142, docs/supplier-model.md). A supplier is the organisation —
// a name. What we have with it is a RELATIONSHIP, which carries the type, the
// contracting department (which owns it), what it touches, the contract and a
// status. The accountable person and the criticality are derived, never stored.
//
// Reading: suppliers.read. A department-scoped role (IAM/IAO) sees every
// supplier's NAME — so it can find "Microsoft" rather than create it a second
// time — but only the relationships its department contracts or that touch its
// department's systems.
// Writing: suppliers.write. The supplier row is a shared catalogue entry, gated
// by the capability alone (the v114 argument: a seat gate on a shared catalogue
// manufactures duplicates). A relationship is gated by seat: an IAM/IAO records
// relationships for their own department only.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const uuidParam    = require('../../middleware/uuidParam');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { isDeptScoped, getUserDepartment, assertWriteScope } = require('../../auth/scoping');
const { query, withActor } = require('../../db/pool');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));
for (const [name, guard] of uuidParam('id', 'rid', 'eid')) router.param(name, guard);

const canRead  = requireCapability('suppliers.read');
const canWrite = requireCapability('suppliers.write');
// The per-type control sets (v143) are part of the control catalogue, so they
// are edited by whoever edits the catalogue — not by whoever records suppliers.
const canEditSets = requireCapability('controls.write');
const SET_KEYS = ['all', 'onshore', 'contracted_service', 'service_provider', 'product'];

const TYPES    = ['onshore', 'contracted_service', 'service_provider', 'product'];
const STATUSES = ['proposed', 'active', 'exiting', 'ended'];
// An objective as the sets show it: its reference, title and SoA status.
const OBJECTIVE_COLUMNS = `
  c.id AS control_id, c.title,
  COALESCE((SELECT sc.ref_code FROM control_mappings cm
              JOIN standard_controls sc ON sc.id = cm.standard_control_id
              JOIN standards st ON st.id = sc.standard_id
             WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
           c.reference_code) AS ref,
  vs.status AS objective_status`;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

// What each type must be attached to, in the words the refusal uses.
const TOUCHES = {
  onshore:            'an onshore contractor is recorded against the people component they are (and no system)',
  contracted_service: 'a contracted-out service is recorded against the system it operates',
  service_provider:   'a service provider is recorded against the system it hosts (and no component)',
  product:            'a product supplier is recorded against the technology component it supplies (and no system)',
};

const RELATIONSHIP_FIELDS = ['relationship_type', 'department_id', 'system_id', 'component_id', 'description',
  'contract_ref', 'contract_url', 'contract_start', 'contract_end', 'status'];

// One place that says what a relationship row looks like on the wire. DATE
// columns go out as text: node-pg turns a DATE into local midnight, which
// serialises as the day before during BST.
const RELATIONSHIP_SELECT = `
  SELECT sr.id, sr.supplier_id, sp.name AS supplier_name, sr.relationship_type,
         sr.department_id, d.name AS department_name,
         sr.system_id, sys.name AS system_name,
         sr.component_id, cc.name AS component_name, cc.component_type::text AS component_type,
         sr.description, sr.contract_ref, sr.contract_url,
         sr.contract_start::text AS contract_start, sr.contract_end::text AS contract_end,
         sr.status, sr.created_at, sr.updated_at,
         o.owner_user_ids, o.owner_names, COALESCE(o.is_siro_fallback, FALSE) AS owner_is_siro_fallback,
         COALESCE(c.systems_touched, 0) AS systems_touched,
         c.impact_c, c.impact_i, c.impact_a, c.max_impact
    FROM supplier_relationships sr
    JOIN suppliers sp               ON sp.id = sr.supplier_id
    LEFT JOIN departments d         ON d.id = sr.department_id
    LEFT JOIN systems sys           ON sys.id = sr.system_id
    LEFT JOIN control_components cc ON cc.id = sr.component_id
    LEFT JOIN v_department_risk_owner o ON o.department_id = sr.department_id
    LEFT JOIN v_supplier_relationship_criticality c ON c.relationship_id = sr.id`;

// A department-scoped reader sees relationships its department contracts, and
// those touching its department's systems — an IAO looking at their SaaS system
// needs to see who hosts it even when another department holds the contract.
async function readScope(req, params) {
  if (!isDepartmentIsolationEnabled() || !isDeptScoped(req.user.role)) return 'TRUE';
  params.push(await getUserDepartment(req.user.id));
  const p = `$${params.length}`;
  return `(sr.department_id = ${p} OR EXISTS (
            SELECT 1 FROM v_supplier_relationship_systems rs JOIN systems x ON x.id = rs.system_id
             WHERE rs.relationship_id = sr.id AND x.department_id = ${p}))`;
}

function nameConflict(err, name) {
  if (err && err.code === '23505' && /uq_suppliers_name/.test(err.constraint || err.message || '')) {
    return `A supplier called "${name}" already exists.`;
  }
  return null;
}

// Turn the database's refusals into sentences.
function relationshipRefusal(err, body) {
  if (!err) return null;
  if (err.code === '23514') {
    if (err.constraint === 'chk_sr_touches') return TOUCHES[body.relationship_type] || 'That type cannot be attached that way.';
    if (err.constraint === 'chk_sr_contract_dates') return 'The contract cannot end before it starts.';
    if (err.hint === 'supplier_component_kind') return err.message.charAt(0).toUpperCase() + err.message.slice(1) + '.';
  }
  if (err.code === '23503') return 'The department, system or component does not exist.';
  return null;
}

function setName(key) {
  return { all: 'every-supplier', onshore: 'onshore contractors', contracted_service: 'contracted-out service',
           service_provider: 'service provider', product: 'product supplier' }[key] || key;
}

async function auditRow(db, userId, action, entityType, id, label, narrative) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
     VALUES ($1, $2, $3, $4, $5, $6)`, [userId, action, entityType, id, label, narrative]);
}

// ── GET /suppliers — every supplier, with a summary of its visible relationships
router.get('/', canRead, async (req, res, next) => {
  try {
    const params = [];
    const scope = await readScope(req, params);
    const { rows } = await query(`
      SELECT sp.id, sp.name, sp.notes, sp.created_at,
             COUNT(r.id)::int AS relationship_count,
             COUNT(r.id) FILTER (WHERE r.status = 'active')::int AS active_count,
             COALESCE(array_agg(DISTINCT r.relationship_type) FILTER (WHERE r.id IS NOT NULL), '{}') AS types,
             COALESCE(array_agg(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL), '{}') AS departments,
             MAX(c.max_impact) FILTER (WHERE r.status <> 'ended') AS max_impact,
             -- Assurance gaps (v144): live relationships holding the finding, the
             -- control objectives not met across them, and how many of those
             -- gaps nobody has answered yet (no open action, no acceptance).
             COUNT(r.id) FILTER (WHERE r.status IN ('active', 'exiting'))::int AS live_count,
             COUNT(f.relationship_id)::int                                     AS gap_count,
             COALESCE(SUM(f.unmet_count), 0)::int                              AS unmet_objectives,
             COUNT(f.relationship_id) FILTER (WHERE
               NOT EXISTS (SELECT 1 FROM security_actions a
                            WHERE a.origin = 'supplier_assurance' AND a.subject_id = f.relationship_id
                              AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected'))
               AND NOT EXISTS (SELECT 1 FROM exceptions e
                            WHERE e.origin = 'supplier_assurance' AND e.subject_id = f.relationship_id
                              AND e.status = 'active'))::int                   AS unanswered_gaps
        FROM suppliers sp
        LEFT JOIN (SELECT sr.* FROM supplier_relationships sr WHERE ${scope}) r ON r.supplier_id = sp.id
        LEFT JOIN departments d ON d.id = r.department_id
        LEFT JOIN v_supplier_relationship_criticality c ON c.relationship_id = r.id
        LEFT JOIN v_supplier_assurance_findings f ON f.relationship_id = r.id
       GROUP BY sp.id
       ORDER BY lower(sp.name)`, params);
    res.json({ suppliers: rows });
  } catch (err) { next(err); }
});

// ── GET /suppliers/relationships?system_id=|component_id= ──────────────────────
// The relationships touching one system (directly, or through a component on
// it) or recorded against one component — for the system and component pages.
router.get('/relationships', canRead, async (req, res, next) => {
  try {
    const { system_id, component_id } = req.query;
    const params = [];
    const where = [];
    if (system_id) {
      if (!UUID_RE.test(system_id)) return res.status(400).json({ error: 'system_id must be a UUID.' });
      params.push(system_id);
      where.push(`sr.id IN (SELECT relationship_id FROM v_supplier_relationship_systems WHERE system_id = $${params.length})`);
    }
    if (component_id) {
      if (!UUID_RE.test(component_id)) return res.status(400).json({ error: 'component_id must be a UUID.' });
      params.push(component_id);
      where.push(`sr.component_id = $${params.length}`);
    }
    if (!where.length) return res.status(400).json({ error: 'Give a system_id or a component_id.' });
    where.push(await readScope(req, params));
    const { rows } = await query(`${RELATIONSHIP_SELECT}
       WHERE ${where.join(' AND ')}
       ORDER BY lower(sp.name), sr.relationship_type`, params);
    res.json({ relationships: rows });
  } catch (err) { next(err); }
});

// ── GET /suppliers/objectives — the control set for each kind of relationship ─
// 'all' is the supplier programme, expected of every relationship.
router.get('/objectives', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT sto.applies_to, sto.added_at, ${OBJECTIVE_COLUMNS}
        FROM supplier_type_objectives sto
        JOIN controls c ON c.id = sto.control_id
        LEFT JOIN v_control_status vs ON vs.control_id = c.id
       ORDER BY ref NULLS LAST, c.title`);
    const sets = Object.fromEntries(SET_KEYS.map((k) => [k, []]));
    for (const r of rows) sets[r.applies_to].push(r);
    res.json({ sets });
  } catch (err) { next(err); }
});

// ── POST /suppliers/objectives — { applies_to, control_id } ────────────────────
router.post('/objectives', canEditSets, async (req, res, next) => {
  const { applies_to, control_id } = req.body || {};
  if (!SET_KEYS.includes(applies_to)) return res.status(400).json({ error: `applies_to must be one of: ${SET_KEYS.join(', ')}.` });
  if (!UUID_RE.test(control_id || '')) return res.status(400).json({ error: 'control_id must be a UUID.' });
  try {
    const out = await withActor(req.user.id, async (db) => {
      const c = await db.query(`SELECT title FROM controls WHERE id = $1`, [control_id]);
      if (!c.rows.length) return { status: 404, error: 'Control objective not found.' };
      const ins = await db.query(
        `INSERT INTO supplier_type_objectives (applies_to, control_id, added_by) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING control_id`, [applies_to, control_id, req.user.id]);
      if (!ins.rows.length) return { status: 409, error: 'That objective is already in this set.' };
      await auditRow(db, req.user.id, 'create', 'supplier_type_objectives', control_id, c.rows[0].title,
        `Objective "${c.rows[0].title}" added to the ${setName(applies_to)} supplier control set`);
      return { status: 201 };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ applies_to, control_id });
  } catch (err) { next(err); }
});

// ── DELETE /suppliers/objectives/:appliesTo/:controlId ─────────────────────────
router.delete('/objectives/:appliesTo/:controlId', canEditSets, async (req, res, next) => {
  const { appliesTo, controlId } = req.params;
  if (!SET_KEYS.includes(appliesTo) || !UUID_RE.test(controlId)) return res.status(404).json({ error: 'Not in that set.' });
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM supplier_type_objectives sto USING controls c
          WHERE sto.applies_to = $1 AND sto.control_id = $2 AND c.id = sto.control_id
          RETURNING c.title`, [appliesTo, controlId]);
      if (rows.length) {
        await auditRow(db, req.user.id, 'delete', 'supplier_type_objectives', controlId, rows[0].title,
          `Objective "${rows[0].title}" removed from the ${setName(appliesTo)} supplier control set`);
      }
      return rows[0];
    });
    if (!gone) return res.status(404).json({ error: 'Not in that set.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /suppliers/:id — one supplier and its (visible) relationships ──────────
router.get('/:id', canRead, async (req, res, next) => {
  try {
    const sp = await query(`SELECT id, name, notes, created_at, updated_at FROM suppliers WHERE id = $1`, [req.params.id]);
    if (!sp.rows.length) return res.status(404).json({ error: 'Supplier not found.' });
    const params = [req.params.id];
    const scope = await readScope(req, params);
    const { rows } = await query(`${RELATIONSHIP_SELECT}
       WHERE sr.supplier_id = $1 AND ${scope}
       ORDER BY (sr.status = 'ended'), sr.relationship_type, lower(d.name)`, params);
    // Each relationship's expected objectives (v143): every-supplier + its type's.
    const ids = rows.map((r) => r.id);
    // v144: whether each is met by current evidence, until when.
    const objectives = ids.length ? (await query(`
      SELECT ro.relationship_id, ro.sources, ro.met, ro.expired_only, ro.covered_until::text AS covered_until,
             -- v160: ours = met (or not) by our own control in the SoA, not by evidence.
             ro.ours, ro.our_status,
             CASE WHEN ro.ours THEN COALESCE((
               SELECT array_agg(dp.name ORDER BY lower(dp.name))
                 FROM delivery_pattern_objectives dpo
                 JOIN delivery_patterns dp ON dp.id = dpo.pattern_id
                WHERE dpo.control_id = c.id), '{}') END AS our_solutions,
             ${OBJECTIVE_COLUMNS}
        FROM v_supplier_objective_coverage ro
        JOIN controls c ON c.id = ro.control_id
        LEFT JOIN v_control_status vs ON vs.control_id = c.id
       WHERE ro.relationship_id = ANY($1)
       ORDER BY ref NULLS LAST, c.title`, [ids])).rows : [];
    const evidence = ids.length ? (await query(`
      SELECT e.id, e.relationship_id, e.kind, e.title, e.reference, e.url,
             e.issued_on::text AS issued_on, e.expires_on::text AS expires_on,
             es.effective_expiry::text AS effective_expiry, es.is_current,
             COALESCE(array_agg(eo.control_id) FILTER (WHERE eo.control_id IS NOT NULL), '{}') AS control_ids
        FROM supplier_evidence e
        JOIN v_supplier_evidence_state es ON es.evidence_id = e.id
        LEFT JOIN supplier_evidence_objectives eo ON eo.evidence_id = e.id
       WHERE e.relationship_id = ANY($1)
       GROUP BY e.id, es.effective_expiry, es.is_current
       ORDER BY es.is_current DESC, e.kind, lower(e.title)`, [ids])).rows : [];
    // The finding's answer, if it holds: an open action or an active acceptance.
    const answers = ids.length ? (await query(`
      SELECT f.relationship_id, f.reason, f.unmet_count,
             (SELECT a.id FROM security_actions a
               WHERE a.origin = 'supplier_assurance' AND a.subject_id = f.relationship_id
                 AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected') LIMIT 1) AS action_id,
             (SELECT e.expires_at::text FROM exceptions e
               WHERE e.origin = 'supplier_assurance' AND e.subject_id = f.relationship_id
                 AND e.status = 'active' LIMIT 1) AS accepted_until
        FROM v_supplier_assurance_findings f
       WHERE f.relationship_id = ANY($1)`, [ids])).rows : [];
    // Where each relationship's criticality comes from: the systems it touches at
    // its highest impact, with that system's C/I/A — so the page can say WHICH
    // system sets the figure, and on which dimension.
    const touched = ids.length ? (await query(`
      SELECT rs.relationship_id, s.id, s.name, s.impact_c, s.impact_i, s.impact_a,
             GREATEST(s.impact_c, s.impact_i, s.impact_a) AS impact
        FROM v_supplier_relationship_systems rs
        JOIN systems s ON s.id = rs.system_id AND s.is_active
       WHERE rs.relationship_id = ANY($1)
       ORDER BY lower(s.name)`, [ids])).rows : [];
    for (const r of rows) {
      r.criticality_systems = r.max_impact == null ? []
        : touched.filter((t) => t.relationship_id === r.id && t.impact === r.max_impact)
                 .map(({ relationship_id, ...t }) => t);  // eslint-disable-line no-unused-vars
      r.objectives = objectives.filter((o) => o.relationship_id === r.id);
      r.evidence = evidence.filter((e) => e.relationship_id === r.id);
      r.assurance_finding = answers.find((a) => a.relationship_id === r.id) || null;
    }
    res.json({ ...sp.rows[0], relationships: rows });
  } catch (err) { next(err); }
});

// ── POST /suppliers — { name, notes? } ─────────────────────────────────────────
router.post('/', canWrite, async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'A supplier needs a name.' });
  const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null;
  try {
    const row = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO suppliers (name, notes, created_by) VALUES ($1, $2, $3)
         RETURNING id, name, notes, created_at, updated_at`, [name, notes, req.user.id]);
      await auditRow(db, req.user.id, 'create', 'supplier', rows[0].id, name, `Supplier "${name}" recorded`);
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    const msg = nameConflict(err, name);
    if (msg) return res.status(409).json({ error: msg });
    next(err);
  }
});

// ── PATCH /suppliers/:id — { name?, notes? } ───────────────────────────────────
router.patch('/:id', canWrite, async (req, res, next) => {
  const b = req.body || {};
  const sets = [];
  const params = [req.params.id];
  if ('name' in b) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'A supplier needs a name.' });
    params.push(name); sets.push(`name = $${params.length}`);
  }
  if ('notes' in b) {
    params.push(typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null);
    sets.push(`notes = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    const row = await withActor(req.user.id, async (db) => {
      const before = await db.query(`SELECT name FROM suppliers WHERE id = $1`, [req.params.id]);
      if (!before.rows.length) return null;
      const { rows } = await db.query(
        `UPDATE suppliers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1
         RETURNING id, name, notes, created_at, updated_at`, params);
      if (before.rows[0].name !== rows[0].name) {
        await auditRow(db, req.user.id, 'update', 'supplier', rows[0].id, rows[0].name,
          `Supplier renamed from "${before.rows[0].name}" to "${rows[0].name}"`);
      }
      return rows[0];
    });
    if (!row) return res.status(404).json({ error: 'Supplier not found.' });
    res.json(row);
  } catch (err) {
    const msg = nameConflict(err, b.name?.trim?.());
    if (msg) return res.status(409).json({ error: msg });
    next(err);
  }
});

// ── DELETE /suppliers/:id — only one with no relationships (entered in error) ──
router.delete('/:id', canWrite, async (req, res, next) => {
  try {
    const { rows: rel } = await query(`SELECT count(*)::int AS n FROM supplier_relationships WHERE supplier_id = $1`, [req.params.id]);
    if (rel[0].n > 0) {
      return res.status(409).json({ error: `This supplier has ${rel[0].n} relationship${rel[0].n === 1 ? '' : 's'} on record — end them rather than deleting the supplier.` });
    }
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(`DELETE FROM suppliers WHERE id = $1 RETURNING id, name`, [req.params.id]);
      if (rows.length) await auditRow(db, req.user.id, 'delete', 'supplier', rows[0].id, rows[0].name, `Supplier "${rows[0].name}" deleted`);
      return rows[0];
    });
    if (!gone) return res.status(404).json({ error: 'Supplier not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// Validate the relationship fields present in a body. Returns an error string or null.
function validateRelationship(b, { creating }) {
  if (creating || 'relationship_type' in b) {
    if (!TYPES.includes(b.relationship_type)) return `Type must be one of: ${TYPES.join(', ')}.`;
  }
  if (creating || 'status' in b) {
    if (!STATUSES.includes(b.status)) return `Status must be one of: ${STATUSES.join(', ')}.`;
  }
  for (const f of ['department_id', 'system_id', 'component_id']) {
    if (b[f] != null && b[f] !== '' && !UUID_RE.test(b[f])) return `${f} must be a UUID.`;
  }
  for (const f of ['contract_start', 'contract_end']) {
    if (b[f] != null && b[f] !== '' && (!DATE_RE.test(b[f]) || Number.isNaN(Date.parse(b[f])))) return `${f} must be a date (YYYY-MM-DD).`;
  }
  if (b.contract_url != null && b.contract_url !== '' && !/^https?:\/\//i.test(b.contract_url)) {
    return 'The contract link must start with http:// or https://.';
  }
  return null;
}

const blankToNull = (v) => (v === '' || v === undefined ? null : (typeof v === 'string' ? v.trim() || null : v));

// The department a department-scoped writer may use: their own. Refuses another.
async function seatDepartment(req, requested) {
  if (!isDepartmentIsolationEnabled() || !isDeptScoped(req.user.role)) return requested || await getUserDepartment(req.user.id);
  const mine = await getUserDepartment(req.user.id);
  if (!mine) { const e = new Error('No department assigned.'); e.status = 403; throw e; }
  if (requested && requested !== mine) {
    const e = new Error('You can record relationships for your own department only.'); e.status = 403; throw e;
  }
  return mine;
}

// ── POST /suppliers/:id/relationships ──────────────────────────────────────────
router.post('/:id/relationships', canWrite, async (req, res, next) => {
  const b = req.body || {};
  const bad = validateRelationship(b, { creating: true });
  if (bad) return res.status(400).json({ error: bad });
  try {
    const departmentId = await seatDepartment(req, b.department_id || null);
    if (!departmentId) return res.status(400).json({ error: 'Which department contracts this supplier?' });
    const row = await withActor(req.user.id, async (db) => {
      const sp = await db.query(`SELECT name FROM suppliers WHERE id = $1`, [req.params.id]);
      if (!sp.rows.length) return null;
      const { rows } = await db.query(
        `INSERT INTO supplier_relationships
           (supplier_id, relationship_type, department_id, system_id, component_id, description,
            contract_ref, contract_url, contract_start, contract_end, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [req.params.id, b.relationship_type, departmentId, blankToNull(b.system_id), blankToNull(b.component_id),
         blankToNull(b.description), blankToNull(b.contract_ref), blankToNull(b.contract_url),
         blankToNull(b.contract_start), blankToNull(b.contract_end), b.status, req.user.id]);
      await auditRow(db, req.user.id, 'create', 'supplier_relationships', rows[0].id, sp.rows[0].name,
        `Relationship with "${sp.rows[0].name}" recorded (${b.relationship_type}, ${b.status})`);
      return rows[0];
    });
    if (!row) return res.status(404).json({ error: 'Supplier not found.' });
    const { rows } = await query(`${RELATIONSHIP_SELECT} WHERE sr.id = $1`, [row.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    const msg = relationshipRefusal(err, b);
    if (msg) return res.status(400).json({ error: msg });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── PATCH /suppliers/relationships/:rid ────────────────────────────────────────
router.patch('/relationships/:rid', canWrite, async (req, res, next) => {
  const b = req.body || {};
  const bad = validateRelationship(b, { creating: false });
  if (bad) return res.status(400).json({ error: bad });
  const fields = RELATIONSHIP_FIELDS.filter((f) => f in b);
  if (!fields.length) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    await assertWriteScope(req, { table: 'supplier_relationships', id: req.params.rid });
    if ('department_id' in b) b.department_id = await seatDepartment(req, b.department_id || null);
    // The refusal message needs the type the row will have after the change.
    const cur = await query(`SELECT relationship_type FROM supplier_relationships WHERE id = $1`, [req.params.rid]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Relationship not found.' });
    const effective = { relationship_type: cur.rows[0].relationship_type, ...b };

    const params = [req.params.rid];
    const sets = fields.map((f) => {
      params.push(f === 'relationship_type' || f === 'status' || f === 'department_id' ? b[f] : blankToNull(b[f]));
      return `${f} = $${params.length}`;
    });
    try {
      await withActor(req.user.id, (db) => db.query(
        `UPDATE supplier_relationships SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params));
    } catch (err) {
      const msg = relationshipRefusal(err, effective);
      if (msg) return res.status(400).json({ error: msg });
      throw err;
    }
    const { rows } = await query(`${RELATIONSHIP_SELECT} WHERE sr.id = $1`, [req.params.rid]);
    res.json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── DELETE /suppliers/relationships/:rid — a relationship recorded in error. ───
// A relationship that has run its course is ENDED (status), not deleted: the
// record that we once relied on the supplier is itself worth keeping.
router.delete('/relationships/:rid', canWrite, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'supplier_relationships', id: req.params.rid });
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM supplier_relationships sr USING suppliers sp
          WHERE sr.id = $1 AND sp.id = sr.supplier_id
          RETURNING sr.id, sp.name, sr.relationship_type`, [req.params.rid]);
      if (rows.length) {
        await auditRow(db, req.user.id, 'delete', 'supplier_relationships', rows[0].id, rows[0].name,
          `Relationship with "${rows[0].name}" (${rows[0].relationship_type}) deleted as recorded in error`);
      }
      return rows[0];
    });
    if (!gone) return res.status(404).json({ error: 'Relationship not found.' });
    res.status(204).end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── Evidence (v144): a report or contract terms covering some expected objectives ─
const EVIDENCE_KINDS = ['report', 'contract_terms'];
const EVIDENCE_FIELDS = ['kind', 'title', 'reference', 'url', 'issued_on', 'expires_on'];

function validateEvidence(b, { creating }) {
  if (creating || 'kind' in b) {
    if (!EVIDENCE_KINDS.includes(b.kind)) return 'Evidence is a report or contract terms.';
  }
  if (creating || 'title' in b) {
    if (typeof b.title !== 'string' || !b.title.trim()) return 'Give the evidence a title — the report\'s name, or the contract and clause.';
  }
  for (const f of ['issued_on', 'expires_on']) {
    if (b[f] != null && b[f] !== '' && (!DATE_RE.test(b[f]) || Number.isNaN(Date.parse(b[f])))) return `${f} must be a date (YYYY-MM-DD).`;
  }
  if (b.url != null && b.url !== '' && !/^https?:\/\//i.test(b.url)) return 'The link must start with http:// or https://.';
  if (creating || 'control_ids' in b) {
    if (!Array.isArray(b.control_ids) || !b.control_ids.length) return 'Say which objectives this evidence covers.';
    if (!b.control_ids.every((id) => UUID_RE.test(id))) return 'control_ids must be UUIDs.';
  }
  return null;
}

function evidenceRefusal(err) {
  if (err?.code !== '23514') return null;
  if (err.constraint === 'chk_se_report_expires') return 'A report must say when it expires — an assurance report covers a period, and one with no end would count for ever.';
  if (err.constraint === 'chk_se_dates') return 'The evidence cannot expire before it was issued.';
  return null;
}

// Every objective must be one this relationship is expected to meet.
async function outsideTheSet(db, relationshipId, controlIds) {
  const { rows } = await db.query(
    `SELECT x.id FROM unnest($2::uuid[]) AS x(id)
      WHERE NOT EXISTS (SELECT 1 FROM v_supplier_relationship_objectives ro
                         WHERE ro.relationship_id = $1 AND ro.control_id = x.id)`, [relationshipId, controlIds]);
  return rows.length;
}

// v160: an objective that is ours — delivered organisation-wide — is met by our own
// control in the SoA, so a supplier's evidence cannot be recorded against it.
const OURS_ERROR = 'Evidence from a supplier cannot cover an objective that is ours: it is delivered once for the organisation, and met by our own control in the Statement of Applicability.';
async function oursIn(db, relationshipId, controlIds) {
  const { rows } = await db.query(
    `SELECT 1 FROM v_supplier_objective_coverage
      WHERE relationship_id = $1 AND control_id = ANY($2::uuid[]) AND ours`, [relationshipId, controlIds]);
  return rows.length;
}

const evidenceScope = { via: { sql: `SELECT sr.department_id FROM supplier_evidence e
  JOIN supplier_relationships sr ON sr.id = e.relationship_id WHERE e.id = $1` } };

// ── POST /suppliers/relationships/:rid/evidence ────────────────────────────────
router.post('/relationships/:rid/evidence', canWrite, async (req, res, next) => {
  const b = req.body || {};
  const bad = validateEvidence(b, { creating: true });
  if (bad) return res.status(400).json({ error: bad });
  try {
    await assertWriteScope(req, { table: 'supplier_relationships', id: req.params.rid });
    const ids = [...new Set(b.control_ids)];
    const out = await withActor(req.user.id, async (db) => {
      const rel = await db.query(
        `SELECT sp.name FROM supplier_relationships sr JOIN suppliers sp ON sp.id = sr.supplier_id WHERE sr.id = $1`, [req.params.rid]);
      if (!rel.rows.length) return { status: 404, error: 'Relationship not found.' };
      if (await outsideTheSet(db, req.params.rid, ids)) {
        return { status: 400, error: 'Evidence can only cover objectives this relationship is expected to meet.' };
      }
      if (await oursIn(db, req.params.rid, ids)) return { status: 400, error: OURS_ERROR };
      const { rows } = await db.query(
        `INSERT INTO supplier_evidence (relationship_id, kind, title, reference, url, issued_on, expires_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.params.rid, b.kind, b.title.trim(), blankToNull(b.reference), blankToNull(b.url),
         blankToNull(b.issued_on), blankToNull(b.expires_on), req.user.id]);
      await db.query(`INSERT INTO supplier_evidence_objectives (evidence_id, control_id) SELECT $1, unnest($2::uuid[])`, [rows[0].id, ids]);
      await auditRow(db, req.user.id, 'create', 'supplier_evidence', rows[0].id, rel.rows[0].name,
        `${b.kind === 'report' ? 'Assurance report' : 'Contract terms'} "${b.title.trim()}" recorded for "${rel.rows[0].name}", covering ${ids.length} objective${ids.length === 1 ? '' : 's'}`
        + (b.expires_on ? `, until ${b.expires_on}` : ''));
      return { status: 201, id: rows[0].id };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ id: out.id });
  } catch (err) {
    const msg = evidenceRefusal(err);
    if (msg) return res.status(400).json({ error: msg });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── PATCH /suppliers/evidence/:eid — fields and/or the objectives it covers ─────
router.patch('/evidence/:eid', canWrite, async (req, res, next) => {
  const b = req.body || {};
  const bad = validateEvidence(b, { creating: false });
  if (bad) return res.status(400).json({ error: bad });
  const fields = EVIDENCE_FIELDS.filter((f) => f in b);
  if (!fields.length && !('control_ids' in b)) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    await assertWriteScope(req, { id: req.params.eid, ...evidenceScope });
    const out = await withActor(req.user.id, async (db) => {
      const cur = await db.query(
        `SELECT e.relationship_id, e.title, sp.name FROM supplier_evidence e
           JOIN supplier_relationships sr ON sr.id = e.relationship_id JOIN suppliers sp ON sp.id = sr.supplier_id
          WHERE e.id = $1`, [req.params.eid]);
      if (!cur.rows.length) return { status: 404, error: 'Evidence not found.' };
      if (fields.length) {
        const params = [req.params.eid];
        const sets = fields.map((f) => { params.push(f === 'title' ? b.title.trim() : (f === 'kind' ? b.kind : blankToNull(b[f]))); return `${f} = $${params.length}`; });
        await db.query(`UPDATE supplier_evidence SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      }
      if ('control_ids' in b) {
        const ids = [...new Set(b.control_ids)];
        if (await outsideTheSet(db, cur.rows[0].relationship_id, ids)) {
          const e = new Error('Evidence can only cover objectives this relationship is expected to meet.'); e.status = 400; throw e;
        }
        if (await oursIn(db, cur.rows[0].relationship_id, ids)) {
          const e = new Error(OURS_ERROR); e.status = 400; throw e;
        }
        await db.query(`DELETE FROM supplier_evidence_objectives WHERE evidence_id = $1`, [req.params.eid]);
        await db.query(`INSERT INTO supplier_evidence_objectives (evidence_id, control_id) SELECT $1, unnest($2::uuid[])`, [req.params.eid, ids]);
      }
      await auditRow(db, req.user.id, 'update', 'supplier_evidence', req.params.eid, cur.rows[0].name,
        `Evidence "${cur.rows[0].title}" for "${cur.rows[0].name}" changed: ${[...fields, ...('control_ids' in b ? ['objectives covered'] : [])].join(', ')}`);
      return { status: 200 };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json({ id: req.params.eid });
  } catch (err) {
    const msg = evidenceRefusal(err);
    if (msg) return res.status(400).json({ error: msg });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── DELETE /suppliers/evidence/:eid ────────────────────────────────────────────
// Evidence recorded in error. Evidence that has lapsed is not deleted — it stays,
// expired, as the record that the relationship was once assured.
router.delete('/evidence/:eid', canWrite, async (req, res, next) => {
  try {
    await assertWriteScope(req, { id: req.params.eid, ...evidenceScope });
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM supplier_evidence e USING supplier_relationships sr, suppliers sp
          WHERE e.id = $1 AND sr.id = e.relationship_id AND sp.id = sr.supplier_id
          RETURNING e.id, e.title, sp.name`, [req.params.eid]);
      if (rows.length) {
        await auditRow(db, req.user.id, 'delete', 'supplier_evidence', rows[0].id, rows[0].name,
          `Evidence "${rows[0].title}" for "${rows[0].name}" deleted as recorded in error`);
      }
      return rows[0];
    });
    if (!gone) return res.status(404).json({ error: 'Evidence not found.' });
    res.status(204).end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
