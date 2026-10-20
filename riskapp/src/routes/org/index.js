'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { query }    = require('../../db/pool');
const { refreshFromDb } = require('../../auth/permissions');

const router = Router();
router.use(authenticate);

// ── GET /org/phase ──────────────────────────────────────────────────────────────
// Setup-vs-operational state. Readable by any authenticated user so the UI can
// reflect the phase (and the security_consultant can see/flip it). Returns the
// org name for context.
router.get('/phase', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT org_name, setup_phase_active, setup_completed_at FROM org_config LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Org config not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /org/go-operational ──────────────────────────────────────────────────
// One-way transition from setup to operational. Consultant-only by design (the
// security_consultant owns onboarding); after this the consultant's exception
// authority drops to risk_analyst level. Idempotency is enforced inside
// go_operational() — a second call raises 'already operational' → 409.
router.post('/go-operational', async (req, res, next) => {
  try {
    if (req.user.role !== 'security_consultant') {
      return res.status(403).json({
        error: 'Only the security consultant can move the organisation to operational.',
      });
    }
    await query(`SELECT go_operational($1)`, [req.user.id]);
    // Refresh the in-memory permission cache so setup-phase-only capabilities
    // (e.g. the consultant's write authority) lapse immediately, without a restart.
    await refreshFromDb();
    const { rows } = await query(
      `SELECT org_name, setup_phase_active, setup_completed_at FROM org_config LIMIT 1`
    );
    res.status(200).json(rows[0]);
  } catch (err) {
    if ((err.message || '').toLowerCase().includes('already operational')) {
      return res.status(409).json({ error: 'The organisation is already operational.' });
    }
    next(err);
  }
});

module.exports = router;
