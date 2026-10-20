'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /actions archive filtering: the default list hides terminal / "archived"
// actions that no longer need acting on; they remain reachable via
// ?status=archived and ?status=all for audit. Invariant-based so it doesn't
// depend on exact seed counts.
//
// v97 moved 'completed' INTO the archived set. With the verify step retired, an
// action that has completed every remediation item is the end of the line, not a
// staging post awaiting sign-off — so 'verified'/'rejected' are gone and
// archived is now exactly ('completed','cancelled').

const { app, request, tokenFor } = require('./helpers');

const ARCHIVED = new Set(['completed', 'cancelled']);
const list = (qs = '') =>
  request(app).get(`/api/v1/actions${qs}`).set('Authorization', `Bearer ${tokenFor('ciso')}`);

describe('GET /actions — archive (terminal-status) filtering', () => {
  test('default view excludes archived actions', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.actions.length).toBeGreaterThan(0);
    for (const a of res.body.actions) expect(ARCHIVED.has(a.status)).toBe(false);
  });

  test('?status=archived returns only terminal actions', async () => {
    const res = await list('?status=archived');
    expect(res.status).toBe(200);
    expect(res.body.actions.length).toBeGreaterThan(0); // seed has completed + cancelled actions
    for (const a of res.body.actions) expect(ARCHIVED.has(a.status)).toBe(true);
  });

  test('?status=all is exactly active ∪ archived (a partition, no overlap)', async () => {
    const [all, active, archived] = await Promise.all([list('?status=all'), list(), list('?status=archived')]);
    expect(all.body.actions.length).toBe(active.body.actions.length + archived.body.actions.length);
  });

  // Regression guard for the v97 flip: 'completed' must NOT appear in the
  // default (active) view any more, and the retired statuses must never come back.
  test('completed counts as archived, not active', async () => {
    const [active, archived] = await Promise.all([list(), list('?status=archived')]);
    expect(active.body.actions.some((a) => a.status === 'completed')).toBe(false);
    expect(archived.body.actions.some((a) => a.status === 'completed')).toBe(true);
  });

  test('the retired verified/rejected statuses are gone', async () => {
    const all = await list('?status=all');
    for (const a of all.body.actions) expect(['verified', 'rejected']).not.toContain(a.status);
    expect((await list('?status=verified')).status).toBe(400);
  });

  test('a specific status filter still works', async () => {
    const res = await list('?status=in_progress');
    expect(res.status).toBe(200);
    for (const a of res.body.actions) expect(a.status).toBe('in_progress');
  });

  test('an invalid status filter is rejected 400', async () => {
    const res = await list('?status=bogus');
    expect(res.status).toBe(400);
  });
});
