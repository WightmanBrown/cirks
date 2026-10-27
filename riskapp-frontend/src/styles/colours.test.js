// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Every colour comes from styles/globals.css. A colour written anywhere else
// cannot follow a theme (day mode), and it is how CIRKS reached 144 colours and
// unreadable grey text before 2026-10-26. Name a token, or mix one:
//   color-mix(in srgb, var(--red) 15%, transparent)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLOBALS = join(SRC, 'styles', 'globals.css');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|jsx?)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [p] : [];
  });
}

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const COLOUR = /#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?)\(|(?:color|background(?:-color)?|border(?:-[a-z]+)*|fill|stroke|outline)\s*:\s*['"]?(?:white|black|red|green|blue|orange|yellow|gr[ae]y|silver|purple|navy|teal|gold|pink)\b/;

describe('colours', () => {
  it('are written only in styles/globals.css', () => {
    const offenders = [];
    for (const f of files(SRC)) {
      if (f === GLOBALS) continue;
      stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        // An anchor such as href="#top" or a route is not a colour.
        const code = line.replace(/(['"`])#[a-z][\w-]*\1/gi, '');
        if (COLOUR.test(code)) offenders.push(`${relative(SRC, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every colour token a stylesheet names is defined', () => {
    const globals = readFileSync(GLOBALS, 'utf8');
    const defined = new Set([...globals.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const missing = new Set();
    for (const f of files(SRC)) {
      const text = stripComments(readFileSync(f, 'utf8'));
      // Tokens a component sets for itself (style={{ '--tone': … }}, or in its own CSS).
      const local = new Set([...text.matchAll(/['"]?(--[a-z0-9-]+)['"]?\s*:/g)].map((m) => m[1]));
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
        if (!defined.has(m[1]) && !local.has(m[1])) missing.add(`${relative(SRC, f)}: ${m[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
