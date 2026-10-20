#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS ISMS-cycle driver — Phase 3 of the demo/training dataset.
//
//   node db/isms-cycle.js [--base <url>] [--dry-run] [--reset]
//
// The architecture tier (departments, assets, systems, services, components) and
// the risk surface (system_threats, system_controls) load from CSV via
// db/import.js. The OPERATIONAL tier cannot: risks, actions, exceptions and
// meetings are produced by stored functions, triggers and multi-step state
// machines, so hand-writing them as CSV yields inconsistent derived scores and an
// empty audit_log. This script instead logs in as each persona and drives the
// REAL HTTP endpoints, in the order a real ISMS cycle runs:
//
//   analyst raises risks → judges each threat-linked control on the coverage
//   panel → CISO validates (and returns one) → gap-driven actions are built from
//   the coverage gap and accepted → some items complete → a couple of risks are
//   formally accepted as time-bounded exceptions → the secretary plans, runs,
//   closes and issues minutes for an SWG meeting, and plans the next one.
//
// Everything therefore lands with real derived scores, real residual history and
// a real audit trail — the same rows a human clicking the UI would produce.
//
// AUTH: personas are authenticated by minting access tokens with the server's own
// JWT_ACCESS_SECRET (the pattern src/__tests__/integration/helpers.js uses),
// NOT by logging in. A training instance's passwords belong to whoever set them;
// this script must never need or change them.
//
// Re-running is safe: every phase checks for what it already created and skips.
// --reset deletes ONLY what this script creates (risks and their dependants,
// meetings) so the cycle can be re-run from clean; it never touches the
// architecture tier.
//
// CAVEAT on --reset: completing an action item legitimately flips its control or
// component OPERATIONAL on the system — that is the remediation actually landing.
// Deleting the risks does not put those statuses back, so each cycle leaves the
// risk surface a little more remediated and a subsequent run finds fewer
// untreated pairs (and so fewer top-of-scale risks). To rehearse repeatedly from
// a truly identical starting point, re-apply seed-data/demo/system-controls.csv
// statuses before re-running.

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { pool, query } = require('../src/db/pool');

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { base: process.env.ISMS_BASE || 'http://localhost:3000/api/v1' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--assess-backlog') out.assessBacklog = true;
    else if (a === '--hold-back') out.holdBack = parseInt(argv[++i], 10);
    else if (a === '--reset') out.reset = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const HELP = `
CIRKS ISMS-cycle driver — generates the operational tier against the real API.

  node db/isms-cycle.js [options]

  --base <url>       API base (default http://localhost:3000/api/v1, or $ISMS_BASE)
  --dry-run          report the plan; make no writes
  --reset            delete previously generated risks + meetings first
  --assess-backlog   assess EVERY identified threat that has no risk yet,
                     instead of building a fresh 36-risk portfolio
  --hold-back <n>    with --assess-backlog, leave n systems entirely unassessed
                     (default 4) so the identified-but-not-yet-assessed state
                     stays visible — it is a real state, not an omission
  -h, --help         this message

Requires JWT_ACCESS_SECRET and a reachable API. Run it from the app container:
  docker compose exec app node riskapp/db/isms-cycle.js
`;

// ── tiny logger ──────────────────────────────────────────────────────────────
let step = 0;
const log = (m) => console.log(m);
const phase = (m) => console.log(`\n── ${++step}. ${m} ${'─'.repeat(Math.max(0, 60 - m.length))}`);
const ok = (m) => console.log(`   ✓ ${m}`);
const skip = (m) => console.log(`   · ${m}`);
const warn = (m) => console.log(`   ! ${m}`);

// ── HTTP ─────────────────────────────────────────────────────────────────────
let BASE = '';
let DRY = false;
const counters = { posts: 0, skipped: 0, failed: 0 };

async function api(token, method, path, body) {
  if (DRY && method !== 'GET') { counters.posts++; return { __dry: true }; }
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  // Several endpoints answer 204 with no body (validate is one). Normalise to an
  // object so callers can treat "it worked" as truthy without special-casing.
  let json = text ? null : {};
  try { if (text) json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${json?.error || text.slice(0, 200)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  if (method !== 'GET') counters.posts++;
  return json;
}

// Run an API call, tolerating an expected conflict (already-exists) as a skip.
async function tolerate(fn, label) {
  try { return await fn(); }
  catch (err) {
    if (err.status === 409) { counters.skipped++; skip(`${label} — already exists`); return null; }
    counters.failed++; warn(`${label} — ${err.message}`);
    return null;
  }
}

// ── deterministic helpers (no Math.random: re-runs must be reproducible) ─────
function hash01(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const daysFromNow = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(9, 0, 0, 0);
  return d;
};
const isoDate = (d) => d.toISOString().slice(0, 10);

// ── personas ─────────────────────────────────────────────────────────────────
// Resolved by ROLE from the live DB, so this works against any populated org
// rather than only the Misty Isles fixture.
async function resolvePersonas() {
  const { rows } = await query(`
    SELECT DISTINCT ON (role) id, email, full_name, role
      FROM users WHERE is_active ORDER BY role, created_at`);
  const byRole = Object.fromEntries(rows.map(r => [r.role, r]));
  const need = ['risk_analyst', 'ciso', 'admin'];
  const missing = need.filter(r => !byRole[r]);
  if (missing.length) throw new Error(`no active user holds the required role(s): ${missing.join(', ')}`);
  return byRole;
}

function tokenFor(user) {
  if (!process.env.JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET is not set — run this inside the app container');
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '2h' }   // long enough for a full cycle
  );
}

// A meeting_secretary is required for the SWG lifecycle and a fresh org may not
// have one. Create the persona through the admin API rather than inserting.
async function ensureSecretary(personas, adminToken) {
  if (personas.meeting_secretary) {
    skip(`secretary exists — ${personas.meeting_secretary.full_name}`);
    return personas.meeting_secretary;
  }
  const email = 'swg.secretary@mig.local';
  const { rows: dept } = await query(
    `SELECT id FROM departments ORDER BY (name ILIKE '%information security%') DESC, name LIMIT 1`);
  if (DRY) { ok(`would create meeting_secretary ${email}`); return { id: '(dry-run)', email, role: 'meeting_secretary', full_name: 'SWG Secretary' }; }
  const created = await tolerate(() => api(adminToken, 'POST', '/admin/users', {
    email,
    full_name: 'Morag Sinclair',
    role: 'meeting_secretary',
    department_id: dept[0]?.id || null,
    // No published default: without DEMO_PASSWORD the account gets a random
    // password nobody knows, like the accounts install.js locks.
    password: process.env.DEMO_PASSWORD || require('crypto').randomBytes(24).toString('base64url'),
  }), `create secretary ${email}`);
  if (!created) {
    const { rows } = await query(`SELECT id, email, full_name, role FROM users WHERE lower(email) = lower($1)`, [email]);
    if (rows.length) return rows[0];
    throw new Error('could not create or find a meeting_secretary');
  }
  ok(`created meeting_secretary ${email} (password: DEMO_PASSWORD, or random if unset)`);
  const { rows } = await query(`SELECT id, email, full_name, role FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0];
}

// ── risk selection ───────────────────────────────────────────────────────────
// Builds a browsable, deliberately-spread portfolio rather than one risk per
// pair (222 pairs would be noise). Because residual probability is a MAX over
// the threat's controls — an unjudged or non-operational control holds the risk
// at the threat's inherent — the spread is driven by each pair's gap count:
//
//   clean   (0 gaps)  → every control judged down → visibly reduced, green/amber
//   gappy   (1–2)     → the gaps hold it near inherent → amber/red + real candidates
//   critical(3+)      → high-impact systems, the ones that earn actions/exceptions
//
// `opts.perSystemCap` bounds how many risks one system may take — 2 keeps a
// browsable demo portfolio spread across the estate. `opts.excludeSystemIds`
// holds systems back ENTIRELY, so their identified threats stay unassessed:
// under the v100 model that is a real workflow state worth showing, not an
// omission. Both matter when assessing the backlog in bulk, where the point is
// coverage rather than spread.
async function planRisks(limit, opts = {}) {
  const perSystemCap   = opts.perSystemCap ?? 2;
  const excludeSystems = opts.excludeSystemIds || new Set();
  // Residual probability is a MIN over the DEPLOYED (operational|degraded)
  // controls — the BEST deployed control governs, and missing/unknown ones are
  // ignored entirely. So what predicts a risk's band is not how many gaps it has
  // but whether it has any working control at all:
  //   untreated (none deployed)   → sits at the threat's inherent    → top of scale
  //   partial   (degraded only)   → inherent - 1
  //   treated   (has operational) → inherent - 2
  // Tiering on gap COUNT (the intuitive reading) is wrong here: a pair with four
  // gaps and one operational control scores exactly the same as a pristine one.
  const { rows } = await query(`
    SELECT s.id  AS system_id, s.name AS system_name, s.owner_user_id,
           GREATEST(COALESCE(s.impact_c,1), COALESCE(s.impact_i,1), COALESCE(s.impact_a,1)) AS impact,
           t.id AS threat_id, t.name AS threat_name,
           GREATEST(t.probability_c, t.probability_i, t.probability_a) AS inherent,
           COUNT(*) FILTER (WHERE sc.status = 'operational') AS operational,
           COUNT(*) FILTER (WHERE sc.status = 'degraded') AS degraded,
           COUNT(*) AS treating_controls
      FROM system_threats st
      JOIN systems s ON s.id = st.system_id AND s.is_active
      JOIN threats t ON t.id = st.threat_id
      JOIN control_threats ct ON ct.threat_id = t.id
      LEFT JOIN system_controls sc ON sc.control_id = ct.control_id AND sc.system_id = s.id
     WHERE NOT EXISTS (SELECT 1 FROM risks r
                        WHERE r.system_id = s.id AND r.threat_id = t.id AND r.is_active)
     GROUP BY s.id, s.name, s.owner_user_id, t.id, t.name, t.probability_c, t.probability_i, t.probability_a
  `);

  const tiered = rows.map(r => {
    const op = Number(r.operational), deg = Number(r.degraded);
    return {
      ...r,
      impact: Number(r.impact),
      inherent: Number(r.inherent),
      tier: op === 0 && deg === 0 ? 'untreated' : op === 0 ? 'partial' : 'treated',
    };
  });

  const stable = (a, b) => hash01(a.system_name + a.threat_name) - hash01(b.system_name + b.threat_name);
  // Untreated/partial pairs are ranked hardest-first so they reach the top of the
  // scale. Treated pairs are ranked only by the stable hash: ranking them by
  // impact too would pick the 39 biggest systems and pile the whole portfolio
  // into one band, which is the opposite of the spread we want.
  const rankBy = {
    untreated: (a, b) => ((b.impact * b.inherent) - (a.impact * a.inherent)) || stable(a, b),
    partial:   (a, b) => ((b.impact * b.inherent) - (a.impact * a.inherent)) || stable(a, b),
    treated:   stable,
  };

  // Explicit per-tier quotas — the point is the SPREAD. Untreated pairs are rare
  // by design (a well-run org has few), so take EVERY one that exists: they are
  // the only pairs that can reach the top of the scale, and each is a genuine
  // finding worth showing.
  const quota = {
    untreated: limit,
    partial:   Math.round(limit * 0.25),
    treated:   Math.round(limit * 0.65),
  };
  const perSystem = new Map();
  const picked = [];
  const seen = new Set();                    // pairs already chosen — the slack
                                             // pass revisits each tier, and
                                             // re-picking a pair means a 409.
  const pairKey = (r) => r.system_id + '|' + r.threat_id;

  const take = (tier, max) => {
    let taken = 0;
    for (const r of tiered.filter(x => x.tier === tier).sort(rankBy[tier])) {
      if (picked.length >= limit || taken >= max) break;
      if (seen.has(pairKey(r))) continue;
      if (excludeSystems.has(r.system_id)) continue;   // deliberately held back
      const n = perSystem.get(r.system_id) || 0;
      if (n >= perSystemCap) continue;
      perSystem.set(r.system_id, n + 1);
      seen.add(pairKey(r));
      picked.push(r);
      taken++;
    }
    return taken;
  };

  const got = {};
  for (const tier of ['untreated', 'partial', 'treated']) got[tier] = take(tier, quota[tier]);
  // A short tier (e.g. few clean pairs) hands its slack to the others rather
  // than shrinking the portfolio.
  for (const tier of ['treated', 'partial', 'untreated']) {
    if (picked.length >= limit) break;
    take(tier, limit - picked.length);
  }
  return picked;
}

// The analyst's judgement of each threat-linked control's residual probability.
// Honest to the model: only an operational control earns a reduction; a degraded
// one earns less; unknown/missing/not-deployed earn none, which (being a MAX)
// holds the whole risk at the threat's inherent until the gap is closed.
function judgeFor(status, inherent) {
  if (status === 'operational') return clamp(inherent - 2, 1, 5);
  if (status === 'degraded')    return clamp(inherent - 1, 1, 5);
  return inherent;                     // unknown, missing, or not on the system
}

const RATIONALE = (threat, system) =>
  `${threat} assessed against ${system} as part of the annual information risk assessment. `
  + `Scored from the threat's inherent likelihood and the controls currently deployed on the system.`;

// ── phases ───────────────────────────────────────────────────────────────────
async function raiseRisks(tokens, personas, target, opts = {}) {
  phase('Analyst raises risks');
  // `target` is the size of the whole portfolio, not a per-run batch — otherwise
  // a second run silently doubles the risk register.
  const { rows: have } = await query('SELECT count(*)::int AS n FROM risks WHERE is_active');
  const limit = Math.max(0, target - have[0].n);
  if (limit === 0) {
    skip(`${have[0].n} active risks already — portfolio target of ${target} met`);
    return [];
  }
  if (have[0].n) log(`   ${have[0].n} active risks exist; raising ${limit} more to reach ${target}`);

  const plan = await planRisks(limit, opts);
  if (!plan.length) { skip('no unrisked system × threat pairs left'); return []; }

  const counts = plan.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
  log(`   planning ${plan.length} risks — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);

  const created = [];
  for (const r of plan) {
    const { rows: t } = await query(
      `SELECT probability_c, probability_i, probability_a FROM threats WHERE id = $1`, [r.threat_id]);
    const inh = t[0];
    const made = await tolerate(() => api(tokens.analyst, 'POST', '/risks', {
      system_id: r.system_id,
      threat_id: r.threat_id,
      probability_c: inh.probability_c,
      probability_i: inh.probability_i,
      probability_a: inh.probability_a,
      rationale: RATIONALE(r.threat_name, r.system_name),
      review_date: isoDate(daysFromNow(180)),
      treatment_decision: 'mitigate',
    }), `risk “${r.threat_name}” on ${r.system_name}`);
    if (made?.id || made?.__dry) created.push({ ...r, id: made?.id, inherent: inh });
  }
  ok(`${created.length} risks raised`);
  return created;
}

async function judgeCoverage(tokens) {
  phase('Analyst judges the coverage panel (per-control residual probability)');
  // Driven from the DB, not from the risks this run happened to create, so a
  // re-run still judges anything left unjudged (e.g. after a partial failure).
  const { rows: risks } = await query(`
    SELECT r.id, r.system_id, r.threat_id,
           t.probability_c, t.probability_i, t.probability_a
      FROM risks r
      JOIN threats t ON t.id = r.threat_id
     WHERE r.is_active
       AND NOT EXISTS (SELECT 1 FROM risk_control_probability rcp WHERE rcp.risk_id = r.id)`);
  if (!risks.length) { skip('every active risk already has control judgements'); return; }

  let judged = 0;
  for (const row of risks) {
    const r = { ...row, inherent: row };
    const { rows: controls } = await query(`
      SELECT c.id, COALESCE(sc.status::text, 'not_deployed') AS status
        FROM control_threats ct
        JOIN controls c ON c.id = ct.control_id
        LEFT JOIN system_controls sc ON sc.control_id = c.id AND sc.system_id = $1
       WHERE ct.threat_id = $2`, [r.system_id, r.threat_id]);

    for (const c of controls) {
      // Judging a control that earns no reduction would write a row identical to
      // the fallback — skip it, so the panel shows a real judgement or nothing.
      if (judgeFor(c.status, r.inherent.probability_c) === r.inherent.probability_c
       && judgeFor(c.status, r.inherent.probability_i) === r.inherent.probability_i
       && judgeFor(c.status, r.inherent.probability_a) === r.inherent.probability_a) continue;
      const done = await tolerate(() => api(tokens.analyst, 'PUT', `/risks/${r.id}/controls/${c.id}/probability`, {
        probability_c: judgeFor(c.status, r.inherent.probability_c),
        probability_i: judgeFor(c.status, r.inherent.probability_i),
        probability_a: judgeFor(c.status, r.inherent.probability_a),
      }), `judge control on risk ${r.id}`);
      if (done || DRY) judged++;
    }
  }
  ok(`${judged} per-control judgements recorded`);
}

async function validateRisks(tokens, risks) {
  phase('CISO validates the queue');
  const pending = await api(tokens.ciso, 'GET', '/governance/risks/pending');
  // v_pending_risks names the key `risk_id`, not `id`.
  const list = (pending?.risks || []).map(r => r.risk_id || r.id).filter(Boolean);
  if (!list.length) { skip('nothing pending'); return; }

  // Return one to the analyst so the "returned" state is represented, validate
  // the rest. The returned one is chosen deterministically.
  const returnIdx = Math.floor(hash01('return-pick') * list.length);
  let validated = 0, returned = 0;
  for (let i = 0; i < list.length; i++) {
    const id = list[i];
    if (i === returnIdx) {
      const r = await tolerate(() => api(tokens.ciso, 'POST', `/governance/risks/${id}/validate`, {
        action: 'return',
        notes: 'Please confirm the availability rating with the asset owner and re-check the backup control status before this is accepted.',
      }), `return risk ${id}`);
      if (r || DRY) returned++;
    } else {
      const r = await tolerate(() => api(tokens.ciso, 'POST', `/governance/risks/${id}/validate`, {
        action: 'validate',
      }), `validate risk ${id}`);
      if (r || DRY) validated++;
    }
  }
  ok(`${validated} validated, ${returned} returned to the analyst`);
}

async function buildActions(tokens, personas) {
  phase('Gap-driven security actions — build, accept, progress');
  // Actions are mandatory at or above org_config.mandatory_action_score.
  const { rows: cfg } = await query('SELECT mandatory_action_score FROM org_config');
  const threshold = cfg[0]?.mandatory_action_score ?? 12;

  const { rows: candidates } = await query(`
    SELECT r.id, r.risk_score, s.name AS system_name, t.name AS threat_name
      FROM risks r
      JOIN systems s ON s.id = r.system_id
      JOIN threats t ON t.id = r.threat_id
     WHERE r.is_active AND r.risk_score >= $1
       AND NOT EXISTS (SELECT 1 FROM security_action_risks sar WHERE sar.risk_id = r.id)
     ORDER BY r.risk_score DESC`, [threshold]);

  log(`   ${candidates.length} risks at or above the mandatory action score (${threshold})`);
  const built = [];

  for (const r of candidates) {
    const cand = await tolerate(() => api(tokens.analyst, 'GET', `/risks/${r.id}/action-items/candidates`),
      `candidates for ${r.threat_name} on ${r.system_name}`);
    if (!cand) continue;
    if (DRY) { built.push({ risk: r }); continue; }

    // Every non-operational component is mandatory — the endpoint rejects the
    // action if one would be left uncovered. Controls: take the worst first.
    const items = [
      ...cand.components
        .filter(c => !c.already_in_open_action)
        .map(c => ({ element_type: 'component', component_id: c.component_id,
                     comment: `Bring ${c.name} to an operational state on this system.` })),
      ...cand.controls
        .filter(c => !c.already_in_open_action)
        .sort((a, b) => (a.system_status === 'missing' ? 0 : 1) - (b.system_status === 'missing' ? 0 : 1))
        .slice(0, 3)
        .map(c => ({ element_type: 'control', control_id: c.control_id,
                     comment: c.on_system
                       ? `Remediate ${c.title} — currently ${c.system_status} on this system.`
                       : `Deploy ${c.title} on this system.` })),
    ];
    if (!items.length) { skip(`no open candidates for ${r.threat_name} on ${r.system_name}`); continue; }

    const action = await tolerate(() => api(tokens.analyst, 'POST', `/risks/${r.id}/actions/from-gap`, {
      title: `Treat “${r.threat_name}” on ${r.system_name}`,
      items,
    }), `action for ${r.threat_name} on ${r.system_name}`);
    if (action?.id) built.push({ risk: r, actionId: action.id, itemCount: action.item_count });
  }
  ok(`${built.length} actions proposed`);

  // The CISO accepts most (freezing items + snapshotting the baseline) and
  // leaves a couple in the acceptance queue so that screen is not empty.
  const toAccept = built.filter((b, i) => b.actionId && i < Math.max(0, built.length - 2));
  let accepted = 0;
  for (const b of toAccept) {
    const r = await tolerate(() => api(tokens.ciso, 'POST', `/risks/${b.risk.id}/actions/${b.actionId}/accept`, {}),
      `accept action ${b.actionId}`);
    if (r || DRY) accepted++;
  }
  ok(`${accepted} accepted, ${built.length - accepted} left in the acceptance queue`);

  // Complete a third of the accepted actions' items so remediation shows real
  // progress and the risk scores actually move.
  let completed = 0;
  for (const b of toAccept.slice(0, Math.ceil(toAccept.length / 3))) {
    // GET /risks/:id/actions answers with a bare array, not an envelope.
    const detail = await tolerate(() => api(tokens.ciso, 'GET', `/risks/${b.risk.id}/actions`), `actions for risk ${b.risk.id}`);
    const action = Array.isArray(detail) ? detail.find(a => a.id === b.actionId) : null;
    for (const item of (action?.items || []).slice(0, 2)) {
      if (item.status === 'completed') continue;
      const r = await tolerate(() => api(tokens.ciso, 'POST', `/risks/${b.risk.id}/action-items/${item.id}/complete`,
        item.element_type === 'control'
          // v120: an item's target is blank unless someone judged one. Completing
          // it confirms what the control now achieves, so a blank target becomes
          // a modest, explicit judgement rather than a refused request.
          ? { probability_c: item.target_p_c ?? 2, probability_i: item.target_p_i ?? 2, probability_a: item.target_p_a ?? 2 }
          : {}), `complete item ${item.id}`);
      if (r || DRY) completed++;
    }
  }
  ok(`${completed} action items completed`);
}

async function acceptExceptions(tokens) {
  phase('CISO accepts a small number of risks as time-bounded exceptions');
  const { rows } = await query(`
    SELECT r.id, r.risk_score, s.name AS system_name, t.name AS threat_name
      FROM risks r
      JOIN systems s ON s.id = r.system_id
      JOIN threats t ON t.id = r.threat_id
     WHERE r.is_active AND r.validation_status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.risk_id = r.id AND e.status = 'active')
     ORDER BY r.risk_score DESC LIMIT 3`);

  const JUSTIFY = [
    'Remediation requires a plant shutdown that cannot be scheduled before the next maintenance window. Compensating monitoring is in place and reported to the SWG monthly.',
    'The supplier contract is in renegotiation; the security schedule will be added at renewal. Accepted for one cycle on the CISO\'s authority.',
    'Segmentation is funded and scheduled but will not complete this cycle. Interim access restrictions have been applied and are reviewed quarterly.',
  ];
  const CADENCE = ['monthly', 'quarterly', 'quarterly'];

  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const made = await tolerate(() => api(tokens.ciso, 'POST', `/risks/${r.id}/exceptions`, {
      justification: JUSTIFY[i % JUSTIFY.length],
      expires_at: isoDate(daysFromNow(90 + i * 45)),
      review_cadence: CADENCE[i % CADENCE.length],
      notes: `Accepted at score ${r.risk_score} — ${r.threat_name} on ${r.system_name}.`,
    }), `exception on ${r.threat_name} / ${r.system_name}`);
    if (made || DRY) n++;
  }
  ok(`${n} exceptions accepted`);
}

async function runMeetingCycle(tokens, personas) {
  phase('SWG meeting — plan, agenda, decisions, close, issue minutes');

  const existing = await api(tokens.secretary, 'GET', '/meetings');
  const meetings = existing?.meetings || [];
  if (meetings.some(m => m.minutes_issued_at)) {
    skip('an issued meeting already exists — skipping the historic meeting');
  } else {
    const held = await tolerate(() => api(tokens.secretary, 'POST', '/meetings', {
      meeting_date: isoDate(daysFromNow(-21)),
      chaired_by: personas.ciso.id,
      target_duration_min: 90,
    }), 'plan the historic meeting');
    const meetingId = held?.meeting?.id;

    if (meetingId) {
      await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${meetingId}/agenda/generate`, {}), 'generate agenda');

      // Attendees: the chair, the analyst, the SIRO if there is one.
      for (const p of [personas.ciso, personas.risk_analyst, personas.siro].filter(Boolean)) {
        await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${meetingId}/attendees`, {
          user_id: p.id,
          role_at_meeting: p.role === 'ciso' ? 'chair' : 'member',
        }), `add attendee ${p.full_name}`);
      }

      // Record a decision against each generated agenda item.
      const agenda = await tolerate(() => api(tokens.secretary, 'GET', `/meetings/${meetingId}/agenda`), 'read agenda');
      const items = agenda?.items || [];
      let decided = 0;
      for (const it of items) {
        const text = DECISIONS[it.category] || DECISIONS._default;
        const r = await tolerate(() => api(tokens.secretary, 'POST',
          `/meetings/${meetingId}/agenda/items/${it.id}/decision`,
          { decision_text: text }), `decision on “${(it.title || '').slice(0, 40)}”`);
        if (r || DRY) decided++;
      }
      ok(`${items.length} agenda items, ${decided} decisions recorded`);

      await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${meetingId}/close`, {
        quorate: true,
        quorate_notes: 'Chair, SIRO and risk analyst present; quorum met.',
      }), 'close the meeting');

      await tolerate(() => api(tokens.secretary, 'PATCH', `/meetings/${meetingId}/minutes`, {
        minutes_body: MINUTES,
      }), 'save minutes draft');

      await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${meetingId}/issue-minutes`, {}), 'issue minutes');
      ok('historic meeting closed and minutes issued');
    }
  }

  // The forthcoming meeting: left open so "next meeting" widgets, the agenda
  // prep screens and the personalised pack all have live content.
  if (meetings.some(m => !m.closed_at)) {
    skip('an open meeting already exists — skipping the forthcoming meeting');
  } else {
    const next = await tolerate(() => api(tokens.secretary, 'POST', '/meetings', {
      meeting_date: isoDate(daysFromNow(14)),
      chaired_by: personas.ciso.id,
      target_duration_min: 90,
    }), 'plan the forthcoming meeting');
    if (next?.meeting?.id) {
      await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${next.meeting.id}/agenda/generate`, {}), 'generate agenda');
      for (const p of [personas.ciso, personas.risk_analyst, personas.siro].filter(Boolean)) {
        await tolerate(() => api(tokens.secretary, 'POST', `/meetings/${next.meeting.id}/attendees`, {
          user_id: p.id, role_at_meeting: p.role === 'ciso' ? 'chair' : 'member',
        }), `add attendee ${p.full_name}`);
      }
      ok(`forthcoming meeting planned for ${isoDate(daysFromNow(14))}`);
    }
  }
}

