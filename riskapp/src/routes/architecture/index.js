'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The security architecture library (v148, docs/system-security-view.md §4.2–§4.4):
//
//   rules     a security solution required of every system recording ANY of the
//             rule's trigger components ("Windows Server 2025 → CrowdStrike EDR");
//   roles     which system pattern slots each component can answer (v178:
//             "Windows 11 can answer: Operating system"); the system profile
//             groups that held this until v177 are retired;
//   builds    a set of components applied to a system as a COPY.
//
// Rules cite the published document they come from (a policy, standard or
// procedure in Policies & documents), so they inherit its owner, approval and
// review date. A rule's trigger is a component, or since v178 a system pattern. Written by the security team (controls.write), like
// the rest of the library. Report only: nothing here moves a status or a score.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const uuidParam    = require('../../middleware/uuidParam');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { query, withActor, withRollback } = require('../../db/pool');
const systemPatterns = require('../../lib/systemPatterns');
const { systemFits } = require('../systems/pattern');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));
for (const [name, guard] of uuidParam('id', 'componentId')) router.param(name, guard);

const canView  = requireCapability('controls.read');
const canWrite = requireCapability('controls.write');
// v155: component roles (the template, v178) and the patterns (builds) are an
// architect's work; the rules that REQUIRE a security solution stay with the
// security team.
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
         COALESCE((SELECT array_agg(pt.system_pattern ORDER BY pt.system_pattern)
                     FROM architecture_rule_pattern_triggers pt WHERE pt.rule_id = o.id), '{}') AS pattern_triggers,
         (SELECT count(DISTINCT w.system_id)::int FROM v_system_wanted_solutions w WHERE w.rule_id = o.id) AS systems
    FROM architecture_rules o
    JOIN delivery_patterns p    ON p.id = o.pattern_id
    JOIN control_components doc ON doc.id = o.standard_id`;

// The roles a component can play (v178), each with the components that can
// play it, for the System patterns page and the system creation wizard.
async function rolesWithMembers() {
  const { rows } = await query(`
    SELECT r AS role, json_agg(json_build_object('id', cc.id, 'name', cc.name, 'component_type', cc.component_type,
                                                 'roles', cc.roles, 'instantiation', cc.instantiation) ORDER BY lower(cc.name)) AS members
      FROM control_components cc, unnest(cc.roles) r
     GROUP BY r`);
  const by = Object.fromEntries(rows.map((x) => [x.role, x.members]));
  return systemPatterns.ROLES.map((r) => ({ ...r, members: by[r.key] || [] }));
}

const BUILDS_SQL = `
  SELECT o.id, o.name, o.notes, o.system_pattern,
         ${componentList('system_build_components', 'build_id')} AS components
    FROM system_builds o`;

// A build's system pattern (v182): one of the patterns, or null (not stated,
// allowed with a warning). Returns { value } or { error }.
function buildPattern(v) {
  if (v === null || v === '') return { value: null };
  if (systemPatterns.patternOf(v)) return { value: v };
  return { error: `system_pattern is one of ${systemPatterns.PATTERNS.map((p) => p.code).join(', ')}, or null.` };
}
const patternWords = (code) => (code ? `${code} ${systemPatterns.patternOf(code).name}` : 'no pattern');

// ── GET /architecture ─────────────────────────────────────────────────────────
// The whole library in one read: it is small, and the page shows all three.
router.get('/', canView, async (req, res, next) => {
  try {
    const [rules, roles, builds, documents, systems] = await Promise.all([
      query(`${RULES_SQL} ORDER BY lower(p.name), lower(doc.name)`),
      rolesWithMembers(),
      query(`${BUILDS_SQL} ORDER BY lower(o.name)`),
      // The documents a rule can cite (v139): not guidelines.
      query(`SELECT st.component_id AS id, cc.name, cc.document_kind, st.status
               FROM control_components cc JOIN v_component_state st ON st.component_id = cc.id
              WHERE cc.component_type = 'information' AND cc.document_kind IN ('policy', 'standard', 'procedure')
              ORDER BY lower(cc.name)`),
      query(`SELECT count(*)::int AS n FROM systems WHERE is_active`),
    ]);
    res.json({
      rules: rules.rows, roles, builds: builds.rows,
      documents: documents.rows, active_systems: systems.rows[0].n,
    });
  } catch (err) { next(err); }
});

// ── GET /architecture/system-patterns ─────────────────────────────────────────
// The eight system patterns (v177; S7, S8 v181), each with the active systems that follow it
// and how they measure up, and the systems whose pattern is not stated (each with
// the components it records and their roles). The
// systems are scoped as GET /systems scopes them: with department isolation on,
// an IAM or IAO sees their own department's systems and shared ones.
const DEPT_SCOPED = new Set(['information_asset_manager', 'information_asset_owner']);
router.get('/system-patterns', canView, async (req, res, next) => {
  try {
    const scoped = isDepartmentIsolationEnabled() && DEPT_SCOPED.has(req.user.role);
    const { rows } = await query(`
      SELECT s.id, s.name, s.system_pattern, s.is_security_system, d.name AS department_name
        FROM systems s LEFT JOIN departments d ON d.id = s.department_id
       WHERE s.is_active
         AND (NOT $1::boolean
              OR s.is_shared
              OR s.department_id = (SELECT department_id FROM users WHERE id = $2))
       ORDER BY lower(s.name)`, [scoped, req.user.id]);
    const fits = await systemFits(rows.map((r) => r.id));
    // A system with no pattern carries what it records, with each component's
    // roles, so an architect can see which pattern it is closest to, or that
    // none fits and a new one may be needed (owner, 2026-11-17).
    const unstated = rows.filter((r) => !r.system_pattern).map((r) => r.id);
    const recorded = new Map(unstated.map((id) => [id, []]));
    if (unstated.length) {
      const { rows: comps } = await query(`
        SELECT x.system_id, cc.id, cc.name, cc.component_type, cc.roles
          FROM system_components x JOIN control_components cc ON cc.id = x.component_id
         WHERE x.system_id = ANY($1::uuid[])
         ORDER BY lower(cc.name)`, [unstated]);
      for (const c of comps) recorded.get(c.system_id).push({ id: c.id, name: c.name, component_type: c.component_type, roles: c.roles || [] });
    }
    const systems = rows.map((r) => ({
      ...r, pattern_fit: fits.get(r.id),
      ...(r.system_pattern ? {} : { recorded: recorded.get(r.id) }),
    }));
    res.json({
      patterns: systemPatterns.PATTERNS.map((p) => ({ ...p, systems: systems.filter((x) => x.system_pattern === p.code).length })),
      systems,
      roles: await rolesWithMembers(),
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

// ── Builds: name + notes ──────────────────────────────────────────────────────
function namedRoutes(path, { table, entityType, noun, sql }) {
  router.post(`/${path}`, guardFor(path), async (req, res, next) => {
    const b = req.body || {};
    const name = text(b.name);
    if (!name) return res.status(400).json({ error: `Give the ${noun} a name.` });
    const pat = 'system_pattern' in b ? buildPattern(b.system_pattern) : { value: null };
    if (pat.error) return res.status(400).json({ error: pat.error });
    try {
      const id = await withActor(req.user.id, async (db) => {
        const cols = ['name', 'notes', 'created_by', 'system_pattern']; const vals = [name, text(b.notes), req.user.id, pat.value];
        const { rows: [r] } = await db.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
        await audit(db, req.user.id, entityType, r.id, name, 'create', `${noun[0].toUpperCase()}${noun.slice(1)} "${name}" created, following ${patternWords(pat.value)}`);
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
    if ('system_pattern' in b) {
      const pat = buildPattern(b.system_pattern);
      if (pat.error) return res.status(400).json({ error: pat.error });
      params.push(pat.value); sets.push(`system_pattern = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    try {
      const found = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(
          `UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING name, system_pattern`, params);
        if (!rows.length) return false;
        const what = 'system_pattern' in b ? `now follows ${patternWords(rows[0].system_pattern)}` : 'changed';
        await audit(db, req.user.id, entityType, req.params.id, rows[0].name, 'update', `${noun[0].toUpperCase()}${noun.slice(1)} "${rows[0].name}" ${what}`);
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

namedRoutes('builds', { table: 'system_builds', entityType: 'system_build', noun: 'build', sql: BUILDS_SQL });

// ── A rule's system pattern triggers (v178) ───────────────────────────────────
// POST /architecture/rules/:id/patterns { system_pattern }; DELETE …/patterns/:code.
// "Every supplier-run service needs Provided by the supplier": a system pattern
// as a trigger, beside the rule's trigger components. The security team's, as
// the rest of the rule.
router.post('/rules/:id/patterns', canWrite, async (req, res, next) => {
  const code = (req.body || {}).system_pattern;
  if (!systemPatterns.patternOf(code)) {
    return res.status(400).json({ error: `system_pattern is one of ${systemPatterns.PATTERNS.map((p) => p.code).join(', ')}.` });
  }
  try {
    const out = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(`SELECT ${RULE_LABEL} AS label FROM architecture_rules o WHERE o.id = $1`, [req.params.id]);
      if (!rows.length) return { status: 404, error: 'Rule not found.' };
      const ins = await db.query(
        'INSERT INTO architecture_rule_pattern_triggers (rule_id, system_pattern) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, code]);
      if (!ins.rowCount) return { status: 409, error: 'That system pattern is already a trigger of this rule.' };
      await audit(db, req.user.id, 'architecture_rule', req.params.id, rows[0].label, 'update',
        `System pattern ${code} ${systemPatterns.patternOf(code).name} added as a trigger of "${rows[0].label}"`);
      return { ok: true };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/rules/:id/patterns/:code', canWrite, async (req, res, next) => {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM architecture_rule_pattern_triggers t USING architecture_rules o
          WHERE t.rule_id = $1 AND t.system_pattern = $2 AND o.id = t.rule_id RETURNING ${RULE_LABEL} AS label`,
        [req.params.id, req.params.code]);
      if (!rows.length) return false;
      await audit(db, req.user.id, 'architecture_rule', req.params.id, rows[0].label, 'update',
        `System pattern ${req.params.code} removed as a trigger of "${rows[0].label}"`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'Not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── A component's roles (v178) ────────────────────────────────────────────────
// GET /architecture/components/:componentId/roles?roles=a,b  what changing them would do
// PUT /architecture/components/:componentId/roles  { roles, confirm_gaps? }
//
// Changing what a component can answer ripples through every system recording
// it: a slot it answered may be left empty. The preview runs the real change and
// rolls it back (withRollback), so it cannot disagree with saving. A change that
// leaves a system with a new gap is refused (409, with the preview) unless the
// caller says they know (confirm_gaps). It changes no security solution: the
// triggers follow components, not roles. Audited with the systems it touched.
function parseRoles(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').filter(Boolean) : null;
  if (!list) return { error: 'roles is a list of roles.' };
  const keys = systemPatterns.ROLES.map((r) => r.key);
  const bad = list.filter((k) => !keys.includes(k));
  if (bad.length) return { error: `Not a role: ${bad.join(', ')}. Roles are ${keys.join(', ')}.` };
  return { roles: [...new Set(list)].sort() };
}

async function roleChange(db, componentId, roles) {
  const { rows: [c] } = await db.query('SELECT name, roles FROM control_components WHERE id = $1', [componentId]);
  if (!c) return null;
  const gapsSql = `
    SELECT s.id, s.name, s.system_pattern,
           COALESCE((SELECT array_agg(g.label ORDER BY g.sort_index) FROM v_system_slot_gaps g WHERE g.system_id = s.id), '{}') AS gaps
      FROM systems s JOIN system_components x ON x.system_id = s.id AND x.component_id = $1
     WHERE s.is_active ORDER BY lower(s.name)`;
  const before = (await db.query(gapsSql, [componentId])).rows;
  await db.query('UPDATE control_components SET roles = $2 WHERE id = $1', [componentId, roles]);
  const after = new Map((await db.query(gapsSql, [componentId])).rows.map((r) => [r.id, r.gaps]));
  const systems = before.map((r) => {
    const now = after.get(r.id) || [];
    return { id: r.id, name: r.name, system_pattern: r.system_pattern,
      new_gaps: now.filter((g) => !r.gaps.includes(g)), closed_gaps: r.gaps.filter((g) => !now.includes(g)) };
  });
  return { component: { id: componentId, name: c.name, roles: c.roles }, roles, systems,
    gaps_created: systems.filter((x) => x.new_gaps.length).length };
}

const roleLabel = (k) => systemPatterns.ROLES.find((r) => r.key === k)?.labels[0] || k;

router.get('/components/:componentId/roles', canArchitect, async (req, res, next) => {
  const p = parseRoles(req.query.roles ?? '');
  if (p.error) return res.status(400).json({ error: p.error });
  try {
    const preview = await withRollback(req.user.id, (db) => roleChange(db, req.params.componentId, p.roles));
    if (!preview) return res.status(404).json({ error: 'Component not found.' });
    res.json(preview);
  } catch (err) { next(err); }
});

router.put('/components/:componentId/roles', canArchitect, async (req, res, next) => {
  const b = req.body || {};
  const p = parseRoles(b.roles);
  if (p.error) return res.status(400).json({ error: p.error });
  try {
    const out = await withActor(req.user.id, async (db) => {
      const r = await roleChange(db, req.params.componentId, p.roles);
      if (!r) return { status: 404, body: { error: 'Component not found.' } };
      if (r.gaps_created && b.confirm_gaps !== true) {
        // Thrown so withActor rolls the change back.
        const e = new Error('gaps'); e.refusal = { status: 409, body: { code: 'role_change_leaves_gaps',
          error: `This leaves ${r.gaps_created} system${r.gaps_created === 1 ? '' : 's'} with a gap. Confirm to go ahead.`, preview: r } };
        throw e;
      }
      const was = r.component.roles.map(roleLabel).join(', ') || 'none';
      const now = r.roles.map(roleLabel).join(', ') || 'none';
      const touched = r.systems.filter((x) => x.new_gaps.length || x.closed_gaps.length);
      await audit(db, req.user.id, 'control_components', req.params.componentId, r.component.name, 'update',
        `"${r.component.name}" can answer: ${was} → ${now}. ${r.systems.length} system${r.systems.length === 1 ? '' : 's'} record it`
        + (touched.length ? `; ${touched.map((x) => `${x.name}${x.new_gaps.length ? ` now lacks ${x.new_gaps.join(', ')}` : ''}${x.closed_gaps.length ? ` now has ${x.closed_gaps.join(', ')}` : ''}`).join('; ')}` : '; no slot changes'));
      return { status: 200, body: r };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    if (err.refusal) return res.status(err.refusal.status).json(err.refusal.body);
    next(err);
  }
});

module.exports = router;
