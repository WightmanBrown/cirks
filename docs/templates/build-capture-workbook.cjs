#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Builds the organisation capture workbook: one sheet per dataset that
// riskapp/db/import.js loads, in load order, with the importer's own column
// names in row 1 so each sheet can be saved as <file>.csv and loaded as it is.
//
//   node build-capture-workbook.cjs <out-dir> [--csv <dir>]
//
// Writes CIRKS-organisation-capture.xlsx (blank) and
// CIRKS-organisation-capture-EXAMPLE.xlsx (a small invented organisation).
// With --csv it also writes the example's sheets as CSV files exactly as Excel's
// "CSV UTF-8" would (byte-order mark, CRLF), which is what the import check uses.
//
// Needs `exceljs`, which is NOT a dependency of the application — install it
// somewhere temporary and point NODE_PATH at it:
//   (cd /tmp/x && npm i exceljs) && NODE_PATH=/tmp/x/node_modules node build-capture-workbook.cjs .
//
// The column lists below must match DATASETS in riskapp/db/import.js. If a
// column is added there, add it here and rebuild.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROWS = 500; // rows given drop-downs and checks on each sheet
const YESNO = ['yes', 'no'];
const ROLES = [
  ['admin', 'Administrator', 'Manages accounts, roles, permissions and departments. Not a risk role.', 'IT service owner or system administrator'],
  ['ciso', 'CISO', 'Validates risks, accepts security actions and exceptions, owns the control picture.', 'Chief Information Security Officer'],
  ['siro', 'SIRO', 'Senior Information Risk Owner. Signs off review cycles; owns a department\'s risks where it has no Information Asset Owner.', 'A board-level executive'],
  ['risk_analyst', 'Risk Analyst', 'Assesses risks; maintains threats, control objectives, security solutions and the architecture.', 'Security team analysts'],
  ['information_asset_owner', 'Information Asset Owner (IAO)', 'Accountable for a department\'s information assets, systems and risks. Sees and acts for their own department. Expect ONE per department.', 'Head of the department'],
  ['information_asset_manager', 'Information Asset Manager (IAM)', 'Runs the department\'s assets, systems and services day to day. Own department only. A department may have several, for example one per minor department or team.', 'The department\'s operations or IT lead'],
  ['meeting_secretary', 'Meeting Secretary', 'Plans, runs and minutes Security Working Group meetings.', 'Governance or PMO support'],
  ['security_consultant', 'Security Consultant', 'An external onboarding role: sets up the first picture during the setup phase, then loses its write access.', 'The consultant loading this workbook'],
  ['security_architect', 'Security Architect', 'Edits the systems architecture template, the patterns and the component library; reads everything. Normally an ADDITIONAL role for a named person.', 'An IAM or analyst who also does architecture'],
  ['soc_analyst', 'SOC Analyst', 'Read-only across risk, architecture and controls, for enriching security events.', 'Security operations staff'],
];
const ROLE_KEYS = ROLES.map((r) => r[0]);

// A list drawn from a column of another sheet.
const from = (sheet, col = 'A') => ({ ref: `'${sheet}'!$${col}$2:$${col}$${ROWS + 1}` });

