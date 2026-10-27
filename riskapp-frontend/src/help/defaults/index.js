// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * The draft help text that ships with CIRKS, keyed by help key.
 *
 * A HelpDot shows this text unless an admin has written their own in the help
 * editor (saved in the database), which then takes precedence. Clearing the
 * saved text brings the draft back. Each area of the app has its own file;
 * `shared.js` holds the column keys (`col.*`) used across many tables.
 */
import shared from './shared';
import risk from './risk';
import architecture from './architecture';
import controls from './controls';
import meetings from './meetings';
import admin from './admin';

const SOURCES = { shared, risk, architecture, controls, meetings, admin };

export function mergeDefaults(sources) {
  const out = {};
  for (const [file, entries] of Object.entries(sources)) {
    for (const [key, entry] of Object.entries(entries)) {
      if (out[key]) throw new Error(`help key "${key}" is defined twice (again in ${file}.js)`);
      out[key] = entry;
    }
  }
  return out;
}

export const HELP_DEFAULTS = mergeDefaults(SOURCES);
