#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The Misty Isles security architecture (v148, docs/system-security-view.md
// step 2): the MIG Security Architecture Standard, its six membership groups,
// the rules that follow from what a system is built on, a few builds, and each
// system's answers to the groups. Applied through the real API as the CISO, so
// it is audited like any other change, and idempotent: run it again and it adds
// only what is missing.
//
//   node db/dataset/misty-isles/architecture.js --base http://localhost:3000/api/v1 [--dry-run]
//
// Run after build/import (a fresh instance) or on an existing one — it is the
// one source for both. Answers come from the hosting class each system already
// has in build.js, or from what it already records. Where neither says, the
// answer is LEFT BLANK on purpose: the finding then shows "Nothing recorded for
// Operating system" on that system, which is the honest state and part of what
// the training data should teach (docs/system-security-view.md §8, dragon 3).

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const BASE = opt('--base', 'http://localhost:3000/api/v1');
const DRY = args.includes('--dry-run');
const AS = opt('--as', 'ciso@mig.local');
// No default: install.js passes the administrator's chosen password. A published
// default would be a known password on every training instance.
const PASSWORD = process.env.CIRKS_PASSWORD;
if (!PASSWORD) { console.error('Set CIRKS_PASSWORD to the password of the account this signs in as (--as).'); process.exit(1); }

// ── The story ───────────────────────────────────────────────────────────────────
const STANDARD = {
  name: 'MIG Security Architecture Standard',
  description: 'What every MIG system must record about itself, and the security solutions that follow from how it is built. Source of the Systems architecture template and the Security pattern triggers.',
};

// New library components: [name, type, description]. All exist once for the
// organisation — a system RECORDS that it is on MIGNet, it does not hold a copy.
const NEW_COMPONENTS = [
  ['MIGNet (internal)', 'technology', 'Connected to the internal MIG network.'],
  ['MIGNet (DMZ)', 'technology', 'Connected to the MIG demilitarised zone, reachable from outside.'],
  ['Azure cloud network', 'technology', 'Connected to MIG’s Azure virtual network.'],
  ['External internet', 'technology', 'Reached over the public internet (SaaS, remote users).'],
  ['Power station OT network', 'technology', 'The isolated operational network at the power station.'],
  ['Water works OT network', 'technology', 'The isolated operational network at Wellhead Road water treatment works.'],
  ['Airport and harbour OT network', 'technology', 'The operational network shared by the airport and the harbour.'],
  ['Microsoft Azure UK South', 'facility', 'MIG’s Azure subscription, UK South region.'],
  ['Supplier-hosted (SaaS)', 'facility', 'Hosted by the supplier; MIG does not run the infrastructure.'],
  ['Supplier-managed (SaaS)', 'technology', 'The supplier manages the operating system; MIG has no access to it.'],
  ['Joined to MIG Active Directory', 'technology', 'Users and administrators sign in with their MIG Active Directory account.'],
  ['Entra ID sign-in', 'technology', 'Users sign in with their MIG Entra ID (Microsoft 365) account.'],
  ['Local accounts only', 'technology', 'Accounts exist only on the system itself; no central sign-in.'],
  ['Supplier-managed sign-in', 'technology', 'Accounts are held and managed in the supplier’s service.'],
  ['Supplier support team', 'people', 'The supplier’s own support staff operate the service.'],
  ['PAN-OS', 'technology', 'The PaloAlto firewall operating system, on the 850-22 and its gateways.'],
  ['Members of the public', 'people', 'Citizens using a public-facing service.'],
];

