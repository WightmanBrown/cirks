'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The migration runner used to send a whole no-transaction file as ONE query,
// which Postgres executes in a single IMPLICIT transaction — so the directive
// did not mean what it says, and a file that added an enum value and then used
// it was refused. That took CIRKS-test down on 2026-09-10.
//
// The runner now splits such files. This is the migration engine, so the split
// has to be provably lossless: the first test below runs it over EVERY migration
// in the repository and asserts the pieces reassemble into the original.

const fs = require('fs');
const path = require('path');
const { splitStatements } = require('../../db/splitStatements');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

describe('splitStatements — losslessness over the real corpus', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  // The baseline is frozen at v88, so only the forward migrations live here.
  test('there are migrations to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test.each(files)('%s reassembles exactly', (file) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const parts = splitStatements(sql);
    // Rejoining with the separator that was consumed must recover the original,
    // ignoring only trailing whitespace/comment-only remainder that carries no
    // statement. Compare on non-whitespace content so formatting cannot mask a
    // dropped or duplicated fragment.
    const strip = (s) => s.replace(/\s+/g, '');
    expect(strip(parts.join(';'))).toBe(strip(sql).replace(/;$/, ''));
  });
});

describe('splitStatements — the things a naive split on ";" gets wrong', () => {
  test('a dollar-quoted function body is one statement, semicolons and all', () => {
    const sql = `
CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE t SET a = 1;
  UPDATE t SET b = 2;
  RETURN NEW;
END; $$;
SELECT 1;`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/CREATE FUNCTION/);
    expect(parts[0]).toMatch(/RETURN NEW/);   // the body stayed intact
    expect(parts[1]).toMatch(/SELECT 1/);
  });

  test('a TAGGED dollar quote is handled too', () => {
    const sql = `CREATE FUNCTION g() RETURNS int LANGUAGE sql AS $function$ SELECT 1; $function$;\nSELECT 2;`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/\$function\$/);
  });

  test('a semicolon inside a string literal does not split', () => {
    const sql = `INSERT INTO t (msg) VALUES ('a;b');\nSELECT 1;`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/'a;b'/);
  });

  test("an escaped quote inside a literal does not end the string", () => {
    const sql = `INSERT INTO t (msg) VALUES ('it''s; fine');\nSELECT 1;`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/it''s; fine/);
  });

  test('a semicolon inside a line comment does not split', () => {
    const sql = `-- a comment; with a semicolon\nSELECT 1;\nSELECT 2;`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
  });

  test('a semicolon inside a block comment does not split', () => {
    const sql = `/* a; b; c */\nSELECT 1;`;
    expect(splitStatements(sql)).toHaveLength(1);
  });

  test('comment-only and empty fragments are dropped, not executed', () => {
    const sql = `-- header only\n\n;;\nSELECT 1;\n-- trailing\n`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/SELECT 1/);
  });
});

describe('splitStatements — the case that caused the outage', () => {
  test('ALTER TYPE and a use of the new value become SEPARATE statements', () => {
    const sql = `-- migrate:no-transaction
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'soc_integration';
INSERT INTO role_permissions (role, capability_key) VALUES ('soc_integration', 'knowledge.enrich');`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/ALTER TYPE/);
    expect(parts[1]).toMatch(/INSERT INTO role_permissions/);
    // Sent separately, each autocommits, so the value exists by the time it is
    // used. Sent together they share an implicit transaction and Postgres
    // refuses with "unsafe use of new value".
    expect(parts[0]).not.toMatch(/INSERT/);
  });
});
