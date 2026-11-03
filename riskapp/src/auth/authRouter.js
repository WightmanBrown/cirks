'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router } = require('express');
const { login, refresh, logout } = require('./authController');
const { switchRole }             = require('./switchRoleController');
const totp                       = require('./totpController');
const authRateLimit              = require('../middleware/authRateLimit');
const authenticate               = require('../middleware/authenticate');

const router = Router();

router.post('/login',       login);
router.post('/refresh',     refresh);
router.post('/logout',      logout);
router.post('/switch-role', authenticate, switchRole);

// Two-factor sign-in on the signed-in account (H-05, v166). Confirming and
// switching off take a code, so they share the sign-in throttle.
router.get('/totp',          authenticate, totp.status);
router.post('/totp/setup',   authenticate, totp.setup);
router.post('/totp/confirm', authRateLimit, authenticate, totp.confirm);
router.post('/totp/disable', authRateLimit, authenticate, totp.disable);

module.exports = router;
