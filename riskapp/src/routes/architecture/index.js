'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The security architecture library (v148, docs/system-security-view.md §4.2–§4.4):
//
//   rules     a security solution required of every system recording ANY of the
//             rule's trigger components ("Windows Server 2025 → CrowdStrike EDR");
//   groups    what every system must record about itself — at least one member
//             of each group (network zone, hosting, operating system, …);
//   builds    a set of components applied to a system as a COPY.
//
// Rules and groups cite the published document they come from (a policy,
// standard or procedure in Policies & documents), so they inherit its owner,
// approval and review date. Written by the security team (controls.write), like
// the rest of the library. Report only: nothing here moves a status or a score.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const uuidParam    = require('../../middleware/uuidParam');
const { requireCapability } = require('../../auth/permissions');
const { query, withActor }  = require('../../db/pool');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));
for (const [name, guard] of uuidParam('id', 'componentId')) router.param(name, guard);

const canView  = requireCapability('controls.read');
const canWrite = requireCapability('controls.write');
// v155: the template (groups) and the patterns (builds) are an architect's work;
// the rules that REQUIRE a security solution stay with the security team.
const canArchitect = requireCapability('architecture.write');
const guardFor = (path) => (path === 'rules' ? canWrite : canArchitect);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function audit(db, userId, entityType, id, label, action, narrative) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
     VALUES ($1, $2, $3, $4, $5, $6)`, [userId, action, entityType, id, label, narrative]);
}

function refusal(err) {
  if (err?.hint === 'architecture_document') return [400, 'Cite a policy, standard or procedure from Policies & documents. A guideline is advisory and cannot require anything.'];
  if (err?.code === '23505') {
    if (/uq_architecture_rule/.test(err.constraint || '')) return [409, 'That document already requires this security solution. Add triggers to the existing rule instead.'];
    if (/uq_membership_group_name/.test(err.constraint || '')) return [409, 'A membership group with that name already exists.'];
    if (/uq_system_build_name/.test(err.constraint || '')) return [409, 'A build with that name already exists.'];
    return [409, 'That is already there.'];
  }
  if (err?.code === '23503') return [400, 'The component, document or security solution does not exist.'];
  return null;
}
const fail = (res, next) => (err) => {
  const r = refusal(err);
  if (r) return res.status(r[0]).json({ error: r[1] });
  return next(err);
};

const componentList = (table, key) => `
  COALESCE((SELECT json_agg(json_build_object('id', cc.id, 'name', cc.name, 'component_type', cc.component_type,
                                              'systems', (SELECT count(*)::int FROM system_components x
                                                            JOIN systems s ON s.id = x.system_id AND s.is_active
                                                           WHERE x.component_id = cc.id))
                            ORDER BY cc.name)
              FROM ${table} t JOIN control_components cc ON cc.id = t.component_id
             WHERE t.${key} = o.id), '[]')`;

const RULES_SQL = `
  SELECT o.id, o.notes, o.pattern_id, p.name AS pattern_name,
         o.standard_id, doc.name AS standard_name, doc.document_kind AS standard_kind,
         ${componentList('architecture_rule_triggers', 'rule_id')} AS triggers,
         (SELECT count(DISTINCT w.system_id)::int FROM v_system_wanted_solutions w WHERE w.rule_id = o.id) AS systems
    FROM architecture_rules o
    JOIN delivery_patterns p    ON p.id = o.pattern_id
    JOIN control_components doc ON doc.id = o.standard_id`;

const GROUPS_SQL = `
  SELECT o.id, o.name, o.notes, o.sort_index, o.standard_id, doc.name AS standard_name,
         ${componentList('membership_group_members', 'group_id')} AS members,
         ${componentList('membership_group_triggers', 'group_id')} AS triggers,
         (SELECT count(*)::int FROM v_system_membership_gaps g WHERE g.group_id = o.id) AS systems_unanswered
    FROM membership_groups o
    JOIN control_components doc ON doc.id = o.standard_id`;

const BUILDS_SQL = `
  SELECT o.id, o.name, o.notes,
         ${componentList('system_build_components', 'build_id')} AS components
    FROM system_builds o`;

// ── GET /architecture ─────────────────────────────────────────────────────────
// The whole library in one read: it is small, and the page shows all three.
router.get('/', canView, async (req, res, next) => {
  try {
    const [rules, groups, builds, documents, systems] = await Promise.all([
      query(`${RULES_SQL} ORDER BY lower(p.name), lower(doc.name)`),
      query(`${GROUPS_SQL} ORDER BY o.sort_index, lower(o.name)`),
      query(`${BUILDS_SQL} ORDER BY lower(o.name)`),
      // The documents a rule or group can cite (v139): not guidelines.
      query(`SELECT st.component_id AS id, cc.name, cc.document_kind, st.status
               FROM control_components cc JOIN v_component_state st ON st.component_id = cc.id
              WHERE cc.component_type = 'information' AND cc.document_kind IN ('policy', 'standard', 'procedure')
              ORDER BY lower(cc.name)`),
      query(`SELECT count(*)::int AS n FROM systems WHERE is_active`),
    ]);
    res.json({
      rules: rules.rows, groups: groups.rows, builds: builds.rows,
      documents: documents.rows, active_systems: systems.rows[0].n,
    });
  } catch (err) { next(err); }
});

// ── Generic member lists (triggers, members, build components) ────────────────
// One shape for every "this thing has a list of components" table.
function componentListRoutes(path, { table, key, parent, parentLabel, entityType, noun }) {
  router.post(`/${path}/:id/${noun.segment}`, guardFor(path), async (req, res, next) => {
    const { component_id } = req.body || {};
    if (!UUID_RE.test(component_id || '')) return res.status(400).json({ error: 'Choose a component.' });
    try {
      const out = await withActor(req.user.id, async (db) => {
        const p = await db.query(`SELECT ${parentLabel} AS label FROM ${parent} o WHERE o.id = $1`, [req.params.id]);
        if (!p.rows.length) return { status: 404, error: 'Not found.' };
        const c = await db.query('SELECT name FROM control_components WHERE id = $1', [component_id]);
        if (!c.rows.length) return { status: 400, error: 'The component does not exist.' };
        const ins = await db.query(
          `INSERT INTO ${table} (${key}, component_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, component_id]);
        if (!ins.rowCount) return { status: 409, error: `"${c.rows[0].name}" is already ${noun.already}.` };
        await audit(db, req.user.id, entityType, req.params.id, p.rows[0].label, 'update',
          `${noun.title} "${c.rows[0].name}" added to ${entityType.replace(/_/g, ' ')} "${p.rows[0].label}"`);
        return { ok: true };
      });
      if (out.error) return res.status(out.status).json({ error: out.error });
      res.status(201).json({ ok: true });
    } catch (err) { fail(res, next)(err); }
  });

  router.delete(`/${path}/:id/${noun.segment}/:componentId`, guardFor(path), async (req, res, next) => {
    try {
      const gone = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(
          `DELETE FROM ${table} t USING control_components cc, ${parent} o
            WHERE t.${key} = $1 AND t.component_id = $2 AND cc.id = t.component_id AND o.id = t.${key}
            RETURNING cc.name, ${parentLabel} AS label`, [req.params.id, req.params.componentId]);
        if (!rows.length) return false;
        await audit(db, req.user.id, entityType, req.params.id, rows[0].label, 'update',
          `${noun.title} "${rows[0].name}" removed from ${entityType.replace(/_/g, ' ')} "${rows[0].label}"`);
        return true;
      });
      if (!gone) return res.status(404).json({ error: 'Not found.' });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}

