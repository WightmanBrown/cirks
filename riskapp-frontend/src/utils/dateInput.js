// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Reading a date someone TYPED. The browser's own date field accepts typing only
// in its locale's order and segment by segment, and otherwise answers with a bare
// "invalid date" (owner, 2026-09-30). CIRKS takes the ways people write dates:
//   31/03/2027 · 31-3-27 · 31.03.2027   day first — the UK order
//   2027-03-31                           ISO
//   31 Mar 2027 · 31 March 2027
// and always shows how it read the date, so a swapped day and month is visible.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

function build(y, m, d) {
  if (y < 100) y += 2000;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;          // 31/02 and the like
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The ISO date (YYYY-MM-DD) a typed string means, or null if it is not a date. */
export function parseDateInput(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/);
  if (m) return build(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s*([a-z]{3,9})\.?,?\s*(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3));
    if (month < 0 || !'january february march april may june july august september october november december'
      .split(' ')[month].startsWith(m[2])) return null;
    return build(+m[3], month + 1, +m[1]);
  }
  return null;
}

/** How an ISO date is shown in the field for editing: 31/03/2027. */
export function formatForTyping(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** How CIRKS read it, in words: "Wed 31 Mar 2027". */
export function describeDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}
