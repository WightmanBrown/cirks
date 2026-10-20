// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// E2E runs against a dedicated test stack so the dev servers (3000/5173 on
// riskapp_dev) are never touched: backend on 3100 → riskapp_test, frontend on
// 5273 proxying to it. Browsers point at the chromium build fetched by
// `npx playwright install chromium`.
const HERE = dirname(fileURLToPath(import.meta.url));
const RISKAPP_DIR = join(HERE, '..', 'riskapp');

const BACKEND_PORT  = 3100;
const FRONTEND_PORT = 5273;

// Derive the test DB URL from the dev .env (swap the db name to riskapp_test).
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const env = readFileSync(join(RISKAPP_DIR, '.env'), 'utf8');
  const line = env.split('\n').find(l => l.startsWith('DATABASE_URL='));
  return line.slice('DATABASE_URL='.length).trim().replace(/\/[^/]+$/, '/riskapp_test');
}

const DATABASE_URL = testDatabaseUrl();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // shared DB state — keep specs serial
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      // Backend pointed at riskapp_test. dotenv won't override these inline vars.
      command: 'node src/server.js',
      cwd: RISKAPP_DIR,
      // The auth rate limiter (H-03) defaults to 20 attempts / 15 min. The suite
      // logs in several times PER TEST (a browser login plus API tokens for each
      // role it checks), so a full run blows through that and every spec after
      // the trip point fails with 429 — a harness artefact, not a real finding.
      // Raised here only; the default still applies everywhere else, and
      // rate-limiting itself is covered by its own unit test.
      env: {
        ...process.env,
        DATABASE_URL,
        PORT: String(BACKEND_PORT),
        AUTH_RATE_LIMIT_MAX: '10000',
        AUTH_RATE_LIMIT_WINDOW_MIN: '1',
      },
      // 401 (unauthenticated) means the server is up and routing.
      url: `http://localhost:${BACKEND_PORT}/api/v1/users`,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run dev',
      env: {
        ...process.env,
        VITE_PORT: String(FRONTEND_PORT),
        VITE_API_TARGET: `http://localhost:${BACKEND_PORT}`,
      },
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
