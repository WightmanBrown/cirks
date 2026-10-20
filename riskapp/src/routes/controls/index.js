'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }            = require('express');
const authenticate          = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { getControls }       = require('./controlsController');
const { getControl }        = require('./controlDetailController');
const { createControl }     = require('./createControlController');
const { importControls }    = require('./importControlsController');
const {
  getControlComponents,
  createControlComponent,
  updateControlComponent,
  unlinkControlComponent,
} = require('./controlComponentsController');
const { rateControl }     = require('./rateControlController');
const updateControl       = require('./updateControlController');
const { previewWithdrawal, withdrawControl } = require('./withdrawControlController');
const setMaturityCap      = require('./maturityCapController');
const { linkControlThreat, unlinkControlThreat } = require('./controlThreatsController');
const patterns = require('./deliveryPatternsController');

const router = Router();

router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));
for (const [name, guard] of require('../../middleware/uuidParam')('patternId', 'partId')) router.param(name, guard);

const canView   = requireCapability('controls.read');
const canCreate = requireCapability('controls.write');
const adminOnly = requireCapability('controls.import');

router.get('/',        canView,   getControls);
// The security solutions library (v147) — registered before '/:id' routes.
router.get('/solutions', canView, patterns.listSolutions);
router.get('/solutions/recorded-on', canView, patterns.recordedOn);
// One solution, seen from its own page (/security-solutions/:id).
router.post('/solutions',                                    canCreate, patterns.createSolution);
router.get('/solutions/:patternId',                          canView,   patterns.getSolution);
router.patch('/solutions/:patternId',                        canCreate, patterns.updateSolution);
router.delete('/solutions/:patternId',                       canCreate, patterns.deleteSolution);
router.post('/solutions/:patternId/objectives',              canCreate, patterns.addSolutionObjective);
router.delete('/solutions/:patternId/objectives/:controlId', canCreate, patterns.removeSolutionObjective);
router.post('/solutions/:patternId/parts',                   canCreate, patterns.addSolutionPart);
router.delete('/solutions/:patternId/parts/:partId',         canCreate, patterns.removeSolutionPart);
router.post('/import', adminOnly, importControls);
router.post('/',       canCreate, createControl);

router.get('/:id/components',                       canView,   getControlComponents);
router.post('/:id/components',                      canCreate, createControlComponent);
router.patch('/:controlId/components/:componentId', canCreate, updateControlComponent);
router.delete('/:controlId/components/:componentId',canCreate, unlinkControlComponent);

router.post('/:id/threats',              canCreate, linkControlThreat);
router.delete('/:id/threats/:threatLinkId', canCreate, unlinkControlThreat);

router.patch('/:id/rate', canCreate, rateControl);

// Delivery patterns (v145): the valid ways an objective is delivered.
router.post('/:id/patterns',                              canCreate, patterns.createPattern);
router.patch('/:id/patterns/:patternId',                  canCreate, patterns.updatePattern);
router.delete('/:id/patterns/:patternId',                 canCreate, patterns.deletePattern);
router.post('/:id/patterns/:patternId/parts',             canCreate, patterns.addPart);
router.delete('/:id/patterns/:patternId/parts/:partId',   canCreate, patterns.removePart);
// Custom gating inside (control owner OR controls.write) — needs only authentication
// + read visibility, not the write capability, so it is not canCreate-guarded here.
router.patch('/:id/maturity-cap', canView, setMaturityCap);
// Withdrawing a control from use (v131): one act, a required reason, and a
// preview of what it would do — including which risks rise when it goes.
router.get('/:id/withdrawal', canCreate, previewWithdrawal);
router.post('/:id/withdraw',  canCreate, withdrawControl);
router.patch('/:id',      canCreate, updateControl);

// Set how several controls are delivered at once (v127) — e.g. marking every
// governance objective organisation-wide in one act.
router.post('/delivery', canCreate, require('./bulkDeliveryController'));
router.get('/:id',        canView,   getControl);

module.exports = router;
