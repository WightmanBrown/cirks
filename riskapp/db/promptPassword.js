'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A password typed at the terminal, never echoed — shared by create-admin.js
// and the Misty Isles install, so both ask the same way. ADMIN_PASSWORD in the
// environment is the non-interactive alternative; there is never a default.

// Hidden prompt — echoes nothing as the user types.
function promptHidden(question) {
  return new Promise((res) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    let val = '';
    const finish = () => {
      stdin.setRawMode && stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (ch) => {
      const s = ch.toString('utf8');
      for (const c of s) {
        const code = c.charCodeAt(0);
        if (code === 13 || code === 10 || code === 4) {       // Enter / Ctrl-D
          finish(); res(val); return;
        } else if (code === 3) {                              // Ctrl-C
          finish(); process.exit(130);
        } else if (code === 127 || code === 8) {              // Backspace / Del
          val = val.slice(0, -1);
        } else if (code >= 32) {                              // printable only
          val += c;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function resolvePassword(label = 'New admin password: ') {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error('No password: set ADMIN_PASSWORD or run interactively (a TTY is required for the hidden prompt).');
  }
  const p1 = await promptHidden(label);
  const p2 = await promptHidden('Confirm password: ');
  if (p1 !== p2) throw new Error('Passwords do not match.');
  return p1;
}

module.exports = { promptHidden, resolvePassword };
