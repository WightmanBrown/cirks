#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// deploy/install.sh runs the install guide's own commands. Each block of
// docs/INSTALL.md marked `<!-- install.sh: ID -->` must appear in install.sh,
// character for character and in the same order, between
// `# >>> INSTALL.md ID` and `# <<< INSTALL.md ID`. CI runs this, so the guide
// and the script cannot drift apart: change one, and this fails until the
// other matches.
//
//   node deploy/check-install-script.mjs            # exit 0 when they agree

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guidePath = join(root, 'docs/INSTALL.md');
const scriptPath = join(root, 'deploy/install.sh');

// The marked blocks of the guide, in order: [{ id, lines }].
export function guideBlocks(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^<!-- install\.sh: (\S+) -->$/);
    if (!m) continue;
    if (lines[i + 1] !== '```bash') throw new Error(`INSTALL.md line ${i + 2}: the marker for ${m[1]} must sit directly above a \`\`\`bash block`);
    const end = lines.indexOf('```', i + 2);
    if (end < 0) throw new Error(`INSTALL.md: the block marked ${m[1]} is never closed`);
    out.push({ id: m[1], lines: lines.slice(i + 2, end) });
  }
  return out;
}

// The guide regions of the script, in order: [{ id, lines }].
export function scriptRegions(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^# >>> INSTALL\.md (\S+)$/);
    if (!m) continue;
    const end = lines.indexOf(`# <<< INSTALL.md ${m[1]}`, i + 1);
    if (end < 0) throw new Error(`install.sh: the region ${m[1]} is never closed`);
    out.push({ id: m[1], lines: lines.slice(i + 1, end) });
  }
  return out;
}

// Every disagreement, in words. Empty when the two agree.
export function compare(guide, script) {
  const problems = [];
  const g = guide.map((b) => b.id);
  const s = script.map((r) => r.id);
  for (const id of g) if (!s.includes(id)) problems.push(`${id}: marked in INSTALL.md but missing from install.sh`);
  for (const id of s) if (!g.includes(id)) problems.push(`${id}: in install.sh but no longer marked in INSTALL.md`);
  const common = g.filter((id) => s.includes(id));
  if (common.join() !== s.filter((id) => g.includes(id)).join()) {
    problems.push(`the blocks are in a different order: INSTALL.md ${common.join(', ')}; install.sh ${s.join(', ')}`);
  }
  for (const id of common) {
    const a = guide.find((b) => b.id === id).lines;
    const b = script.find((r) => r.id === id).lines;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        problems.push(`${id}, line ${i + 1} of the block:\n    INSTALL.md: ${a[i] ?? '(nothing)'}\n    install.sh: ${b[i] ?? '(nothing)'}`);
        break;
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const guide = guideBlocks(readFileSync(guidePath, 'utf8'));
  const script = scriptRegions(readFileSync(scriptPath, 'utf8'));
  const problems = compare(guide, script);
  if (problems.length) {
    console.error('docs/INSTALL.md and deploy/install.sh disagree:\n');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nChange whichever is wrong so the marked blocks match exactly.');
    process.exit(1);
  }
  console.log(`docs/INSTALL.md and deploy/install.sh agree (${guide.length} blocks: ${guide.map((b) => b.id).join(', ')}).`);
}
