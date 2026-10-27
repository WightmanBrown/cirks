// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/StyleSheetPage.jsx  (/admin/colours)
 *
 * The master sheet of CIRKS's fonts and colours: every token in
 * styles/globals.css, grouped as that file groups them, with how readable each
 * text colour is on each surface and the pairings the app actually uses.
 *
 * It reads globals.css itself (as raw text) and asks the browser for each
 * token's current value, so a new token or a second theme shows up here with no
 * change to this page.
 */
import { useEffect, useMemo, useState } from 'react';
import cssText from '../styles/globals.css?raw';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import styles from './StyleSheetPage.module.css';

// ── Reading globals.css ──────────────────────────────────────────────────────

// The :root block's tokens, each under the comment that heads its group.
export function parseTokens(css) {
  const start = css.indexOf(':root {');
  if (start < 0) return [];
  const body = css.slice(start + 7, css.indexOf('\n}', start));
  const groups = [];
  let current = null;
  let comment = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (comment !== null) {                       // inside a multi-line comment
      if (line.includes('*/')) comment = null;
      continue;
    }
    if (line.startsWith('/*')) {
      const text = line.replace(/^\/\*+\s*/, '').replace(/\*\/.*$/, '').replace(/[─—-]{2,}.*$/, '').trim();
      // "── Colour ───" banners and an empty first line carry no group name.
      const title = text.split(/\s[—(]|[.:](\s|$)/)[0].trim();
      if (title) { current = { title, tokens: [] }; groups.push(current); }
      if (!line.includes('*/')) comment = true;
      continue;
    }
    for (const m of line.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (!current) { current = { title: 'Tokens', tokens: [] }; groups.push(current); }
      current.tokens.push({ name: m[1], declared: m[2].trim() });
    }
  }
  return groups.filter(g => g.tokens.length);
}

// Families and weights the page loads, from the Google Fonts link in index.html.
function loadedFonts() {
  const link = typeof document !== 'undefined' && document.querySelector('link[href*="fonts.googleapis.com/css2"]');
  if (!link) return {};
  const out = {};
  for (const fam of new URL(link.href).searchParams.getAll('family')) {
    const [name, spec = ''] = fam.split(':');
    out[name.replace(/\+/g, ' ')] = (spec.split('@')[1] || '400').split(';').map(Number);
  }
  return out;
}

// ── Colour arithmetic (WCAG 2.x contrast) ────────────────────────────────────

