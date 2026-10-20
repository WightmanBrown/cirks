'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Small gaps closed 2026-09-22:
//   • an objective's title and description can be edited after it is created
//     (they could not — a typo was permanent), audited, title kept unique;
//   • the objective CSV import accepts an optional reference_code column;
//   • NIST CSF requirements sort in the CSF's own order (v125).

const { app, request, tokenFor, query } = require('./helpers');

const auth  = () => `Bearer ${tokenFor('ciso')}`;
const patch = (path, body) => request(app).patch(path).set('Authorization', auth()).send(body);
const upload = (csv) => request(app).post('/api/v1/controls/import').set('Authorization', `Bearer ${tokenFor('admin')}`)
  .attach('file', Buffer.from(csv), 'objectives.csv');

const created = [];
afterAll(async () => {
  await query(`DELETE FROM controls WHERE id = ANY($1::uuid[]) OR title LIKE 'IMPORT-REF %'`, [created]);
});

describe('an objective can be reworded', () => {
  let id;
  beforeAll(async () => {
    const r = await query(`INSERT INTO controls (title, control_type) VALUES ('EDIT tpyo objective', 'preventive') RETURNING id`);
    id = r.rows[0].id; created.push(id);
  });

  it('title and description change, and the old words are kept in the audit trail', async () => {
    const res = await patch(`/api/v1/controls/${id}`, { title: 'EDIT typo objective', description: 'Now described.' });
    expect(res.status).toBe(200);
    expect(res.body.control).toMatchObject({ title: 'EDIT typo objective', description: 'Now described.' });
    const { rows } = await query(
      `SELECT field_name, old_value, new_value FROM audit_log
        WHERE entity_type = 'control_objective' AND entity_id = $1 ORDER BY field_name`, [id]);
    expect(rows).toEqual([
      { field_name: 'description', old_value: null, new_value: 'Now described.' },
      { field_name: 'title', old_value: 'EDIT tpyo objective', new_value: 'EDIT typo objective' },
    ]);
  });

  it('a blank title is refused', async () => {
    expect((await patch(`/api/v1/controls/${id}`, { title: '   ' })).status).toBe(400);
  });

  it('a title another objective already has is refused, whatever the case', async () => {
    const { rows } = await query(`SELECT title FROM controls WHERE id <> $1 LIMIT 1`, [id]);
    const res = await patch(`/api/v1/controls/${id}`, { title: rows[0].title.toUpperCase() });
    expect(res.status).toBe(409);
  });
});

describe('the objective CSV import takes a reference', () => {
  it('imports references, and skips a row whose reference clashes', async () => {
    await query(`INSERT INTO controls (title, control_type, reference_code) VALUES ('IMPORT-REF existing', 'preventive', 'IMP-01')`);
    const csv = [
      'control_type,title,description,is_baseline,reference_code',
      'preventive,IMPORT-REF new one,,false,IMP-02',
      'preventive,IMPORT-REF clashes with db,,false,imp-01',
      'preventive,IMPORT-REF clashes in file,,false,IMP-02',
      'preventive,IMPORT-REF no reference,,false,',
    ].join('\n');
    const res = await upload(csv);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors.map(e => e.message)).toEqual([
      expect.stringMatching(/already used by another control objective/),
      expect.stringMatching(/more than once in this file/),
    ]);
    const { rows } = await query(
      `SELECT title, reference_code FROM controls WHERE title LIKE 'IMPORT-REF %' ORDER BY title`);
    expect(rows).toEqual([
      { title: 'IMPORT-REF existing', reference_code: 'IMP-01' },
      { title: 'IMPORT-REF new one', reference_code: 'IMP-02' },
      { title: 'IMPORT-REF no reference', reference_code: null },
    ]);
  });
});
