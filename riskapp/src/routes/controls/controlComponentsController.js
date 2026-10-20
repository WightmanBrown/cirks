'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

const VALID_TYPES    = new Set(['people', 'process', 'information', 'technology', 'facility']);
const VALID_STATUSES = new Set(['operational', 'degraded', 'planned', 'decommissioned', 'unknown']);

// GET /controls/:id/components
async function getControlComponents(req, res, next) {
  const { id } = req.params;

  try {
    const controlCheck = await query(
      `SELECT id FROM controls WHERE id = $1`,
      [id]
    );
    if (controlCheck.rows.length === 0) {
      return res.status(404).json({ error: `Control ${id} not found.` });
    }

    const [componentsResult] = await Promise.all([
      query(
        `SELECT
           cc.id,
           cc.component_type,
           cc.name,
           cc.status,
           cc.description,
           cc.notes,
           cc.last_verified_at,
           ccl.role,
           cc.created_at,
           cc.updated_at
         FROM control_component_links ccl
         JOIN control_components cc ON cc.id = ccl.component_id
         WHERE ccl.control_id = $1
         ORDER BY cc.component_type, cc.name`,
        [id]
      ),
    ]);

    res.json({
      components:    componentsResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /controls/:id/components
// Body may contain either:
//   existing_component_id — link an existing component (no creation)
//   name + component_type + ... — create a new component and link it
async function createControlComponent(req, res, next) {
  const { id: controlId } = req.params;
  const {
    existing_component_id,
    name,
    component_type,
    status      = 'unknown',
    description,
    notes,
    role,
  } = req.body;

  try {
    const controlCheck = await query(
      `SELECT id FROM controls WHERE id = $1`,
      [controlId]
    );
    if (controlCheck.rows.length === 0) {
      return res.status(404).json({ error: `Control ${controlId} not found.` });
    }

    // ── Link existing ────────────────────────────────────────────────────────
    if (existing_component_id) {
      const compCheck = await query(
        `SELECT id, component_type, name, status, description, notes, created_at, updated_at
         FROM control_components WHERE id = $1`,
        [existing_component_id]
      );
      if (compCheck.rows.length === 0) {
        return res.status(404).json({ error: `Component ${existing_component_id} not found.` });
      }

      const linkCheck = await query(
        `SELECT 1 FROM control_component_links WHERE control_id = $1 AND component_id = $2`,
        [controlId, existing_component_id]
      );
      if (linkCheck.rows.length > 0) {
        return res.status(409).json({ error: 'This component is already linked to this control.' });
      }

      await query(
        `INSERT INTO control_component_links (control_id, component_id, role, created_by)
         VALUES ($1, $2, $3, $4)`,
        [controlId, existing_component_id, role?.trim() || null, req.user.id]
      );

      return res.status(201).json({
        component: { ...compCheck.rows[0], role: role?.trim() || null },
      });
    }

    // ── Create new + link ────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    if (!component_type || !VALID_TYPES.has(component_type)) {
      return res.status(400).json({
        error: `component_type must be one of: ${[...VALID_TYPES].join(', ')}.`,
      });
    }
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({
        error: `status must be one of: ${[...VALID_STATUSES].join(', ')}.`,
      });
    }

    const compResult = await query(
      `INSERT INTO control_components
         (component_type, name, description, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, component_type, name, status, description, notes, created_at, updated_at`,
      [
        component_type,
        name.trim(),
        description?.trim() || null,
        notes?.trim() || null,
        status,
        req.user.id,
      ]
    );
    const component = compResult.rows[0];

    await query(
      `INSERT INTO control_component_links (control_id, component_id, role, created_by)
       VALUES ($1, $2, $3, $4)`,
      [controlId, component.id, role?.trim() || null, req.user.id]
    );

    res.status(201).json({ component: { ...component, role: role?.trim() || null } });
  } catch (err) {
    // v139: a guideline is advisory and cannot deliver a control.
    if (err.hint === 'guideline_no_control') return res.status(409).json({ error: err.message });
    // v141: a new document cannot be created already Published without a review date.
    if (err?.code === '23514' && err?.constraint === 'chk_published_document_has_review_date') {
      return res.status(400).json({ error: 'A published policy or document must have a review date — create it unpublished, then publish it with its date.' });
    }
    next(err);
  }
}

// PATCH /controls/:controlId/components/:componentId
async function updateControlComponent(req, res, next) {
  const { controlId, componentId } = req.params;
  const {
    name,
    status,
    description,
    notes,
    role,
  } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty.' });
  }
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `status must be one of: ${[...VALID_STATUSES].join(', ')}.`,
    });
  }

  try {
    const linkCheck = await query(
      `SELECT 1 FROM control_component_links WHERE control_id = $1 AND component_id = $2`,
      [controlId, componentId]
    );
    if (linkCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Component not found on this control.' });
    }

    const [compResult] = await Promise.all([
      query(
        `UPDATE control_components
         SET
           name        = COALESCE($2, name),
           status      = COALESCE($3, status),
           description = COALESCE($4, description),
           notes       = COALESCE($5, notes),
           updated_at  = NOW()
         WHERE id = $1
         RETURNING id, component_type, name, status, description, notes, updated_at`,
        [
          componentId,
          name?.trim() ?? null,
          status ?? null,
          description !== undefined ? (description?.trim() || null) : undefined,
          notes !== undefined ? (notes?.trim() || null) : undefined,
        ]
      ),
      role !== undefined
        ? query(
            `UPDATE control_component_links SET role = $3 WHERE control_id = $1 AND component_id = $2`,
            [controlId, componentId, role?.trim() || null]
          )
        : Promise.resolve(),
    ]);

    const updatedRole = role !== undefined
      ? role?.trim() || null
      : (await query(
          `SELECT role FROM control_component_links WHERE control_id = $1 AND component_id = $2`,
          [controlId, componentId]
        )).rows[0]?.role;

    res.json({ component: { ...compResult.rows[0], role: updatedRole } });
  } catch (err) {
    next(err);
  }
}

// DELETE /controls/:controlId/components/:componentId
async function unlinkControlComponent(req, res, next) {
  const { controlId, componentId } = req.params;

  try {
    const result = await query(
      `DELETE FROM control_component_links
       WHERE control_id = $1 AND component_id = $2`,
      [controlId, componentId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Component not found on this control.' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getControlComponents,
  createControlComponent,
  updateControlComponent,
  unlinkControlComponent,
};