// ── The sheets, in LOAD ORDER ────────────────────────────────────────────────
// col: [name, width, required?, help, validation?]
//   validation: array = fixed list · { ref } = list from another sheet · 'level' = whole number 1–5
const SHEETS = [
  {
    title: '01 Departments', file: 'departments.csv',
    what: 'Every department that owns information, systems or services. A CIRKS department is the level that has its own Information Asset Owner: record major departments here, not the minor departments under them (see Read me). Load first: almost everything else names a department.',
    cols: [
      ['name', 34, true, 'The department\'s name. Must be unique. Every other sheet refers to the department by exactly this text.'],
      ['description', 60, false, 'What the department does, in a sentence.'],
      ['owner_email', 34, false, 'Email of the department\'s head, as it appears on the Users sheet. Optional. Filled in after Users load, so the user does not have to exist first.', from('02 Users')],
    ],
    example: [
      ['Finance', 'Budgets, payments and payroll.', 'h.finance@example.org'],
      ['Customer Services', 'Enquiries, complaints and the customer portal.', 'h.customer@example.org'],
      ['Information Technology', 'Runs the shared network, sign-in and hosting.', 'h.it@example.org'],
    ],
  },
  {
    title: '02 Users', file: 'users.csv',
    what: 'Everyone who will sign in. Each person has ONE primary role here; further roles go on the next sheet.',
    cols: [
      ['email', 34, true, 'The sign-in name. Must be unique (capital letters are ignored).'],
      ['full_name', 30, true, 'The person\'s name as it should appear on screen.'],
      ['role', 28, false, 'Primary role: one of the keys on the Roles sheet. Blank = information_asset_owner.', ROLE_KEYS],
      ['department_name', 34, false, 'Their department, exactly as on the Departments sheet. Required in practice for an IAO or IAM: those roles see only their own department.', from('01 Departments')],
      ['is_active', 12, false, 'yes or no. Blank = yes. "no" creates the account switched off.', YESNO],
      ['view_mode', 14, false, 'business (rating words) or expert (numbers). Blank = business. The person can change it.', ['business', 'expert']],
      ['password', 22, false, 'LEAVE BLANK. Blank gives every account the starting password chosen when the file is loaded (the load refuses a user with no password at all). CIRKS has no self-service password change yet: an administrator then sets each person\'s own password on Admin, User accounts. Do not keep real passwords in a spreadsheet.'],
    ],
    example: [
      ['ciso@example.org', 'Priya Nair', 'ciso', 'Information Technology', 'yes', 'expert', ''],
      ['siro@example.org', 'Daniel Okafor', 'siro', '', 'yes', 'business', ''],
      ['analyst@example.org', 'Marta Lindqvist', 'risk_analyst', 'Information Technology', 'yes', 'expert', ''],
      ['h.finance@example.org', 'Helen Marsh', 'information_asset_owner', 'Finance', 'yes', 'business', ''],
      ['m.finance@example.org', 'Tom Adeyemi', 'information_asset_manager', 'Finance', 'yes', 'business', ''],
      ['h.customer@example.org', 'Grace Tan', 'information_asset_owner', 'Customer Services', 'yes', 'business', ''],
      ['m.customer@example.org', 'Luis Ortega', 'information_asset_manager', 'Customer Services', 'yes', 'business', ''],
      ['h.it@example.org', 'Aisha Rahman', 'information_asset_owner', 'Information Technology', 'yes', 'business', ''],
      ['m.it@example.org', 'Ben Whitaker', 'information_asset_manager', 'Information Technology', 'yes', 'expert', ''],
      ['secretary@example.org', 'Olive Park', 'meeting_secretary', '', 'yes', 'business', ''],
    ],
  },
  {
    title: '03 Additional roles', file: 'user_roles.csv',
    what: 'Only for people who hold MORE than one role. One row per extra role. Leave empty if nobody does.',
    cols: [
      ['email', 34, true, 'The person, as on the Users sheet.', from('02 Users')],
      ['role', 28, true, 'The extra role: a key from the Roles sheet. Must differ from their primary role.', ROLE_KEYS],
    ],
    example: [
      ['m.it@example.org', 'security_architect'],
      ['analyst@example.org', 'meeting_secretary'],
    ],
  },
  {
    title: '04 Impact tables', file: 'impact-tables.csv',
    what: 'The scales information is rated against, e.g. "Financial loss", "Harm to individuals". One row per table; its level wording goes on the next two sheets.',
    cols: [
      ['name', 40, true, 'The table\'s name. Must be unique: the next sheets and the asset ratings refer to it by this text.'],
      ['description', 60, false, 'What kind of harm this table measures.'],
      ['scope', 16, true, 'organisation = every department rates against it. department = only the department named in the next column uses it.', ['organisation', 'department']],
      ['department_name', 34, true, 'The department ACCOUNTABLE for the table\'s wording. Required for every table, an organisation-wide one included: scope says how far it reaches, this says who looks after it.', from('01 Departments')],
      ['mandatory', 12, false, 'yes = every information asset MUST be rated against this table. Only allowed when scope is organisation AND published is yes. Blank = no.', YESNO],
      ['published', 12, false, 'yes = ready to rate against. Blank = draft.', YESNO],
    ],
    example: [
      ['Financial loss', 'Direct cost to the organisation or its customers.', 'organisation', 'Finance', 'yes', 'yes'],
      ['Harm to individuals', 'Distress, loss of privacy or physical harm to a person.', 'organisation', 'Information Technology', 'yes', 'yes'],
      ['Customer service standards', 'Missed service commitments to customers.', 'department', 'Customer Services', 'no', 'yes'],
    ],
  },
  {
    title: '05 Impact levels', file: 'impact-table-bil-levels.csv',
    what: 'For each impact table, what each level 1–5 MEANS in words. Five rows per table (1 = least harm, 5 = most).',
    cols: [
      ['table_name', 40, true, 'The impact table, exactly as on the Impact tables sheet.', from('04 Impact tables')],
      ['level', 10, true, 'A whole number 1 to 5.', 'level'],
      ['statement', 90, false, 'The harm at this level, written so that someone rating an asset can recognise it. E.g. "Loss of £10,000 to £100,000".'],
    ],
    example: [
      ['Financial loss', 1, 'Loss under £1,000.'],
      ['Financial loss', 2, 'Loss of £1,000 to £10,000.'],
      ['Financial loss', 3, 'Loss of £10,000 to £100,000.'],
      ['Financial loss', 4, 'Loss of £100,000 to £1 million.'],
      ['Financial loss', 5, 'Loss over £1 million, or one that threatens the organisation\'s survival.'],
      ['Harm to individuals', 1, 'Minor inconvenience to one person.'],
      ['Harm to individuals', 2, 'Distress to one person, or inconvenience to many.'],
      ['Harm to individuals', 3, 'Serious distress or financial harm to one person, or distress to many.'],
      ['Harm to individuals', 4, 'Lasting harm to one person, or serious harm to many.'],
      ['Harm to individuals', 5, 'Risk to life, or lasting harm to many people.'],
      ['Customer service standards', 1, 'A handful of customers wait longer than promised.'],
      ['Customer service standards', 2, 'A service commitment is missed for a day.'],
      ['Customer service standards', 3, 'A service commitment is missed for a week.'],
      ['Customer service standards', 4, 'Most customers cannot be served for several days.'],
      ['Customer service standards', 5, 'Customers cannot be served at all for a week or more.'],
    ],
  },
  {
    title: '06 Impact levels by CIA', file: 'impact-table-cia-levels.csv',
    what: 'For each impact table and level, which of Confidentiality, Integrity and Availability it applies to. A table rates an asset only on the dimensions that have a row here. Leave a dimension out if losing it cannot cause this kind of harm.',
    cols: [
      ['table_name', 40, true, 'The impact table, exactly as on the Impact tables sheet.', from('04 Impact tables')],
      ['level', 10, true, 'A whole number 1 to 5.', 'level'],
      ['dimension', 12, true, 'c = confidentiality (it leaks), i = integrity (it is wrong), a = availability (it cannot be used).', ['c', 'i', 'a']],
      ['statement', 90, true, 'The harm at this level if THIS dimension is lost. Usually the same words as the level\'s statement on the previous sheet. Must not be blank: a blank statement means the dimension is not assessed.'],
    ],
    example: (() => {
      const out = [];
      const fin = ['Loss under £1,000.', 'Loss of £1,000 to £10,000.', 'Loss of £10,000 to £100,000.', 'Loss of £100,000 to £1 million.', 'Loss over £1 million, or one that threatens the organisation\'s survival.'];
      const harm = ['Minor inconvenience to one person.', 'Distress to one person, or inconvenience to many.', 'Serious distress or financial harm to one person, or distress to many.', 'Lasting harm to one person, or serious harm to many.', 'Risk to life, or lasting harm to many people.'];
      const svc = ['A handful of customers wait longer than promised.', 'A service commitment is missed for a day.', 'A service commitment is missed for a week.', 'Most customers cannot be served for several days.', 'Customers cannot be served at all for a week or more.'];
      fin.forEach((s, i) => ['c', 'i', 'a'].forEach((d) => out.push(['Financial loss', i + 1, d, s])));
      harm.forEach((s, i) => ['c', 'i'].forEach((d) => out.push(['Harm to individuals', i + 1, d, s])));
      svc.forEach((s, i) => out.push(['Customer service standards', i + 1, 'a', s]));
      return out;
    })(),
  },
  {
    title: '07 Information assets', file: 'information-assets.csv',
    what: 'The information the organisation holds, at the level someone is accountable for it: "Payroll records", not "the HR database". Rate each on the next sheet.',
    cols: [
      ['name', 40, true, 'The asset\'s name. Keep it unique across the whole organisation: ratings and system links refer to it by this text.'],
      ['description', 60, false, 'What the information is and why it is held.'],
      ['department_name', 34, true, 'The department that owns it, exactly as on the Departments sheet.', from('01 Departments')],
      ['owner_email', 34, false, 'The accountable person, normally the department\'s IAO. Blank is allowed.', from('02 Users')],
      ['managed_by_email', 34, false, 'Who looks after it day to day, normally the department\'s IAM. Blank is allowed.', from('02 Users')],
      ['is_shared', 12, false, 'yes = every department can see it, and it counts towards the impact of any business service that uses a system holding it, whichever department provides the service. Typical for sign-in or network data. Blank = no.', YESNO],
      ['is_active', 12, false, 'Blank = yes.', YESNO],
    ],
    example: [
      ['Payroll records', 'Salaries, bank details and tax codes of all staff.', 'Finance', 'h.finance@example.org', 'm.finance@example.org', 'no', 'yes'],
      ['Supplier payment records', 'Invoices and supplier bank details.', 'Finance', 'h.finance@example.org', 'm.finance@example.org', 'no', 'yes'],
      ['Customer accounts', 'Names, addresses and account history of customers.', 'Customer Services', 'h.customer@example.org', 'm.customer@example.org', 'no', 'yes'],
      ['Customer enquiries', 'Messages from customers and the replies given.', 'Customer Services', 'h.customer@example.org', 'm.customer@example.org', 'no', 'yes'],
      ['Staff sign-in accounts', 'User names, group memberships and sign-in data for all staff.', 'Information Technology', 'h.it@example.org', 'm.it@example.org', 'yes', 'yes'],
    ],
  },
  {
    title: '08 Asset ratings', file: 'asset-impact-ratings.csv',
    what: 'How bad it would be if each asset were lost, leaked or wrong: one row per asset per impact table. Every asset needs a row for every MANDATORY table. This is where every risk score\'s impact comes from.',
    cols: [
      ['asset_name', 40, true, 'The asset, exactly as on the Information assets sheet.', from('07 Information assets')],
      ['impact_table_name', 40, true, 'The impact table, exactly as on the Impact tables sheet.', from('04 Impact tables')],
      ['rated_level', 12, false, 'The simple way: ONE level 1–5 for the asset on this table. It applies to every dimension the table assesses. Fill this in, or the three columns to the right.', 'level'],
      ['c_level', 10, false, 'The detailed way: the level if the asset LEAKS. Overrides rated_level for confidentiality.', 'level'],
      ['i_level', 10, false, 'The level if the asset is WRONG or tampered with. Overrides rated_level for integrity.', 'level'],
      ['a_level', 10, false, 'The level if the asset CANNOT BE USED. Overrides rated_level for availability.', 'level'],
    ],
    example: [
      ['Payroll records', 'Financial loss', 3, '', '', ''],
      ['Payroll records', 'Harm to individuals', 4, '', '', ''],
      ['Supplier payment records', 'Financial loss', '', 2, 4, 3],
      ['Supplier payment records', 'Harm to individuals', 1, '', '', ''],
      ['Customer accounts', 'Financial loss', 3, '', '', ''],
      ['Customer accounts', 'Harm to individuals', 3, '', '', ''],
      ['Customer accounts', 'Customer service standards', 4, '', '', ''],
      ['Customer enquiries', 'Financial loss', 1, '', '', ''],
      ['Customer enquiries', 'Harm to individuals', 2, '', '', ''],
      ['Customer enquiries', 'Customer service standards', 3, '', '', ''],
      ['Staff sign-in accounts', 'Financial loss', 4, '', '', ''],
      ['Staff sign-in accounts', 'Harm to individuals', 3, '', '', ''],
    ],
  },
  {
    title: '09 Systems', file: 'systems.csv',
    what: 'The things the organisation RUNS that hold or process information. A system is what a risk is assessed against. Where the major parts are different technology (a server back end and public kiosks), record them as separate systems.',
    cols: [
      ['name', 40, true, 'The system\'s name. Keep it unique across the whole organisation: links refer to it by this text.'],
      ['description', 60, false, 'What it is and what it is for.'],
      ['department_name', 34, true, 'The department that owns it, exactly as on the Departments sheet. That department owns its risks.', from('01 Departments')],
      ['owner_email', 34, false, 'The accountable person, normally the department\'s IAO. Blank is allowed.', from('02 Users')],
      ['manager_email', 34, false, 'Who runs it day to day, normally the department\'s IAM. Blank is allowed.', from('02 Users')],
      ['is_shared', 12, false, 'yes = marks it as a system other departments rely on, such as the network or staff sign-in. Blank = no.', YESNO],
      ['is_active', 12, false, 'Blank = yes.', YESNO],
    ],
    example: [
      ['Payroll system', 'Calculates and pays staff salaries.', 'Finance', 'h.finance@example.org', 'm.finance@example.org', 'no', 'yes'],
      ['Purchase ledger', 'Records and pays supplier invoices.', 'Finance', 'h.finance@example.org', 'm.finance@example.org', 'no', 'yes'],
      ['Customer portal', 'Website where customers manage their accounts and send enquiries.', 'Customer Services', 'h.customer@example.org', 'm.customer@example.org', 'no', 'yes'],
      ['Staff directory and sign-in', 'Where every member of staff signs in.', 'Information Technology', 'h.it@example.org', 'm.it@example.org', 'yes', 'yes'],
    ],
  },
  {
    title: '10 System assets', file: 'system-assets.csv',
    what: 'Which information each system holds: one row per system per asset. A system\'s impact is the HIGHEST rating among the assets linked here, so a system with no rows scores as if it held nothing.',
    cols: [
      ['system_name', 40, true, 'The system, exactly as on the Systems sheet.', from('09 Systems')],
      ['asset_name', 40, true, 'The information asset, exactly as on the Information assets sheet.', from('07 Information assets')],
      ['notes', 60, false, 'Anything worth saying about how the system holds it.'],
    ],
    example: [
      ['Payroll system', 'Payroll records', ''],
      ['Purchase ledger', 'Supplier payment records', ''],
      ['Customer portal', 'Customer accounts', ''],
      ['Customer portal', 'Customer enquiries', ''],
      ['Staff directory and sign-in', 'Staff sign-in accounts', 'The asset that is this system\'s whole purpose.'],
    ],
  },
  {
    title: '11 Business services', file: 'business-services.csv',
    what: 'What the organisation does for people, named as they would name it: "Paying staff", "Answering customer enquiries". A service is delivered by the systems linked on the next sheet.',
    cols: [
      ['name', 40, true, 'The service\'s name. Keep it unique across the whole organisation.'],
      ['description', 60, false, 'What the service delivers and to whom.'],
      ['department_name', 34, true, 'The department that provides the service, exactly as on the Departments sheet.', from('01 Departments')],
      ['manager_email', 34, false, 'Who runs the service, normally the department\'s IAM. Blank is allowed.', from('02 Users')],
      ['is_shared', 12, false, 'yes = other departments may adopt this service. Blank = no.', YESNO],
      ['is_active', 12, false, 'Blank = yes.', YESNO],
    ],
    example: [
      ['Paying staff', 'Monthly salary payments to all staff.', 'Finance', 'm.finance@example.org', 'no', 'yes'],
      ['Paying suppliers', 'Settling supplier invoices on time.', 'Finance', 'm.finance@example.org', 'no', 'yes'],
      ['Answering customer enquiries', 'Replying to customers who contact us.', 'Customer Services', 'm.customer@example.org', 'no', 'yes'],
    ],
  },
  {
    title: '12 Service systems', file: 'business-service-systems.csv',
    what: 'Which systems each business service depends on: one row per service per system. A service\'s impact comes from the information its own department holds in these systems, plus any asset marked shared.',
    cols: [
      ['service_name', 40, true, 'The business service, exactly as on the Business services sheet.', from('11 Business services')],
      ['system_name', 40, true, 'A system it depends on, exactly as on the Systems sheet. It may belong to another department.', from('09 Systems')],
    ],
    example: [
      ['Paying staff', 'Payroll system'],
      ['Paying staff', 'Staff directory and sign-in'],
      ['Paying suppliers', 'Purchase ledger'],
      ['Answering customer enquiries', 'Customer portal'],
      ['Answering customer enquiries', 'Staff directory and sign-in'],
    ],
  },
];

