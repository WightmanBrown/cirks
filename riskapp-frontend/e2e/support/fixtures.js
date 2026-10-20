// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test as base, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE  = dirname(fileURLToPath(import.meta.url));
const RESET = join(HERE, '..', '..', '..', 'riskapp', 'test', 'e2e', 'db', 'reset.mjs');

// Specs mutate shared DB state (planning meetings, adopting actions, …). Reset
// the deterministic baseline before every test so order never matters. Output
// is swallowed unless the reset fails.
export const test = base.extend({
  seededDb: [async ({}, use) => {
    try {
      execFileSync('node', [RESET], { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`DB reset failed:\n${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`);
    }
    await use();
  }, { auto: true }],
});

export { expect };
