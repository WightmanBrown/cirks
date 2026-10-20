'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router } = require('express');
const { login, refresh, logout } = require('./authController');
const { switchRole }             = require('./switchRoleController');
const authenticate               = require('../middleware/authenticate');

const router = Router();

router.post('/login',       login);
router.post('/refresh',     refresh);
router.post('/logout',      logout);
router.post('/switch-role', authenticate, switchRole);

module.exports = router;
