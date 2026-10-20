#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles: a security solution for the control objectives that had none
// (docs/dataset/misty-isles-objective-solutions.md, the owner's answers of
// 2026-10-07). Applied through the real API as the CISO, so it is audited like
// any other change, and idempotent: run it again and it adds only what is
// missing.
//
//   node db/dataset/misty-isles/objective-solutions.js --base http://localhost:3000/api/v1 [--dry-run]
//
// What was recorded is preserved, moved to where it belongs. Before v152 a
// person marked an objective operational on a system; now that state follows a
// part. So where an objective was operational (or degraded) on a system and its
// new solution has a part that lives on the system — BitLocker, the failover
// arrangement — that part is recorded there in the same state. Nobody's
// statement is discarded, and nothing is claimed that was not claimed before.
// This is done only on the first run, while the objective still has no solution.

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const BASE = opt('--base', 'http://localhost:3000/api/v1');
const DRY = args.includes('--dry-run');
const AS = opt('--as', 'ciso@mig.local');
// No default: install.js passes the administrator's chosen password. A published
// default would be a known password on every training instance.
const PASSWORD = process.env.CIRKS_PASSWORD;
if (!PASSWORD) { console.error('Set CIRKS_PASSWORD to the password of the account this signs in as (--as).'); process.exit(1); }
const STANDARD = 'MIG Security Architecture Standard';

// ── The owner's answers ──────────────────────────────────────────────────────
// Q3: BitLocker and FileVault as technology components. Q2: PR.IR-03 is
// failover, not backup, so the failover arrangement is a thing a system has.
const NEW_COMPONENTS = [
  ['BitLocker', 'technology', 'Full-disk encryption on Windows desktops and servers.'],
  ['FileVault', 'technology', 'Full-disk encryption on macOS.'],
  ['Failover to Castle Vaults DR room', 'technology', 'The system is replicated to the Castle Vaults DR room and can be run from there.'],
];

// §2 — the solution already does this job; the library just did not say so.
const ADD_TO_EXISTING = {
  'DE.AE-02': ['CrowdStrike EDR', 'Microsoft Defender for Servers (Azure)', 'Wazuh agent (OT)', 'Syslog to Wazuh (network appliances)', 'Provided by the supplier'],
  'PR.AA-01': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],
  'PR.AA-03': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],
  'PR.AA-04': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],        // Q1: yes
  'RC.RP-02': ['Veeam backup', 'Azure Backup', 'Microsoft 365 Backup', 'Configuration backup (network appliances)', 'Provided by the supplier'],
};

// §3 — new solutions. parts: [component, where]; triggers: components that imply it.
// Q4: one per facility. Bank Street is recorded operational and The Castle
// degraded, so the two on-premises datacentres read good and degraded as the
// owner asked, from the facilities' own state.
const DATACENTRE = ['PR.AA-06', 'DE.CM-02', 'PR.IR-02'];
const WINDOWS = ['Windows 10', 'Windows 11', 'Windows Server 2016', 'Windows Server 2025'];
const NEW_SOLUTIONS = [
  { name: 'Secure datacentre — Bank Street', was: 'Secure Datacentre', delivers: DATACENTRE,
    parts: [['Bank Street server room', 'organisation'], ['Physical security', 'organisation']], triggers: ['Bank Street server room'] },
  { name: 'Secure datacentre — The Castle', delivers: DATACENTRE,
    parts: [['The Castle server room', 'organisation'], ['Physical security', 'organisation']], triggers: ['The Castle server room'] },
  { name: 'Secure datacentre — Shark Point', delivers: DATACENTRE,
    parts: [['Shark Point Server Room', 'organisation'], ['Physical security', 'organisation']], triggers: ['Shark Point Server Room'] },
  { name: 'Secure premises — MIG Official Premises', delivers: ['PR.AA-06'],
    parts: [['MIG Official Premises', 'organisation'], ['Physical security', 'organisation']], triggers: ['MIG Official Premises'] },
  { name: 'Patch and configuration management (ME End-Point Central)', delivers: ['PR.PS-01', 'PR.PS-02'],
    parts: [['ME End-Point Central', 'organisation'], ['IT Administrators', 'organisation'],
            ['System configuration', 'organisation'], ['Vulnerability management', 'organisation']],
    triggers: [...WINDOWS, 'Ubuntu Server 24.04 LTS', 'AlmaLinux 9'] },
  { name: 'Data-at-rest encryption (BitLocker)', delivers: ['PR.DS-01'], onSystem: 'BitLocker', preserveOn: WINDOWS,
    parts: [['BitLocker', 'on_system'], ['Encryption Standard', 'organisation'],
            ['Data handling policy', 'organisation'], ['Data protection and handling', 'organisation']],
    triggers: WINDOWS },
  { name: 'Data-at-rest encryption (FileVault)', delivers: ['PR.DS-01'], onSystem: 'FileVault', preserveOn: ['MacOS Sequoia (15)'],
    parts: [['FileVault', 'on_system'], ['Encryption Standard', 'organisation'],
            ['Data handling policy', 'organisation'], ['Data protection and handling', 'organisation']],
    triggers: ['MacOS Sequoia (15)'] },
  // No trigger: nothing a system is built on says it has failover. It is in
  // place where the arrangement is recorded on the system.
  { name: 'Failover to the Castle Vaults DR room', delivers: ['PR.IR-03'], onSystem: 'Failover to Castle Vaults DR room',
    parts: [['Failover to Castle Vaults DR room', 'on_system'], ['Castle Vaults DR room', 'organisation'],
            ['Resilience and recovery', 'organisation']],
    triggers: [] },
];

