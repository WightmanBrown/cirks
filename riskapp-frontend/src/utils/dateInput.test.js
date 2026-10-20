// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { parseDateInput, formatForTyping, describeDate } from './dateInput';

describe('parseDateInput — the ways people type a date', () => {
  test.each([
    ['31/03/2027', '2027-03-31'],
    ['1/1/2028',   '2028-01-01'],
    ['31-3-27',    '2027-03-31'],
    ['31.03.2027', '2027-03-31'],
    ['2027-03-31', '2027-03-31'],
    ['31 Mar 2027', '2027-03-31'],
    ['31 march 2027', '2027-03-31'],
    ['  01/01/2028 ', '2028-01-01'],
  ])('%s → %s', (text, iso) => expect(parseDateInput(text)).toBe(iso));

  test('day first, never month first: 03/04/2027 is 3 April', () => {
    expect(parseDateInput('03/04/2027')).toBe('2027-04-03');
  });

  test.each(['', '31/02/2027', '13/13/2027', '2027', 'tomorrow', '31 Smarch 2027', '12/2027', '00/01/2027'])(
    'not a date: %j', (text) => expect(parseDateInput(text)).toBeNull());
});

describe('showing it back', () => {
  test('for editing, day first', () => expect(formatForTyping('2027-03-31')).toBe('31/03/2027'));
  test('in words, with the weekday, never shifted by the local clock', () => {
    expect(describeDate('2027-03-31')).toBe('Wed 31 Mar 2027');
    expect(describeDate('2028-01-01')).toBe('Sat 1 Jan 2028');
  });
});
