'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Regression guard for the v38 schema-drift bug: POST /bil/impact-tables/:id/publish
// queried impact_table_custom_subcategories / impact_row_cia_analysis, both DROPPED
// by v38. The handler 500'd for anyone allowed to publish (IAM on a dept table).
// These tests reproduce that (RED) and lock the fixed behaviour (GREEN after Phase 3).

const { app, query, request, tokenFor, IT_DEPT } = require('./helpers');

let tableId;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO impact_tables (name, scope, department_id, created_by)
     VALUES ('ITG Publish Regression', 'department', $1, $2)
     RETURNING id`,
    [IT_DEPT, '11111111-0000-0000-0000-000000000004']
  );
  tableId = rows[0].id;

  // Fully populate every BIL level and every CIA dimension/level with a statement,
  // so a correct completeness check treats the table as publishable.
  for (let lvl = 1; lvl <= 5; lvl++) {
    await query(
      `INSERT INTO impact_table_bil_levels (impact_table_id, level, statement)
       VALUES ($1, $2, $3)`,
      [tableId, lvl, `BIL ${lvl} statement`]
    );
    for (const dim of ['c', 'i', 'a']) {
      await query(
        `INSERT INTO impact_table_cia_levels (impact_table_id, level, dimension, statement)
         VALUES ($1, $2, $3, $4)`,
        [tableId, lvl, dim, `${dim.toUpperCase()}${lvl} statement`]
      );
    }
  }
});

afterAll(async () => {
  if (tableId) await query('DELETE FROM impact_tables WHERE id = $1', [tableId]);
});

test('IAM publishing a complete dept impact table does not 500 (v38 schema drift)', async () => {
  const res = await request(app)
    .post(`/api/v1/bil/impact-tables/${tableId}/publish`)
    .set('Authorization', `Bearer ${tokenFor('iam')}`);
  expect(res.status).not.toBe(500);
  expect([200, 422]).toContain(res.status);
});

test('a fully-populated dept impact table publishes (200) for IAM', async () => {
  const res = await request(app)
    .post(`/api/v1/bil/impact-tables/${tableId}/publish`)
    .set('Authorization', `Bearer ${tokenFor('iam')}`);
  expect(res.status).toBe(200);
  expect(res.body.published_at).toBeTruthy();

  const { rows } = await query(
    'SELECT published_at, published_by FROM impact_tables WHERE id = $1',
    [tableId]
  );
  expect(rows[0].published_at).not.toBeNull();
  expect(rows[0].published_by).toBe('11111111-0000-0000-0000-000000000004');
});

// ── Per-dimension completeness (replaces the all-fifteen-rows rule) ───────────
//
// A blank dimension is a statement, not an omission: "this dimension carries no
// impact for this subject area". Ten of the seeded Misty Isles tables are like
// this — availability/integrity only for supply and continuity, confidentiality
// only for privacy. The old rule demanded a statement in every one of the
// fifteen rows POST seeds, which forced authors to type "n/a" — the worst
// possible answer, because a non-empty statement makes the dimension INHERIT the
// rated level in recomputeAssetCia, inflating the very score the author meant to
// exclude.
//
// These need a real database: the rule is a GROUP BY … HAVING over the level
// rows, which the mocked layer cannot evaluate.

async function makeTable(name) {
  const { rows } = await query(
    `INSERT INTO impact_tables (name, scope, department_id, created_by)
     VALUES ($1, 'department', $2, $3) RETURNING id`,
    [name, IT_DEPT, '11111111-0000-0000-0000-000000000004'],
  );
  return rows[0].id;
}

// Mirrors POST /bil/impact-tables, which seeds all fifteen rows blank.
async function seedBlankGrid(id) {
  await query(
    `INSERT INTO impact_table_cia_levels (impact_table_id, level, dimension)
     SELECT $1, s, d FROM generate_series(1,5) s
       CROSS JOIN (VALUES ('c'::CHAR(1)),('i'::CHAR(1)),('a'::CHAR(1))) dims(d)`, [id]);
  for (let lvl = 1; lvl <= 5; lvl++) {
    await query(`INSERT INTO impact_table_bil_levels (impact_table_id, level, statement)
                 VALUES ($1, $2, $3)`, [id, lvl, `BIL ${lvl}`]);
  }
}

// Write a real statement into the given levels of one dimension. Levels not
// listed stay blank, which is how "this dimension does not apply here" is said.
async function fill(id, dim, levels) {
  for (const lvl of levels) {
    await query(
      `UPDATE impact_table_cia_levels
          SET statement = $3
        WHERE impact_table_id = $1 AND dimension = $2 AND level = $4`,
      [id, dim, `${dim.toUpperCase()}${lvl} statement`, lvl],
    );
  }
}

const publish = id => request(app)
  .post(`/api/v1/bil/impact-tables/${id}/publish`)
  .set('Authorization', `Bearer ${tokenFor('iam')}`);

describe('publish: per-dimension completeness', () => {
  const made = [];
  afterAll(async () => {
    for (const id of made) await query('DELETE FROM impact_tables WHERE id = $1', [id]);
  });

  test('an availability-only table publishes — the case that drove the change', async () => {
    const id = await makeTable('ITG Availability Only'); made.push(id);
    await seedBlankGrid(id);
    await fill(id, 'a', [1, 2, 3, 4, 5]);          // C and I deliberately left blank

    const res = await publish(id);
    expect(res.status).toBe(200);
    expect(res.body.published_at).toBeTruthy();
  });

  test('a half-described dimension is refused — the error the old rule could not see', async () => {
    const id = await makeTable('ITG Half Described'); made.push(id);
    await seedBlankGrid(id);
    await fill(id, 'a', [1, 2, 3, 4, 5]);
    await fill(id, 'c', [1, 2, 3]);                // 3 of 5 — score would depend on rated level

    const res = await publish(id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/C has 3 of 5/);
    expect(res.body.error).toMatch(/do not write "n\/a"/i);
  });

  test('a table with nothing described is refused', async () => {
    const id = await makeTable('ITG Nothing Described'); made.push(id);
    await seedBlankGrid(id);

    const res = await publish(id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/at least one CIA dimension/i);
  });
});

// ── Published tables are frozen, and edits re-derive the assets ──────────────
//
// Statement-presence is what lets a dimension contribute to an asset's C/I/A,
// so editing a table's levels changes what every rating against it MEANS. Two
// consequences, both only observable against a real database:
//   * a published table must refuse level edits (its scale is depended upon), and
//   * an edit to an unpublished one must re-derive the assets rated against it.
// Before this, neither held: publish-then-edit was the documented workaround for
// the completeness check, and nothing recomputed afterwards.

describe('published tables are frozen; edits recompute', () => {
  let tId, assetId;

  beforeAll(async () => {
    tId = await makeTable('ITG Freeze And Recompute');
    await seedBlankGrid(tId);
    await fill(tId, 'a', [1, 2, 3, 4, 5]);      // availability only, to start

    const { rows } = await query(
      `INSERT INTO information_assets (name, department_id, is_active)
       VALUES ('ITG Recompute Probe', $1, TRUE) RETURNING id`, [IT_DEPT]);
    assetId = rows[0].id;

    await query(
      `INSERT INTO asset_impact_ratings (asset_id, impact_table_id, rated_level)
       VALUES ($1, $2, 4)`, [assetId, tId]);
    // Derive from the availability-only table: A=4, C and I floor to 1.
    await request(app)
      .put(`/api/v1/bil/impact-tables/${tId}/cia-levels`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ levels: [{ level: 1, dimension: 'a', statement: 'A1 statement' }] });
  });

  afterAll(async () => {
    if (assetId) await query('DELETE FROM information_assets WHERE id = $1', [assetId]);
    if (tId) await query('DELETE FROM impact_tables WHERE id = $1', [tId]);
  });

  test('editing levels re-derives the assets rated against the table', async () => {
    const before = await query('SELECT confidentiality FROM information_assets WHERE id=$1', [assetId]);
    expect(Number(before.rows[0].confidentiality)).toBe(1);   // C blank → floors to 1

    // Describe confidentiality fully. The asset is rated 4, so C must become 4.
    const levels = [1, 2, 3, 4, 5].map(l => ({ level: l, dimension: 'c', statement: `C${l} statement` }));
    const res = await request(app)
      .put(`/api/v1/bil/impact-tables/${tId}/cia-levels`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ levels });
    expect(res.status).toBe(200);

    const after = await query('SELECT confidentiality FROM information_assets WHERE id=$1', [assetId]);
    expect(Number(after.rows[0].confidentiality)).toBe(4);
  });

  test('clearing a dimension re-derives it back down', async () => {
    const levels = [1, 2, 3, 4, 5].map(l => ({ level: l, dimension: 'c', statement: null }));
    await request(app)
      .put(`/api/v1/bil/impact-tables/${tId}/cia-levels`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ levels })
      .expect(200);

    const { rows } = await query('SELECT confidentiality FROM information_assets WHERE id=$1', [assetId]);
    expect(Number(rows[0].confidentiality)).toBe(1);
  });

  test('a published table refuses level edits — closing the publish-then-edit bypass', async () => {
    await request(app)
      .post(`/api/v1/bil/impact-tables/${tId}/publish`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .expect(200);

    const res = await request(app)
      .put(`/api/v1/bil/impact-tables/${tId}/cia-levels`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ levels: [{ level: 1, dimension: 'a', statement: 'edited after publish' }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/frozen/i);
  });

  test('unpublishing reopens it for editing', async () => {
    await request(app)
      .post(`/api/v1/bil/impact-tables/${tId}/unpublish`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .expect(200);

    await request(app)
      .put(`/api/v1/bil/impact-tables/${tId}/cia-levels`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ levels: [{ level: 1, dimension: 'a', statement: 'A1 revised' }] })
      .expect(200);
  });

  test('unpublishing an unpublished table is refused rather than silently accepted', async () => {
    const res = await request(app)
      .post(`/api/v1/bil/impact-tables/${tId}/unpublish`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not published/i);
  });
});