// A rule is named for what it requires and where it comes from.
const RULE_LABEL = `(SELECT p.name || ' — ' || d.name FROM delivery_patterns p, control_components d
                      WHERE p.id = o.pattern_id AND d.id = o.standard_id)`;

componentListRoutes('rules', {
  table: 'architecture_rule_triggers', key: 'rule_id', parent: 'architecture_rules',
  parentLabel: RULE_LABEL, entityType: 'architecture_rule',
  noun: { segment: 'triggers', title: 'Trigger', already: 'a trigger of this rule' },
});
componentListRoutes('groups', {
  table: 'membership_group_members', key: 'group_id', parent: 'membership_groups',
  parentLabel: 'o.name', entityType: 'membership_group',
  noun: { segment: 'members', title: 'Member', already: 'a member of this group' },
});
componentListRoutes('groups', {
  table: 'membership_group_triggers', key: 'group_id', parent: 'membership_groups',
  parentLabel: 'o.name', entityType: 'membership_group',
  noun: { segment: 'triggers', title: 'Trigger', already: 'a trigger of this group' },
});
componentListRoutes('builds', {
  table: 'system_build_components', key: 'build_id', parent: 'system_builds',
  parentLabel: 'o.name', entityType: 'system_build',
  noun: { segment: 'components', title: 'Component', already: 'in this build' },
});