// Keyed on meeting_agenda_items.category (CATEGORY_BASE in agendaController.js).
const DECISIONS = {
  opening:          'Apologies noted. The agenda was agreed without amendment.',
  previous_minutes: 'The minutes of the previous meeting were agreed as an accurate record.',
  change_briefing:  'The group noted the changes to the estate since the last meeting.',
  cycle_overview:   'The cycle position was noted. The group is content with progress against the plan.',
  isms_objectives:  'Progress against the ISMS objectives was reviewed and noted.',
  new_risks:        'Noted. The group agreed the scoring reflects the current control position.',
  action_progress:  'Progress noted; no change to the target date.',
  sap_health:       'The action plan position was reviewed. Overdue items to be chased by the owners.',
  assurance:        'The assurance position was noted.',
  risk_validation:  'Reviewed and accepted the analyst\'s assessment. Validated.',
  action_adoption:  'Action accepted. Owner to report progress at the next meeting.',
  exceptions:       'Exception reviewed and confirmed. To be re-examined at expiry.',
  aob:              'No other business was raised.',
  close:            'The Chair thanked members and closed the meeting.',
  _default:         'Discussed and noted. No further action at this meeting.',
};

const MINUTES = `The Security Working Group met to review the current information risk position.

The group reviewed the risks raised since the last meeting and accepted the analyst's assessments, noting that residual probability remains at the inherent level wherever a treating control is missing, degraded or of unknown status. The Chair emphasised that this is the intended behaviour of the assessment model: the weakest control on a system governs the residual position, and closing a single gap is what moves the score.

Security actions built from the coverage gap were reviewed and accepted. Owners were confirmed and the group noted that acceptance freezes the action's scope and records the risk baseline against which progress will be measured.

The group reviewed the outstanding risk exceptions. Each was confirmed as still justified, with the Chair noting that an exception is a time-bounded decision and not a substitute for remediation. All will be re-examined at expiry.

The operational technology estate was discussed as a standing concern. The group acknowledged that the utilities, airport and maritime systems carry a materially higher proportion of non-operational controls than the corporate estate, and that remediation there is constrained by maintenance windows and vendor support rather than by funding.

Date of next meeting: as circulated.`;