// The six groups (owner, 2026-10-01), with their members.
const GROUPS = [
  { name: 'Connectivity', members: ['MIGNet (internal)', 'MIGNet (DMZ)', 'Azure cloud network', 'External internet',
      'Power station OT network', 'Water works OT network', 'Airport and harbour OT network'] },
  { name: 'Hosting', members: ['Bank Street server room', 'The Castle server room', 'Shark Point Server Room', 'Castle Vaults DR room',
      "Crow's Nest Disaster Management Centre", 'MIG Official Premises', 'Mobile locations', 'MS O365 UK South', 'Super Bill SaaS cloud',
      'Dr Max Windshear Airport ATC tower', 'Dr Max Windshear Airport Fuel Bunker', 'Wellhead Road, Water Treatment Works',
      'Microsoft Azure UK South', 'Supplier-hosted (SaaS)'] },
  { name: 'Operating system', members: ['Windows Server 2016', 'Windows Server 2025', 'Windows 11', 'Windows 10', 'Windows 7',
      'Ubuntu Server 24.04 LTS', 'Debian 12', 'AlmaLinux 9', 'Cisco IOS XE V26 26.1.1', 'PAN-OS', 'Raspberry Pi 5', 'Supplier-managed (SaaS)'] },
  { name: 'Authentication service', members: ['Joined to MIG Active Directory', 'Entra ID sign-in', 'Local accounts only', 'Supplier-managed sign-in'] },
  { name: 'Support team', members: ['IT Administrators', 'Agency IT contractors', 'Power station operations team',
      'Water plant operations team', 'InfoSec Team', 'Supplier support team'] },
  { name: 'User group', members: ['All desktop users', 'HR Team', 'Treasury Team', 'Healthcare Medical Team', 'Education Team',
      'Science Team', 'AG Chambers', 'Clerk of Court', 'Prison Service Team', 'Internal revenue team', 'Coast Guard', 'Police Force',
      'Fire and Rescue', 'Ambulance Service', 'Port Authority Team', 'ATC team', 'AirOperations Team', 'AirOperations Fuelling Team',
      'AirOperations Engineering', 'Pharmacists', 'MIG Utilities billing team', 'Power station operations team',
      'Water plant operations team', 'Expert People Group', 'InfoSec Team', 'IT Administrators', 'Utilities Team',
      'Members of the public'] },
];

// Rules: solution → triggers (any one).
const OS_HOSTS = ['Windows Server 2016', 'Windows Server 2025', 'Windows 11', 'Windows 10', 'Ubuntu Server 24.04 LTS', 'AlmaLinux 9'];
const OT_NETS = ['Power station OT network', 'Water works OT network', 'Airport and harbour OT network'];
const RULES = [
  // Windows 7 is deliberately absent: CrowdStrike does not support it (story §6.2).
  ['CrowdStrike EDR', OS_HOSTS],
  // Containment is not on the OS rule: on an Azure server it would ask for a
  // Falcon agent that Defender replaces. A threat that calls for it gets a choice.
  ['Wazuh agent (OT)', OT_NETS],
  ['Network isolation', OT_NETS],
  ['Syslog to Wazuh (network appliances)', ['Cisco IOS XE V26 26.1.1', 'PAN-OS']],
  ['Configuration backup (network appliances)', ['Cisco IOS XE V26 26.1.1']],
  // Backup belongs to the host's operating system, not the room: a network
  // appliance in Bank Street has its configuration backed up, not Veeam.
  ['Veeam backup', OS_HOSTS],
  ['Microsoft Defender for Servers (Azure)', ['Microsoft Azure UK South']],
  ['Azure Backup', ['Microsoft Azure UK South']],
  ['TLS', ['MIGNet (internal)', 'MIGNet (DMZ)', 'Azure cloud network']],
  ['NIDS (Palo Alto ATP)', ['MIGNet (internal)', 'MIGNet (DMZ)']],
  ['Perimeter firewall and segmentation', ['MIGNet (internal)', 'MIGNet (DMZ)']],
  ['Active Directory (on-premises)', ['Joined to MIG Active Directory']],
  ['Entra ID (cloud)', ['Entra ID sign-in']],
  ['Remote-access VPN', ['Mobile locations']],
  ['Provided by the supplier', ['Supplier-hosted (SaaS)']],
];

const BUILDS = [
  ['MIG Windows server (on premises)', ['Windows Server 2025', 'MIGNet (internal)', 'Joined to MIG Active Directory', 'IT Administrators',
    'Crowdstrike Falcon Agent', 'Veeam Backup', 'TLS 1.2+ configuration']],
  ['MIG Linux server (on premises)', ['Ubuntu Server 24.04 LTS', 'MIGNet (internal)', 'Joined to MIG Active Directory', 'IT Administrators',
    'Crowdstrike Falcon Agent', 'Veeam Backup', 'TLS 1.2+ configuration']],
  ['MIG Azure server', ['Azure cloud network', 'Microsoft Azure UK South', 'Entra ID sign-in', 'Microsoft Defender for Servers',
    'Azure Backup', 'TLS 1.2+ configuration']],
  ['Supplier SaaS', ['External internet', 'Supplier-hosted (SaaS)', 'Supplier-managed (SaaS)', 'Supplier-managed sign-in', 'Supplier support team']],
];