// ── Rules ─────────────────────────────────────────────────────────────────────
// POST /architecture/rules — { pattern_id, standard_id, notes?, trigger_ids? }
router.post('/rules', canWrite, async (req, res, next) => {
  const { pattern_id, standard_id, trigger_ids = [] } = req.body || {};
  if (!UUID_RE.test(pattern_id || '')) return res.status(400).json({ error: 'Choose the security solution the rule requires.' });
  if (!UUID_RE.test(standard_id || '')) return res.status(400).json({ error: 'Choose the document the rule comes from.' });
  if (!Array.isArray(trigger_ids) || !trigger_ids.every((t) => UUID_RE.test(t))) {
    return res.status(400).json({ error: 'trigger_ids must be a list of component ids.' });
  }
  try {
    const id = await withActor(req.user.id, async (db) => {
      const { rows: [r] } = await db.query(
        `INSERT INTO architecture_rules (pattern_id, standard_id, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pattern_id, standard_id, text(req.body.notes), req.user.id]);
      for (const t of trigger_ids) {
        await db.query(`INSERT INTO architecture_rule_triggers (rule_id, component_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [r.id, t]);
      }
      const { rows: [l] } = await db.query(`SELECT ${RULE_LABEL} AS label FROM architecture_rules o WHERE o.id = $1`, [r.id]);
      await audit(db, req.user.id, 'architecture_rule', r.id, l.label, 'create', `Architecture rule created: ${l.label}`);
      return r.id;
    });
    const { rows } = await query(`${RULES_SQL} WHERE o.id = $1`, [id]);
    res.status(201).json({ rule: rows[0] });
  } catch (err) { fail(res, next)(err); }
});

