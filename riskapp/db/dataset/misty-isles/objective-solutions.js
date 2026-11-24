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
// solution-library.js RENAMES, which runs after this on a new install.
const RENAMED = { 'Data handling policy': 'Information Classification and Handling Policy' };
const { patternFor } = require('./solution-patterns');

// ── The owner's answers ──────────────────────────────────────────────────────
// Q3: BitLocker and FileVault as technology components. Q2: BRR-05 is
// failover, not backup, so the failover arrangement is a thing a system has.
const NEW_COMPONENTS = [
  ['BitLocker', 'technology', 'Full-disk encryption on Windows desktops and servers.'],
  ['FileVault', 'technology', 'Full-disk encryption on macOS.'],
  ['Failover to Castle Vaults DR room', 'technology', 'The system is replicated to the Castle Vaults DR room and can be run from there.'],
  // 2026-11-23: CS-03 is network access control by ExtremeCloud IQ Site Engine;
  // 802.1X is what each system's network port has, recorded nowhere yet.
  ['802.1X network access control', 'technology', 'The system authenticates to the network with 802.1X before it is given access, enforced by ExtremeCloud IQ Site Engine.'],
];

// §2 — the solution already does this job; the library just did not say so.
const ADD_TO_EXISTING = {
  'CIRKS1.IDA-01': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],
  'CIRKS1.IDA-04': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],
  'CIRKS1.IDA-05': ['Active Directory (on-premises)', 'Entra ID (cloud)', 'Provided by the supplier'],        // Q1: yes
  'CIRKS1.IR-09': ['Veeam backup', 'Azure Backup', 'Microsoft 365 Backup', 'Configuration backup (network appliances)', 'Provided by the supplier'],
};

