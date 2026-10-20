'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// db/csv.js reads what db/import.js loads. These pin the cases a file saved
// from a spreadsheet produces, which a hand-written or exported CSV never does.

const { parse } = require('../../db/csv');

describe('csv parse', () => {
  test('a plain file: header row, then records keyed by it', () => {
    const { columns, records } = parse('name,description\r\nFinance,Money\r\nLegal,\r\n');
    expect(columns).toEqual(['name', 'description']);
    expect(records).toEqual([{ name: 'Finance', description: 'Money' }, { name: 'Legal', description: '' }]);
  });

  test('quoted fields keep separators, quotes and line breaks', () => {
    const { records } = parse('name,description\n"Smith, Jones","said ""hello""\nthen left"\n');
    expect(records[0]).toEqual({ name: 'Smith, Jones', description: 'said "hello"\nthen left' });
  });

  test("Excel's byte-order mark is not part of the first column name", () => {
    const { columns, records } = parse('\uFEFFname,description\r\nFinance,Money\r\n');
    expect(columns[0]).toBe('name');
    expect(records[0].name).toBe('Finance');
  });

  test('header names are trimmed', () => {
    expect(parse(' name ,description \nFinance,Money\n').columns).toEqual(['name', 'description']);
  });

  test('a row of nothing but separators is a blank line, not a record', () => {
    const { records } = parse('name,description\nFinance,Money\n,\n , \n\nLegal,Law\n');
    expect(records.map((r) => r.name)).toEqual(['Finance', 'Legal']);
  });

  test('a short row pads with blanks; tab-separated works the same way', () => {
    expect(parse('name\tdescription\nFinance\n', '\t').records).toEqual([{ name: 'Finance', description: '' }]);
  });

  test('an empty file has no columns and no records', () => {
    expect(parse('')).toEqual({ columns: [], records: [] });
  });
});
