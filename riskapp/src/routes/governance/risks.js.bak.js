'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }         = require('express');
const authenticate       = require('../../middleware/authenticate');
const requireRole        = require('../../middleware/requireRole');
const { getPendingRisks } = require('../../controllers/governance/risksController');

const router = Router();

// GET /api/v1/governance/risks/pending
// CISO only. Backed by v_pending_risks.
router.get(
  '/pending',
  authenticate,
  requireRole('ciso'),
  getPendingRisks
);

module.exports = router;
