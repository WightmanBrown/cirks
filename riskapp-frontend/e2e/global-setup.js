// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESET = join(HERE, '..', '..', 'riskapp', 'test', 'e2e', 'db', 'reset.mjs');

// Reset riskapp_test to the deterministic baseline before any spec runs.
// CLONE_E2E_DB=1 forces a schema re-clone from riskapp_dev (use after migrations).
export default function globalSetup() {
  const args = [RESET];
  if (process.env.CLONE_E2E_DB === '1') args.push('--clone');
  console.log('[e2e] resetting riskapp_test…');
  execFileSync('node', args, { stdio: 'inherit' });
}
