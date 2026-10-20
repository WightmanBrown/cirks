'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Statement of Applicability (SoA) — ISO/IEC 27001:2022 clause 6.1.3(d).
//
// ONE record (v122). Applicability, drivers, justification, implementation status
// and owner are recorded once per CIRKS control, in `soa_entries`. Every standard
// is a LENS on that record: its requirements (`standard_controls`) are read
// through `control_mappings`, and whether each is covered, partly covered, excluded
// or a gap is DERIVED. The only thing a requirement records for itself is an
// exclusion with its reason (`standard_requirement_exclusions`).
//
// Until v122 each standard had its own full copy of the SoA (`standard_soa_entries`)
// and nothing kept the copies in step — see docs/statement-of-applicability.md.
//
// Gated on the existing controls capabilities — the SoA is a controls-applicability
// artifact: controls.read to view/export, controls.write to edit.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query, withActor } = require('../../db/pool');

const router = Router();
router.use(authenticate);

const canRead  = requireCapability('controls.read');
const canWrite = requireCapability('controls.write');

const VALID_STATUS  = new Set(['not_implemented', 'planned', 'partial', 'implemented']);
const VALID_DRIVERS = new Set(['risk', 'legal', 'regulatory', 'contractual', 'business']);
const STATUS_RANK   = { not_implemented: 0, planned: 1, partial: 2, implemented: 3 };
const RANKED_STATUS = ['not_implemented', 'planned', 'partial', 'implemented'];

// Annex A theme from the control ref prefix (A.5/A.6/A.7/A.8).
const THEMES = [
  { key: 'A.5', label: 'Organizational' },
  { key: 'A.6', label: 'People' },
  { key: 'A.7', label: 'Physical' },
  { key: 'A.8', label: 'Technological' },
];
function themeForRef(ref) {
  const t = THEMES.find(t => (ref || '').startsWith(t.key));
  return t ? t.label : 'Other';
}

// Natural order on a reference: A.5.2 before A.5.10, and letters kept, so NIST's
// "GV.OC-01" sorts as itself. (A digits-only key used to be used here; it gave
// every NIST "-01" the same key and interleaved the sections.)
const byRef = (a, b) => String(a.ref ?? '').localeCompare(String(b.ref ?? ''), 'en', { numeric: true });

// ── Views ────────────────────────────────────────────────────────────────────
// 'all' is the record itself: every CIRKS control. Any other key is the code of a
// standard in the `standards` registry — read from the database, never from a list
// in code. A hardcoded list here meant a newly loaded standard had no view at all,
// and asking for it silently returned 'all' under the wrong name.
const ALL_VIEW = { key: 'all', label: 'All control objectives', stdCode: null };
// The record, narrowed to objectives mapped to no standard — the organisation's own.
// Still the record (editable, not derived); just filtered. 'custom' is reserved: a
// standard registered under that code would be unreachable here.
const CUSTOM_VIEW = { key: 'custom', label: 'Custom control objectives', stdCode: null, customOnly: true };
// Objectives mapped to no standard: the organisation's own, under their own reference.
const UNMAPPED_GROUP = 'Custom control objectives';

class UnknownViewError extends Error {}

async function resolveView(key) {
  const k = (key || 'all').toString();
  if (k === 'all') return ALL_VIEW;
  if (k === 'custom') return CUSTOM_VIEW;
  const { rows } = await query(`SELECT code, name FROM standards WHERE code = $1`, [k]);
  if (!rows.length) throw new UnknownViewError(`Unknown standard: ${k}`);
  return { key: rows[0].code, label: rows[0].name, stdCode: rows[0].code };
}

// A requirement's group label. ISO themes and CIS control numbers are derived
// from the ref; every other standard supplies its own grouping at import.
function requirementGroup(stdCode, ref, grouping) {
  if (stdCode === 'iso27001') return themeForRef(ref);
  if (stdCode === 'cis_v8')   return `CIS Control ${String(ref || '').split('.')[0] || '?'}`;
  return grouping || 'Other';
}

// Group rows in the order they arrive (rows are pre-sorted by the standard's own
// sort order), except that ISO themes keep Annex A order and CIS sorts numerically.
function groupRows(view, rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.group)) map.set(r.group, []);
    map.get(r.group).push(r);
  }
  let keys = [...map.keys()];
  if (view.stdCode === 'iso27001') {
    const order = THEMES.map(t => t.label);
    keys.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  } else if (view.stdCode === 'cis_v8') {
    const num = g => parseInt(String(g).replace(/[^0-9]/g, ''), 10) || 999;
    keys.sort((a, b) => num(a) - num(b));
  } else if (!view.stdCode) {
    // 'all': standards in registry order (rows arrive that way), unmapped last.
    keys = [...keys.filter(k => k !== UNMAPPED_GROUP), ...keys.filter(k => k === UNMAPPED_GROUP)];
  }
  return keys.map(label => ({ label, controls: map.get(label) }));
}