// The hosting class of every system (build.js §2), which most answers follow.
const CLASS = require('./hostingClasses');
const MICROSOFT_SAAS = new Set(['MIG Document Management', 'MIG Telephony and Messaging', 'MIG Video Conferencing',
  'Information Security Management System', 'Microsoft Defender for Cloud']);
const OT_NET = { 'Power Distribution': 'Power station OT network', 'Power Generation': 'Power station OT network',
  'Water Distribution': 'Water works OT network' };

// Answers the hosting class does not give (owner, 2026-10-02: "fill in most of
// them, and deliberately leave two or three blank as teaching examples").
// Each applies only to a group the system has not answered.
const FILL = {
  'Aircraft fuelling': ['Debian 12'],
  'Approach radar': ['Debian 12'],
  'Power Distribution': ['Debian 12'],
  'Criminal Records and Firearms Licensing System': ['Windows Server 2016'],
  'Electoral Roll': ['Windows Server 2025', 'IT Administrators', 'Members of the public'],
  'GIS Land Register': ['Ubuntu Server 24.04 LTS', 'IT Administrators', 'Utilities Team'],
  'Host Intrusion Detection System': ['Supplier-managed (SaaS)'],          // the CrowdStrike console is CrowdStrike's service
  'Network Intrusion Detection System': ['PAN-OS'],
  'MIG Remote Access VPN': ['PAN-OS'],
  'Information Security Playbooks': ['Windows 7', 'InfoSec Team'],          // §6.2: no agent can run
  'Student Desktop': ['Windows 11', 'MIG Official Premises', 'IT Administrators', 'Education Team'],
  'Pupil/student records system': ['Bank Street server room'],
  'Tax Records System': ['Bank Street server room'],
  'Maritime and Aviation Radio Communications System': ['Dr Max Windshear Airport ATC tower', 'IT Administrators',
    'ATC team', 'Coast Guard', 'Port Authority Team'],
  'Information Security Management System': ['Supplier support team', 'InfoSec Team'],
  'MIG Telephony and Messaging': ['Supplier support team'],
  'MIG Corporate Email': ['IT Administrators'],
  'MIG Desktop (remote)': ['IT Administrators'],
  'MIG File storage': ['IT Administrators'],
  'Flight operations system': ['AirOperations Team'],
  'HR System': ['HR Team'],
  'IT Support Ticketing System': ['All desktop users'],
  'Support Knowledge base': ['All desktop users'],
  'Schools facilities management': ['Education Team'],
};
// Left blank on purpose — what an unfinished record looks like:
//   Driver and Vehicle Licensing System — operating system, hosting, support team, user group;
//   Maritime and Aviation Radio Communications System — operating system.

// An Azure server records a Windows or Linux OS, so the CrowdStrike and Veeam
// rules apply to it as well as Defender and Azure Backup. The architecture's
// answer is a choice, recorded once per solution (it settles every objective
// the solution delivers).
const CHOICES = {
  'Electoral Roll': ['Microsoft Defender for Servers (Azure)', 'Azure Backup'],
  'GIS Land Register': ['Microsoft Defender for Servers (Azure)', 'Azure Backup'],
};
const CHOICE_NOTE = 'Azure-hosted servers use Defender for Servers and Azure Backup, not CrowdStrike and Veeam (MIG Security Architecture Standard).';

