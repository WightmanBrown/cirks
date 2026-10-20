'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Contextual help (in-app tooltip/guidance) — Phase 1.
//
// Author-owned help text anchored to UI elements by a stable key. Reading is open
// to any authenticated user; editing reuses admin.manage (no new capability, so no
// capabilityDefaults/seed.sql drift-guard sync).
//
//   GET    /help?locale=en   — resolved catalogue for a locale (falls back to 'en')
//   POST   /help/keys        — register an instrumented key (admin; idempotent)
//   PUT    /help/:key        — upsert/clear the text for a key+locale (admin)
//   GET    /help/coverage    — every registered key + which locales have text (admin)

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }    = require('../../db/pool');

const router = Router();
router.use(authenticate);

const canEdit = requireCapability('admin.manage');

const DEFAULT_LOCALE = 'en';
const VALID_PLACEMENT = new Set(['top', 'bottom', 'left', 'right', 'auto']);
// Accept e.g. 'en', 'fr', 'pt-BR'. Keeps the locale axis honest for Phase 2.
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

function normLocale(raw) {
  const loc = (raw || DEFAULT_LOCALE).trim();
  return LOCALE_RE.test(loc) ? loc : DEFAULT_LOCALE;
}

// ── GET /help ────────────────────────────────────────────────────────────────
// The resolved catalogue the frontend caches. For each registered key we return
// the requested locale's text, falling back to 'en' when that locale is missing,
// plus the bare list of known keys (so edit mode knows which keys still need text).
router.get('/', async (req, res, next) => {
  try {
    const locale = normLocale(req.query.locale);
    const { rows } = await query(
      `SELECT k.help_key,
              k.placement,
              COALESCE(c.title, ce.title)                       AS title,
              COALESCE(c.body,  ce.body)                        AS body,
              CASE WHEN c.body IS NOT NULL THEN $1
                   WHEN ce.body IS NOT NULL THEN $2
                   ELSE NULL END                                AS locale_used
         FROM help_keys k
         LEFT JOIN help_content c  ON c.help_key  = k.help_key AND c.locale  = $1
         LEFT JOIN help_content ce ON ce.help_key = k.help_key AND ce.locale = $2
        ORDER BY k.help_key`,
      [locale, DEFAULT_LOCALE]
    );

    const entries = {};
    for (const r of rows) {
      if (!r.body) continue; // no text in this locale or the fallback — skip
      entries[r.help_key] = {
        title: r.title,
        body: r.body,
        placement: r.placement,
        locale_used: r.locale_used,
        is_fallback: r.locale_used !== locale,
      };
    }

    res.json({
      locale,
      default_locale: DEFAULT_LOCALE,
      entries,
      known_keys: rows.map(r => r.help_key),
    });
  } catch (err) { next(err); }
});

// ── POST /help/keys ──────────────────────────────────────────────────────────
// Self-registration: as an admin browses in edit mode, each HelpDot reports its
// key so the catalogue/coverage view can list elements that have no text yet.
// Idempotent — an existing key is left untouched (placement is owned by PUT).
router.post('/keys', canEdit, async (req, res, next) => {
  try {
    const { key, placement, page_hint } = req.body;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'key is required.' });
    }
    if (placement !== undefined && !VALID_PLACEMENT.has(placement)) {
      return res.status(400).json({ error: `placement must be one of ${[...VALID_PLACEMENT].join(', ')}` });
    }
    await query(
      `INSERT INTO help_keys (help_key, placement, page_hint)
       VALUES ($1, COALESCE($2, 'top'), $3)
       ON CONFLICT (help_key) DO NOTHING`,
      [key, placement || null, page_hint || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── PUT /help/:key ─────────────────────────────────────────────────────────────
// Upsert the help text for a key in a locale. An empty/whitespace body CLEARS that
// locale's text (so an admin can retract a description). Placement, when supplied,
// is set on the locale-invariant key row.
router.put('/:key', canEdit, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { title, body, placement } = req.body;
    const locale = normLocale(req.body.locale);

    if (placement !== undefined && !VALID_PLACEMENT.has(placement)) {
      return res.status(400).json({ error: `placement must be one of ${[...VALID_PLACEMENT].join(', ')}` });
    }

    // Ensure the key exists; set placement if the caller supplied one.
    await query(
      `INSERT INTO help_keys (help_key, placement)
       VALUES ($1, COALESCE($2, 'top'))
       ON CONFLICT (help_key) DO UPDATE
         SET placement = COALESCE($2, help_keys.placement)`,
      [key, placement || null]
    );

    const trimmed = (body || '').trim();
    if (!trimmed) {
      // Clear this locale's text.
      await query(`DELETE FROM help_content WHERE help_key = $1 AND locale = $2`, [key, locale]);
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
         VALUES ($1, 'update', 'help_content', NULL, $2, $3)`,
        [req.user.id, key, `Help text cleared for ${key} (${locale})`]
      );
      return res.json({ entry: null, cleared: true });
    }

    const result = await query(
      `INSERT INTO help_content (help_key, locale, title, body, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (help_key, locale) DO UPDATE
         SET title = EXCLUDED.title,
             body = EXCLUDED.body,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING *`,
      [key, locale, title || null, trimmed, req.user.id]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
       VALUES ($1, 'update', 'help_content', NULL, $2, $3)`,
      [req.user.id, key, `Help text updated for ${key} (${locale})`]
    );

    res.json({ entry: result.rows[0] });
  } catch (err) { next(err); }
});

// ── GET /help/coverage ─────────────────────────────────────────────────────────
// Authoring overview: every registered key + the locales that have text. Lets an
// admin see which instrumented elements still lack a description (or a translation).
router.get('/coverage', canEdit, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT k.help_key,
              k.placement,
              k.page_hint,
              COALESCE(ARRAY_AGG(c.locale ORDER BY c.locale) FILTER (WHERE c.locale IS NOT NULL), '{}') AS locales
         FROM help_keys k
         LEFT JOIN help_content c ON c.help_key = k.help_key
        GROUP BY k.help_key, k.placement, k.page_hint
        ORDER BY k.help_key`
    );
    res.json({ keys: rows, default_locale: DEFAULT_LOCALE });
  } catch (err) { next(err); }
});

module.exports = router;