// ── Deriving a requirement from the controls mapped to it ────────────────────
// `mapped` is each mapped control's SoA facts; `exclusion` is the requirement's own
// exclusion reason, if one is recorded. Pure, so the rule is testable without a DB.
//
//   excluded — an explicit requirement exclusion (it wins even over an applicable
//              control: that control may serve another standard), OR every mapped
//              control carries a DECIDED not-applicable entry
//   covered  — at least one fully mapped control is applicable
//   partial  — only partially mapped controls are applicable
//   gap      — anything else: unmapped, or mapped only to undecided controls
//
// A requirement is as implemented as its best applicable full mapping; with only
// partial mappings it is 'partial' at best.
function deriveRequirement(mapped = [], exclusion = null) {
  const justifications = (list) => {
    const seen = [...new Set(list.map(m => (m.justification || '').trim()).filter(Boolean))];
    return seen.length ? seen.join('; ') : null;
  };
  const best = (list) => RANKED_STATUS[Math.max(0, ...list.map(m => STATUS_RANK[m.implementation_status] ?? 0))];
  const drivers = (list) => [...new Set(list.flatMap(m => m.drivers || []))].sort();

  if (exclusion && exclusion.trim()) {
    return { state: 'excluded', exclusion: 'explicit', applicable: false,
             implementation_status: 'not_implemented', justification: exclusion.trim(), drivers: [] };
  }
  const full    = mapped.filter(m => m.applicable && m.coverage === 'full');
  const partial = mapped.filter(m => m.applicable && m.coverage !== 'full');
  if (full.length) {
    return { state: 'covered', exclusion: null, applicable: true,
             implementation_status: best(full), justification: justifications(full), drivers: drivers(full) };
  }
  if (partial.length) {
    const status = RANKED_STATUS[Math.min(STATUS_RANK.partial, STATUS_RANK[best(partial)])];
    return { state: 'partial', exclusion: null, applicable: true,
             implementation_status: status, justification: justifications(partial), drivers: drivers(partial) };
  }
  if (mapped.length && mapped.every(m => m.decided && !m.applicable)) {
    return { state: 'excluded', exclusion: 'inherited', applicable: false,
             implementation_status: 'not_implemented', justification: justifications(mapped), drivers: [] };
  }
  return { state: 'gap', exclusion: null, applicable: false,
           implementation_status: 'not_implemented', justification: null, drivers: [] };
}

// Fetch the live SoA rows for a view. Both shapes carry `control_id` (a controls.id
// for 'all', a standard_controls.id for a standard) + `entry_kind`, so one PATCH
// endpoint and one page serve both.
async function fetchSoaRows(view = ALL_VIEW) {
  if (!view.stdCode) {
    // The record: every native control + its SoA entry, grouped under its first
    // mapped standard, carrying ALL its mappings so overlap is visible.
    const { rows } = await query(`
      SELECT c.id AS control_id, 'control'::text AS entry_kind, c.title, c.description, vcs.status, c.reference_code,
             c.effectiveness, c.effectiveness_notes, c.rated_at, ru.full_name AS rated_by_name, c.delivery,
             COALESCE(se.applicable, FALSE)                        AS applicable,
             COALESCE(se.drivers, '{}')                            AS drivers,
             se.justification,
             se.implementation_description,
             COALESCE(vci.implementation_status, 'not_implemented') AS implementation_status,
             -- Derived for controls delivered on each system, stated otherwise (v129).
             COALESCE(vci.status_source, 'stated')                 AS implementation_source,
             COALESCE(vci.partial_reasons, '{}')                   AS partial_reasons,
             vci.threat_systems, vci.threat_systems_present, vci.degraded_systems,
             vci.expected_systems, vci.expected_systems_present,
             se.owner_user_id, u.full_name AS owner_name,
             COALESCE(refs.list, '[]'::json)                       AS standard_refs,
             COALESCE(scp.list, '[]'::json)                        AS scopes
      FROM controls c
      JOIN v_control_status vcs ON vcs.control_id = c.id
      LEFT JOIN soa_entries se ON se.control_id = c.id
      LEFT JOIN v_control_implementation vci ON vci.control_id = c.id
      LEFT JOIN users u        ON u.id = se.owner_user_id
      LEFT JOIN users ru       ON ru.id = c.rated_by
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('code', s.code, 'name', s.name, 'ref', sc.ref_code, 'sort_index', sc.sort_index)
                        ORDER BY s.sort_index, s.name, sc.sort_index) AS list
        FROM control_mappings cm
        JOIN standard_controls sc ON sc.id = cm.standard_control_id
        JOIN standards s          ON s.id  = sc.standard_id
        WHERE cm.control_id = c.id
      ) refs ON TRUE
      LEFT JOIN LATERAL (
        -- The scopes this objective is NARROWED to; none = the whole organisation (v126).
        SELECT json_agg(json_build_object('id', sco.id, 'name', sco.name) ORDER BY lower(sco.name)) AS list
        FROM soa_entry_scopes x JOIN scopes sco ON sco.id = x.scope_id
        WHERE x.control_id = c.id
      ) scp ON TRUE
    `);
    const { rows: stds } = await query(`SELECT name FROM standards ORDER BY sort_index, name`);
    const stdOrder = stds.map(s => s.name);
    for (const r of rows) {
      r.drivers       = r.drivers || [];
      r.standard_refs = r.standard_refs || [];
      r.scopes        = r.scopes || [];
      const primary   = r.standard_refs[0];
      r.ref           = primary ? primary.ref : (r.reference_code || null);
      r.sort_index    = primary ? primary.sort_index : null;
      r.group         = primary ? primary.name : UNMAPPED_GROUP;
    }
    const rank = g => { const i = stdOrder.indexOf(g); return i === -1 ? 999 : i; };
    rows.sort((a, b) => (rank(a.group) - rank(b.group))
      || String(a.sort_index ?? '').localeCompare(String(b.sort_index ?? ''))
      || byRef(a, b) || a.title.localeCompare(b.title));
    return view.customOnly ? rows.filter(r => r.standard_refs.length === 0) : rows;
  }

  // A standard's lens: its requirements, each derived from the mapped controls.
  const { rows } = await query(`
    SELECT sc.id AS control_id, 'standard_control'::text AS entry_kind,
           sc.ref_code AS ref, sc.title, sc.description, sc.grouping, sc.implementation_group, sc.sort_index,
           ex.justification AS exclusion_justification, ex.excluded_at, eu.full_name AS excluded_by_name,
           COALESCE(mp.list, '[]'::json) AS mapped_controls
    FROM standard_controls sc
    JOIN standards s ON s.id = sc.standard_id AND s.code = $1
    LEFT JOIN standard_requirement_exclusions ex ON ex.standard_control_id = sc.id
    LEFT JOIN users eu ON eu.id = ex.excluded_by
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'control_id', c.id, 'title', c.title, 'coverage', cm.coverage,
               'decided', se.control_id IS NOT NULL,
               'applicable', COALESCE(se.applicable, FALSE),
               'implementation_status', COALESCE(vci.implementation_status, 'not_implemented'),
               'justification', se.justification,
               'implementation_description', se.implementation_description,
               'drivers', COALESCE(se.drivers, '{}'))
             ORDER BY cm.coverage, c.title) AS list
      FROM control_mappings cm
      JOIN controls c          ON c.id = cm.control_id
      LEFT JOIN soa_entries se ON se.control_id = c.id
      LEFT JOIN v_control_implementation vci ON vci.control_id = c.id
      WHERE cm.standard_control_id = sc.id
    ) mp ON TRUE
    ORDER BY sc.sort_index, sc.ref_code
  `, [view.stdCode]);
  for (const r of rows) {
    r.mapped_controls = r.mapped_controls || [];
    const d = deriveRequirement(r.mapped_controls, r.exclusion_justification);
    r.requirement_state     = d.state;
    r.exclusion             = d.exclusion;
    r.applicable            = d.applicable;
    r.implementation_status = d.implementation_status;
    r.justification         = d.justification;
    r.drivers               = d.drivers;
    r.group                 = requirementGroup(view.stdCode, r.ref, r.grouping);
  }
  // The standard's own order (sort_index; NIST's was repaired in v125), with a
  // natural sort on the reference to break ties and to order a standard whose
  // sort_index is missing.
  rows.sort((a, b) => String(a.sort_index ?? '').localeCompare(String(b.sort_index ?? '')) || byRef(a, b));
  return rows;
}