// A system's answers: [group, component]. Only what the story says.
function answersFor(sys, cls, records) {
  const out = [];
  const add = (c) => out.push(c);
  // Connectivity
  if (cls === 'IT' || cls === 'INF') add(sys === 'MIG Remote Access VPN' ? 'MIGNet (DMZ)' : sys === 'MIG Desktop (remote)' ? 'External internet' : 'MIGNet (internal)');
  if (cls === 'AZ' || sys === 'Microsoft Defender for Cloud') add('Azure cloud network');
  if (cls === 'SAAS' && sys !== 'Microsoft Defender for Cloud') add('External internet');
  if (cls === 'OT') add(OT_NET[sys] || 'Airport and harbour OT network');
  // Hosting — what is recorded already answers it; else from the class.
  if (cls === 'AZ') add('Microsoft Azure UK South');
  if (cls === 'SAAS' && !records.facility) add('Supplier-hosted (SaaS)');
  // Operating system
  if (cls === 'SAAS') add('Supplier-managed (SaaS)');
  // Authentication service
  if (cls === 'IT' || cls === 'INF') add('Joined to MIG Active Directory');
  if (cls === 'AZ' || (cls === 'SAAS' && MICROSOFT_SAAS.has(sys))) add('Entra ID sign-in');
  if (cls === 'SAAS' && !MICROSOFT_SAAS.has(sys)) add('Supplier-managed sign-in');
  if (cls === 'OT') add('Local accounts only');
  // Support team — the supplier runs a SaaS, or contracted-out OT.
  if ((cls === 'SAAS' && !MICROSOFT_SAAS.has(sys)) || records.contracted) add('Supplier support team');
  return out;
}