// ── Styling ──────────────────────────────────────────────────────────────────
const INK = 'FF1F2933', REQUIRED = 'FF1D4E89', OPTIONAL = 'FF52606D', BAND = 'FFF0F4F8', AMBER = 'FFFFF4D6';
const border = { bottom: { style: 'thin', color: { argb: 'FFBCCCDC' } } };

function addReadMe(wb, example) {
  const ws = wb.addWorksheet('Read me', { properties: { tabColor: { argb: 'FFD97706' } } });
  ws.columns = [{ width: 5 }, { width: 30 }, { width: 34 }, { width: 100 }];
  const line = (cells, style = {}) => {
    const r = ws.addRow(cells);
    r.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; c.font = { color: { argb: INK }, ...style }; });
    return r;
  };
  line(['', example ? 'CIRKS organisation capture — WORKED EXAMPLE' : 'CIRKS organisation capture'], { bold: true, size: 16 });
  ws.mergeCells(ws.lastRow.number, 2, ws.lastRow.number, 4);
  line(['', example
    ? 'A small invented organisation, filled in to show what each sheet should look like. It loads as it is. Do not load it into a real instance.'
    : 'One sheet per kind of record. Fill the sheets in, save each one as a CSV file, and load them into CIRKS in the numbered order.']);
  ws.mergeCells(ws.lastRow.number, 2, ws.lastRow.number, 4);
  ws.lastRow.height = 32;
  ws.addRow([]);

  line(['', 'The rule to model by'], { bold: true, size: 12 });
  line(['', 'Only record things that help answer a security question. CIRKS is a risk system, not an inventory: if a fact would not change what a risk scores, which protection is needed, or who has to act, leave it out.']);
  ws.mergeCells(ws.lastRow.number, 2, ws.lastRow.number, 4); ws.lastRow.height = 32;
  ws.addRow([]);

  line(['', 'The sheets, in the order they are loaded'], { bold: true, size: 12 });
  const head = line(['#', 'Sheet', 'Save as this file name', 'What goes on it'], { bold: true });
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; c.border = border; });
  SHEETS.forEach((s, i) => { const r = line([i + 1, s.title, s.file, s.what]); r.height = Math.max(18, Math.ceil(s.what.length / 105) * 15); });
  line(['', 'Roles', '(not loaded)', 'Reference only: the role keys the Users and Additional roles sheets accept, and what each is for.']);
  ws.addRow([]);

  const para = (title, items) => {
    line(['', title], { bold: true, size: 12 });
    items.forEach((t) => { const r = line(['', '•', t]); ws.mergeCells(r.number, 3, r.number, 4); r.getCell(2).alignment = { horizontal: 'right', vertical: 'top' }; r.height = Math.max(16, Math.ceil(t.length / 125) * 15); });
    ws.addRow([]);
  };
  para('Filling it in', [
    'Row 1 of every sheet is the column names CIRKS reads. Do not rename, reorder or delete them, and do not add a title row above them.',
    'Start typing in row 2. One record per row, no blank rows in the middle, no totals or notes underneath: everything below row 1 is loaded as data.',
    'Blue column names are required. Grey ones are optional; leave the cell empty to take the default. Hover over a column name for what it means and what it accepts.',
    'Sheets refer to each other by NAME, exactly as typed: a department by its name, a person by their email, a system or asset by its name. The drop-downs offer what you have already entered, so fill the sheets in order and pick from the list where one is offered.',
    'Names must be unique within their sheet across the whole organisation. Two systems called "Finance system" in different departments cannot be told apart when another sheet refers to them.',
    'Give each department one Information Asset Owner and at least one Information Asset Manager on the Users sheet. A department with no Information Asset Owner has its risks owned by the SIRO; one with two has its risks owned by whichever comes first by name, so give it one.',
    'Departments with minor departments under them: record only the major department (the one with its own Information Asset Owner). Record the minor departments\' work as business services named so they are recognisable, and their managers as extra Information Asset Managers of the major department. A unit with its own accountable owner who signs off its own risks is a department in its own right.',
    'Leave the password column empty.',
  ]);
  para('Saving a sheet as CSV', [
    'Select the sheet, then File → Save As (Excel) or File → Export To (Numbers) and choose "CSV UTF-8 (Comma delimited)". Excel saves only the sheet you are on.',
    'Name the file exactly as shown in the table above, for example departments.csv. CIRKS finds each file by its name.',
    'Put all the CSV files in one folder. A sheet you have left empty needs no file.',
  ]);
  para('Loading into CIRKS', [
    'The files are loaded by the CIRKS import command on the server, not through a screen in the application. Whoever runs your CIRKS instance does this.',
    'Check first, changing nothing:   node db/import.js <folder> --dry-run',
    'Then load:   node db/import.js <folder> --password <starting password for the new accounts>',
    'In a container installation, copy the folder in and prefix the command:   docker compose cp ./capture app:/tmp/capture   then   docker compose exec app node db/import.js /tmp/capture --dry-run',
    'All the files in the folder are loaded in the right order in one go. To load one sheet at a time, put only that file in the folder and run the command again for the next; keep to the numbered order, because each sheet refers to the ones before it.',
    'If you load one sheet at a time, load Departments once more after Users. The department heads (owner_email) cannot be set until the people exist; the second pass fills them in and changes nothing else.',
    'Each file reports how many rows were imported, skipped and in error. A row that already exists is skipped, so running the same file twice is safe. A row in error is reported with its reason and the rest still load.',
    'At least one administrator account must exist before loading (it is created when CIRKS is installed).',
  ]);
  para('What this workbook does not cover', [
    'Threats, control objectives, components, security solutions, suppliers and risks. A catalogue of control objectives comes with CIRKS; the rest are built in the application once the organisation on these sheets is loaded. The same import command reads further files for them if you want to prepare those in bulk.',
  ]);
  ws.views = [{ showGridLines: false }];
}

