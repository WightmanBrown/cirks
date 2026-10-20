'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// SOC enrichment (Stages 2–3) against the real riskapp_test DB:
//   - GET /knowledge/enrich (single) + POST /knowledge/enrich/bulk shapes
//   - machine auth via X-API-Key (mint → use → revoke), incl. JWT fallthrough
// Seeds one host (technology component flagged is_host) + IP linked to a seeded
// system, then tears it down. See docs/soc-enrichment-stage3.md.

const { app, request, tokenFor, query } = require('./helpers');

const ADMIN_ID   = '11111111-0000-0000-0000-000000000001';
const SYSTEM_ID  = '44444444-0000-0000-0000-000000000001'; // Active Directory (seed)
const HOST_IP    = '198.51.100.77';
const HOST_NAME  = 'test-enrich.local';
const LABEL      = '__test_wazuh';

let hostId;
let keyId;
let plaintextKey;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO control_components (name, component_type, is_host, hostname, created_by)
     VALUES ('TEST-enrich-host', 'technology', TRUE, $1, $2)
     RETURNING id`,
    [HOST_NAME, ADMIN_ID]
  );
  hostId = rows[0].id;
  await query('INSERT INTO component_ip_addresses (component_id, ip_address) VALUES ($1, $2::inet)', [hostId, HOST_IP]);
  await query('INSERT INTO system_components (system_id, component_id) VALUES ($1, $2)', [SYSTEM_ID, hostId]);
});

afterAll(async () => {
  await query('DELETE FROM api_keys WHERE label = $1', [LABEL]);
  if (hostId) {
    await query('DELETE FROM system_components WHERE component_id = $1', [hostId]);
    await query('DELETE FROM component_ip_addresses WHERE component_id = $1', [hostId]);
    await query('DELETE FROM control_components WHERE id = $1', [hostId]);
  }
});

describe('GET /knowledge/enrich (single)', () => {
  test('resolves an IP → host → system with impact + risk band', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('Authorization', `Bearer ${tokenFor('analyst')}`);
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(res.body.query_kind).toBe('ip');
    expect(res.body.hosts.map((h) => h.hostname)).toContain(HOST_NAME);
    const sys = res.body.systems.find((s) => s.id === SYSTEM_ID);
    expect(sys).toBeTruthy();
    expect(sys.risk).toHaveProperty('band');
    expect(sys.impact).toHaveProperty('max');
  });

  test('an unknown IP returns matched:false (not an error)', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/enrich?q=203.0.113.254')
      .set('Authorization', `Bearer ${tokenFor('analyst')}`);
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.systems).toEqual([]);
  });

  test('a missing query is a 400', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/enrich')
      .set('Authorization', `Bearer ${tokenFor('analyst')}`);
    expect(res.status).toBe(400);
  });

  test('soc_analyst is admitted (holds knowledge.query)', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('Authorization', `Bearer ${tokenFor('soc')}`);
    expect(res.status).toBe(200);
  });

  test('a role without knowledge.query is forbidden', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('Authorization', `Bearer ${tokenFor('siro')}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /knowledge/search (universal, scope-aware)', () => {
  test('a global role finds risks, systems, threats, actions and controls', async () => {
    const adRes = await request(app)
      .get('/api/v1/knowledge/search?q=Active%20Directory')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(adRes.status).toBe(200);
    expect(adRes.body.systems.some((s) => s.name === 'Active Directory')).toBe(true);
    expect(adRes.body.risks.length).toBeGreaterThan(0);
    expect(adRes.body.risks[0]).toHaveProperty('entity_type', 'risk');

    const phishRes = await request(app)
      .get('/api/v1/knowledge/search?q=phishing')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(phishRes.status).toBe(200);
    expect(phishRes.body.threats.some((t) => /phishing/i.test(t.name))).toBe(true);
    expect(phishRes.body.actions.length).toBeGreaterThan(0);

    const mfaRes = await request(app)
      .get('/api/v1/knowledge/search?q=MFA')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(mfaRes.status).toBe(200);
    expect(mfaRes.body.controls.some((c) => /MFA/i.test(c.name))).toBe(true);
  });

  test('security_consultant sees catalogues but not risks/actions (lacks those caps)', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/search?q=phishing')
      .set('Authorization', `Bearer ${tokenFor('consultant')}`);
    expect(res.status).toBe(200);
    expect(res.body.threats.length).toBeGreaterThan(0); // holds threats.read
    expect(res.body.risks).toEqual([]);                  // no risks.read
    expect(res.body.actions).toEqual([]);                // no actions.read
  });

  test('IAM/IAO are admitted (knowledge.query granted in v88) and get results', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/search?q=Active%20Directory')
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(res.status).toBe(200);
    expect(res.body.systems.some((s) => s.name === 'Active Directory')).toBe(true);
  });

  // v110 inverted this. soc_analyst used to hold knowledge.query ALONE, so every
  // entity block in searchAll was gated out and the role got eight empty arrays
  // — while the same systems and risks came back freely from /enrich and
  // /graph, which apply no per-entity gates. That was an inconsistency, not a
  // boundary. The SOC analyst is now a read-only power user.
  test('soc_analyst gets real results from /search', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/search?q=Active%20Directory')
      .set('Authorization', `Bearer ${tokenFor('soc')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('soc_analyst still sees nothing it was not granted — meetings stay closed', async () => {
    const res = await request(app)
      .get('/api/v1/meetings')
      .set('Authorization', `Bearer ${tokenFor('soc')}`);
    expect(res.status).toBe(403);
  });

  test('a role without knowledge.query is forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/search?q=ad')
      .set('Authorization', `Bearer ${tokenFor('siro')}`);
    expect(res.status).toBe(403);
  });

  test('a missing query is a 400', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/search')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /knowledge/graph/:type/:id (walkable, scope-aware)', () => {
  test('a global role gets the seed system + its risk/component/asset neighbours', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/system/${SYSTEM_ID}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(200);
    expect(res.body.root).toEqual({ type: 'system', id: SYSTEM_ID });
    const types = res.body.nodes.map((n) => n.data.type);
    expect(res.body.nodes.some((n) => n.data.id === `system-${SYSTEM_ID}`)).toBe(true); // seed
    expect(types).toContain('risk');   // AD carries seeded risks
    expect(res.body.edges.length).toBeGreaterThan(0);
  });

  test('security_consultant gets the system but no risk neighbours (lacks risks.read)', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/system/${SYSTEM_ID}`)
      .set('Authorization', `Bearer ${tokenFor('consultant')}`);
    expect(res.status).toBe(200);
    expect(res.body.nodes.map((n) => n.data.type)).not.toContain('risk');
  });

  test('IAM is admitted and can walk', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/system/${SYSTEM_ID}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(res.status).toBe(200);
  });

  test('a risk seed expands to its threat and system', async () => {
    // risk-02 (validated AD phishing) from the seed
    const RISK_ID = '66666666-0000-0000-0000-000000000002';
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/risk/${RISK_ID}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(200);
    const types = res.body.nodes.map((n) => n.data.type);
    expect(types).toContain('threat');
    expect(types).toContain('system');
  });

  test('a role without knowledge.query is forbidden', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/system/${SYSTEM_ID}`)
      .set('Authorization', `Bearer ${tokenFor('siro')}`);
    expect(res.status).toBe(403);
  });

  test('an unknown type is a 400', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/graph/widget/${SYSTEM_ID}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /knowledge/enrich/bulk', () => {
  test('resolves an array, one result per query', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/enrich/bulk')
      .set('Authorization', `Bearer ${tokenFor('soc')}`)
      .send({ queries: [HOST_IP, '203.0.113.254', HOST_NAME] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.results[0].matched).toBe(true);  // IP hit
    expect(res.body.results[1].matched).toBe(false); // unknown
    expect(res.body.results[2].matched).toBe(true);  // hostname hit
  });

  test('rejects an empty / non-array body', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/enrich/bulk')
      .set('Authorization', `Bearer ${tokenFor('soc')}`)
      .send({ queries: [] });
    expect(res.status).toBe(400);
  });

  test('rejects an over-limit batch', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/enrich/bulk')
      .set('Authorization', `Bearer ${tokenFor('soc')}`)
      .send({ queries: Array.from({ length: 257 }, (_, i) => `10.0.0.${i % 255}`) });
    expect(res.status).toBe(400);
  });
});

describe('machine auth via X-API-Key', () => {
  test('admin mints a key (returned once)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/api-keys')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ label: LABEL });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^cirks_sk_/);
    expect(res.body.role).toBe('soc_integration');   // v111: the machine role, not a human one
    expect(res.body).not.toHaveProperty('key_hash');
    keyId = res.body.id;
    plaintextKey = res.body.key;
  });

  test('the key authenticates an enrichment lookup (no JWT)', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('X-API-Key', plaintextKey);
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
  });

  test('the key works on the bulk path too', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/enrich/bulk')
      .set('X-API-Key', plaintextKey)
      .send({ queries: [HOST_IP] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('an invalid key is 401', async () => {
    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('X-API-Key', 'cirks_sk_not_a_real_key');
    expect(res.status).toBe(401);
  });

  // v111. Before this, POST /admin/api-keys admitted any role holding
  // knowledge.query — which admin (45 capabilities) and ciso (44) both do. An
  // administrator could mint a long-lived bearer credential with full
  // administrative powers, every write included, and hand it to an integration.
  test.each(['admin', 'ciso', 'risk_analyst', 'soc_analyst'])(
    'a key CANNOT be minted as the human role %s', async (role) => {
      const res = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ label: `should-not-exist-${role}`, role });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/machine role/i);
    });

  test('a machine key is refused on /search and /graph — enrichment only', async () => {
    for (const path of ['/api/v1/knowledge/search?q=a',
                        '/api/v1/knowledge/graph/system/00000000-0000-0000-0000-000000000000']) {
      const res = await request(app).get(path).set('X-API-Key', plaintextKey);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/knowledge\.query/);
    }
  });

  test('a revoked key is rejected', async () => {
    const del = await request(app)
      .delete(`/api/v1/admin/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(del.status).toBe(200);

    const res = await request(app)
      .get(`/api/v1/knowledge/enrich?q=${HOST_IP}`)
      .set('X-API-Key', plaintextKey);
    expect(res.status).toBe(401);
  });

  test('a non-admin cannot mint keys', async () => {
    const res = await request(app)
      .post('/api/v1/admin/api-keys')
      .set('Authorization', `Bearer ${tokenFor('analyst')}`)
      .send({ label: 'nope' });
    expect(res.status).toBe(403);
  });
});
