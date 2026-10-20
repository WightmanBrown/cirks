'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Phase 6: separation-of-duties triggers (v65). Each rule has an org-wide toggle
// in sod_rules (default off). These tests run each enforcement transactionally —
// enable the rule, attempt a violating + a non-violating operation, then ROLLBACK
// so nothing (including the toggle) leaks to other suites. Default-off behaviour is
// covered by every other suite staying green.

const { pool } = require('./helpers');

const CISO  = '11111111-0000-0000-0000-000000000002';
const ANALY = '11111111-0000-0000-0000-000000000003';
const OWNER = '11111111-0000-0000-0000-000000000005';
const RISK  = '66666666-0000-0000-0000-000000000001'; // seed risk; owner DERIVED = the IAO of its system's dept

async function inTxn(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

async function enable(c, key) {
  await c.query('UPDATE sod_rules SET enabled = TRUE WHERE key = $1', [key]);
}

describe('SoD rule: risk.validate (validator ≠ identifier)', () => {
  test('blocks self-validation when enabled', async () => {
    await inTxn(async (c) => {
      await enable(c, 'risk.validate');
      await expect(
        c.query(`UPDATE risks SET validation_status='validated', identified_by=$2, validated_by=$2 WHERE id=$1`, [RISK, CISO]),
      ).rejects.toThrow(/SoD\[risk\.validate\]/);
    });
  });
  test('allows validation by a different person', async () => {
    await inTxn(async (c) => {
      await enable(c, 'risk.validate');
      await expect(
        c.query(`UPDATE risks SET validation_status='validated', identified_by=$2, validated_by=$3 WHERE id=$1`, [RISK, ANALY, CISO]),
      ).resolves.toBeDefined();
    });
  });
});

describe('SoD rule: exception.accept (acceptor ≠ risk owner)', () => {
  function insertException(c, acceptedBy) {
    return c.query(
      `INSERT INTO exceptions (subject_type, origin, risk_id, justification, accepted_by, accepted_role, expires_at, review_cadence)
       VALUES ('risk', 'risk_treatment', $1, 'test', $2, 'ciso', now() + interval '30 days', 'quarterly')`,
      [RISK, acceptedBy],
    );
  }
  test('blocks the risk owner accepting their own risk exception when enabled', async () => {
    await inTxn(async (c) => {
      await enable(c, 'exception.accept');
      await expect(insertException(c, OWNER)).rejects.toThrow(/SoD\[exception\.accept\]/);
    });
  });
  test('allows a non-owner to accept', async () => {
    await inTxn(async (c) => {
      await enable(c, 'exception.accept');
      await expect(insertException(c, CISO)).resolves.toBeDefined();
    });
  });
  test('allows the owner when the rule is disabled (default)', async () => {
    await inTxn(async (c) => {
      // rule left at its seeded default (false)
      await expect(insertException(c, OWNER)).resolves.toBeDefined();
    });
  });
});

describe('SoD rule: impact_table.publish (publisher ≠ creator)', () => {
  async function makeTable(c, createdBy) {
    // department_id is required at EVERY scope since v102 — an organisation-scope
    // table applies to all departments but is still OWNED by one. Take the
    // creator's own department, which is what POST /bil/impact-tables does.
    const { rows } = await c.query(
      `INSERT INTO impact_tables (name, scope, department_id, created_by)
       VALUES ('SoD Test', 'organisation',
               (SELECT department_id FROM users WHERE id = $1), $1)
       RETURNING id`,
      [createdBy],
    );
    return rows[0].id;
  }
  test('blocks the creator publishing their own table when enabled', async () => {
    await inTxn(async (c) => {
      await enable(c, 'impact_table.publish');
      const id = await makeTable(c, CISO);
      await expect(
        c.query(`UPDATE impact_tables SET published_at=now(), published_by=$2 WHERE id=$1`, [id, CISO]),
      ).rejects.toThrow(/SoD\[impact_table\.publish\]/);
    });
  });
  test('allows a different publisher', async () => {
    await inTxn(async (c) => {
      await enable(c, 'impact_table.publish');
      const id = await makeTable(c, CISO);
      await expect(
        c.query(`UPDATE impact_tables SET published_at=now(), published_by=$2 WHERE id=$1`, [id, ANALY]),
      ).resolves.toBeDefined();
    });
  });
});

describe('SoD rule: role.grant (no self-elevation)', () => {
  test('blocks granting a role to yourself when enabled', async () => {
    await inTxn(async (c) => {
      await enable(c, 'role.grant');
      await expect(
        c.query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, 'risk_analyst', $1)`, [OWNER]),
      ).rejects.toThrow(/SoD\[role\.grant\]/);
    });
  });
  test('allows another admin to grant the role', async () => {
    await inTxn(async (c) => {
      await enable(c, 'role.grant');
      await expect(
        c.query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, 'risk_analyst', $2)`, [OWNER, CISO]),
      ).resolves.toBeDefined();
    });
  });
});