// CSV of SoA rows (live or a frozen snapshot) — business keys only, no UUIDs.
function soaCsv(rows, view = ALL_VIEW) {
  const esc = v => {
    const str = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const isStd = !!view.stdCode;
  const header = isStd
    ? ['Reference', view.stdCode === 'iso27001' ? 'Theme' : 'Group', 'Requirement', 'Description', 'State', 'Implementation status', 'Justification', 'Mapped controls']
    : ['Reference', 'Standards', 'Control', 'Description', 'Applicable', 'Drivers', 'Justification', 'Implementation status', 'Implementation description', 'Owner'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push((isStd
      ? [r.ref, r.group, r.title, r.description, r.requirement_state, r.implementation_status, r.justification,
         (r.mapped_controls || []).map(m => `${m.title} (${m.coverage})`).join('; ')]
      : [r.ref, (r.standard_refs || []).map(s => `${s.name} ${s.ref}`).join('; '), r.title, r.description,
         r.applicable ? 'Yes' : 'No', (r.drivers || []).join('; '), r.justification, r.implementation_status,
         r.implementation_description, r.owner_name]
    ).map(esc).join(','));
  }
  return lines.join('\n');
}

// Canonical signature of an SoA snapshot — the recorded decisions only, order-
// independent for drivers, null-normalised. Used to detect "nothing changed since the
// last approval" so an identical version can't be approved twice. Catalogue metadata
// (title/description) is excluded: it isn't part of the applicability stance.
function soaSignature(rows) {
  return JSON.stringify((rows || []).map(r => [
    r.control_id ?? r.ref,
    r.applicable === true,
    [...(r.drivers || [])].sort(),
    (r.justification ?? '').trim(),
    r.implementation_status ?? '',
    (r.implementation_description ?? '').trim(),
    r.owner_name ?? '',
  ]));
}

function summarise(rows, view) {
  const applicable = rows.filter(r => r.applicable);
  const summary = {
    total:                      rows.length,
    applicable:                 applicable.length,
    not_applicable:             rows.length - applicable.length,
    implemented:                rows.filter(r => r.implementation_status === 'implemented').length,
    // "Needs attention" for the page: applicable controls that aren't fully implemented.
    applicable_not_implemented: applicable.filter(r => r.implementation_status !== 'implemented').length,
    // Audit-readiness gaps: no justification, or applicable with no driver recorded.
    missing_justification:      applicable.filter(r => !r.justification || !r.justification.trim()).length,
    missing_drivers:            applicable.filter(r => !r.drivers || r.drivers.length === 0).length,
  };
  if (view.stdCode) {
    for (const s of ['covered', 'partial', 'excluded', 'gap']) {
      summary[s] = rows.filter(r => r.requirement_state === s).length;
    }
    // An exclusion with no reason is the audit gap on a standard's lens.
    summary.not_applicable = summary.excluded;
    summary.missing_justification = rows.filter(r =>
      (r.applicable || r.requirement_state === 'excluded') && !(r.justification || '').trim()).length;
  }
  return summary;
}

function viewError(err, res, next) {
  if (err instanceof UnknownViewError) return res.status(404).json({ error: err.message });
  return next(err);
}

// ── GET /soa?framework=all|<standard code> ──────────────────────────────────────
router.get('/', canRead, async (req, res, next) => {
  try {
    const view   = await resolveView(req.query.framework);
    const rows   = await fetchSoaRows(view);
    res.json({ framework: view.key, framework_label: view.label,
               summary: summarise(rows, view), groups: groupRows(view, rows) });
  } catch (err) { viewError(err, res, next); }
});

// Where an adopted objective applies (v126). `scopeIds` is a list of scope ids;
// an empty list means the whole organisation. Not applicable = no scopes: they
// would only resurface, stale, if the objective were adopted again.
async function validateScopeIds(scopeIds) {
  if (scopeIds === undefined) return null;
  if (!Array.isArray(scopeIds) || scopeIds.some(x => typeof x !== 'string' || !UUID_RE.test(x))) {
    return 'scope_ids must be a list of scope ids ([] = the whole organisation).';
  }
  if (!scopeIds.length) return null;
  const { rows } = await query(`SELECT count(*)::int AS n FROM scopes WHERE id = ANY($1::uuid[])`, [[...new Set(scopeIds)]]);
  return rows[0].n === new Set(scopeIds).size ? null : 'One or more scopes were not found.';
}

async function setObjectiveScopes(db, controlIds, scopeIds) {
  await db.query(`DELETE FROM soa_entry_scopes WHERE control_id = ANY($1::uuid[])`, [controlIds]);
  if (scopeIds && scopeIds.length) {
    await db.query(
      `INSERT INTO soa_entry_scopes (control_id, scope_id)
       SELECT c, s FROM unnest($1::uuid[]) AS c CROSS JOIN unnest($2::uuid[]) AS s
       ON CONFLICT DO NOTHING`, [controlIds, [...new Set(scopeIds)]]);
  }
}

// ── PATCH /soa/:id ───────────────────────────────────────────────────────────────
// `:id` is a native controls.id → edit the record (soa_entries), or a
// standard_controls.id → edit that requirement's EXCLUSION, the only thing it owns.
//   control body:     { applicable?, drivers?, justification?, implementation_status?,
//                       implementation_description?, owner_user_id? }
//   requirement body: { excluded: boolean, justification? }  (a reason is required to exclude)
const CONTROL_FIELDS = ['applicable', 'drivers', 'justification', 'implementation_status', 'implementation_description', 'owner_user_id', 'scope_ids'];

function validateSoaBody({ applicable, drivers, implementation_status }) {
  if (implementation_status !== undefined && !VALID_STATUS.has(implementation_status)) {
    return `Invalid implementation_status: ${implementation_status}`;
  }
  if (drivers !== undefined && (!Array.isArray(drivers) || drivers.some(d => !VALID_DRIVERS.has(d)))) {
    return `drivers must be a subset of ${[...VALID_DRIVERS].join(', ')}`;
  }
  if (applicable !== undefined && typeof applicable !== 'boolean') {
    return 'applicable must be a boolean.';
  }
  return null;
}

function buildSets(body, startParam = 1) {
  const sets = [];
  const params = [];
  let p = startParam;
  const { applicable, drivers, justification, implementation_status, implementation_description, owner_user_id } = body;
  if (applicable !== undefined)                 { sets.push(`applicable = $${p++}`);                 params.push(applicable); }
  if (drivers !== undefined)                    { sets.push(`drivers = $${p++}`);                    params.push(drivers); }
  if (justification !== undefined)              { sets.push(`justification = $${p++}`);              params.push(justification || null); }
  if (implementation_status !== undefined)      { sets.push(`implementation_status = $${p++}`);      params.push(implementation_status); }
  if (implementation_description !== undefined) { sets.push(`implementation_description = $${p++}`); params.push(implementation_description || null); }
  if (owner_user_id !== undefined)              { sets.push(`owner_user_id = $${p++}`);              params.push(owner_user_id || null); }
  return { sets, params, next: p };
}

router.patch('/:id', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const err = validateSoaBody(body);
    if (err) return res.status(400).json({ error: err });

    // Native control? -> the record (drives the control status lifecycle).
    const ctrl = await query(`SELECT id, effectiveness, delivery FROM controls WHERE id = $1`, [id]);
    if (ctrl.rows.length) {
      // A control delivered on each system has its status DERIVED from those
      // systems (v129); typing one would be a second, competing answer.
      if (body.implementation_status !== undefined && ctrl.rows[0].delivery === 'system') {
        return res.status(400).json({
          error: 'This control is delivered on each system, so its implementation status is derived from those systems and cannot be set.',
        });
      }
      const scopeErr = await validateScopeIds(body.scope_ids);
      if (scopeErr) return res.status(400).json({ error: scopeErr });
      const { applicable, drivers, justification, implementation_status, implementation_description, owner_user_id } = body;
      const { sets, params, next: p } = buildSets(body);
      if (!sets.length && body.scope_ids === undefined) return res.status(400).json({ error: 'No fields to update.' });
      sets.push(`updated_by = $${p}`); params.push(req.user.id);
      sets.push(`updated_at = now()`);
      params.push(id);

      // Under withActor: the v131 trigger records WHAT changed, from what, to
      // what — and needs the actor to attribute it. The controller no longer
      // writes an audit row of its own; "SoA updated" with no field, no old and
      // no new value is what made the 2026-07-29 exclusions unexplainable.
      const result = await withActor(req.user.id, async (db) => {
        let r = await db.query(
          `UPDATE soa_entries SET ${sets.join(', ')} WHERE control_id = $${params.length} RETURNING *`, params
        );
        if (!r.rowCount) {
          r = await db.query(
            `INSERT INTO soa_entries (control_id, applicable, drivers, justification, implementation_status, implementation_description, owner_user_id, updated_by)
             VALUES ($1, COALESCE($2,FALSE), COALESCE($3::text[],'{}'), $4, COALESCE($5,'not_implemented'), $6, $7, $8) RETURNING *`,
            [id, applicable, drivers, justification || null, implementation_status, implementation_description || null, owner_user_id || null, req.user.id]
          );
        }
        return r;
      });

      // Scopes: set when given; cleared when the objective is marked not
      // applicable (or given scopes while it is not applicable).
      if (body.scope_ids !== undefined || applicable === false) {
        const nowApplicable = result.rows[0].applicable === true;
        await withActor(req.user.id, (db) => setObjectiveScopes(db, [id], nowApplicable ? (body.scope_ids ?? []) : []));
      }

      // The objective's status is derived (v124); report what it now is so the
      // page can relabel the row without a reload.
      let control_status;
      if (applicable !== undefined) {
        const st = await query(`SELECT status FROM v_control_status WHERE control_id = $1`, [id]);
        control_status = st.rows[0]?.status;
      }
      return res.json({ entry: result.rows[0], control_status });
    }

    // Standard requirement? -> its exclusion, and nothing else.
    const sc = await query(
      `SELECT sc.id, sc.ref_code, s.name AS standard_name FROM standard_controls sc
       JOIN standards s ON s.id = sc.standard_id WHERE sc.id = $1`, [id]);
    if (!sc.rows.length) return res.status(404).json({ error: 'SoA entry not found.' });
    const label = `${sc.rows[0].standard_name} ${sc.rows[0].ref_code}`;

    const stray = CONTROL_FIELDS.filter(f => f !== 'justification' && body[f] !== undefined);
    if (stray.length) {
      return res.status(400).json({
        error: `A standard requirement's ${stray.join(', ')} is derived from the control objectives mapped to it. `
             + 'Edit those in the All control objectives view; a requirement records only its exclusion.',
      });
    }
    const reason = typeof body.justification === 'string' ? body.justification.trim() : '';
    const existing = await query(
      `SELECT justification FROM standard_requirement_exclusions WHERE standard_control_id = $1`, [id]);
    const wasExcluded = existing.rows.length > 0;
    const excluded = typeof body.excluded === 'boolean' ? body.excluded : wasExcluded;

    if (!excluded) {
      if (!wasExcluded) return res.status(400).json({ error: 'This requirement is not excluded.' });
      await query(`DELETE FROM standard_requirement_exclusions WHERE standard_control_id = $1`, [id]);
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, field_name, old_value, human_narrative)
         VALUES ($1, 'delete', 'standard_requirement_exclusion', $2, $3, 'justification', $4, $5)`,
        [req.user.id, id, label, existing.rows[0].justification, `Exclusion of ${label} withdrawn`]
      );
      return res.json({ exclusion: null });
    }

    if (!reason) {
      return res.status(400).json({ error: 'A reason is required to exclude a requirement.' });
    }
    const result = await query(
      `INSERT INTO standard_requirement_exclusions (standard_control_id, justification, excluded_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (standard_control_id) DO UPDATE
         SET justification = EXCLUDED.justification, excluded_by = EXCLUDED.excluded_by, excluded_at = now()
       RETURNING *`,
      [id, reason, req.user.id]
    );
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, field_name, old_value, new_value, human_narrative)
       VALUES ($1, $2, 'standard_requirement_exclusion', $3, $4, 'justification', $5, $6, $7)`,
      [req.user.id, wasExcluded ? 'update' : 'create', id, label,
       wasExcluded ? existing.rows[0].justification : null, reason,
       wasExcluded ? `Exclusion reason for ${label} changed` : `${label} excluded`]
    );
    res.json({ exclusion: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /soa/decisions — the bulk decision ─────────────────────────────────────
// First-time triage means deciding on every objective in the library (NIST CSF
// alone is 106), and one page per objective makes that slow. So the SoA register
// can decide several at once — and deciding is ALL it can do: how an objective is
// implemented, rated and deployed is edited on its own page, with its control.
//
// Body: { control_ids: [uuid…], applicable: boolean, justification?: string, drivers?: [] }
//   • "not applicable" requires a reason; "adopted" does not (the register counts
//     adopted objectives with no justification, so the gap stays visible);
//   • a shared reason fills only objectives that have NO justification yet — words
//     someone already wrote are kept, and the response says how many;
//   • drivers are added to each objective's existing drivers, never replaced.
// All-or-nothing in one transaction, attributed via withActor, one audit row each.
const BULK_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/decisions', canWrite, async (req, res, next) => {
  try {
    const { control_ids, applicable, drivers, scope_ids } = req.body || {};
    const reason = typeof req.body?.justification === 'string' ? req.body.justification.trim() : '';

    if (!Array.isArray(control_ids) || !control_ids.length) {
      return res.status(400).json({ error: 'control_ids must be a non-empty list.' });
    }
    if (control_ids.length > BULK_MAX) {
      return res.status(400).json({ error: `At most ${BULK_MAX} objectives at once.` });
    }
    if (control_ids.some(id => typeof id !== 'string' || !UUID_RE.test(id))) {
      return res.status(400).json({ error: 'control_ids must be objective ids.' });
    }
    if (typeof applicable !== 'boolean') {
      return res.status(400).json({ error: 'applicable must be true or false.' });
    }
    if (!applicable && !reason) {
      return res.status(400).json({ error: 'A reason is required to mark objectives not applicable.' });
    }
    if (drivers !== undefined && (!Array.isArray(drivers) || drivers.some(d => !VALID_DRIVERS.has(d)))) {
      return res.status(400).json({ error: `drivers must be a subset of ${[...VALID_DRIVERS].join(', ')}` });
    }
    const scopeErr = await validateScopeIds(scope_ids);
    if (scopeErr) return res.status(400).json({ error: scopeErr });
    const ids = [...new Set(control_ids)];

    const result = await withActor(req.user.id, async (db) => {
      const found = await db.query(`SELECT id FROM controls WHERE id = ANY($1::uuid[])`, [ids]);
      if (found.rows.length !== ids.length) {
        const known = new Set(found.rows.map(r => r.id));
        const err = new Error(`Not control objectives: ${ids.filter(i => !known.has(i)).join(', ')}`);
        err.status = 404;
        throw err;
      }
      // Upsert: create a missing SoA entry, set applicability, fill an EMPTY
      // justification, union the drivers. `kept` = a justification already there.
      const { rows } = await db.query(
        `INSERT INTO soa_entries (control_id, applicable, justification, drivers, updated_by)
         SELECT id, $2, NULLIF($3, ''), COALESCE($4::text[], '{}'), $5 FROM unnest($1::uuid[]) AS id
         ON CONFLICT (control_id) DO UPDATE SET
           applicable    = EXCLUDED.applicable,
           justification = CASE WHEN NULLIF(btrim(COALESCE(soa_entries.justification, '')), '') IS NULL
                                THEN EXCLUDED.justification ELSE soa_entries.justification END,
           drivers       = ARRAY(SELECT DISTINCT unnest(soa_entries.drivers || EXCLUDED.drivers) ORDER BY 1),
           updated_by    = EXCLUDED.updated_by,
           updated_at    = now()
         RETURNING control_id,
                   (xmax <> 0 AND justification IS DISTINCT FROM NULLIF($3, '')) AS kept`,
        [ids, applicable, reason, drivers ?? null, req.user.id]
      );
      // Where they apply: replaced when scope_ids is given, cleared if not applicable.
      if (!applicable) await setObjectiveScopes(db, ids, []);
      else if (scope_ids !== undefined) await setObjectiveScopes(db, ids, scope_ids);
      // ONE row for the batch. Each objective's own change is recorded by the
      // v131 trigger with its old and new values; what the trigger cannot know is
      // that these were decided together, which is the only thing left to say.
      await db.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_name, new_value, changes, human_narrative)
         VALUES ($1, 'update', 'soa_entry', NULL, 'bulk', $2::text, $3::jsonb, $4)`,
        [req.user.id, String(applicable), JSON.stringify({ control_ids: ids, applicable, reason: reason || null }),
         `SoA decision taken for ${ids.length} objectives together: ${applicable ? 'adopted' : 'not applicable'}`
         + `${reason ? ` — ${reason}` : ''}`]
      );
      const st = await db.query(
        `SELECT control_id, status FROM v_control_status WHERE control_id = ANY($1::uuid[])`, [ids]);
      return { rows, statuses: st.rows };
    });

    const kept = reason ? result.rows.filter(r => r.kept).length : 0;
    res.json({
      decided: ids.length,
      justification_kept: kept,
      statuses: Object.fromEntries(result.statuses.map(r => [r.control_id, r.status])),
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// ── GET /soa/export ─────────────────────────────────────────────────────────────
// CSV of the SoA — the artifact an auditor opens. Business keys only, no UUIDs.
// ── GET /soa/findings[?control_id=] — what the SoA contradicts (v130) ─────────
// Derived, never stored: each finding closes itself when the fact changes. Each is
// resolved by an act that already exists — change the SoA decision or its scope,
// record a reason, or remove the deployment.
const FINDING_TYPES = ['deployed_where_not_applicable', 'not_applicable_counters_threat', 'not_applicable_without_reason'];

router.get('/findings', canRead, async (req, res, next) => {
  const controlId = req.query.control_id;
  if (controlId !== undefined && !UUID_RE.test(String(controlId))) {
    return res.status(400).json({ error: 'control_id must be a control id.' });
  }
  try {
    const { rows } = await query(`
      SELECT f.finding_type, f.control_id, f.system_id, f.system_status, f.why, f.risks_affected,
             c.title, c.delivery,
             COALESCE((SELECT sc.ref_code FROM control_mappings cm
                         JOIN standard_controls sc ON sc.id = cm.standard_control_id
                         JOIN standards st ON st.id = sc.standard_id
                        WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
                      c.reference_code) AS ref,
             se.applicable, se.justification,
             s.name AS system_name, d.name AS department_name
        FROM v_soa_findings f
        JOIN controls c          ON c.id = f.control_id
        JOIN soa_entries se      ON se.control_id = f.control_id
        LEFT JOIN systems s      ON s.id = f.system_id
        LEFT JOIN departments d  ON d.id = s.department_id
       WHERE ($1::uuid IS NULL OR f.control_id = $1::uuid)
       ORDER BY f.finding_type, f.risks_affected DESC, ref NULLS LAST, c.title, s.name`,
      [controlId ?? null]);
    const counts = Object.fromEntries(FINDING_TYPES.map(t => [t, 0]));
    for (const r of rows) counts[r.finding_type] += 1;
    res.json({ counts, findings: rows });
  } catch (err) { next(err); }
});

router.get('/export', canRead, async (req, res, next) => {
  try {
    const view = await resolveView(req.query.framework);
    const rows = await fetchSoaRows(view);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="statement-of-applicability-${view.key}.csv"`);
    res.send(soaCsv(rows, view));
  } catch (err) { viewError(err, res, next); }
});

// ── Sealed/approved versions (Sprint 2a) ────────────────────────────────────────
// Approving snapshots the full live SoA into an immutable, numbered version — the
// point-in-time artifact an auditor signs off against. Live entries stay editable.

// POST /soa/versions — snapshot + approve the current SoA as the next version.
router.post('/versions', canWrite, async (req, res, next) => {
  try {
    const note = (req.body && typeof req.body.note === 'string') ? req.body.note.trim() || null : null;
    // The version is the RECORD — every control's SoA entry — not a standard's
    // lens. This used to default to the ISO view, which has no requirements loaded
    // on any real instance, so an approved version would have been empty.
    const rows = await fetchSoaRows(ALL_VIEW);
    const applicableCount = rows.filter(r => r.applicable).length;

    // An approved version is immutable; don't let an identical one be approved again.
    const last = await query(
      `SELECT version_no, snapshot FROM soa_versions ORDER BY version_no DESC LIMIT 1`
    );
    if (last.rows.length && soaSignature(rows) === soaSignature(last.rows[0].snapshot)) {
      return res.status(409).json({
        error: `Nothing has changed since version ${last.rows[0].version_no}. Edit the SoA before approving a new version.`,
      });
    }
    const versionNo = (last.rows[0]?.version_no ?? 0) + 1;

    const result = await query(
      `INSERT INTO soa_versions (version_no, snapshot, control_count, applicable_count, note, approved_by)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)
       RETURNING id, version_no, control_count, applicable_count, note, approved_at`,
      [versionNo, JSON.stringify(rows), rows.length, applicableCount, note, req.user.id]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
       VALUES ($1, 'create', 'soa_version', $2, $3)`,
      [req.user.id, result.rows[0].id, `SoA approved as version ${versionNo} (${applicableCount}/${rows.length} applicable)`]
    );

    res.status(201).json({ version: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /soa/versions — approved-version history (metadata only).
router.get('/versions', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT v.id, v.version_no, v.control_count, v.applicable_count, v.note,
             v.approved_at, u.full_name AS approved_by_name
      FROM soa_versions v
      LEFT JOIN users u ON u.id = v.approved_by
      ORDER BY v.version_no DESC
    `);
    res.json({ versions: rows });
  } catch (err) { next(err); }
});

// GET /soa/versions/:id — a single frozen version incl. its snapshot.
router.get('/versions/:id', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT v.id, v.version_no, v.snapshot, v.control_count, v.applicable_count, v.note,
             v.approved_at, u.full_name AS approved_by_name
      FROM soa_versions v
      LEFT JOIN users u ON u.id = v.approved_by
      WHERE v.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Version not found.' });
    res.json({ version: rows[0] });
  } catch (err) { next(err); }
});

// GET /soa/versions/:id/export — CSV of a frozen version.
router.get('/versions/:id/export', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT version_no, snapshot FROM soa_versions WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Version not found.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="statement-of-applicability-v${rows[0].version_no}.csv"`);
    res.send(soaCsv(rows[0].snapshot, ALL_VIEW));
  } catch (err) { next(err); }
});

// ── GET /soa/coverage (Sprint 2b — risk traceability) ───────────────────────────
// Read-only derivation, no new schema. Annex A control "treats" an active risk
// ⟺ the control is deployed on that risk's system (system_controls) AND addresses
// that risk's threat (control_threats) — the exact intersection that already powers
// the risk-detail Mitigating Controls panel, rolled up per control.
//
// ISO 27001:2022 6.1.3 decouples applicability from risk-traceability, so we do NOT
// force a risk link: applicable controls partition into
//   • treated   — treats ≥1 active risk (the governed, traceable core)
//   • baseline  — implemented/partial but treats no identified risk (the legitimate
//                 "passively assumed" majority — justified by non-risk drivers)
//   • untraced  — applicable, not yet implemented, no risk link (feeds the SAP)
// The inverse is the auditor's real question: active risks above appetite with NO
// control treating them = untreated risk.
//
// FRAMEWORK-AWARE since 2026-09-18 (defect 1f). This used to hard-filter
// `standards.code = 'iso27001'` and returned ZERO rows on every real instance:
// ISO/IEC 27001 is registered with 0 controls, and the 106 loaded are NIST CSF.
// So the whole risk-traceability feature — bands, the untreated-risk queue, the
// auditor's question — was dead, and looked merely empty. It now takes the same
// `?framework=` parameter as `GET /soa`, with the same default, so the two halves
// of that page can never again describe different catalogues.
//
// Two shapes, mirroring `fetchSoaRows`:
//   • a named standard — rows are `standard_controls`, and the risk linkage is
//     reached through `control_mappings` to the native controls that implement it;
//   • `all` (the default view) — rows ARE the native `controls`, so the linkage is
//     direct and no mapping hop is needed. Under the old code this view had no
//     coverage at all, which is why the default page never showed a band.
router.get('/coverage', canRead, async (req, res, next) => {
  try {
    const view     = await resolveView(req.query.framework);
    const stdCode  = view.stdCode;   // null for 'all'
    const cfg = await query(`SELECT mandatory_action_score FROM org_config LIMIT 1`);
    const appetiteScore = cfg.rows[0]?.mandatory_action_score ?? 12;

    // Risk linkage per row. For a standard, reached through control_mappings to the
    // native controls that implement each requirement (system_controls ∩
    // control_threats); applicability is merged in below from the derivation.
    // `deployed` was `SELECT TRUE AS deployed` beside an aggregate with no GROUP
    // BY. That subquery returns one row even when nothing matches, so the value
    // was a constant TRUE for every control — including controls deployed
    // nowhere. COUNT(*) > 0 answers the question that was being asked.
    //
    // `any_verified` reads `system_controls.provenance = 'verified_action'`, and
    // nothing in the codebase ever writes that value — all 823 rows say
    // 'recorded' (defect 1d's sibling). It is therefore FALSE for everything and
    // will stay that way until provenance is written at completion. Kept rather
    // than dropped so the query does not have to be rediscovered then; the
    // absence is recorded here so the field is not mistaken for a measurement.
    let controls = stdCode
      ? (await query(`
      SELECT
        sc.id        AS control_id,
        sc.ref_code  AS ref,
        sc.title,
        COALESCE(tr.risks_treated, 0)                          AS risks_treated,
        COALESCE(tr.systems_count, 0)                          AS systems_count,
        tr.max_treated_score,
        COALESCE(dep.deployed, FALSE)                          AS deployed,
        COALESCE(dep.any_verified, FALSE)                      AS any_verified
      FROM standard_controls sc
      JOIN standards st ON st.id = sc.standard_id AND st.code = $1
      LEFT JOIN LATERAL (
        -- ::int, or pg hands back bigint as a STRING and every consumer is
        -- relying on JS coercing "0" > 0 to false. It happens to work; it is not
        -- something to depend on, and a count that arrives as text will
        -- eventually be concatenated by someone.
        SELECT COUNT(DISTINCT r.id)::int        AS risks_treated,
               COUNT(DISTINCT r.system_id)::int AS systems_count,
               MAX(r.risk_score)           AS max_treated_score
        FROM control_mappings cm
        JOIN v_control_presence syc ON syc.control_id = cm.control_id AND syc.status <> 'not_applicable'
        JOIN control_threats ct  ON ct.control_id  = cm.control_id
        JOIN risks r ON r.system_id = syc.system_id AND r.threat_id = ct.threat_id AND r.is_active = TRUE
        WHERE cm.standard_control_id = sc.id
      ) tr ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) > 0 AS deployed,
               bool_or(syc.provenance = 'verified_action') AS any_verified
        FROM control_mappings cm
        JOIN v_control_presence syc ON syc.control_id = cm.control_id AND syc.status <> 'not_applicable'
        WHERE cm.standard_control_id = sc.id
      ) dep ON TRUE
    `, [stdCode])).rows
      : (await query(`
      SELECT
        c.id    AS control_id,
        COALESCE(pm.ref, '')                                  AS ref,
        c.title,
        COALESCE(se.applicable, FALSE)                        AS applicable,
        COALESCE(vci.implementation_status, 'not_implemented') AS implementation_status,
        COALESCE(se.drivers, '{}')                            AS drivers,
        COALESCE(tr.risks_treated, 0)                         AS risks_treated,
        COALESCE(tr.systems_count, 0)                         AS systems_count,
        tr.max_treated_score,
        COALESCE(dep.deployed, FALSE)                         AS deployed,
        COALESCE(dep.any_verified, FALSE)                     AS any_verified
      FROM controls c
      LEFT JOIN soa_entries se ON se.control_id = c.id
      LEFT JOIN v_control_implementation vci ON vci.control_id = c.id
      LEFT JOIN LATERAL (
        SELECT sc.ref_code AS ref
        FROM control_mappings cm
        JOIN standard_controls sc ON sc.id = cm.standard_control_id
        JOIN standards s          ON s.id  = sc.standard_id
        WHERE cm.control_id = c.id
        ORDER BY s.sort_index, sc.sort_index LIMIT 1
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        -- ::int, or pg hands back bigint as a STRING and every consumer is
        -- relying on JS coercing "0" > 0 to false. It happens to work; it is not
        -- something to depend on, and a count that arrives as text will
        -- eventually be concatenated by someone.
        SELECT COUNT(DISTINCT r.id)::int        AS risks_treated,
               COUNT(DISTINCT r.system_id)::int AS systems_count,
               MAX(r.risk_score)           AS max_treated_score
        FROM v_control_presence syc
        JOIN control_threats ct ON ct.control_id = syc.control_id AND syc.status <> 'not_applicable'
        JOIN risks r ON r.system_id = syc.system_id AND r.threat_id = ct.threat_id AND r.is_active = TRUE
        WHERE syc.control_id = c.id
      ) tr ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) > 0 AS deployed,
               bool_or(syc.provenance = 'verified_action') AS any_verified
        FROM v_control_presence syc WHERE syc.control_id = c.id AND syc.status <> 'not_applicable'
      ) dep ON TRUE
    `)).rows;

    // The custom view is the record narrowed to unmapped objectives; narrow the
    // coverage the same way so the two halves of the page describe the same rows.
    if (view.customOnly) {
      const ids = new Set((await fetchSoaRows(view)).map(r => r.control_id));
      controls = controls.filter(r => ids.has(r.control_id));
    }

    // A requirement's applicability, status and drivers are DERIVED from the
    // controls mapped to it — the same derivation GET /soa uses, so the two halves
    // of the page cannot disagree about a row.
    if (stdCode) {
      const derived = new Map((await fetchSoaRows(view)).map(r => [r.control_id, r]));
      for (const r of controls) {
        const d = derived.get(r.control_id) || {};
        r.applicable            = !!d.applicable;
        r.implementation_status = d.implementation_status || 'not_implemented';
        r.drivers               = d.drivers || [];
        r.requirement_state     = d.requirement_state;
      }
    }

    for (const r of controls) {
      r.theme   = themeForRef(r.ref);
      r.drivers = r.drivers || [];
      if (!r.applicable) {
        r.band = 'not_applicable';
      } else if (r.risks_treated > 0) {
        r.band = 'treated';
      } else if (r.implementation_status === 'implemented' || r.implementation_status === 'partial') {
        r.band = 'baseline';
      } else {
        r.band = 'untraced';
      }
    }
    controls.sort(byRef);

    // Inverse view: active risks at/above appetite with no control treating them.
    const { rows: untreated } = await query(`
      SELECT r.id AS risk_id, r.risk_score,
             sys.name AS system_name, t.name AS threat_name
      FROM risks r
      JOIN systems sys ON sys.id = r.system_id
      JOIN threats t   ON t.id   = r.threat_id
      WHERE r.is_active = TRUE
        AND r.risk_score >= $1
        AND NOT EXISTS (
          SELECT 1
          FROM v_control_presence sc
          JOIN control_threats ct ON ct.control_id = sc.control_id AND ct.threat_id = r.threat_id
          WHERE sc.system_id = r.system_id AND sc.status <> 'not_applicable'
        )
      ORDER BY r.risk_score DESC, t.name ASC
    `, [appetiteScore]);

    const applicable = controls.filter(r => r.applicable);
    const summary = {
      applicable:      applicable.length,
      treated:         applicable.filter(r => r.band === 'treated').length,
      baseline:        applicable.filter(r => r.band === 'baseline').length,
      untraced:        applicable.filter(r => r.band === 'untraced').length,
      untreated_risks: untreated.length,
    };

    res.json({
      framework: view.key, appetite_score: appetiteScore,
      summary, controls, untreated_risks: untreated,
    });
  } catch (err) { viewError(err, res, next); }
});

module.exports = router;
module.exports.deriveRequirement = deriveRequirement;