// §4 / Q5 — one process for the whole organisation, not something each system has.
const ORGANISATION_WIDE = ['ID.RA-10', 'DE.CM-06', 'ID.AM-04', 'ID.RA-08', 'ID.AM-01', 'ID.AM-02'];

// §5 / Q6 — PR.IR-04, PR.PS-03, ID.AM-08, ID.RA-09, PR.PS-06, ID.RA-02: the
// owner is building these by hand. Nothing here touches them.

// ── Plumbing ─────────────────────────────────────────────────────────────────
let H;
async function api(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path} ${body ? JSON.stringify(body) : ''}`); return {}; }
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  const data = t ? JSON.parse(t) : {};
  if (!r.ok && r.status !== 409) throw new Error(`${method} ${path} → ${r.status} ${data.error || t}`);
  return data;
}

async function main() {
  const login = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: AS, password: PASSWORD }) })).json();
  if (!login.access_token) throw new Error(`could not sign in as ${AS}`);
  H = { 'content-type': 'application/json', authorization: `Bearer ${login.access_token}` };
  const done = { components: 0, objectives: 0, solutions: 0, parts: 0, rules: 0, triggers: 0, preserved: 0, organisation: 0 };

  // Components
  let comps = (await api('GET', '/components?all=1')).components;
  for (const [name, type, description] of NEW_COMPONENTS) {
    if (comps.some((c) => c.name === name)) continue;
    await api('POST', '/components', { component_type: type, name, description, status: 'operational' });
    done.components++;
  }
  comps = (await api('GET', '/components?all=1')).components;
  // Each exists on the system it is installed on — say so; it is never assumed.
  for (const [name] of NEW_COMPONENTS) {
    const c = comps.find((x) => x.name === name);
    if (c && !c.instantiation) await api('PATCH', `/components/${c.id}`, { instantiation: 'per_system' });
  }
  const compId = (name) => {
    const c = comps.find((x) => x.name === name);
    if (!c) throw new Error(`component "${name}" is not in the library`);
    return c.id;
  };

  // Objectives, by the reference people know them by
  const controls = (await api('GET', '/controls?limit=1000')).controls;
  const objective = (ref) => {
    const c = controls.find((x) => x.framework_ref === ref || x.reference_code === ref);
    if (!c) throw new Error(`control objective ${ref} is not in the library`);
    return c;
  };

  let library = (await api('GET', '/controls/solutions')).solutions;
  const hasSolution = (ref) => library.some((s) => s.objectives.some((o) => o.id === objective(ref).id));

  // What people had recorded, read BEFORE anything changes: objective → system → status.
  const systemList = await api('GET', '/systems');
  const systems = Array.isArray(systemList) ? systemList : systemList.systems;
  const recorded = new Map();   // system id → { name, components:Set(name), status: Map(control id → status) }
  for (const s of systems) {
    const detail = await api('GET', `/systems/${s.id}`);
    const sys = detail.system || detail;
    const ctl = await api('GET', `/systems/${s.id}/controls`);
    recorded.set(s.id, {
      name: s.name,
      components: new Set((sys.components || []).filter((c) => c.recorded !== false).map((c) => c.name)),
      status: new Map(ctl.map((c) => [c.id, c.status])),
    });
  }
  const preserve = [];   // [system id, component name, status] — decided now, applied after the solutions exist
  for (const sol of NEW_SOLUTIONS.filter((x) => x.onSystem)) {
    for (const ref of sol.delivers) {
      if (hasSolution(ref)) continue;                          // not the first run: nothing left to carry over
      const oid = objective(ref).id;
      for (const [sid, r] of recorded) {
        const st = r.status.get(oid);
        if (st !== 'operational' && st !== 'degraded') continue;
        if (sol.preserveOn && !sol.preserveOn.some((os) => r.components.has(os))) continue;
        if (r.components.has(sol.onSystem)) continue;
        preserve.push([sid, sol.onSystem, st]);
      }
    }
  }

  // §2 — objectives added to solutions that exist
  const solution = (name) => library.find((s) => s.name === name);
  for (const [ref, names] of Object.entries(ADD_TO_EXISTING)) {
    for (const name of names) {
      const s = solution(name);
      if (!s) throw new Error(`security solution "${name}" is not in the library`);
      if (s.objectives.some((o) => o.id === objective(ref).id)) continue;
      await api('POST', `/controls/solutions/${s.id}/objectives`, { control_id: objective(ref).id });
      done.objectives++;
    }
  }

  // §3 — new solutions, their parts, and the components that imply them
  for (const def of NEW_SOLUTIONS) {
    let s = solution(def.name);
    if (!s && def.was && solution(def.was)) {                  // the owner's own empty draft, given its name
      await api('PATCH', `/controls/solutions/${solution(def.was).id}`, { name: def.name });
      done.solutions++;
    } else if (!s) {
      await api('POST', '/controls/solutions', { name: def.name, kind: 'parts' });
      done.solutions++;
    }
    if (DRY) continue;
    library = (await api('GET', '/controls/solutions')).solutions;
    s = solution(def.name);
    for (const ref of def.delivers) {
      if (s.objectives.some((o) => o.id === objective(ref).id)) continue;
      await api('POST', `/controls/solutions/${s.id}/objectives`, { control_id: objective(ref).id });
      done.objectives++;
    }
    const haveParts = new Set(s.parts.map((p) => p.component_id));
    for (const [name, location] of def.parts) {
      if (haveParts.has(compId(name))) continue;
      await api('POST', `/controls/solutions/${s.id}/parts`, { component_id: compId(name), location });
      done.parts++;
    }
  }

  if (!DRY) {
    const lib = await api('GET', '/architecture');
    const std = (lib.documents || []).find((d) => d.name === STANDARD);
    if (!std) throw new Error(`"${STANDARD}" is not in the library — run architecture.js first`);
    library = (await api('GET', '/controls/solutions')).solutions;
    for (const def of NEW_SOLUTIONS.filter((x) => x.triggers.length)) {
      let rule = lib.rules.find((r) => r.pattern_name === def.name);
      if (!rule) { rule = (await api('POST', '/architecture/rules', { pattern_id: solution(def.name).id, standard_id: std.id })).rule; done.rules++; }
      const have = new Set((rule.triggers || []).map((t) => t.name));
      for (const t of def.triggers) {
        if (have.has(t)) continue;
        await api('POST', `/architecture/rules/${rule.id}/triggers`, { component_id: compId(t) });
        done.triggers++;
      }
    }
  }

  // What was recorded, carried over as the part's state on the system
  for (const [sid, name, status] of preserve) {
    await api('POST', `/systems/${sid}/components`, { component_id: compId(name) });
    await api('PATCH', `/systems/${sid}/components/${compId(name)}`, { status });
    done.preserved++;
  }

  // §4 — delivered once for the organisation
  for (const ref of ORGANISATION_WIDE) {
    const c = objective(ref);
    // the list does not carry the delivery mode; the objective's own page does
    const detail = await api('GET', `/controls/${c.id}`);
    if ((detail.control || detail).delivery === 'organisation') continue;
    await api('PATCH', `/controls/${c.id}`, { delivery: 'organisation' });
    done.organisation++;
  }

  // One read of the findings settles every system (v152), whether or not the
  // server settles after each write.
  if (!DRY) await api('GET', '/findings/component-record');

  console.log(`${DRY ? '[dry run] ' : ''}components added ${done.components}; solutions added ${done.solutions}; `
    + `objectives given a solution ${done.objectives}; parts added ${done.parts}; rules ${done.rules} with ${done.triggers} triggers; `
    + `on-system parts recorded from what was stated ${done.preserved}; objectives now organisation-wide ${done.organisation}.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
