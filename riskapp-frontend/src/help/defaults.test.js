// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_DEFAULTS, mergeDefaults } from './defaults';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name) ? [p] : [];
  });
}

// Every help key written literally in the source: <HelpDot k="…">, helpKey="…".
function usedKeys() {
  const keys = new Set();
  const re = /(?:\bk=|\bhelpKey(?:=|:\s*))["']([a-z0-9_.-]+)["']/g;
  for (const f of sourceFiles(SRC)) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) keys.add(m[1]);
  }
  return keys;
}

describe('shipped help drafts', () => {
  const used = usedKeys();

  it('every help point in the app has draft text', () => {
    const missing = [...used].filter((k) => !k.startsWith('glossary.') && !HELP_DEFAULTS[k]);
    expect(missing).toEqual([]);
  });

  it('every draft is used by a help point', () => {
    const unused = Object.keys(HELP_DEFAULTS).filter((k) => !used.has(k));
    expect(unused).toEqual([]);
  });

  it('every draft has a body, and a title of its own', () => {
    const bad = Object.entries(HELP_DEFAULTS)
      .filter(([, d]) => !d.body?.trim() || !d.title?.trim())
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('refuses a key defined in two files', () => {
    expect(() => mergeDefaults({ a: { x: { body: '1' } }, b: { x: { body: '2' } } }))
      .toThrow(/defined twice/);
  });
});
