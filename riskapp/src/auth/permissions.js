'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Configurable-RBAC resolver. Single source of truth for "can this role do X?".
//
// Grants are held IN MEMORY (built from capabilityDefaults — the shipped baseline
// that reproduces the historical route-guard contract). Route guards therefore add
// no per-request DB round-trip, and unit tests that mock the pool are unaffected.
//
// The DB table role_permissions is the admin-editable OVERRIDE layer: call
// refreshFromDb() (Phase 7, on startup / after an admin edit) to replace the
// in-memory grants with the persisted matrix. Until then the defaults are used.
//
// Authorization follows the caller's ACTIVE role (req.user.role) — switching role
// (elevation) changes which capabilities apply, exactly as requireRole did.

const DEFAULTS = require('./capabilityDefaults');

// role -> Map(capabilityKey -> scope)
const grants = new Map();

// Non-removable floor: the admin role always retains these, regardless of what the
// matrix says, so an admin can never edit away their own ability to manage RBAC.
const ADMIN_FLOOR = new Map([['admin', new Set(['admin.manage'])]]);

// Setup-phase-only capabilities: granted but ONLY effective while the org is in
// setup (org_config.setup_phase_active = TRUE). The security_consultant is an
// external onboarding role — it needs write access to stand up the initial asset/
// system/service/threat picture during setup, but that authority should lapse once
// the org goes operational (the internal team owns the live picture thereafter).
// This is a resolver-level GUARDRAIL, not a grant: it composes on top of whatever
// role_permissions says, and is deliberately code-level (mirrors v75's
// canAcceptRiskAtScore security_consultant setup case) so an admin RBAC edit can't
// silently clobber it. When operational, can() denies these and they drop out of
// the role's effective capability set (/me/capabilities).
const SETUP_PHASE_ONLY = {
  security_consultant: new Set([
    'assets.write', 'systems.write', 'services.write', 'services.delete', 'threats.write',
  ]),
};

function isSetupGated(role, capabilityKey) {
  return SETUP_PHASE_ONLY[role]?.has(capabilityKey) === true;
}

// Whether department isolation is enforced org-wide. Default TRUE so that, before
// the org_config value is loaded (and in unit tests), department-scoped controllers
// behave exactly as they did historically. refreshFromDb() loads the real value
// (server startup); when false, own_dept scoping is not enforced (spreadsheet mode).
let isolationEnabled = true;

// Whether the org is still in its setup phase. Default TRUE so that, before the
// org_config value is loaded (and in unit tests), setup-phase-only capabilities
// behave as granted — historical behaviour. refreshFromDb() loads the real value;
// go_operational flips it FALSE (the org route calls refreshFromDb so it applies live).
let setupPhaseActive = true;

function loadDefaults() {
  grants.clear();
  for (const [role, caps] of Object.entries(DEFAULTS)) {
    grants.set(role, new Map(caps.map((c) => [c.key, c.scope])));
  }
}
loadDefaults();

/**
 * Does `role` hold `capabilityKey`?
 * @returns {{allowed: boolean, scope: 'all_depts'|'own_dept'|null}}
 */
function can(role, capabilityKey) {
  if (ADMIN_FLOOR.get(role)?.has(capabilityKey)) return { allowed: true, scope: 'all_depts' };
  const m = grants.get(role);
  if (!m || !m.has(capabilityKey)) return { allowed: false, scope: null };
  // Setup-phase-only grant, but the org is operational → no longer effective.
  if (!setupPhaseActive && isSetupGated(role, capabilityKey)) return { allowed: false, scope: null };
  return { allowed: true, scope: m.get(capabilityKey) };
}

/** Express guard — 403 unless the caller's active role holds the capability. */
function requireCapability(capabilityKey) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!can(req.user.role, capabilityKey).allowed) {
      return res.status(403).json({ error: `Missing capability: ${capabilityKey}` });
    }
    next();
  };
}

/** All capabilities a role holds, as sorted [{ key, scope }] — for /me/capabilities + UI. */
function capabilitiesForRole(role) {
  const out = grants.has(role)
    ? [...grants.get(role).entries()]
        // Drop setup-phase-only caps once operational so /me/capabilities (and the
        // UI affordances derived from it) reflect what the role can actually do now.
        .filter(([key]) => setupPhaseActive || !isSetupGated(role, key))
        .map(([key, scope]) => ({ key, scope }))
    : [];
  for (const key of ADMIN_FLOOR.get(role) ?? []) {
    if (!out.some((c) => c.key === key)) out.push({ key, scope: 'all_depts' });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Replace the in-memory grants from the DB role_permissions table (admin override).
 * No-op (keeps defaults) if the table is empty. Phase 7 calls this on startup and
 * after admin edits; not invoked by default so the defaults remain authoritative.
 */
async function refreshFromDb() {
  const { query } = require('../db/pool');
  const { rows } = await query('SELECT role, capability_key, scope FROM role_permissions');
  if (rows.length) {
    const next = new Map();
    for (const r of rows) {
      if (!next.has(r.role)) next.set(r.role, new Map());
      next.get(r.role).set(r.capability_key, r.scope);
    }
    grants.clear();
    for (const [role, m] of next) grants.set(role, m);
  }
  const cfg = await query('SELECT department_isolation, setup_phase_active FROM org_config LIMIT 1');
  if (cfg.rows.length) {
    isolationEnabled = cfg.rows[0].department_isolation === true;
    setupPhaseActive = cfg.rows[0].setup_phase_active !== false; // default TRUE
  }
}

/** Is department isolation enforced? Controllers gate own_dept row-filtering on this. */
function isDepartmentIsolationEnabled() {
  return isolationEnabled;
}

/** Is the org still in its setup phase? Setup-phase-only caps are effective only when true. */
function isSetupPhaseActive() {
  return setupPhaseActive;
}

/** Test helper: restore the in-memory grants to the shipped defaults. */
function _resetToDefaults() {
  loadDefaults();
}

/** Test helper: set the department-isolation flag directly (bypassing the DB). */
function _setDepartmentIsolation(enabled) {
  isolationEnabled = enabled === true;
}

/** Test helper: set the setup-phase flag directly (bypassing the DB). */
function _setSetupPhase(active) {
  setupPhaseActive = active === true;
}

module.exports = {
  can,
  requireCapability,
  capabilitiesForRole,
  isDepartmentIsolationEnabled,
  isSetupPhaseActive,
  refreshFromDb,
  _resetToDefaults,
  _setDepartmentIsolation,
  _setSetupPhase,
};