// §3 — new solutions. parts: [component, where, slot?]; triggers: components that imply it.
// slot: the part's slot in the solution's pattern (solution-patterns.js), or none.
// Q4: one per facility. Bank Street is recorded operational and The Castle
// degraded, so the two on-premises datacentres read good and degraded as the
// owner asked, from the facilities' own state.
// §10 (owner, 2026-11-23): perimeters, secure areas, siting and utilities, cabling.
const DATACENTRE = ['CIRKS1.PHY-02', 'CIRKS1.PHY-04', 'CIRKS1.PHY-05', 'CIRKS1.PHY-01', 'CIRKS1.PHY-03', 'CIRKS1.PHY-06', 'CIRKS1.PHY-07'];
const WINDOWS = ['Windows 10', 'Windows 11', 'Windows Server 2016', 'Windows Server 2025'];
const NEW_SOLUTIONS = [
  { name: 'Secure datacentre — Bank Street', was: 'Secure Datacentre', delivers: DATACENTRE,
    // CCTV and electronic access control: the owner's (CIRKS-dev 2026-10-09).
    parts: [['Bank Street server room', 'organisation'], ['Physical security', 'organisation'],
            ['Chubb electronic access control', 'organisation'], ['MIG CCTV system', 'organisation']], triggers: ['Bank Street server room'] },
  { name: 'Secure datacentre — The Castle', delivers: DATACENTRE,
    parts: [['The Castle server room', 'organisation'], ['Physical security', 'organisation'],
            ['MIG CCTV system', 'organisation']], triggers: ['The Castle server room'] },
  { name: 'Secure datacentre — Shark Point', delivers: DATACENTRE,
    parts: [['Shark Point Server Room', 'organisation'], ['Physical security', 'organisation']], triggers: ['Shark Point Server Room'] },
  { name: 'Secure premises — MIG Official Premises', delivers: ['CIRKS1.PHY-02'],
    parts: [['MIG Official Premises', 'organisation'], ['Physical security', 'organisation']], triggers: ['MIG Official Premises'] },
  { name: 'Patch and configuration management (ME End-Point Central)', delivers: ['CIRKS1.CVM-01', 'CIRKS1.SVM-03'],
    parts: [['ME End-Point Central', 'organisation'], ['IT Administrators', 'organisation'],
            ['System configuration', 'organisation'], ['Vulnerability management', 'organisation']],
    triggers: [...WINDOWS, 'Ubuntu Server 24.04 LTS', 'AlmaLinux 9'] },
  { name: 'Data-at-rest encryption (BitLocker)', delivers: ['CIRKS1.DCH-04'], onSystem: 'BitLocker', preserveOn: WINDOWS,
    parts: [['BitLocker', 'on_system'], ['Encryption Standard', 'organisation'],
            ['Data handling policy', 'organisation'], ['Data protection and handling', 'organisation']],
    triggers: WINDOWS },
  { name: 'Data-at-rest encryption (FileVault)', delivers: ['CIRKS1.DCH-04'], onSystem: 'FileVault', preserveOn: ['MacOS Sequoia (15)'],
    parts: [['FileVault', 'on_system'], ['Encryption Standard', 'organisation'],
            ['Data handling policy', 'organisation'], ['Data protection and handling', 'organisation']],
    triggers: ['MacOS Sequoia (15)'] },
  // No trigger: nothing a system is built on says it has failover. It is in
  // place where the arrangement is recorded on the system.
  { name: 'Failover to the Castle Vaults DR room', delivers: ['CIRKS1.BRR-05'], onSystem: 'Failover to Castle Vaults DR room',
    parts: [['Failover to Castle Vaults DR room', 'on_system'], ['Castle Vaults DR room', 'organisation'],
            ['Resilience and recovery', 'organisation']],
    triggers: [] },

  // §9 (owner, 2026-11-23): the objectives countering a threat that were
  // delivered once, or not stated, and had no solution. Organisation-wide, so
  // nothing on a system implies them and they have no triggers.
  { name: 'Security awareness programme (KnowBe4)', delivers: ['CIRKS1.SAT-01', 'CIRKS1.SAT-03', 'CIRKS1.SAT-04'],   // §10: phishing, tracking
    parts: [['Security awareness training', 'organisation', 'process'], ['KnowBe4', 'organisation'],
            ['Security awareness completions (KnowBe4)', 'organisation', 'evidence'], ['All desktop users', 'organisation']], triggers: [] },
  { name: 'Role-based security training', delivers: ['CIRKS1.SAT-02'],
    parts: [['Security awareness training', 'organisation', 'process'], ['IT Administrators', 'organisation'],
            ['Policy acknowledgements — IT and security staff', 'organisation', 'evidence']], triggers: [] },
  { name: 'Access review', delivers: ['CIRKS1.AA-05'],
    parts: [['User account management process', 'organisation', 'process'], ['Access Control and Account Management Policy', 'organisation', 'defined_by'],
            ['IT Administrators', 'organisation', 'responsible'], ['Microsoft Active Directory Domain Services', 'organisation'],
            ['Microsoft Entra ID', 'organisation']], triggers: [] },
  { name: 'Defined roles and separation', delivers: ['CIRKS1.AA-06'],
    parts: [['User account management process', 'organisation', 'process'], ['ISMS Roles and Responsibilities', 'organisation', 'defined_by'],
            ['Access Control and Account Management Policy', 'organisation']], triggers: [] },
  { name: 'Service account management', delivers: ['CIRKS1.IDA-06'],
    parts: [['User account management process', 'organisation', 'process'], ['Access Control and Account Management Policy', 'organisation', 'defined_by'],
            ['Microsoft Active Directory Domain Services', 'organisation'], ['IT Administrators', 'organisation', 'responsible']], triggers: [] },
  { name: 'Recovery planning and exercise', delivers: ['CIRKS1.BRR-04'],
    parts: [['Data Backup and Recovery Policy', 'organisation', 'plan'], ['Resilience and recovery', 'organisation'],
            ['Incident response exercise reports', 'organisation', 'exercise']], triggers: [] },
  { name: 'Device inventory', delivers: ['CIRKS1.EST-03'],
    parts: [['ME End-Point Central', 'organisation', 'record'], ['Asset management', 'organisation', 'maintained_by']], triggers: [] },
  { name: 'Software inventory', delivers: ['CIRKS1.EST-04'],
    parts: [['ME End-Point Central', 'organisation', 'record'], ['Asset management', 'organisation', 'maintained_by'],
            ['Systems Register Standard', 'organisation', 'standard']], triggers: [] },
  { name: 'Asset return and disposal', delivers: ['CIRKS1.EST-06'],
    parts: [['Asset management', 'organisation', 'process'], ['User account management process', 'organisation'],
            ['IT Team', 'organisation', 'responsible']], triggers: [] },
  { name: 'Equipment maintenance', delivers: ['CIRKS1.PHY-08'],
    parts: [['IT Team', 'organisation', 'responsible'], ['Physical security maintenance log', 'organisation', 'evidence'],
            ['Server room HVAC', 'organisation']], triggers: [] },
  { name: 'Security monitoring coverage', delivers: ['CIRKS1.DM-05'],
    parts: [['Wazuh', 'organisation', 'security_system'], ['InfoSec Team', 'organisation', 'team'],
            ['Detective Monitoring Policy', 'organisation', 'policy'], ['Detective Monitoring', 'organisation']], triggers: [] },
  { name: 'Vulnerability report handling', delivers: ['CIRKS1.SD-10'],
    parts: [['Vulnerability management', 'organisation', 'process'], ['Vulnerability Management Policy', 'organisation', 'defined_by'],
            ['InfoSec Team', 'organisation', 'responsible']], triggers: [] },
  // Not implemented (the SoA): the 802.1X part is recorded on no system, so the
  // solution reads incomplete until one is.
  { name: 'Network access control (ExtremeCloud IQ Site Engine)', delivers: ['CIRKS1.CS-03'],
    parts: [['ExtremeCloud IQ Site Engine', 'organisation', 'security_system'], ['802.1X network access control', 'on_system', 'on_system'],
            ['Network Security Policy', 'organisation', 'policy']], triggers: [] },
];

