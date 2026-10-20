'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');

const { getProbabilitySignals }           = require('./probabilitySignalsController');
const { getRiskHeatmap }                  = require('./riskHeatmapController');
const { getCurrentRisks, getFutureRisks } = require('./riskHeatmapDetailController');
const { getMyRiskTrends }                 = require('./myRiskTrendsController');

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({ message: 'Operations API — coming soon.' });
});

// GET /api/v1/operations/probability-signals
// risk_analyst only.
router.get(
  '/probability-signals',
  authenticate,
  requireCapability('probability_signals.read'),
  getProbabilitySignals
);

// GET /api/v1/operations/risk-heatmap
// Dashboard summary — max probability/impact per risk, role-scoped.
// Accessible to: ciso, risk_analyst, information_asset_manager, information_asset_owner.
router.get(
  '/risk-heatmap',
  authenticate,
  getRiskHeatmap
);

// GET /api/v1/operations/risk-heatmap/current
router.get(
  '/risk-heatmap/current',
  authenticate,
  requireCapability('risk_heatmap.read'),
  getCurrentRisks
);

// GET /api/v1/operations/risk-heatmap/future
router.get(
  '/risk-heatmap/future',
  authenticate,
  requireCapability('risk_heatmap.read'),
  getFutureRisks
);

// GET /api/v1/operations/my-risk-trends
// Trend counts (new / increased / reduced / eliminated) since last SWG.
// IAO + IAM — always scoped to the caller's own department (v108: a risk
// belongs to the department that owns its system).
router.get(
  '/my-risk-trends',
  authenticate,
  requireCapability('risk_trends.read'),
  getMyRiskTrends
);

module.exports = router;