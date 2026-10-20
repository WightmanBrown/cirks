'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }            = require('express');
const authenticateAny       = require('../../middleware/authenticateAny');
const { requireCapability } = require('../../auth/permissions');
const { enrich, enrichBulk, search } = require('./enrichmentController');
const { neighbors } = require('./graphController');

const router = Router();

// Machine (X-API-Key) OR human (JWT) — knowledge is the one surface a SOC
// integration reaches.
router.use(authenticateAny);

// Two capabilities, not one (v111). A machine key answers enrichment questions;
// the universal search and the graph walk are for humans. Before this, one grant
// opened all four, so any API key reached the whole register.
const canQuery  = requireCapability('knowledge.query');   // humans: search + graph
const canEnrich = requireCapability('knowledge.enrich');  // machines + humans

// GET  /knowledge/enrich?q=<ip|hostname>     — single lookup
// POST /knowledge/enrich/bulk { queries: [] } — batch lookup (primary machine path)
router.get('/search', canQuery, search);
router.get('/graph/:type/:id', canQuery, neighbors); // walkable graph: one-hop neighbours
router.get('/enrich', canEnrich, enrich);
router.post('/enrich/bulk', canEnrich, enrichBulk);

module.exports = router;
