'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A control objective's own reference (v123).
//
// A CUSTOM objective — one the organisation writes, mapped to no standard — had no
// reference at all: `controls.reference_code` existed and nothing read or wrote it,
// and the Add dialog offered no field. So it could be neither referred to nor
// sorted. These tests pin: a reference can be set on create and changed later; it
// identifies the objective (unique, ignoring case and spaces); and a custom
// objective shows it everywhere a standard objective shows its standard's ref.

const { app, request, tokenFor, query } = require('./helpers');

const auth = () => `Bearer ${tokenFor('ciso')}`;
const post  = (path, body) => request(app).post(path).set('Authorization', auth()).send(body);
const patch = (path, body) => request(app).patch(path).set('Authorization', auth()).send(body);
const get   = (path)       => request(app).get(path).set('Authorization', auth());

const created = [];
const make = async (title, reference_code) => {
  const res = await post('/api/v1/controls', { title, control_type: 'preventive', reference_code });
  if (res.status === 201) created.push(res.body.control.id);
  return res;
};

afterAll(async () => {
  if (created.length) await query(`DELETE FROM controls WHERE id = ANY($1::uuid[])`, [created]);
});

describe('a control objective has a reference of its own', () => {
  it('is set on create, trimmed', async () => {
    const res = await make('REF test: external access uses MFA', '  ORG-AC-01 ');
    expect(res.status).toBe(201);
    expect(res.body.control.reference_code).toBe('ORG-AC-01');
  });

  it('identifies the objective: a second use is refused, whatever the case', async () => {
    const res = await make('REF test: a different objective', 'org-ac-01');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already used by another control objective/);
  });

  it('a blank reference means none, and many objectives may have none', async () => {
    const a = await make('REF test: no reference A', '   ');
    const b = await make('REF test: no reference B');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.control.reference_code).toBeNull();
  });

  it('can be changed later, and the same uniqueness applies', async () => {
    const id = created[0];
    const ok = await patch(`/api/v1/controls/${id}`, { reference_code: 'ORG-AC-02' });
    expect(ok.status).toBe(200);
    expect(ok.body.control.reference_code).toBe('ORG-AC-02');

    const other = created[1];
    const clash = await patch(`/api/v1/controls/${other}`, { reference_code: 'org-ac-02' });
    expect(clash.status).toBe(409);
  });

  it('the database refuses a blank reference even from direct SQL', async () => {
    await expect(query(`UPDATE controls SET reference_code = '  ' WHERE id = $1`, [created[0]]))
      .rejects.toThrow(/chk_controls_reference_code_not_blank/);
  });
});

describe('a custom objective is shown and found by its reference', () => {
  it('the library marks it CUSTOM with its own reference, and filters on custom', async () => {
    const res = await get('/api/v1/controls?framework=custom');
    expect(res.status).toBe(200);
    const row = res.body.controls.find(c => c.id === created[0]);
    expect(row).toMatchObject({ framework: 'custom', framework_ref: 'ORG-AC-02' });
    // Nothing mapped to a standard is in the custom list.
    expect(res.body.controls.every(c => c.standard_refs.length === 0)).toBe(true);
  });

  it('search finds it by reference', async () => {
    const res = await get('/api/v1/controls?q=ORG-AC-02');
    expect(res.body.controls.map(c => c.id)).toContain(created[0]);
  });

  it('the detail page shows it', async () => {
    const res = await get(`/api/v1/controls/${created[0]}`);
    expect(res.body.control).toMatchObject({ framework: 'custom', framework_ref: 'ORG-AC-02', reference_code: 'ORG-AC-02' });
  });

  it('the SoA files it under Custom control objectives, by its reference', async () => {
    const res = await get('/api/v1/soa');
    const group = res.body.groups.find(g => g.label === 'Custom control objectives');
    const row = group.controls.find(c => c.control_id === created[0]);
    expect(row.ref).toBe('ORG-AC-02');
  });
});

describe('the SoA has a view of custom objectives on their own', () => {
  const ids = (body) => (body.groups || []).flatMap(g => g.controls.map(c => c.control_id)).sort();

  it('lists exactly the objectives mapped to no standard, and keeps them editable', async () => {
    const res = await get('/api/v1/soa?framework=custom');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ framework: 'custom', framework_label: 'Custom control objectives' });
    const rows = res.body.groups.flatMap(g => g.controls);
    expect(rows.map(r => r.control_id)).toContain(created[0]);
    expect(rows.every(r => r.standard_refs.length === 0)).toBe(true);
    // It is the record, not a standard's derived lens.
    expect(rows.every(r => r.entry_kind === 'control')).toBe(true);
  });

  it('its coverage describes the same rows', async () => {
    const [cov, page] = await Promise.all([get('/api/v1/soa/coverage?framework=custom'), get('/api/v1/soa?framework=custom')]);
    expect(cov.status).toBe(200);
    expect(cov.body.controls.map(c => c.control_id).sort()).toEqual(ids(page.body));
  });
});

