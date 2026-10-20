'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query, withActor } = require('../../db/pool');
const { normaliseReference, referenceConflict } = require('./referenceCode');


module.exports = async function updateControl(req, res, next) {
  try {
    const { id } = req.params;
    // An objective's status is derived (v124) and cannot be set.
    const { is_baseline } = req.body;
    if (req.body.status !== undefined) {
      return res.status(400).json({ error: 'status is derived from the SoA and the maturity rating; it cannot be set.' });
    }
    const ref = normaliseReference(req.body.reference_code);
    if (ref.error) return res.status(400).json({ error: ref.error });

    // Title and description are the objective's own words — what it asks. The
    // title must stay unique: the mappings import resolves objectives by title,
    // so two objectives with one title would make a mapping ambiguous.
    let title;
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
        return res.status(400).json({ error: 'title cannot be blank.' });
      }
      title = req.body.title.trim();
      if (title.length > 500) return res.status(400).json({ error: 'title must be 500 characters or fewer.' });
      const clash = await query(
        `SELECT 1 FROM controls WHERE lower(btrim(title)) = lower($1) AND id <> $2`, [title, id]);
      if (clash.rows.length) {
        return res.status(409).json({ error: `Another control objective is already titled "${title}".` });
      }
    }
    let description;
    if (req.body.description !== undefined) {
      if (req.body.description !== null && typeof req.body.description !== 'string') {
        return res.status(400).json({ error: 'description must be text.' });
      }
      description = req.body.description?.trim() || null;
    }
    // How it is delivered (v127): organisation | group | system, or null to return
    // it to "not stated". One mode per control.
    const DELIVERY = new Set(['organisation', 'group', 'system']);
    const delivery = req.body.delivery;
    if (delivery !== undefined && delivery !== null && !DELIVERY.has(delivery)) {
      return res.status(400).json({ error: 'delivery must be organisation, group or system (or null for not stated).' });
    }
    const before = (title !== undefined || description !== undefined || delivery !== undefined)
      ? (await query(`SELECT title, description, delivery FROM controls WHERE id = $1`, [id])).rows[0]
      : null;

    const sets = [];
    const params = [id];

    if (is_baseline !== undefined) {
      params.push(Boolean(is_baseline));
      sets.push(`is_baseline = $${params.length}`);
    }

    if (ref.value !== undefined) {
      params.push(ref.value);
      sets.push(`reference_code = $${params.length}`);
    }

    if (title !== undefined) {
      params.push(title);
      sets.push(`title = $${params.length}`);
    }

    if (description !== undefined) {
      params.push(description);
      sets.push(`description = $${params.length}`);
    }

    if (delivery !== undefined) {
      params.push(delivery);
      sets.push(`delivery = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    // Under withActor: changing the delivery mode withdraws per-system work
    // items by trigger (0128), and the trigger attributes that to the actor.
    const rows = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `UPDATE controls SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING id, is_baseline, reference_code, title, description, delivery`,
        params
      );
      if (!rows.length) return rows;

      // Rewording what an objective asks changes what the SoA states, so it is
      // recorded with the old and new words.
      for (const [field, value] of [['title', title], ['description', description], ['delivery', delivery]]) {
        if (value === undefined || !before || (before[field] ?? null) === value) continue;
        await db.query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, field_name, old_value, new_value, human_narrative)
           VALUES ($1, 'update', 'control_objective', $2, $3, $4, $5, $6, $7)`,
          [req.user.id, id, rows[0].title, field, before[field], value, `Control objective ${field} changed`]
        );
      }
      return rows;
    });

    if (!rows.length) return res.status(404).json({ error: 'Control not found.' });

    res.json({ control: rows[0] });
  } catch (err) {
    const conflict = referenceConflict(err, req.body.reference_code?.trim?.());
    if (conflict) return res.status(409).json({ error: conflict });
    next(err);
  }
};
