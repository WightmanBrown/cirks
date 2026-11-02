#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles story check: does a freshly built training instance still tell
// the story it promises (story-promises.js)? Reads the database this process is
// configured for (DATABASE_URL); changes nothing.
//
//   node db/dataset/misty-isles/story-check.js
//
// Exit 0 when every promise holds, 1 when any is broken. A failure is NOT a
// failing test of the application: the application may be right and the story
// out of date. The message says so, in the log, in the CI annotation and in
// the job summary.

require('dotenv').config();
const fs = require('fs');
const { pool, query } = require('../../../src/db/pool');
const promises = require('./story-promises');

const COUNT_SQL = {
  departments: `SELECT count(*)::int AS n FROM departments`,
  people: `SELECT count(*)::int AS n FROM users`,
  systems: `SELECT count(*)::int AS n FROM systems`,
  risks: `SELECT count(*)::int AS n FROM risks WHERE is_active`,
  risksAtOrAbove12: `SELECT count(*)::int AS n FROM risks WHERE is_active AND risk_score >= 12`,
  awaitingValidation: `SELECT count(*)::int AS n FROM risks WHERE is_active AND validation_status = 'pending'`,
  returned: `SELECT count(*)::int AS n FROM risks WHERE is_active AND validation_status = 'returned'`,
  identifiedNotAssessed: `SELECT count(*)::int AS n FROM system_threats st
                           WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id)`,
  actions: `SELECT count(*)::int AS n FROM security_actions`,
  actionsAwaitingAcceptance: `SELECT count(*)::int AS n FROM security_actions WHERE accepted_at IS NULL`,
  actionItemsCompleted: `SELECT count(*)::int AS n FROM security_action_items WHERE status = 'completed'`,
  exceptions: `SELECT count(*)::int AS n FROM exceptions WHERE risk_id IS NOT NULL`,
  exceptionsInBreach: `SELECT count(*)::int AS n FROM exceptions WHERE risk_id IS NOT NULL AND status::text = 'expired'`,
  meetings: `SELECT count(*)::int AS n FROM working_group_meetings`,
  meetingsWithMinutes: `SELECT count(*)::int AS n FROM working_group_meetings WHERE minutes_issued_at IS NOT NULL`,
  reviewCycles: `SELECT count(*)::int AS n FROM review_cycles`,
  reviewCyclesClosed: `SELECT count(*)::int AS n FROM review_cycles WHERE status::text = 'completed'`,
};

(async () => {
  const broken = [];
  const lines = [];
  const mark = (ok, text) => { lines.push(`${ok ? '  ✓' : '  ✗'} ${text}`); };

  lines.push('Counts');
  for (const [key, p] of Object.entries(promises.counts)) {
    if (!COUNT_SQL[key]) throw new Error(`story-promises.js: no query for "${key}"`);
    const { rows: [{ n }] } = await query(COUNT_SQL[key]);
    const ok = n === p.expect;
    mark(ok, `${key}: ${n}${ok ? '' : ` — promised ${p.expect} (${p.why})`}`);
    if (!ok) broken.push(`${key} is ${n}, promised ${p.expect} (${p.why})`);
  }

  lines.push('Deliberate problems (degraded parts)');
  const { rows } = await query(`
    SELECT s.name AS system, c.name AS component
      FROM system_components sc JOIN systems s ON s.id = sc.system_id
      JOIN control_components c ON c.id = sc.component_id
     WHERE sc.status = 'degraded'`);
  const key = (s, c) => `${s} / ${c}`;
  const actual = new Set(rows.map((r) => key(r.system, r.component)));
  const wanted = new Set(promises.degradedParts.map(([s, c]) => key(s, c)));
  for (const k of wanted) if (!actual.has(k)) {
    mark(false, `${k} is no longer degraded — a deliberate problem has been mended`);
    broken.push(`${k} is no longer degraded: a deliberate problem has been mended`);
  }
  for (const k of actual) if (!wanted.has(k)) {
    mark(false, `${k} is degraded but is not one of the story's problems`);
    broken.push(`${k} is degraded but is not one of the story's problems`);
  }
  if ([...wanted].every((k) => actual.has(k)) && actual.size === wanted.size) mark(true, `all ${wanted.size} present, and no others`);

  lines.push('Facts the walkthrough relies on');
  for (const f of promises.facts) {
    const { rows: [{ n }] } = await query(f.sql);
    const ok = n === f.expect;
    mark(ok, `${f.what}${ok ? '' : ` — found ${n}, promised ${f.expect} (${f.why})`}`);
    if (!ok) broken.push(`${f.what}: found ${n}, promised ${f.expect} (${f.why})`);
  }

  console.log(`\nMisty Isles story check\n${lines.join('\n')}\n`);
  if (!broken.length) {
    console.log('Every promise holds: the training dataset still tells its story.');
  } else {
    const banner = [
      '══════════════════════════════════════════════════════════════════════',
      ' MISTY ISLES STORY CHECK FAILED — this is the reason for the failure.',
      ' The training dataset no longer tells the story it promises. The',
      ' application\'s own tests are separate jobs; this one checks the story.',
      ' Either the change broke the story (fix it), or the story has changed',
      ' (update riskapp/db/dataset/misty-isles/story-promises.js and the',
      ' documents that quote it, in the same pull request).',
      '══════════════════════════════════════════════════════════════════════',
    ].join('\n');
    console.error(`${banner}\n${broken.length} promise${broken.length === 1 ? '' : 's'} broken:\n${broken.map((b) => `  - ${b}`).join('\n')}`);
    if (process.env.GITHUB_ACTIONS) {
      // One annotation per broken promise, each naming the story check.
      for (const b of broken) console.log(`::error title=Misty Isles story check failed::${b.replace(/\n/g, ' ')}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
          '## ❌ Misty Isles story check failed\n\n'
          + 'This job checks the **training dataset\'s story**, not the application. The build of Misty Isles '
          + 'no longer keeps these promises:\n\n' + broken.map((b) => `- ${b}`).join('\n')
          + '\n\nEither the change broke the story (fix it), or the story has legitimately changed: update '
          + '`riskapp/db/dataset/misty-isles/story-promises.js` and the documents that quote it in the same pull request.\n');
      }
    }
    process.exitCode = 1;
  }
  await pool.end();
})().catch(async (e) => {
  console.error(`Misty Isles story check could not run: ${e.message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Misty Isles story check could not run::${e.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
