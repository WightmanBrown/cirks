// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useUrlState, useUrlSortState } from './useUrlState';

const wrapper = (url) => {
  const Wrapper = ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return Wrapper;
};

test('reads a setting from the address, and the default when it is absent', () => {
  const { result } = renderHook(() => [useUrlState('q'), useUrlState('scope', 'dept')], { wrapper: wrapper('/x?q=radar') });
  expect(result.current[0][0]).toBe('radar');
  expect(result.current[1][0]).toBe('dept');
});

test('writes it to the address, leaving the default out', () => {
  const { result } = renderHook(() => ({ s: useUrlState('scope', 'dept'), loc: useLocation() }), { wrapper: wrapper('/x?selected=7') });
  act(() => result.current.s[1]('all'));
  expect(result.current.loc.search).toBe('?selected=7&scope=all');
  act(() => result.current.s[1]('dept'));
  expect(result.current.loc.search).toBe('?selected=7');
});

test('a sort is one parameter, and takes an updater', () => {
  const { result } = renderHook(() => ({ s: useUrlSortState('sort', { key: 'res_max', dir: 'desc' }), loc: useLocation() }),
    { wrapper: wrapper('/x') });
  expect(result.current.s[0]).toEqual({ key: 'res_max', dir: 'desc' });
  act(() => result.current.s[1]((prev) => ({ key: 'name', dir: prev.dir === 'desc' ? 'asc' : 'desc' })));
  expect(result.current.loc.search).toBe('?sort=name%3Aasc');
  expect(result.current.s[0]).toEqual({ key: 'name', dir: 'asc' });
});
