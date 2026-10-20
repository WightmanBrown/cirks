'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }          = require('express');
const authRouter           = require('../auth/authRouter');
const governanceRouter     = require('./governance/index');
const operationsRouter     = require('./operations/index');
const controlsRouter       = require('./controls/index');
const graphRouter          = require('./graph/index');
const componentsRouter     = require('./components/index');
const bilRouter            = require('./bil/index');
const servicesRouter       = require('./services/index');
const departmentsRouter    = require('./departments/index');
const assetsRouter         = require('./assets/index');
const systemsRouter        = require('./systems/index');
const usersRouter          = require('./users/index');
const risksRouter          = require('./risks/index');
const threatsRouter        = require('./threats/index');
const adminRouter          = require('./admin/index');
const exceptionsRouter     = require('./exceptions/index');
const actionsRouter        = require('./actions/index');
const meetingsRouter       = require('./meetings/index');
const orgRouter            = require('./org/index');
const knowledgeRouter      = require('./knowledge/index');
const soaRouter            = require('./soa/index');
const standardsRouter      = require('./standards/index');
const scopesRouter         = require('./scopes/index');
const helpRouter           = require('./help/index');
const findingsRouter       = require('./findings/index');
const suppliersRouter      = require('./suppliers/index');
const architectureRouter   = require('./architecture/index');

const router = Router();

router.use('/auth',        authRouter);
router.use('/governance',  governanceRouter);
router.use('/operations',  operationsRouter);
router.use('/controls',    controlsRouter);
router.use('/graph',       graphRouter);
router.use('/components',  componentsRouter);
router.use('/bil',         bilRouter);
router.use('/services',    servicesRouter);
router.use('/departments', departmentsRouter);
router.use('/assets',      assetsRouter);
router.use('/systems',     systemsRouter);
router.use('/users',       usersRouter);
router.use('/risks',       risksRouter);
router.use('/threats',     threatsRouter);
router.use('/admin',       adminRouter);
router.use('/exceptions',  exceptionsRouter);
router.use('/actions',     actionsRouter);
router.use('/meetings',    meetingsRouter);
router.use('/org',         orgRouter);
router.use('/knowledge',   knowledgeRouter);
router.use('/soa',         soaRouter);
router.use('/standards',   standardsRouter);
router.use('/scopes',      scopesRouter);
router.use('/help',        helpRouter);
router.use('/findings',    findingsRouter);
router.use('/suppliers',   suppliersRouter);
router.use('/architecture', architectureRouter);

module.exports = router;