// ── reset ────────────────────────────────────────────────────────────────────
// Deletes ONLY the operational tier this script produces. The architecture tier
// (departments, users, assets, systems, services, components, threats, controls
// and the risk surface) is never touched.
async function reset() {
  phase('Reset — removing previously generated operational data');
  if (DRY) { skip('dry run — nothing deleted'); return; }
  const stmts = [
    'DELETE FROM meeting_attendees',
    'DELETE FROM meeting_agenda_items',
    'DELETE FROM meeting_attachments',
    'DELETE FROM working_group_meetings',
    'DELETE FROM security_action_items',
    'DELETE FROM security_action_risks',
    'DELETE FROM security_actions',
    'DELETE FROM exceptions',
    'DELETE FROM risk_control_probability',
    'DELETE FROM risk_residual_history',
    'DELETE FROM risks',
  ];
  for (const s of stmts) {
    const r = await query(s);
    ok(`${s.replace('DELETE FROM ', '')}: ${r.rowCount} removed`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { console.log(HELP); return; }
  BASE = opts.base.replace(/\/$/, '');
  DRY = Boolean(opts.dryRun);

  log(`CIRKS ISMS cycle — API ${BASE}${DRY ? '   [DRY RUN — no writes]' : ''}`);

  // Fail fast if the API is not actually reachable, rather than 40 failed POSTs.
  const personas = await resolvePersonas();
  const tokens = {
    analyst: tokenFor(personas.risk_analyst),
    ciso: tokenFor(personas.ciso),
    admin: tokenFor(personas.admin),
  };
  try {
    await api(tokens.ciso, 'GET', '/org/phase');
  } catch (err) {
    throw new Error(`API not reachable at ${BASE} (${err.message}). Run inside the app container, or pass --base.`);
  }

  log(`   analyst   ${personas.risk_analyst.full_name} <${personas.risk_analyst.email}>`);
  log(`   CISO      ${personas.ciso.full_name} <${personas.ciso.email}>`);
  if (personas.siro) log(`   SIRO      ${personas.siro.full_name} <${personas.siro.email}>`);

  if (opts.reset) await reset();

  phase('Resolve the meeting secretary');
  const secretary = await ensureSecretary(personas, tokens.admin);
  personas.meeting_secretary = secretary;
  tokens.secretary = tokenFor(secretary);

  let risks;
  if (opts.assessBacklog) {
    // Assess the outstanding identified exposures rather than building a fresh
    // portfolio. Everything is in scope except a deliberately held-back set of
    // systems: an ISMS with NOTHING outstanding is not more realistic than one
    // with a known, reported backlog — it is less. Those systems keep their
    // identified threats unassessed, which the SWG agenda item then reports.
    const holdBack = Number.isInteger(opts.holdBack) ? opts.holdBack : 4;
    const { rows: cand } = await query(`
      SELECT DISTINCT st.system_id, s.name
        FROM system_threats st
        JOIN systems s ON s.id = st.system_id AND s.is_active
       WHERE NOT EXISTS (SELECT 1 FROM risks r
                          WHERE r.system_id = st.system_id
                            AND r.threat_id = st.threat_id AND r.is_active)
       ORDER BY s.name`);
    // Deterministic pick so a re-run holds back the SAME systems.
    const held = [...cand].sort((a, b) => hash01(a.name) - hash01(b.name)).slice(0, holdBack);
    const excludeSystemIds = new Set(held.map(r => r.system_id));

    const { rows: tot } = await query(`
      SELECT count(*)::int n FROM system_threats st
       WHERE NOT EXISTS (SELECT 1 FROM risks r
                          WHERE r.system_id = st.system_id
                            AND r.threat_id = st.threat_id AND r.is_active)`);

    phase('Assess the identified backlog');
    log(`   ${tot[0].n} exposures outstanding; holding back ${held.length} system(s) so the`);
    log(`   identified-but-unassessed state stays visible:`);
    held.forEach(h => log(`     · ${h.name}`));

    const { rows: have } = await query('SELECT count(*)::int n FROM risks WHERE is_active');
    risks = await raiseRisks(tokens, personas, have[0].n + tot[0].n, {
      perSystemCap: Infinity,
      excludeSystemIds,
    });
    if (!DRY) await judgeCoverage(tokens);
    await validateRisks(tokens, risks);
    // Actions/exceptions/meetings are left alone: this pass is about assessment
    // coverage, and re-running the governance tail would duplicate it.
  } else {
    risks = await raiseRisks(tokens, personas, 36);
    if (!DRY) await judgeCoverage(tokens);
    await validateRisks(tokens, risks);
    await buildActions(tokens, personas);
    await acceptExceptions(tokens);
    await runMeetingCycle(tokens, personas);
  }

  phase('Summary');
  if (!DRY) {
    const { rows } = await query(`
      SELECT 'risks' k, count(*) v FROM risks WHERE is_active
      UNION ALL SELECT 'validated', count(*) FROM risks WHERE is_active AND validation_status = 'validated'
      UNION ALL SELECT 'security_actions', count(*) FROM security_actions
      UNION ALL SELECT 'action_items', count(*) FROM security_action_items
      UNION ALL SELECT 'items_completed', count(*) FROM security_action_items WHERE status = 'completed'
      UNION ALL SELECT 'active_exceptions', count(*) FROM exceptions WHERE status = 'active'
      UNION ALL SELECT 'meetings', count(*) FROM working_group_meetings
      UNION ALL SELECT 'audit_log', count(*) FROM audit_log`);
    for (const r of rows) log(`   ${r.k.padEnd(18)} ${r.v}`);
  }
  log(`\n${DRY ? 'DRY RUN — ' : ''}${counters.posts} writes, ${counters.skipped} skipped, ${counters.failed} failed.`);
  if (counters.failed) process.exitCode = 1;
}

main()
  .catch((err) => { console.error(`\n[isms-cycle] ERROR: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