// §9 — links on an objective's own list that were never what delivers it.
const UNLINK = [['CIRKS1.DM-05', 'Supply chain management']];

// §4 / Q5 — one process for the whole organisation, not something each system has.
const ORGANISATION_WIDE = ['CIRKS1.SCM-03', 'CIRKS1.DM-05', 'CIRKS1.SCM-02', 'CIRKS1.SD-10', 'CIRKS1.EST-03', 'CIRKS1.EST-02'];

// §5 / Q6 — BRR-07, SVM-04, EST-05, SCM-08, SD-01, IRM-06: the
// owner is building these by hand. Nothing here touches them.

// ── Plumbing ─────────────────────────────────────────────────────────────────
let H;
// Sign in, and sign in again when the 15-minute access token runs out: on a slow
// machine (the CI runner) a step can outlast it (2026-11-17, step 3 failed with
// "401 Access token expired" partway through).
async function signIn() {
  const login = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: AS, password: PASSWORD }) })).json();
  if (!login.access_token) throw new Error(`could not sign in as ${AS}`);
  H = { 'content-type': 'application/json', authorization: `Bearer ${login.access_token}` };
}
async function api(method, path, body, retried = false) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path} ${body ? JSON.stringify(body) : ''}`); return {}; }
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && !retried) { await signIn(); return api(method, path, body, true); }
  const t = await r.text();
  const data = t ? JSON.parse(t) : {};
  if (!r.ok && r.status !== 409) throw new Error(`${method} ${path} → ${r.status} ${data.error || t}`);
  return data;
}

async function main() {
  await signIn();
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
  // On an instance run before, solution-library.js (step 5) has since renamed
  // some components; follow its RENAMES so a second run finds them (2026-11-23).
  const compId = (name) => {
    const c = comps.find((x) => x.name === name) || comps.find((x) => x.name === RENAMED[name]);
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
    // The pattern it implements (v176, solution-patterns.js), on the first run.
    const sp = patternFor(def.name);
    if (sp.solution_pattern && !s.solution_pattern) {
      await api('PATCH', `/controls/solutions/${s.id}`, sp);
    }
    for (const ref of def.delivers) {
      if (s.objectives.some((o) => o.id === objective(ref).id)) continue;
      await api('POST', `/controls/solutions/${s.id}/objectives`, { control_id: objective(ref).id });
      done.objectives++;
    }
    const haveParts = new Set(s.parts.map((p) => p.component_id));
    for (const [name, location, slot] of def.parts) {
      if (haveParts.has(compId(name))) continue;
      await api('POST', `/controls/solutions/${s.id}/parts`, { component_id: compId(name), location, slot_key: slot || null });
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

  // §9 — mislinked components off the objective's list
  for (const [ref, name] of UNLINK) {
    const c = objective(ref);
    const linked = await api('GET', `/controls/${c.id}/components`);
    const list = Array.isArray(linked) ? linked : linked.components || [];
    if (!list.some((x) => (x.component_id || x.id) === compId(name))) continue;
    await api('DELETE', `/controls/${c.id}/components/${compId(name)}`);
    done.unlinked = (done.unlinked || 0) + 1;
  }

  // One read of the findings settles every system (v152), whether or not the
  // server settles after each write.
  if (!DRY) await api('GET', '/findings/component-record');

  console.log(`${DRY ? '[dry run] ' : ''}components added ${done.components}; solutions added ${done.solutions}; `
    + `objectives given a solution ${done.objectives}; parts added ${done.parts}; rules ${done.rules} with ${done.triggers} triggers; `
    + `on-system parts recorded from what was stated ${done.preserved}; objectives now organisation-wide ${done.organisation}; `
    + `mislinked components removed ${done.unlinked || 0}.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
