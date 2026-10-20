'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The organisation capture workbook (docs/templates) is filled in by a person,
// saved from Excel one sheet at a time, and loaded by db/import.js. This runs
// the real importer on files written the way Excel's "CSV UTF-8" writes them —
// byte-order mark, CRLF — one file per run, in the workbook's order.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { query } = require('./helpers');

const IMPORT = path.join(__dirname, '..', '..', '..', 'db', 'import.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cirks-capture-'));
let n = 0;

// Load ONE file, as a person loading sheet by sheet does. Returns the report.
function load(file, rows, extraArgs = ['--password', 'Capture-Test-Start-1']) {
  const dir = path.join(root, String(++n));
  fs.mkdirSync(dir);
  const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(path.join(dir, file), '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n');
  // The importer exits non-zero when any row is in error; the report is still what is wanted.
  try {
    return execFileSync('node', [IMPORT, dir, ...extraArgs], { env: { ...process.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}
const counts = (out, slug) => out.match(new RegExp(`${slug}: imported (\\d+), skipped (\\d+), errors (\\d+)`)).slice(1).map(Number);

afterAll(async () => {
  await query(`DELETE FROM business_service_systems WHERE service_id IN (SELECT id FROM business_services WHERE name LIKE 'OCW %')`);
  await query(`DELETE FROM business_services WHERE name LIKE 'OCW %'`);
  await query(`DELETE FROM system_assets WHERE system_id IN (SELECT id FROM systems WHERE name LIKE 'OCW %')`);
  await query(`DELETE FROM audit_log WHERE entity_id IN (SELECT id FROM systems WHERE name LIKE 'OCW %' UNION SELECT id FROM information_assets WHERE name LIKE 'OCW %')`);
  await query(`DELETE FROM systems WHERE name LIKE 'OCW %'`);
  await query(`DELETE FROM asset_impact_ratings WHERE asset_id IN (SELECT id FROM information_assets WHERE name LIKE 'OCW %')`);
  await query(`DELETE FROM information_assets WHERE name LIKE 'OCW %'`);
  await query(`DELETE FROM impact_tables WHERE name LIKE 'OCW %'`);
  await query(`UPDATE departments SET owner_user_id = NULL WHERE name LIKE 'OCW %'`);
  await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'ocw.%')`);
  await query(`DELETE FROM users WHERE email LIKE 'ocw.%'`);
  await query(`DELETE FROM departments WHERE name LIKE 'OCW %'`);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the capture workbook, loaded one sheet at a time', () => {
  // 2026-10-15: a blank password cell used to become 'Riskapp123' — the demo
  // password published in the repository — when no --password was given.
  test('a person with no password, loaded without --password, is refused — no built-in default', async () => {
    const env = { ...process.env }; delete env.DEMO_PASSWORD;
    const dir = path.join(root, String(++n)); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'users.csv'),
      'email,full_name,role,department_name,is_active,view_mode,password\r\nocw.nopw@example.org,OCW No Password,information_asset_owner,,yes,business,\r\n');
    let out;
    try { out = execFileSync('node', [IMPORT, dir], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (err) { out = `${err.stdout || ''}${err.stderr || ''}`; }
    expect(counts(out, 'users')).toEqual([0, 0, 1]);
    expect(out).toMatch(/no password: load with --password/);
    expect((await query(`SELECT 1 FROM users WHERE email = 'ocw.nopw@example.org'`)).rowCount).toBe(0);
  });

  test('departments, saved from Excel with a byte-order mark', () => {
    const out = load('departments.csv', [['name', 'description', 'owner_email'], ['OCW Finance', 'Budgets, payments', 'ocw.head@example.org']]);
    expect(counts(out, 'departments')).toEqual([1, 0, 0]);
  });

  test('users, then additional roles', async () => {
    const out = load('users.csv', [
      ['email', 'full_name', 'role', 'department_name', 'is_active', 'view_mode', 'password'],
      ['ocw.head@example.org', 'OCW Head', 'information_asset_owner', 'OCW Finance', 'yes', 'business', ''],
      ['ocw.manager@example.org', 'OCW Manager', 'information_asset_manager', 'OCW Finance', '', '', ''],
      ['', '', '', '', '', '', ''],          // a cleared row left behind is a blank line, not an error
    ]);
    expect(counts(out, 'users')).toEqual([2, 0, 0]);
    expect(counts(load('user_roles.csv', [['email', 'role'], ['ocw.manager@example.org', 'security_architect']]), 'user_roles')).toEqual([1, 0, 0]);
    const { rows } = await query(`SELECT role::text FROM v_user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'ocw.manager@example.org') ORDER BY 1`);
    expect(rows.map((r) => r.role)).toEqual(['information_asset_manager', 'security_architect']);
  });

  test('the department head is filled by loading departments again once the users exist', async () => {
    const head = async () => (await query(
      `SELECT u.email FROM departments d LEFT JOIN users u ON u.id = d.owner_user_id WHERE d.name = 'OCW Finance'`)).rows[0].email;
    expect(await head()).toBeNull();           // the user did not exist when the department loaded
    const out = load('departments.csv', [['name', 'description', 'owner_email'], ['OCW Finance', 'Budgets, payments', 'ocw.head@example.org']]);
    expect(counts(out, 'departments')).toEqual([0, 1, 0]);
    expect(await head()).toBe('ocw.head@example.org');
  });

  test('an impact table needs an owning department, and says so in words', () => {
    const out = load('impact-tables.csv', [
      ['name', 'description', 'scope', 'department_name', 'mandatory', 'published'],
      ['OCW Orphan table', '', 'organisation', '', 'no', 'yes'],
      ['OCW Financial loss', 'Cost', 'organisation', 'OCW Finance', 'no', 'yes'],
    ]);
    expect(counts(out, 'impact-tables')).toEqual([1, 0, 1]);
    expect(out).toMatch(/every impact table needs an owning department/);
  });

  test('levels, an asset, its rating, a system and a service: the impact arrives by itself', async () => {
    load('impact-table-bil-levels.csv', [['table_name', 'level', 'statement'], ...[1, 2, 3, 4, 5].map((l) => ['OCW Financial loss', l, `Level ${l}`])]);
    // The table assesses confidentiality and integrity only.
    load('impact-table-cia-levels.csv', [['table_name', 'level', 'dimension', 'statement'],
      ...[1, 2, 3, 4, 5].flatMap((l) => ['c', 'i'].map((d) => ['OCW Financial loss', l, d, `Level ${l}`]))]);
    load('information-assets.csv', [['name', 'description', 'department_name', 'owner_email', 'managed_by_email', 'is_shared', 'is_active'],
      ['OCW Payroll records', 'Salaries, "bank details"', 'OCW Finance', 'ocw.head@example.org', 'ocw.manager@example.org', 'no', 'yes']]);
    load('asset-impact-ratings.csv', [['asset_name', 'impact_table_name', 'rated_level', 'c_level', 'i_level', 'a_level'],
      ['OCW Payroll records', 'OCW Financial loss', 4, '', '', '']]);
    load('systems.csv', [['name', 'description', 'department_name', 'owner_email', 'manager_email', 'is_shared', 'is_active'],
      ['OCW Payroll system', 'Pays staff', 'OCW Finance', 'ocw.head@example.org', 'ocw.manager@example.org', 'no', 'yes']]);
    load('system-assets.csv', [['system_name', 'asset_name', 'notes'], ['OCW Payroll system', 'OCW Payroll records', '']]);
    load('business-services.csv', [['name', 'description', 'department_name', 'manager_email', 'is_shared', 'is_active'],
      ['OCW Paying staff', 'Monthly pay', 'OCW Finance', 'ocw.manager@example.org', 'no', 'yes']]);
    const out = load('business-service-systems.csv', [['service_name', 'system_name'], ['OCW Paying staff', 'OCW Payroll system']]);
    expect(counts(out, 'business-service-systems')).toEqual([1, 0, 0]);

    const asset = (await query(`SELECT description, confidentiality c, integrity i, availability a FROM information_assets WHERE name = 'OCW Payroll records'`)).rows[0];
    expect(asset).toEqual({ description: 'Salaries, "bank details"', c: 4, i: 4, a: 1 });   // availability is not assessed: floors to 1
    const system = (await query(`SELECT impact_c c, impact_i i, impact_a a FROM systems WHERE name = 'OCW Payroll system'`)).rows[0];
    expect(system).toEqual({ c: 4, i: 4, a: 1 });
    const service = (await query(`SELECT confidentiality c, integrity i, availability a FROM business_services WHERE name = 'OCW Paying staff'`)).rows[0];
    expect(service).toEqual({ c: 4, i: 4, a: 1 });
  });
});
