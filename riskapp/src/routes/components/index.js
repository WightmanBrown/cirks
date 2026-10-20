'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }               = require('express');
const authenticate             = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { searchComponents,
        createComponent,
        updateComponent,
        getComponentDetail,
        addComponentIp,
        removeComponentIp }    = require('./componentController');

const router = Router();

router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));

const canView = requireCapability('components.read');
const canEdit = requireCapability('components.write');

router.get('/',                                          canView, searchComponents);
router.post('/',                                         canEdit, createComponent);
router.get('/:id',                                       canView, getComponentDetail);
router.patch('/:id',                                     canEdit, updateComponent);
router.post('/:id/ips',                                  canEdit, addComponentIp);
router.delete('/:id/ips/:ipId',                          canEdit, removeComponentIp);

module.exports = router;
