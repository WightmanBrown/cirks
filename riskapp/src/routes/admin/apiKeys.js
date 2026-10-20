'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Admin CRUD for machine API keys (SOC enrichment — Stage 3). Mounted under the
// admin.manage-gated admin router (authenticate + requireCapability('admin.manage')
// applied by the parent). The plaintext key is returned ONCE on creation and never
// again — only its SHA-256 hash is stored. See docs/soc-enrichment-stage3.md.

const { Router } = require('express');
const { createApiKey, listApiKeys, revokeApiKey } = require('../../auth/apiKeys');
const { can } = require('../../auth/permissions');

const router = Router();

// A key may only assume a MACHINE role, from an explicit allow-list (v111).
//
// This used to admit any role holding knowledge.query, guarding the wrong
// hazard — the comment worried about "minting a key for a role that can't
// query". The real hazard is the opposite: admin holds knowledge.query and 44
// other capabilities, ciso holds 43, so an administrator could mint a long-lived
// bearer credential with full administrative powers, every write included, and
// hand it to an integration.
//
// An allow-list rather than a capability test, because the property wanted is
// "this role exists to be a machine", which no capability expresses. Failing
// closed: an unknown or human role is refused, and adding a machine role is a
// deliberate edit here.
const MACHINE_ROLES = new Set(['soc_integration']);

function roleIsMachine(role) {
  return MACHINE_ROLES.has(role) && can(role, 'knowledge.enrich').allowed;
}

// GET /admin/api-keys — metadata only (never the hash or plaintext).
router.get('/', async (req, res, next) => {
  try {
    res.json(await listApiKeys());
  } catch (err) { next(err); }
});

// POST /admin/api-keys { label, role?, expires_at? } — mint a key; returns it ONCE.
router.post('/', async (req, res, next) => {
  try {
    const { label, role = 'soc_integration', expires_at = null } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'A label is required (name the integration, e.g. "Wazuh prod").' });
    }
    if (!roleIsMachine(role)) {
      return res.status(400).json({
        error: `Role "${role}" cannot be used for an API key. Keys may only assume a machine role (${[...MACHINE_ROLES].join(', ')}), which answers enrichment questions and nothing else.`,
      });
    }
    let expiresAt = null;
    if (expires_at) {
      const d = new Date(expires_at);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'expires_at must be a valid date.' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ error: 'expires_at must be in the future.' });
      expiresAt = d.toISOString();
    }

    const { key, record } = await createApiKey({
      label:     String(label).trim(),
      role,
      createdBy: req.user.id,
      expiresAt,
    });
    // `key` is shown ONCE; the client must copy it now.
    res.status(201).json({ ...record, key });
  } catch (err) { next(err); }
});

// DELETE /admin/api-keys/:id — revoke (soft; sets revoked_at).
router.delete('/:id', async (req, res, next) => {
  try {
    const revoked = await revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ error: 'Key not found or already revoked.' });
    res.json(revoked);
  } catch (err) { next(err); }
});

module.exports = router;
