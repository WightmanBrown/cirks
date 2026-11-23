// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useScrollRestore } from './useScrollRestore';

let nav;
function List({ ready }) {
  useScrollRestore(ready);
  nav = useNavigate();
  return <div>list</div>;
}
function Item() { nav = useNavigate(); return <div>item</div>; }

function app(ready, entries) {
  return (
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/list" element={<List ready={ready} />} />
        <Route path="/item" element={<Item />} />
      </Routes>
    </MemoryRouter>
  );
}

const scrollTo = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  scrollTo.mockClear();
  window.scrollTo = scrollTo;
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
});

test('Back to a list scrolls to where it was left, once its rows are drawn', () => {
  sessionStorage.setItem('cirks.scroll.k1', '1800');
  const { rerender } = render(app(false, [{ pathname: '/list', key: 'k1' }]));   // POP: the first entry
  expect(scrollTo).not.toHaveBeenCalled();                                     // rows not loaded yet
  rerender(app(true, [{ pathname: '/list', key: 'k1' }]));
  expect(scrollTo).toHaveBeenCalledWith(0, 1800);
  rerender(app(true, [{ pathname: '/list', key: 'k1' }]));
  expect(scrollTo).toHaveBeenCalledTimes(1);                                   // once, not on every reload
});

test('arriving by a link does not move the page', () => {
  sessionStorage.setItem('cirks.scroll.k2', '900');
  render(app(true, [{ pathname: '/item', key: 'k0' }]));
  act(() => nav('/list'));                                                      // PUSH
  expect(scrollTo).not.toHaveBeenCalled();
});

test('a page opened afresh is not scrolled to an old position', () => {
  sessionStorage.setItem('cirks.scroll.default', '700');
  render(app(true, ['/list']));                                                 // key "default"
  expect(scrollTo).not.toHaveBeenCalled();
});

test('the position is remembered as the list is scrolled, and restored on Back', async () => {
  render(app(true, [{ pathname: '/list', key: 'k3' }]));
  window.scrollY = 2400;
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(r));
  });
  expect(sessionStorage.getItem('cirks.scroll.k3')).toBe('2400');
  act(() => nav('/item'));
  window.scrollY = 0;
  act(() => nav(-1));                                                           // POP back to k3
  expect(scrollTo).toHaveBeenLastCalledWith(0, 2400);
});