// PATCH /architecture/rules/:id — { standard_id?, notes? }. The solution is what
// the rule IS; to require a different one, write a different rule.
router.patch('/rules/:id', canWrite, async (req, res, next) => {
  const b = req.body || {};
  if ('pattern_id' in b) return res.status(400).json({ error: 'A rule\'s security solution cannot change — write a new rule for the other solution.' });
  const sets = []; const params = [req.params.id];
  if ('standard_id' in b) {
    if (!UUID_RE.test(b.standard_id || '')) return res.status(400).json({ error: 'Choose the document the rule comes from.' });
    params.push(b.standard_id); sets.push(`standard_id = $${params.length}`);
  }
  if ('notes' in b) { params.push(text(b.notes)); sets.push(`notes = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    const found = await withActor(req.user.id, async (db) => {
      const { rowCount } = await db.query(`UPDATE architecture_rules SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      if (!rowCount) return false;
      const { rows: [l] } = await db.query(`SELECT ${RULE_LABEL} AS label FROM architecture_rules o WHERE o.id = $1`, [req.params.id]);
      await audit(db, req.user.id, 'architecture_rule', req.params.id, l.label, 'update', `Architecture rule changed: ${l.label}`);
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Rule not found.' });
    const { rows } = await query(`${RULES_SQL} WHERE o.id = $1`, [req.params.id]);
    res.json({ rule: rows[0] });
  } catch (err) { fail(res, next)(err); }
});

router.delete('/rules/:id', canWrite, async (req, res, next) => {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(`SELECT ${RULE_LABEL} AS label FROM architecture_rules o WHERE o.id = $1`, [req.params.id]);
      if (!rows.length) return false;
      await db.query('DELETE FROM architecture_rules WHERE id = $1', [req.params.id]);
      await audit(db, req.user.id, 'architecture_rule', req.params.id, rows[0].label, 'delete', `Architecture rule removed: ${rows[0].label}`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'Rule not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Membership groups and builds: name + notes (+ document for a group) ───────
function namedRoutes(path, { table, entityType, noun, sql, withDocument }) {
  router.post(`/${path}`, guardFor(path), async (req, res, next) => {
    const b = req.body || {};
    const name = text(b.name);
    if (!name) return res.status(400).json({ error: `Give the ${noun} a name.` });
    if (withDocument && !UUID_RE.test(b.standard_id || '')) return res.status(400).json({ error: 'Choose the document the group comes from.' });
    try {
      const id = await withActor(req.user.id, async (db) => {
        const cols = ['name', 'notes', 'created_by']; const vals = [name, text(b.notes), req.user.id];
        if (withDocument) {
          cols.push('standard_id'); vals.push(b.standard_id);
          if (Number.isInteger(b.sort_index)) { cols.push('sort_index'); vals.push(b.sort_index); }
        }
        const { rows: [r] } = await db.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
        await audit(db, req.user.id, entityType, r.id, name, 'create', `${noun[0].toUpperCase()}${noun.slice(1)} "${name}" created`);
        return r.id;
      });
      const { rows } = await query(`${sql} WHERE o.id = $1`, [id]);
      res.status(201).json({ [entityType.split('_').pop()]: rows[0] });
    } catch (err) { fail(res, next)(err); }
  });

  router.patch(`/${path}/:id`, guardFor(path), async (req, res, next) => {
    const b = req.body || {};
    const sets = []; const params = [req.params.id];
    if ('name' in b) {
      if (!text(b.name)) return res.status(400).json({ error: `A ${noun} needs a name.` });
      params.push(text(b.name)); sets.push(`name = $${params.length}`);
    }
    if ('notes' in b) { params.push(text(b.notes)); sets.push(`notes = $${params.length}`); }
    if (withDocument && 'standard_id' in b) {
      if (!UUID_RE.test(b.standard_id || '')) return res.status(400).json({ error: 'Choose the document the group comes from.' });
      params.push(b.standard_id); sets.push(`standard_id = $${params.length}`);
    }
    if (withDocument && 'sort_index' in b) {
      if (!Number.isInteger(b.sort_index)) return res.status(400).json({ error: 'sort_index is a whole number.' });
      params.push(b.sort_index); sets.push(`sort_index = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    try {
      const found = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(
          `UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING name`, params);
        if (!rows.length) return false;
        await audit(db, req.user.id, entityType, req.params.id, rows[0].name, 'update', `${noun[0].toUpperCase()}${noun.slice(1)} "${rows[0].name}" changed`);
        return true;
      });
      if (!found) return res.status(404).json({ error: 'Not found.' });
      const { rows } = await query(`${sql} WHERE o.id = $1`, [req.params.id]);
      res.json({ [entityType.split('_').pop()]: rows[0] });
    } catch (err) { fail(res, next)(err); }
  });

  router.delete(`/${path}/:id`, guardFor(path), async (req, res, next) => {
    try {
      const gone = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING name`, [req.params.id]);
        if (!rows.length) return false;
        await audit(db, req.user.id, entityType, req.params.id, rows[0].name, 'delete', `${noun[0].toUpperCase()}${noun.slice(1)} "${rows[0].name}" removed`);
        return true;
      });
      if (!gone) return res.status(404).json({ error: 'Not found.' });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}

namedRoutes('groups', { table: 'membership_groups', entityType: 'membership_group', noun: 'membership group', sql: GROUPS_SQL, withDocument: true });
namedRoutes('builds', { table: 'system_builds', entityType: 'system_build', noun: 'build', sql: BUILDS_SQL, withDocument: false });

module.exports = router;