// Whatever CSS colour the browser computes → [r, g, b, a] on 0–255 / 0–1.
function toRgba(computed) {
  if (!computed) return null;
  let m = computed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  m = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [m[1] * 255, m[2] * 255, m[3] * 255, a];
  }
  return null;
}
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);
function luminance([r, g, b]) {
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Resolve a token (or any colour expression) to the rgba the browser paints.
function useResolver(ready) {
  return useMemo(() => {
    if (!ready || typeof document === 'undefined') return () => null;
    const probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const cache = new Map();
    return (expr) => {
      if (!cache.has(expr)) {
        probe.style.color = '';
        probe.style.color = expr;
        cache.set(expr, probe.style.color ? toRgba(getComputedStyle(probe).color) : null);
      }
      return cache.get(expr);
    };
  }, [ready]);
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SURFACES = ['--bg-base', '--bg-inset', '--bg-surface', '--bg-elevated'];
const TEXTS = ['--text-primary', '--text-secondary', '--text-muted', '--text-amber',
  '--red-light', '--green-light', '--amber-light', '--blue-light', '--red', '--green', '--amber', '--blue', '--violet', '--teal'];
const HUES = ['red', 'green', 'amber', 'blue'];
const BANDS = ['low', 'medium', 'high', 'critical', 'catastrophic'];
const PPITF = ['people', 'process', 'information', 'technology', 'facility', 'control', 'system'];
const AA = 4.5;

function Rating({ ratio }) {
  if (ratio == null) return null;
  const pass = ratio >= AA;
  return (
    <span className={pass ? styles.pass : styles.fail} title={pass ? 'Meets WCAG AA for normal text (4.5:1)' : 'Below WCAG AA for normal text (4.5:1)'}>
      {ratio.toFixed(1)}:1 {pass ? '✓' : '✗'}
    </span>
  );
}

export function StyleSheetPage() {
  const groups = useMemo(() => parseTokens(cssText), []);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const resolve = useResolver(ready);
  const fonts = useMemo(() => (ready ? loadedFonts() : {}), [ready]);

  const colourGroups = groups
    .map(g => ({ ...g, tokens: g.tokens.filter(t => !t.name.startsWith('--font') && resolve(`var(${t.name})`)) }))
    .filter(g => g.tokens.length);
  const fontTokens = groups.flatMap(g => g.tokens).filter(t => t.name.startsWith('--font-'));
  const colourCount = colourGroups.reduce((n, g) => n + g.tokens.length, 0);

  const ratioOn = (fgExpr, bgExpr) => {
    const fg = resolve(fgExpr), bg = resolve(bgExpr), base = resolve('var(--bg-base)');
    if (!fg || !bg || !base) return null;
    const solidBg = over(bg, base);
    return contrast(over(fg, solidBg), solidBg);
  };
  const hex = (expr) => {
    const c = resolve(expr);
    if (!c) return '';
    const h = c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    return c[3] < 1 ? `#${h} at ${Math.round(c[3] * 100)}%` : `#${h}`;
  };

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>Colours &amp; Fonts <HelpDot k="style_sheet.title" placement="bottom" /></h1>
        </div>
        <p className={styles.intro}>
          Every font and colour CIRKS uses, read live from <code>styles/globals.css</code>: {fontTokens.length} font
          families and {colourCount} colours. Nothing else in the app may write a colour, so this sheet is the whole
          palette. Readability scores follow WCAG: 4.5:1 is the minimum for normal-sized text.
        </p>

        {/* ── Fonts ─────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Fonts <HelpDot k="style_sheet.fonts" placement="bottom" /></h2>
          {fontTokens.map(t => {
            const family = t.declared.split(',')[0].replace(/['"]/g, '').trim();
            const weights = fonts[family] || [400];
            return (
              <div key={t.name} className={styles.fontCard}>
                <div className={styles.fontHead}>
                  <span className={styles.fontName} style={{ fontFamily: `var(${t.name})` }}>{family}</span>
                  <code className={styles.token}>{t.name}</code>
                  <span className={styles.muted}>weights loaded: {weights.join(', ')}</span>
                </div>
                {weights.map(w => (
                  <div key={w} className={styles.fontSample} style={{ fontFamily: `var(${t.name})`, fontWeight: w }}>
                    <span className={styles.weight}>{w}</span>
                    Risk to the Payroll system — 20 critical · ISO 27001 A.5.27 · The quick brown fox
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        {/* ── Readability ───────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Text on each surface <HelpDot k="style_sheet.readability" placement="bottom" /></h2>
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th>Text colour</th>
                  {SURFACES.map(s => <th key={s}><code>{s}</code></th>)}
                </tr>
              </thead>
              <tbody>
                {TEXTS.filter(t => resolve(`var(${t})`)).map(t => (
                  <tr key={t}>
                    <td><code className={styles.token}>{t}</code><div className={styles.muted}>{hex(`var(${t})`)}</div></td>
                    {SURFACES.map(s => (
                      <td key={s} className={styles.cell} style={{ background: `var(${s})` }}>
                        <span style={{ color: `var(${t})` }} className={styles.sampleText}>Label text</span>
                        <Rating ratio={ratioOn(`var(${t})`, `var(${s})`)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Pairings ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pairings in use <HelpDot k="style_sheet.pairings" placement="bottom" /></h2>

          <h3 className={styles.subTitle}>Risk bands</h3>
          <div className={styles.row}>
            {BANDS.map(b => (
              <div key={b} className={styles.pair}>
                <span className={styles.chip} style={{
                  background: `var(--band-${b}-bg)`, color: `var(--band-${b}-fg)`,
                  borderColor: b === 'catastrophic' ? 'var(--band-catastrophic-edge)' : 'transparent',
                }}>{b}</span>
                <Rating ratio={ratioOn(`var(--band-${b}-fg)`, `var(--band-${b}-bg)`)} />
              </div>
            ))}
          </div>

          <h3 className={styles.subTitle}>Control maturity</h3>
          <div className={styles.row}>
            {[1, 2, 3, 4, 5].map(m => (
              <div key={m} className={styles.pair}>
                <span className={styles.chip} style={{
                  background: `var(--maturity-${m}-bg)`, color: `var(--maturity-${m}-fg)`,
                  borderColor: m === 5 ? 'var(--maturity-5-edge)' : 'transparent',
                }}>level {m}</span>
                <Rating ratio={ratioOn(`var(--maturity-${m}-fg)`, `var(--maturity-${m}-bg)`)} />
              </div>
            ))}
          </div>

          <h3 className={styles.subTitle}>Coloured text on its own tint (badges, banners)</h3>
          <div className={styles.row}>
            {HUES.map(h => (
              <div key={h} className={styles.pair}>
                <span className={styles.chip} style={{
                  background: `color-mix(in srgb, var(--${h}) 15%, transparent)`, color: `var(--${h}-light)`,
                  borderColor: `color-mix(in srgb, var(--${h}) 35%, transparent)`,
                }}>{h}</span>
                <Rating ratio={ratioOn(`var(--${h}-light)`, `color-mix(in srgb, var(--${h}) 15%, transparent)`)} />
              </div>
            ))}
          </div>

          <h3 className={styles.subTitle}>Text on a solid fill (buttons)</h3>
          <div className={styles.row}>
            {['amber', ...HUES.filter(h => h !== 'amber'), 'violet'].map(h => (
              <div key={h} className={styles.pair}>
                <span className={styles.chip} style={{ background: `var(--${h})`, color: 'var(--text-on-fill)' }}>{h}</span>
                <Rating ratio={ratioOn('var(--text-on-fill)', `var(--${h})`)} />
              </div>
            ))}
          </div>

          <h3 className={styles.subTitle}>Component types</h3>
          <div className={styles.row}>
            {PPITF.map(p => {
              const text = p === 'system' ? 'var(--graph-quiet-text)' : 'var(--ppitf-text-dark)';
              return (
                <div key={p} className={styles.pair}>
                  <span className={styles.chip} style={{ background: `var(--ppitf-${p})`, borderColor: `var(--ppitf-${p}-edge)`, color: text }}>{p}</span>
                  <Rating ratio={ratioOn(text, `var(--ppitf-${p})`)} />
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Every colour ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Every colour <HelpDot k="style_sheet.colours" placement="bottom" /></h2>
          {colourGroups.map(g => (
            <div key={g.title} className={styles.group}>
              <h3 className={styles.subTitle}>{g.title}</h3>
              <div className={styles.swatches}>
                {g.tokens.map(t => (
                  <div key={t.name} className={styles.swatch}>
                    <span className={styles.chipSwatch} style={{ background: `var(${t.name})` }} />
                    <code className={styles.token}>{t.name}</code>
                    <span className={styles.muted}>{hex(`var(${t.name})`)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </Shell>
  );
}
