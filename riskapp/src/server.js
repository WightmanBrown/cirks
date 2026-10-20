'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

require('dotenv').config();

// Validate required secrets before starting — fail fast with a clear message.
const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key] || process.env[key].startsWith('REPLACE_')) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const createApp = require('./app');
const { pool }  = require('./db/pool');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app  = createApp();

async function start() {
  // Verify DB connectivity before accepting traffic.
  try {
    await pool.query('SELECT 1');
    console.info('[startup] Database connection OK.');
  } catch (err) {
    console.error('[startup] Cannot reach database:', err.message);
    process.exit(1);
  }

  // Load the configurable-RBAC matrix + department_isolation flag from the DB
  // (overrides the in-memory defaults). Keeps defaults if the tables are empty.
  try {
    await require('./auth/permissions').refreshFromDb();
    console.info('[startup] RBAC permissions loaded.');
  } catch (err) {
    console.warn('[startup] RBAC refresh failed; using built-in defaults:', err.message);
  }

  // Expire any overdue risk exceptions at boot, then keep a daily timer running.
  // (Also runs lazily on the exception read endpoints, so the UI is never stale.)
  const { safeExceptionSweep, startExceptionSweepTimer } = require('./jobs/exceptionSweep');
  await safeExceptionSweep('startup');
  startExceptionSweepTimer();

  app.listen(PORT, () => {
    console.info(`[startup] riskapp listening on http://localhost:${PORT}`);
    console.info(`[startup] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();
