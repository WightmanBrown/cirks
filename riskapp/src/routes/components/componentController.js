'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const net = require('net');
const { query, withActor } = require('../../db/pool');

// Policies & documents lifecycle (v139): API field → column.
const DOCUMENT_FIELDS = {
  document_kind: 'document_kind', document_version: 'document_version',
  document_owner_id: 'document_owner_id', document_approved_by: 'document_approved_by',
  document_approved_on: 'document_approved_on', document_next_review: 'document_next_review',
  document_url: 'document_url',
};
// Dates returned as text — see the search query.
const DOCUMENT_RETURN = Object.values(DOCUMENT_FIELDS)
  .map(c => (['document_approved_on', 'document_next_review'].includes(c) ? `${c}::text AS ${c}` : c)).join(', ');
const DOCUMENT_KINDS = new Set(['policy', 'standard', 'procedure', 'guideline']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// v141: the database refuses a published document with no review date. Say so
// plainly rather than surface a constraint name.
const NEEDS_REVIEW_DATE = 'A published policy or document must have a review date — set its next review date (it can be saved together with publishing it).';
function isReviewDateRule(err) {
  return err?.code === '23514' && err?.constraint === 'chk_published_document_has_review_date';
}

function validateDocumentFields(f) {
  if (f.document_kind != null && !DOCUMENT_KINDS.has(f.document_kind)) {
    return 'document_kind must be policy, standard, procedure or guideline.';
  }
  for (const col of ['document_approved_on', 'document_next_review']) {
    if (f[col] != null && (!ISO_DATE.test(f[col]) || isNaN(new Date(f[col]).getTime()))) {
      return `${col} must be a date (YYYY-MM-DD).`;
    }
  }
  if (f.document_url != null && !/^https?:\/\//i.test(f.document_url)) {
    return 'document_url must be an http(s) link to where the document lives.';
  }
  if (f.document_version != null && typeof f.document_version !== 'string') return 'document_version must be text.';
  return null;
}

const VALID_TYPES = new Set(['people', 'process', 'information', 'technology', 'facility']);

// Accepts a host address (IPv4/IPv6) or a CIDR range (addr/maskbits). The DB inet
// column is the final arbiter; this just gives a clean 400 instead of a 500.
function isValidInet(value) {
  if (typeof value !== 'string') return false;
  const [addr, mask, ...rest] = value.trim().split('/');
  if (rest.length) return false;
  const fam = net.isIP(addr);            // 0 = invalid, 4 = IPv4, 6 = IPv6
  if (fam === 0) return false;
  if (mask !== undefined) {
    const m = Number(mask);
    const max = fam === 6 ? 128 : 32;
    if (!Number.isInteger(m) || m < 0 || m > max) return false;
  }
  return true;
}

// The component catalogue is org-wide readable AND org-wide writable to anyone
// holding components.write. It deliberately has NO departmental ownership — see
// docs/component-ownership.md.
//
// In short: the most-used components span every department in the organisation
// (IT Administrators across 12, Crowdstrike Falcon Agent across 12), so "owning
// department" was incoherent for exactly the entries that matter most. Worse, a
// write gate keyed to one department pushes everyone else toward creating a
// second copy — and duplication is the one failure a shared catalogue cannot
// absorb, because it destroys the question the library exists to answer:
// "which systems run this?"
//
// Writes are therefore gated by CAPABILITY alone, consistently for every
// component type.

// GET /components?q=...&type=...&limit=...&all=1
// Returns { components: [...] }. Pass `all=1` to remove the limit.
async function searchComponents(req, res, next) {
  const { q, type, limit, all } = req.query;
  const wantAll  = all === '1' || all === 'true';
  const safeLimit = Math.min(parseInt(limit) || 15, 500);

  if (type && !VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type: ${type}` });
  }

  try {
    const conditions = [];
    const params     = [];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`cc.name ILIKE $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`cc.component_type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let limitClause = '';
    if (!wantAll) {
      params.push(safeLimit);
      limitClause = `LIMIT $${params.length}`;
    }

    const result = await query(
      `SELECT cc.id, cc.component_type, cc.name, cc.status, cc.description, cc.instantiation,
              -- DATE columns as text: node-pg turns a DATE into local midnight, which
              -- serialises as the PREVIOUS day in UTC during British Summer Time.
              cc.document_kind, cc.document_version, cc.document_next_review::text AS document_next_review, cc.document_url,
              -- v139: the state as it reads, and whether a review has lapsed.
              (SELECT st.status FROM v_component_state st WHERE st.component_id = cc.id) AS effective_status,
              (SELECT st.review_overdue FROM v_component_state st WHERE st.component_id = cc.id) AS review_overdue,
              cc.created_at, cc.is_host, cc.hostname,
              u.id         AS created_by_id,
              u.full_name  AS created_by_name,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ip.id, 'ip_address', abbrev(ip.ip_address), 'label', ip.label) ORDER BY ip.ip_address)
                 FROM component_ip_addresses ip WHERE ip.component_id = cc.id),
                '[]'::json
              ) AS ip_addresses,
              -- max_risk_score is the INDIRECT signal: the worst risk on any
              -- system this component happens to sit in. A component on MIGNet
              -- scores high because MIGNet does, whether or not it is implicated.
              (SELECT MAX(r.risk_score)
               FROM risks r
               JOIN system_components sc2 ON sc2.system_id = r.system_id
               WHERE sc2.component_id = cc.id AND r.is_active = TRUE
              ) AS max_risk_score,
              -- These two are the DIRECT signal, and the distinction is the whole
              -- point: an analyst deliberately marked this component on the risk
              -- as a reason the threat succeeds (Risk detail → Vulnerable System
              -- Components, written to risk_components). Until now that judgement
              -- was invisible everywhere outside the risk page.
              (SELECT COUNT(*)::int
                 FROM risk_components rc
                 JOIN risks r ON r.id = rc.risk_id AND r.is_active = TRUE
                WHERE rc.component_id = cc.id
              ) AS vulnerable_risk_count,
              (SELECT MAX(r.risk_score)
                 FROM risk_components rc
                 JOIN risks r ON r.id = rc.risk_id AND r.is_active = TRUE
                WHERE rc.component_id = cc.id
              ) AS vulnerable_max_score,
              COALESCE(
                -- v_component_presence (v137): an organisational component is on
                -- every system that relies on it, not just where it was recorded.
                (SELECT json_agg(json_build_object('id', sys.id, 'name', sys.name) ORDER BY sys.name)
                 FROM v_component_presence sc
                 JOIN systems sys ON sys.id = sc.system_id
                 WHERE sc.component_id = cc.id),
                '[]'::json
              ) AS systems,
              -- The control objectives this component helps deliver. For a policy
              -- or document this, not a system count, is the useful fact: the
              -- AUP belongs to the objectives it supports, not to any system.
              COALESCE(
                (SELECT json_agg(json_build_object('id', c.id, 'title', c.title,
                   'ref', (SELECT sc.ref_code FROM control_mappings cm
                             JOIN standard_controls sc ON sc.id = cm.standard_control_id
                             JOIN standards st ON st.id = sc.standard_id
                            WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1))
                   ORDER BY c.title)
                 FROM control_component_links l JOIN controls c ON c.id = l.control_id
                 WHERE l.component_id = cc.id),
                '[]'::json
              ) AS controls
         FROM control_components cc
         LEFT JOIN users       u ON u.id = cc.created_by
       ${where}
       ORDER BY cc.component_type, cc.name
       ${limitClause}`,
      params
    );

    res.json({ components: result.rows });
  } catch (err) {
    next(err);
  }
}

// POST /components — create a new library component
async function createComponent(req, res, next) {
  const { component_type, name, description, status, notes, is_host, hostname } = req.body || {};

  if (!component_type || !VALID_TYPES.has(component_type)) {
    return res.status(400).json({
      error: `component_type must be one of: ${[...VALID_TYPES].join(', ')}.`,
    });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required.' });
  }
  // Only technology components may be hosts (mirrors the DB CHECK).
  if (is_host === true && component_type !== 'technology') {
    return res.status(400).json({ error: 'Only a technology component can be a host.' });
  }

  // A new policy or document can carry its lifecycle from the start (v139), so
  // it can be created Published with its review date in one step (v141).
  const docFields = {};
  for (const [key, col] of Object.entries(DOCUMENT_FIELDS)) {
    if (req.body?.[key] != null && req.body[key] !== '') docFields[col] = req.body[key];
  }
  if (Object.keys(docFields).length && component_type !== 'information') {
    return res.status(400).json({ error: 'Only a policy or document has a kind, version, approval and review date.' });
  }
  const docErr = validateDocumentFields(docFields);
  if (docErr) return res.status(400).json({ error: docErr });
  const docCols = Object.keys(docFields);

  try {
    const { rows } = await query(
      `INSERT INTO control_components
         (component_type, name, description, status, notes, created_by,
          is_host, hostname${docCols.map(c => `, ${c}`).join('')})
       VALUES ($1, $2, $3, COALESCE($4, 'unknown'::component_status), $5, $6,
               COALESCE($7, FALSE), $8${docCols.map((_, i) => `, $${9 + i}`).join('')})
       RETURNING id, component_type, name, description, status, created_at,
                 is_host, hostname, ${DOCUMENT_RETURN}`,
      [
        component_type,
        name.trim(),
        description?.trim() || null,
        status || null,
        notes?.trim() || null,
        req.user.id,
        is_host === true,
        is_host === true ? (hostname?.trim() || null) : null,
        ...docCols.map(c => docFields[c]),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (isReviewDateRule(err)) return res.status(400).json({ error: NEEDS_REVIEW_DATE });
    next(err);
  }
}

// PATCH /components/:id — edit a library component (name/type/description/status,
// plus host marker + hostname). Gated by capability only — no owning department.
async function updateComponent(req, res, next) {
  const { id } = req.params;
  const { component_type, name, description, status, is_host, hostname } = req.body || {};
  // Does it exist once for the organisation, or once per system (v137, §5)?
  // null clears it back to "not stated"; omitted leaves it alone.
  const hasInstantiation = Object.prototype.hasOwnProperty.call(req.body || {}, 'instantiation');
  const { instantiation } = req.body || {};
  if (hasInstantiation && instantiation !== null && !['per_system', 'organisational'].includes(instantiation)) {
    return res.status(400).json({ error: "instantiation must be 'per_system', 'organisational' or null." });
  }

  // Policies & documents lifecycle (v139). Each field present in the body is set
  // (null clears it); absent fields are left alone. Validated here so a mistake is
  // a clear 400 rather than a constraint error.
  const docFields = {};
  for (const [key, col] of Object.entries(DOCUMENT_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) docFields[col] = req.body[key] === '' ? null : req.body[key];
  }
  const docErr = validateDocumentFields(docFields);
  if (docErr) return res.status(400).json({ error: docErr });

  if (component_type !== undefined && !VALID_TYPES.has(component_type)) {
    return res.status(400).json({
      error: `component_type must be one of: ${[...VALID_TYPES].join(', ')}.`,
    });
  }
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty.' });
  }

  try {
    // The host marker only makes sense on a technology component. Validate against
    // the effective type (incoming change or current value) for a clean 400.
    if (is_host === true) {
      const { rows: cur } = await query('SELECT component_type FROM control_components WHERE id = $1', [id]);
      if (!cur.length) return res.status(404).json({ error: 'Component not found.' });
      const effectiveType = component_type || cur[0].component_type;
      if (effectiveType !== 'technology') {
        return res.status(400).json({ error: 'Only a technology component can be a host.' });
      }
    }

    if (Object.keys(docFields).length) {
      const { rows: cur } = await query('SELECT component_type FROM control_components WHERE id = $1', [id]);
      if (!cur.length) return res.status(404).json({ error: 'Component not found.' });
      if ((component_type || cur[0].component_type) !== 'information') {
        return res.status(400).json({ error: 'Only a policy or document has a kind, version, approval and review date.' });
      }
      for (const col of ['document_owner_id', 'document_approved_by']) {
        if (docFields[col]) {
          const { rows: u } = await query('SELECT 1 FROM users WHERE id = $1', [docFields[col]]);
          if (!u.length) return res.status(400).json({ error: `${col} is not a known user.` });
        }
      }
    }
    const docCols = Object.keys(docFields);
    const docSet = docCols.map((col, i) => `${col} = $${10 + i}`).join(',\n         ');

    // is_host/hostname use ($n IS NULL ? keep : set) so an omitted field is left
    // untouched; clearing the host marker also clears the hostname. Run as the
    // caller: changing instantiation fires a trigger that withdraws per-system
    // work and audits the answer, and it should name who gave it.
    const { rows } = await withActor(req.user.id, (db) => db.query(
      `UPDATE control_components SET
         component_type = COALESCE($2, component_type),
         name           = COALESCE($3, name),
         description    = COALESCE($4, description),
         status         = COALESCE($5::component_status, status),
         is_host        = COALESCE($6, is_host),
         hostname       = CASE
                            WHEN $6 = FALSE THEN NULL
                            WHEN $7::varchar IS NOT NULL THEN $7::varchar
                            ELSE hostname
                          END,
         instantiation  = CASE WHEN $8 THEN $9 ELSE instantiation END,
         ${docSet ? docSet + ',' : ''}
         updated_at     = now()
       WHERE id = $1
       RETURNING id, component_type, name, description, status,
                 is_host, hostname, instantiation, ${DOCUMENT_RETURN}`,
      [
        id,
        component_type || null,
        name?.trim() || null,
        description?.trim() ?? null,
        status || null,
        is_host === undefined ? null : is_host === true,
        hostname === undefined ? null : (hostname?.trim() || null),
        hasInstantiation,
        hasInstantiation ? instantiation : null,
        ...docCols.map(c => docFields[c]),
      ]
    ));
    if (!rows.length) return res.status(404).json({ error: 'Component not found.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.hint === 'guideline_no_control') return res.status(409).json({ error: err.message });
    if (isReviewDateRule(err)) return res.status(400).json({ error: NEEDS_REVIEW_DATE });
    next(err);
  }
}

// POST /components/:id/ips — attach an IP address to a host.
async function addComponentIp(req, res, next) {
  const { id } = req.params;
  const { ip_address, label } = req.body || {};

  if (!ip_address || !isValidInet(ip_address)) {
    return res.status(400).json({ error: 'A valid ip_address (IPv4/IPv6 host or CIDR) is required.' });
  }

  try {
    const { rows: comp } = await query(
      'SELECT is_host FROM control_components WHERE id = $1', [id]
    );
    if (!comp.length) return res.status(404).json({ error: 'Component not found.' });
    if (!comp[0].is_host) {
      return res.status(400).json({ error: 'Only a host component can have IP addresses. Mark it as a host first.' });
    }

    const { rows } = await query(
      `INSERT INTO component_ip_addresses (component_id, ip_address, label, created_by)
       VALUES ($1, $2::inet, $3, $4)
       ON CONFLICT (component_id, ip_address) DO NOTHING
       RETURNING id, abbrev(ip_address) AS ip_address, label, created_at`,
      [id, ip_address.trim(), label?.trim() || null, req.user.id]
    );
    if (!rows.length) return res.status(409).json({ error: 'That IP is already on this host.' });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// DELETE /components/:id/ips/:ipId — remove an IP from a host.
async function removeComponentIp(req, res, next) {
  const { id, ipId } = req.params;
  try {
    const result = await query(
      'DELETE FROM component_ip_addresses WHERE id = $1 AND component_id = $2',
      [ipId, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'IP address not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// GET /components/:id — full detail: component + linked systems with active risks + threats
async function getComponentDetail(req, res, next) {
  const { id } = req.params;
  try {
    const { rows } = await query(
      `SELECT
         cc.id,
         cc.component_type,
         cc.name,
         cc.status, cc.instantiation,
         cc.document_kind, cc.document_version, cc.document_owner_id, cc.document_approved_by,
         cc.document_approved_on::text AS document_approved_on,
         cc.document_next_review::text AS document_next_review, cc.document_url,
         (SELECT full_name FROM users WHERE id = cc.document_owner_id)    AS document_owner_name,
         (SELECT full_name FROM users WHERE id = cc.document_approved_by) AS document_approved_by_name,
         -- Owner and approver are role-driven, so the page names the role too.
         (SELECT role FROM users WHERE id = cc.document_owner_id)         AS document_owner_role,
         (SELECT role FROM users WHERE id = cc.document_approved_by)      AS document_approved_by_role,
         (SELECT st.status FROM v_component_state st WHERE st.component_id = cc.id)         AS effective_status,
         (SELECT st.review_overdue FROM v_component_state st WHERE st.component_id = cc.id) AS review_overdue,
         -- The response to the overdue-review finding (v140), if any.
         (SELECT json_build_object('id', a.id, 'status', a.status, 'title', a.title)
            FROM security_actions a
           WHERE a.origin = 'document_review' AND a.subject_id = cc.id
             AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')) AS review_action,
         (SELECT json_build_object('id', e.id, 'expires_at', e.expires_at,
                                   'justification', e.justification, 'accepted_by_name', eu.full_name)
            FROM exceptions e LEFT JOIN users eu ON eu.id = e.accepted_by
           WHERE e.origin = 'document_review' AND e.subject_id = cc.id AND e.status = 'active') AS review_exception,
         cc.description,
         cc.created_at,
         cc.is_host,
         cc.hostname,
         u.full_name  AS created_by_name,
         COALESCE((
           SELECT json_agg(json_build_object('id', ip.id, 'ip_address', abbrev(ip.ip_address), 'label', ip.label) ORDER BY ip.ip_address)
           FROM component_ip_addresses ip WHERE ip.component_id = cc.id
         ), '[]'::json) AS ip_addresses,
         -- The risks on which this component was DELIBERATELY named as a reason
         -- the threat succeeds (risk_components). Distinct from the per-system
         -- risks below, which are simply everything live on a system it sits in:
         -- one is a judgement about this component, the other is proximity.
         COALESCE((
           SELECT json_agg(json_build_object(
             'risk_id',     r.id,
             'risk_score',  r.risk_score,
             'threat_name', t.name,
             'system_id',   sys.id,
             'system_name', sys.name,
             'marked_at',   rc.added_at,
             'marked_by',   mu.full_name
           ) ORDER BY r.risk_score DESC NULLS LAST)
           FROM risk_components rc
           JOIN risks   r   ON r.id   = rc.risk_id AND r.is_active = TRUE
           JOIN threats t   ON t.id   = r.threat_id
           JOIN systems sys ON sys.id = r.system_id
           LEFT JOIN users mu ON mu.id = rc.added_by
           WHERE rc.component_id = cc.id
         ), '[]'::json) AS vulnerable_on,
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'id',              sys.id,
               'name',            sys.name,
               'department_name', sdept.name,
               'max_risk_score',  (
                 SELECT MAX(r.risk_score)
                 FROM risks r
                 WHERE r.system_id = sys.id AND r.is_active = TRUE
               ),
               'risks', COALESCE((
                 SELECT json_agg(json_build_object(
                   'id',              r.id,
                   'risk_score',      r.risk_score,
                   'threat_name',     t.name,
                   'threat_category', t.threat_category
                 ) ORDER BY r.risk_score DESC NULLS LAST)
                 FROM risks r
                 JOIN threats t ON t.id = r.threat_id
                 WHERE r.system_id = sys.id AND r.is_active = TRUE
               ), '[]'::json)
             )
             ORDER BY sys.name
           )
           FROM v_component_presence sc
           JOIN systems    sys   ON sys.id   = sc.system_id
           LEFT JOIN departments sdept ON sdept.id = sys.department_id
           WHERE sc.component_id = cc.id
         ), '[]'::json) AS systems
       FROM control_components cc
       LEFT JOIN users       u ON u.id  = cc.created_by
       WHERE cc.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Component not found.' });
    res.json({ component: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchComponents, createComponent,
  isReviewDateRule, NEEDS_REVIEW_DATE,
  updateComponent, getComponentDetail, addComponentIp, removeComponentIp,
};
