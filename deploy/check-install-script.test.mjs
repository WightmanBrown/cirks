// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The checker is what keeps install.sh and the guide the same, so it must
// notice each way they can drift.   node --test deploy/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideBlocks, scriptRegions, compare } from './check-install-script.mjs';

const guide = [
  'Intro', '<!-- install.sh: a -->', '```bash', 'echo one', '```', 'prose',
  '```bash', 'echo unmarked', '```',
  '<!-- install.sh: b -->', '```bash', 'echo two', 'echo three', '```',
].join('\n');
const script = [
  'set -e', '# >>> INSTALL.md a', 'echo one', '# <<< INSTALL.md a', 'glue',
  '# >>> INSTALL.md b', 'echo two', 'echo three', '# <<< INSTALL.md b',
].join('\n');
const check = (g, s) => compare(guideBlocks(g), scriptRegions(s));

test('agreeing files give no problems, and unmarked blocks are ignored', () => {
  assert.deepEqual(check(guide, script), []);
});

test('a changed line is named', () => {
  const p = check(guide.replace('echo three', 'echo 3'), script);
  assert.equal(p.length, 1);
  assert.match(p[0], /^b, line 2 of the block/);
});

test('a line added to one side only is caught', () => {
  assert.match(check(guide, script.replace('echo three', 'echo three\necho four'))[0], /line 3.*\n.*\(nothing\)/s);
});

test('a block marked in the guide but missing from the script', () => {
  assert.match(check(guide, script.replace(/# >>> INSTALL\.md b[\s\S]*$/, ''))[0], /b: marked in INSTALL\.md but missing/);
});

test('a region in the script whose guide marker was removed', () => {
  assert.match(check(guide.replace('<!-- install.sh: b -->\n', ''), script)[0], /b: in install\.sh but no longer marked/);
});

test('blocks in a different order', () => {
  const swapped = [
    '# >>> INSTALL.md b', 'echo two', 'echo three', '# <<< INSTALL.md b',
    '# >>> INSTALL.md a', 'echo one', '# <<< INSTALL.md a',
  ].join('\n');
  assert.match(check(guide, swapped)[0], /different order/);
});

test('a marker not directly above a bash block is an error', () => {
  assert.throws(() => guideBlocks('<!-- install.sh: x -->\n\n```bash\nls\n```'), /directly above/);
});
