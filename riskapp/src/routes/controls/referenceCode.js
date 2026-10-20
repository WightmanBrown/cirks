'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A control objective's own reference (controls.reference_code, v123). Objectives
// mapped to a standard borrow its numbering; a CUSTOM objective — mapped to none —
// has only this. Unique ignoring case and surrounding space (uq_controls_reference_code).

const MAX = 100;

// Returns { value } (a trimmed string, or null to clear) or { error }.
// `undefined` input means "not supplied" and is passed through untouched.
function normaliseReference(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'reference_code must be a string.' };
  const v = raw.trim();
  if (!v) return { value: null };
  if (v.length > MAX) return { error: `reference_code must be ${MAX} characters or fewer.` };
  return { value: v };
}

// The unique index names the collision; say it in the user's terms.
function referenceConflict(err, value) {
  if (err && err.code === '23505' && /uq_controls_reference_code/.test(err.constraint || err.message || '')) {
    return `The reference "${value}" is already used by another control objective.`;
  }
  return null;
}

module.exports = { normaliseReference, referenceConflict };
