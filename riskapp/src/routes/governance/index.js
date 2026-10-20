'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');

const { getPendingRisks }       = require('./risksController');
const { validateRisk }          = require('./validateController');
const { getOverdueActionCount } = require('./sapController');
const { getSecurityActions } = require('./actionsController');
const { getSiroCyclePending,
        getSiroActionPending,
        getSiroCycles,
        getSiroCycleDetail,
        approveSiroCycle,
        getSiroActions,
        getSiroPublishedImpactTables }     = require('./siroController');

const router = Router();

router.use(authenticate);

router.get('/risks/pending',       requireCapability('governance.review'), getPendingRisks);
router.post('/risks/:id/validate', requireCapability('risks.validate'),    validateRisk);
router.get('/sap/overdue',         requireCapability('governance.review'), getOverdueActionCount);
router.get('/sap/actions',         requireCapability('governance.review'), getSecurityActions);
// GET /sap/actions/:id retired — superseded by GET /actions/:id, which is
// RACI-scoped rather than CISO-only and returns the action's items. The old
// route INNER JOINed security_action_plans, so it could never serve a
// gap-driven action (plan_id is NULL until an action joins a plan).
router.get('/siro/cycles/pending',        requireCapability('siro.review'), getSiroCyclePending);
router.get('/siro/cycles',                requireCapability('siro.review'), getSiroCycles);
router.get('/siro/cycles/:id',            requireCapability('siro.review'), getSiroCycleDetail);
router.post('/siro/cycles/:id/approve',   requireCapability('siro.review'), approveSiroCycle);
router.get('/siro/actions/pending',               requireCapability('siro.review'), getSiroActionPending);
router.get('/siro/actions',                       requireCapability('siro.review'), getSiroActions);
router.get('/siro/impact-tables/published',       requireCapability('siro.review'), getSiroPublishedImpactTables);

module.exports = router;
