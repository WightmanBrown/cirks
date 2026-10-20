'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }      = require('express');
const authenticate    = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }       = require('../../db/pool');

const router = Router();
router.use(authenticate);

const canManage = requireCapability('departments.write');

// POST /departments — create a new department
router.post('/', canManage, async (req, res, next) => {
  try {
    const { name, description, owner_user_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const { rows } = await query(
      `INSERT INTO departments (name, description, owner_user_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, owner_user_id`,
      [name.trim(), description?.trim() || null, owner_user_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /departments — list with owner/manager staff + roll-up counts
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        d.id,
        d.name,
        d.description,
        (SELECT STRING_AGG(u.full_name, ', ' ORDER BY u.full_name)
           FROM users u
          WHERE u.department_id = d.id
            AND u.role = 'information_asset_owner'
            AND u.is_active = TRUE
        ) AS iao_names,
        (SELECT STRING_AGG(u.full_name, ', ' ORDER BY u.full_name)
           FROM users u
          WHERE u.department_id = d.id
            AND u.role = 'information_asset_manager'
            AND u.is_active = TRUE
        ) AS iam_names,
        (SELECT COUNT(*)::int FROM information_assets ia WHERE ia.department_id = d.id) AS information_asset_count,
        (SELECT COUNT(*)::int FROM systems sy WHERE sy.department_id = d.id)            AS system_count,
        (SELECT COUNT(*)::int FROM business_services bs WHERE bs.department_id = d.id)  AS service_count,
        (SELECT COUNT(*)::int
           FROM impact_tables it
          WHERE it.department_id = d.id AND it.scope = 'department'
        ) AS impact_table_count,
        (SELECT COUNT(*)::int
           FROM risks r JOIN systems s ON s.id = r.system_id
          WHERE s.department_id = d.id AND r.is_active
        ) AS active_risk_count
      FROM departments d
      ORDER BY d.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /departments/:id — full department summary (profile + staff + roll-ups)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const dept = await query(
      `SELECT d.id, d.name, d.description, d.owner_user_id,
              o.full_name AS owner_name, o.email AS owner_email,
              d.created_at, d.updated_at
         FROM departments d
         LEFT JOIN users o ON o.id = d.owner_user_id
        WHERE d.id = $1`,
      [id]
    );
    if (dept.rowCount === 0) return res.status(404).json({ error: 'Department not found.' });

    const [staff, counts, systems, assets, services] = await Promise.all([
      query(
        `SELECT id, full_name, email, role, is_active
           FROM users WHERE department_id = $1
          ORDER BY is_active DESC, role, full_name`, [id]),
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM information_assets ia WHERE ia.department_id = $1) AS asset_count,
           (SELECT COUNT(*)::int FROM systems sy WHERE sy.department_id = $1)            AS system_count,
           (SELECT COUNT(*)::int FROM business_services bs WHERE bs.department_id = $1)  AS service_count,
           (SELECT COUNT(*)::int FROM impact_tables it WHERE it.department_id = $1 AND it.scope = 'department') AS impact_table_count,
           (SELECT COUNT(*)::int FROM users u WHERE u.department_id = $1 AND u.is_active) AS active_user_count,
           (SELECT COUNT(*)::int FROM risks r JOIN systems s ON s.id = r.system_id
             WHERE s.department_id = $1 AND r.is_active) AS active_risk_count,
           (SELECT COUNT(*)::int FROM v_active_exceptions e WHERE e.department_id = $1) AS active_exception_count`,
        [id]),
      query(
        `SELECT sy.id, sy.name, sy.is_shared,
                (SELECT MAX(r.risk_score) FROM risks r WHERE r.system_id = sy.id AND r.is_active) AS max_risk_score
           FROM systems sy WHERE sy.department_id = $1 ORDER BY sy.name`, [id]),
      query(
        `SELECT id, name, is_shared FROM information_assets WHERE department_id = $1 ORDER BY name`, [id]),
      query(
        `SELECT id, name, is_shared FROM business_services WHERE department_id = $1 ORDER BY name`, [id]),
    ]);

    res.json({
      ...dept.rows[0],
      ...counts.rows[0],
      staff:    staff.rows,
      systems:  systems.rows,
      assets:   assets.rows,
      services: services.rows,
    });
  } catch (err) { next(err); }
});

// PATCH /departments/:id — edit name / description / owner
router.patch('/:id', canManage, async (req, res, next) => {
  try {
    const { name, description, owner_user_id } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be blank.' });
    }
    const { rows, rowCount } = await query(
      `UPDATE departments SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         owner_user_id = COALESCE($3, owner_user_id),
         updated_at    = now()
       WHERE id = $4
       RETURNING id, name, description, owner_user_id`,
      [name?.trim() ?? null, description?.trim() ?? null, owner_user_id ?? null, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Department not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /departments/:id
router.delete('/:id', canManage, async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM departments WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Department not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
