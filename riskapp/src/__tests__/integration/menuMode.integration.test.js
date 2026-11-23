'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The simple or full menu, per person (v183, owner 2026-11-18). Unset, it
// follows the person's role: simple for an information asset owner, full for
// the CISO. A choice is remembered; null goes back to the role's default.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const get = (role) => request(app).get('/api/v1/users/me/menu-mode').set(as(role));
const put = (role, menu_mode) => request(app).put('/api/v1/users/me/menu-mode').set(as(role)).send({ menu_mode });

afterAll(async () => {
  await query('UPDATE users SET menu_mode = NULL WHERE id = ANY($1)', [[USERS.owner.id, USERS.ciso.id]]);
});

test('unset, the menu follows the role: simple for an owner, full for the CISO', async () => {
  await query('UPDATE users SET menu_mode = NULL WHERE id = ANY($1)', [[USERS.owner.id, USERS.ciso.id]]);
  expect((await get('owner')).body).toEqual({ menu_mode: 'simple', chosen: null, role_default: 'simple' });
  expect((await get('ciso')).body).toEqual({ menu_mode: 'full', chosen: null, role_default: 'full' });
});

test('a choice is remembered, null goes back to the default, and nothing else is accepted', async () => {
  expect((await put('owner', 'full')).body).toEqual({ menu_mode: 'full', chosen: 'full', role_default: 'simple' });
  expect((await get('owner')).body.menu_mode).toBe('full');
  const { rows: [u] } = await query('SELECT menu_mode FROM users WHERE id = $1', [USERS.owner.id]);
  expect(u.menu_mode).toBe('full');
  expect((await put('owner', null)).body).toEqual({ menu_mode: 'simple', chosen: null, role_default: 'simple' });
  expect((await put('owner', 'expert')).status).toBe(400);
});