// ── Plumbing ────────────────────────────────────────────────────────────────────
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

  // Components
  const all = async () => (await api('GET', '/components?all=1')).components;
  let comps = await all();
  const byName = () => new Map(comps.map((c) => [c.name, c]));
  let index = byName();
  let created = 0;
  if (!index.has(STANDARD.name)) {
    await api('POST', '/components', { component_type: 'information', name: STANDARD.name, description: STANDARD.description,
      status: 'operational', document_kind: 'standard', document_version: '1.0',
      document_approved_on: new Date().toISOString().slice(0, 10),
      document_next_review: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) });
    created++;
  }
  for (const [name, type, description] of NEW_COMPONENTS) {
    if (index.has(name)) continue;
    await api('POST', '/components', { component_type: type, name, description, status: 'operational' });
    created++;
  }
  comps = DRY ? comps : await all();
  index = byName();
  for (const name of [STANDARD.name, ...NEW_COMPONENTS.map(([n]) => n)]) {
    const c = index.get(name);
    if (c && !c.instantiation) await api('PATCH', `/components/${c.id}`, { instantiation: 'organisational' });
  }
  const id = (name) => {
    const c = index.get(name);
    if (!c && !DRY) throw new Error(`component "${name}" is not in the library`);
    return c?.id;
  };
  console.log(`components: ${created} created`);

  // Library
  const lib = await api('GET', '/architecture');
  const std = id(STANDARD.name);
  for (const [i, g] of GROUPS.entries()) {
    let group = lib.groups?.find((x) => x.name === g.name);
    if (!group) group = (await api('POST', '/architecture/groups', { name: g.name, standard_id: std, sort_index: i + 1 })).group || { members: [] };
    const have = new Set((group.members || []).map((m) => m.name));
    for (const m of g.members) if (!have.has(m)) await api('POST', `/architecture/groups/${group.id}/members`, { component_id: id(m) });
  }
  const solutions = await api('GET', '/controls/solutions');
  const solutionId = (name) => {
    const s = solutions.solutions.find((x) => x.name === name);
    if (!s) throw new Error(`security solution "${name}" is not in the library`);
    return s.id;
  };
  for (const [name, triggers] of RULES) {
    let rule = lib.rules?.find((r) => r.pattern_name === name && r.standard_id === std);
    if (!rule) rule = (await api('POST', '/architecture/rules', { pattern_id: solutionId(name), standard_id: std })).rule || { triggers: [] };
    const have = new Set((rule.triggers || []).map((t) => t.name));
    for (const t of triggers) if (!have.has(t)) await api('POST', `/architecture/rules/${rule.id}/triggers`, { component_id: id(t) });
  }
  for (const [name, members] of BUILDS) {
    let build = lib.builds?.find((b) => b.name === name);
    if (!build) build = (await api('POST', '/architecture/builds', { name })).build || { components: [] };
    const have = new Set((build.components || []).map((c) => c.name));
    for (const m of members) if (!have.has(m)) await api('POST', `/architecture/builds/${build.id}/components`, { component_id: id(m) });
  }
  console.log(`library: ${GROUPS.length} groups, ${RULES.length} rules, ${BUILDS.length} builds`);

  // Each system's answers — only to groups it has not answered. Read what the
  // system RECORDS from its security view: the system page also lists the
  // components its controls imply, which it does not record.
  const systems = await api('GET', '/systems');
  const list = Array.isArray(systems) ? systems : systems.systems;
  // A component can answer several groups (IT Administrators: support team and
  // user group); it is added if ANY group it answers is still unanswered.
  const groupsOf = new Map();
  for (const g of GROUPS) for (const m of g.members) groupsOf.set(m, [...(groupsOf.get(m) || []), g.name]);
  let answered = 0; let chosen = 0;
  const unclassed = [];
  for (const s of list.filter((x) => x.is_active !== false)) {
    const cls = Object.entries(CLASS).find(([, names]) => names.includes(s.name))?.[0];
    if (!cls) { unclassed.push(s.name); continue; }
    const sec = await api('GET', `/systems/${s.id}/security`);
    const answeredGroups = new Set((sec.memberships || []).filter((m) => m.answered).map((m) => m.name));
    const rel = await api('GET', `/suppliers/relationships?system_id=${s.id}`);
    const records = {
      facility: answeredGroups.has('Hosting'),
      contracted: (rel.relationships || []).some((r) => r.relationship_type === 'contracted_service' && r.status !== 'ended'),
    };
    const want = [...answersFor(s.name, cls, records), ...(FILL[s.name] || [])];
    const adding = new Set();
    for (const c of want) {
      const gs = groupsOf.get(c);
      if (!gs) throw new Error(`"${c}" is not a member of any group`);
      if (gs.every((g) => answeredGroups.has(g)) || adding.has(c)) continue;
      adding.add(c);
    }
    for (const c of adding) { await api('POST', `/systems/${s.id}/components`, { component_id: id(c) }); answered++; }
    for (const name of CHOICES[s.name] || []) {
      const sol = solutions.solutions.find((x) => x.name === name);
      const already = (sec.objectives || []).some((o) => o.chosen_pattern_id === sol.id);
      if (already) continue;
      const objective = sol.objectives[0];
      await api('PUT', `/systems/${s.id}/solution-choices/${objective.id}`, { pattern_id: sol.id, notes: CHOICE_NOTE });
      chosen++;
    }
  }
  console.log(`answers recorded: ${answered}; solutions chosen: ${chosen}`);

  // Record what the architecture wants (owner, 2026-10-02): every objective a
  // wanted solution delivers that the system has no control row for. Each row's
  // status is DERIVED from how the system is actually delivered — the same rule
  // build.js uses: complete → operational, degraded → degraded, otherwise
  // missing. Never a default: a row left `unknown` would read as a decision.
  const STATUS = { complete: 'operational', degraded: 'degraded', incomplete: 'missing', no_pattern_in_place: 'missing' };
  let recordedObjectives = 0;
  const statuses = {};
  for (const s of list.filter((x) => x.is_active !== false)) {
    const sec = await api('GET', `/systems/${s.id}/security`);
    const todo = (sec.objectives || []).filter((o) => o.state !== 'needs_solution' && !o.recorded);
    if (!todo.length) continue;
    for (const o of todo) await api('POST', `/systems/${s.id}/controls`, { control_id: o.control_id });
    const detail = DRY ? { control_delivery: [] } : await api('GET', `/systems/${s.id}`);
    const delivery = new Map((detail.control_delivery || []).map((d) => [d.control_id, d.delivery]));
    for (const o of todo) {
      const status = STATUS[delivery.get(o.control_id)] || 'missing';
      await api('PATCH', `/systems/${s.id}/controls/${o.control_id}`, { status });
      statuses[status] = (statuses[status] || 0) + 1;
      recordedObjectives++;
    }
  }
  console.log(`objectives the architecture wants, now recorded: ${recordedObjectives}`, statuses);
  if (unclassed.length) console.log(`no hosting class in the story, left alone: ${unclassed.join(', ')}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
