'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }            = require('express');
const authenticate          = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { getRiskGraph }     = require('./riskGraphController');

const router = Router();

router.use(authenticate);

const canView = requireCapability('graph.read');

router.get('/risk/:id',    canView, getRiskGraph);

module.exports = router;
