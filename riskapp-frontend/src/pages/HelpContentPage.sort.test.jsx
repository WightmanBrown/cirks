// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { HELP_CONTENT_ACCESSORS } from './HelpContentPage';

const r = (over) => ({ help_key: 'x', writtenEn: false, otherLocales: [], source: 'unwritten', ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, HELP_CONTENT_ACCESSORS[key], dir).map((x) => x.help_key);

describe('help content sort', () => {
  it('sorts source by the word on its chip', () => {
    const rows = [r({ help_key: 'u' }), r({ help_key: 'c', source: 'custom' }), r({ help_key: 'd', source: 'default' })];
    expect(order(rows, 'source')).toEqual(['d', 'c', 'u']);
  });

  it('puts keys with no other language last, whichever way', () => {
    const rows = [r({ help_key: 'none' }), r({ help_key: 'fr', otherLocales: ['fr'] }), r({ help_key: 'cy', otherLocales: ['cy'] })];
    expect(order(rows, 'other', 'desc')).toEqual(['fr', 'cy', 'none']);
  });
});