function addRoles(wb) {
  const ws = wb.addWorksheet('Roles', { properties: { tabColor: { argb: 'FF829AB1' } } });
  ws.columns = [{ width: 30 }, { width: 34 }, { width: 90 }, { width: 44 }];
  const h = ws.addRow(['role (type this key)', 'Shown in CIRKS as', 'What the role is for', 'Typically held by']);
  h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OPTIONAL } }; });
  ROLES.forEach((r) => { const row = ws.addRow(r); row.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; }); row.height = Math.max(18, Math.ceil(r[2].length / 95) * 15); });
  ws.addRow([]);
  const n = ws.addRow(['This sheet is reference only and is not loaded. The roles are fixed in CIRKS; what each may do is set by an administrator inside the application.']);
  ws.mergeCells(n.number, 1, n.number, 4); n.getCell(1).font = { italic: true, color: { argb: OPTIONAL } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addSheet(wb, s, example) {
  const ws = wb.addWorksheet(s.title, { properties: { tabColor: { argb: 'FF1D4E89' } } });
  ws.columns = s.cols.map(([, width]) => ({ width }));
  const head = ws.addRow(s.cols.map(([name]) => name));
  head.height = 22;
  s.cols.forEach(([name, , required, help, validation], i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? REQUIRED : OPTIONAL } };
    cell.alignment = { vertical: 'middle' };
    cell.note = { texts: [{ font: { bold: true, size: 9 }, text: `${name} — ${required ? 'REQUIRED' : 'optional'}\n` }, { font: { size: 9 }, text: help }], margins: { insetmode: 'auto' } };
    if (!validation) return;
    const col = ws.getColumn(i + 1).letter;
    const range = `${col}2:${col}${ROWS + 1}`;
    if (validation === 'level') {
      ws.dataValidations.add(range, { type: 'whole', operator: 'between', formulae: [1, 5], allowBlank: true,
        showErrorMessage: true, errorTitle: 'Level', error: 'A whole number from 1 to 5.' });
    } else if (Array.isArray(validation)) {
      ws.dataValidations.add(range, { type: 'list', formulae: [`"${validation.join(',')}"`], allowBlank: true,
        showErrorMessage: true, errorTitle: name, error: `One of: ${validation.join(', ')}.` });
    } else {
      // From another sheet: a warning, not a stop — the name may be typed before
      // the other sheet is filled in, and CIRKS reports a name it cannot find.
      ws.dataValidations.add(range, { type: 'list', formulae: [validation.ref], allowBlank: true,
        showErrorMessage: true, errorStyle: 'warning', errorTitle: name, error: 'This is not on the sheet it refers to yet. It must match exactly when the file is loaded.' });
    }
  });
  if (example) (typeof s.example === 'function' ? s.example() : s.example).forEach((r) => ws.addRow(r));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.cols.length } };
}

