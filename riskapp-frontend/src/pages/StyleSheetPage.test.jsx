// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { parseTokens, contrast } from './StyleSheetPage';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest does not process CSS, so the page's ?raw import is empty here; read the file.
const cssText = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/globals.css'), 'utf8');

describe('StyleSheetPage', () => {
  it('reads every token in :root under the comment that heads its group', () => {
    const groups = parseTokens(`:root {
  /* ── Colour ─────
     long explanation. */

  /* Surfaces, darkest to lightest */
  --bg-base: #000; --bg-top: #111;
  /* Text. Muted text passes AA */
  --text-primary: #fff;
}`);
    expect(groups).toEqual([
      { title: 'Surfaces, darkest to lightest', tokens: [{ name: '--bg-base', declared: '#000' }, { name: '--bg-top', declared: '#111' }] },
      { title: 'Text', tokens: [{ name: '--text-primary', declared: '#fff' }] },
    ]);
  });

  it('finds the real stylesheet\'s colours and fonts', () => {
    const names = parseTokens(cssText).flatMap(g => g.tokens.map(t => t.name));
    expect(names).toEqual(expect.arrayContaining(['--text-muted', '--band-critical-bg', '--ppitf-people', '--font-body']));
  });

  it('computes WCAG contrast', () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
    expect(contrast([127, 136, 157], [26, 30, 40])).toBeGreaterThan(4.5);   // --text-muted on --bg-elevated
  });
});