async function build(outDir, example) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CIRKS'; wb.created = new Date(Date.UTC(2026, 9, 13));
  addReadMe(wb, example);
  SHEETS.forEach((s) => addSheet(wb, s, example));
  addRoles(wb);
  const file = path.join(outDir, `CIRKS-organisation-capture${example ? '-EXAMPLE' : ''}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

// One sheet as Excel's "CSV UTF-8" writes it: byte-order mark, CRLF, quotes
// where a cell holds a comma, a quote or a line break.
function toCsv(rows) {
  const cell = (v) => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

(async () => {
  const args = process.argv.slice(2);
  const outDir = args[0] && !args[0].startsWith('--') ? args[0] : '.';
  const csvDir = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
  for (const example of [false, true]) console.log('wrote', await build(outDir, example));
  if (csvDir) {
    // Read the EXAMPLE workbook back, so the check covers what was written.
    fs.mkdirSync(csvDir, { recursive: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(outDir, 'CIRKS-organisation-capture-EXAMPLE.xlsx'));
    for (const s of SHEETS) {
      const ws = wb.getWorksheet(s.title);
      const rows = [];
      ws.eachRow((row) => { const r = []; for (let i = 1; i <= s.cols.length; i++) r.push(row.getCell(i).value); rows.push(r); });
      fs.writeFileSync(path.join(csvDir, s.file), toCsv(rows));
    }
    console.log(`wrote ${SHEETS.length} CSV files to ${csvDir}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });

module.exports = { SHEETS };
