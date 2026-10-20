#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles training dataset — the architecture tier, derived from the story.
//
//   node db/dataset/misty-isles/build.js            # baseline/ → data/
//   node db/dataset/misty-isles/build.js --out <dir> # baseline/ → <dir> (the container's
//                                                   # /tmp: its root filesystem is read-only)
//
// docs/dataset/misty-isles-architecture.md describes the estate as a real
// organisation would have it (agreed with the owner, 2026-09-30). This script
// turns that description into data: it reads `baseline/` — CIRKS-test exported
// on 2026-09-30, i.e. everything the owner curated (departments, people, systems,
// assets, services and their links, threats, the SoA) — applies the story, and
// writes `data/`, which `node db/import.js db/dataset/misty-isles/data` loads into
// an empty, migrated + seeded database.
//
// Everything that matters is DERIVED from the story rather than typed in:
//   * each system's components follow from its hosting class;
//   * a control's status on a system follows from its delivery patterns
//     (complete → operational, degraded → degraded, otherwise missing);
//   * every degraded state sits on a NAMED part, with a reason (§6 of the sheet);
//   * supplier evidence dates are relative to the day the script runs.
// Real vendors appear only as products; anything that goes wrong is on a
// fictional supplier (owner, question 6).

const fs = require('fs');
const path = require('path');
const { parse } = require('../../csv');

const HERE = __dirname;
const BASE = path.join(HERE, 'baseline');
const outArg = process.argv.indexOf('--out');
const OUT  = outArg > 0 && process.argv[outArg + 1]
  ? path.resolve(process.argv[outArg + 1])
  : path.join(HERE, 'data');

// ── CSV in/out ──────────────────────────────────────────────────────────────────
const data = {};     // slug → { columns, rows }
for (const f of fs.readdirSync(BASE).filter((x) => x.endsWith('.csv'))) {
  const text = fs.readFileSync(path.join(BASE, f), 'utf8');
  const columns = text.split(/\r?\n/)[0].split(',');
  data[f.replace(/\.csv$/, '')] = { columns, rows: parse(text).records };
}
const rows = (slug) => data[slug].rows;
const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function write(slug) {
  const { columns, rows: rs } = data[slug];
  const out = [columns.join(','), ...rs.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(OUT, `${slug}.csv`), out);
}
const today = new Date();
const day = (offset) => new Date(today.getTime() + offset * 864e5).toISOString().slice(0, 10);

// ── The story ───────────────────────────────────────────────────────────────────
const IAO = { infosec: 'C.Shannon@mig.local' };
const IAM = { infosec: 'R.Perlman@mig.local' };

// §2 — the hosting class of every system (shared with architecture.js).
const CLASS = require('./hostingClasses');
const classOf = {};
for (const [k, list] of Object.entries(CLASS)) for (const s of list) classOf[s] = k;

// Owner decisions §8.
const SYSTEM_RENAMES = { 'Electoral Role': 'Electoral Roll', 'Driver licensing system': 'Driver and Vehicle Licensing System',
                         'Vehicle Licensing System': 'Driver and Vehicle Licensing System' };
const NEW_SYSTEMS = [
  { name: 'MIG Remote Access VPN', department_name: 'Department of Information Security',
    description: 'The GlobalProtect remote-access VPN service: the gateway on the PaloAlto 850-22 that remote desktops and field kit connect through.' },
  { name: 'Microsoft Defender for Cloud', department_name: 'Department of Information Security',
    description: 'Endpoint protection for the Azure-hosted servers: Defender for Servers agents reporting to the Defender XDR console, watched by the SOC.' },
];
const DESCRIPTIONS = {
  'IT Support Ticketing System': 'The IT service desk: incidents, requests and changes. Hosted by Helix ServiceDesk (SaaS).',
  'Support Knowledge base': 'Support articles and known-error records, in the same Helix ServiceDesk tenant as the ticketing system.',
  'Driver and Vehicle Licensing System': 'Driving licences and vehicle registration, on-premises (merged from the separate driver and vehicle licensing systems).',
  'Maritime and Aviation Radio Communications System': 'VHF and aviation-band radio for air traffic control and the harbour, encrypted by secure radio.',
  'Electoral Roll': 'The register of electors, hosted on Azure.',
  'Student Desktop': 'Shared lab PCs in the schools.',
  'Flight operations system': 'Flight planning, load control and routing. Hosted by SkyPlan Ops (SaaS).',
  'HR System': 'All HR functions except salary and expenses. Hosted by PeopleFirst HR (SaaS).',
  'GIS Land Register': 'Land ownership and addressing records, hosted on Azure.',
  'Information Security Management System': 'The ISMS policies and records, kept in SharePoint. CIRKS itself is the Risk Management System.',
};

// New components (§3, §4).
const NEW_COMPONENTS = [
  ['TLS 1.2+ configuration', 'technology', 'per_system', 'Services on the system accept TLS 1.2 or later only, per the Encryption Standard.'],
  ['Wazuh agent', 'technology', 'per_system', 'Wazuh host agent, reporting to the Security monitoring platform. Used on OT hosts, where CrowdStrike is not certified.'],
  ['Syslog forwarding to Wazuh', 'technology', 'per_system', 'Network appliances forward their logs by syslog to the Security monitoring platform.'],
  ['Microsoft Defender for Servers', 'technology', 'per_system', 'Endpoint protection agent on Azure-hosted servers.'],
  ['Microsoft Defender XDR console', 'technology', 'organisational', 'The Defender console the SOC works from.'],
  ['Azure Backup', 'technology', 'per_system', 'Backup of Azure-hosted servers to a Recovery Services vault.'],
  ['Microsoft Entra ID', 'technology', 'organisational', 'Cloud identity for Microsoft 365 and Azure, synchronised from Active Directory.'],
  ['PaloAlto GlobalProtect gateway', 'technology', 'organisational', 'The VPN gateway on the PaloAlto 850-22.'],
  ['Veeam Backup & Replication server', 'technology', 'organisational', 'The Veeam server and repositories on MIG Backup, with the immutable offsite copy.'],
  ['Helix ServiceDesk', 'technology', 'per_system', 'Helix ServiceDesk tenant (fictional SaaS).'],
  ['PeopleFirst HR', 'technology', 'per_system', 'PeopleFirst HR tenant (fictional SaaS).'],
  ['SkyPlan Ops', 'technology', 'per_system', 'SkyPlan Ops flight operations (fictional SaaS).'],
  ['FacilityFlow', 'technology', 'per_system', 'FacilityFlow schools facilities management (fictional SaaS).'],
  ['Island Mutual online banking', 'technology', 'per_system', 'The Island Mutual Bank payments portal (fictional).'],
  ['Network configuration backup', 'technology', 'per_system', 'Nightly configuration backups of the network appliances, kept off-box.'],
  ['Agency IT contractors', 'people', 'organisational', 'Contract IT staff from Island Staffing Agency (fictional), working on MIG equipment.'],
];
const COMPONENT_RENAMES = { 'Palo Alto ATP': 'PaloAlto ATP', 'KnowB4': 'KnowBe4' };
// Technology that exists once for the organisation; all other technology is per system.
const ORGANISATIONAL_TECH = new Set(['Crowdstrike SaaS', 'Microsoft Active Directory Domain Services', 'Microsoft Entra ID', 'Wazuh',
  'Microsoft Defender XDR console', 'Veeam Backup & Replication server', 'PaloAlto GlobalProtect gateway', 'PaloAlto 850-22',
  'PaloAlto ATP', 'Advanced Threat Prevention Network Intrusion Detection platform', 'ExtremeCloud IQ Site Engine',
  'ME End-Point Central', 'KnowBe4', 'Zero trust isolation', 'Microsoft Sharepoint', 'Microsoft 365 Archive', 'MS Teams On-line SaaS']);

// §4 — delivery patterns. Parts: [component, location, service system?]
const EDR = [
  { name: 'CrowdStrike EDR', parts: [['Crowdstrike Falcon Agent', 'on_system'], ['Crowdstrike SaaS', 'service', 'Host Intrusion Detection System'],
    ['InfoSec Team', 'service', 'Host Intrusion Detection System'], ['Detective Monitoring', 'service', 'Host Intrusion Detection System']] },
  { name: 'Wazuh agent (OT)', parts: [['Wazuh agent', 'on_system'], ['Wazuh', 'service', 'Security monitoring platform'],
    ['InfoSec Team', 'service', 'Security monitoring platform'], ['Detective Monitoring', 'service', 'Security monitoring platform']] },
  { name: 'Syslog to Wazuh (network appliances)', parts: [['Syslog forwarding to Wazuh', 'on_system'],
    ['Wazuh', 'service', 'Security monitoring platform'], ['InfoSec Team', 'service', 'Security monitoring platform']] },
  { name: 'Microsoft Defender for Servers (Azure)', parts: [['Microsoft Defender for Servers', 'on_system'],
    ['Microsoft Defender XDR console', 'service', 'Microsoft Defender for Cloud'], ['InfoSec Team', 'service', 'Microsoft Defender for Cloud']] },
  { name: 'OSSEC agent (being retired)', parts: [['OSSEC agent', 'on_system'], ['Wazuh', 'service', 'Security monitoring platform']] },
  { name: 'Provided by the supplier', kind: 'supplier' },
];
const BACKUP = [
  { name: 'Veeam backup', parts: [['Veeam Backup', 'on_system'], ['Veeam Backup & Replication server', 'service', 'MIG Backup'],
    ['Resilience and recovery', 'service', 'MIG Backup'], ['IT Administrators', 'service', 'MIG Backup']] },
  { name: 'Microsoft 365 Backup', parts: [['Microsoft 365 Backup', 'on_system']] },
  { name: 'Azure Backup', parts: [['Azure Backup', 'on_system']] },
  { name: 'Configuration backup (network appliances)', parts: [['Network configuration backup', 'on_system']] },
  { name: 'Provided by the supplier', kind: 'supplier' },
];
const PATTERNS = {
  // Endpoint agents deliver monitoring, analysis, logging, execution control and eradication alike.
  'DE.CM-09': EDR, 'DE.AE-03': EDR, 'PR.PS-04': EDR, 'PR.PS-05': EDR, 'RS.MI-02': EDR, 'DE.CM-03': EDR,
  'PR.DS-11': BACKUP, 'RC.RP-01': BACKUP, 'RC.RP-03': BACKUP,
  // Containment is a capability of the EDR or of the network, not a part on each system.
  'RS.MI-01': [
    { name: 'CrowdStrike host containment', parts: [['Crowdstrike Falcon Agent', 'on_system'], ['Crowdstrike SaaS', 'service', 'Host Intrusion Detection System'],
      ['InfoSec Team', 'service', 'Host Intrusion Detection System'], ['Incident management', 'organisation']] },
    { name: 'Network isolation', parts: [['PaloAlto 850-22', 'service', 'Network Intrusion Detection System'],
      ['InfoSec Team', 'service', 'Network Intrusion Detection System'], ['Incident management', 'organisation']] },
    { name: 'Provided by the supplier', kind: 'supplier' },
  ],
  'PR.IR-01': [
    { name: 'Perimeter firewall and segmentation', parts: [['PaloAlto 850-22', 'service', 'Network Intrusion Detection System'],
      ['IT Administrators', 'service', 'Network Intrusion Detection System']] },
    { name: 'Provided by the supplier', kind: 'supplier' },
  ],
  'DE.CM-01': [
    { name: 'NIDS (Palo Alto ATP)', parts: [['PaloAlto ATP', 'service', 'Network Intrusion Detection System'],
      ['Advanced Threat Prevention Network Intrusion Detection platform', 'service', 'Network Intrusion Detection System'],
      ['InfoSec Team', 'service', 'Network Intrusion Detection System']] },
    { name: 'Provided by the supplier', kind: 'supplier' },
  ],
  'PR.DS-02': [
    { name: 'TLS', parts: [['TLS 1.2+ configuration', 'on_system'], ['Encryption Standard', 'organisation']] },
    { name: 'Remote-access VPN', parts: [['PaloAlto GlobalProtect VPN', 'on_system'], ['PaloAlto GlobalProtect gateway', 'service', 'MIG Remote Access VPN']] },
    { name: 'Secure radio', parts: [['Plotnet Secure Radio', 'on_system']] },
    { name: 'Signal secure messaging', parts: [['Signal', 'on_system']] },
    { name: 'Provided by the supplier', kind: 'supplier' },
  ],
  'PR.AA-05': [
    { name: 'Active Directory (on-premises)', parts: [['Microsoft Active Directory Domain Services', 'service', 'MIG Authentication, Authorisation and Access Control system'],
      ['IT Administrators', 'service', 'MIG Authentication, Authorisation and Access Control system']] },
    { name: 'Entra ID (cloud)', parts: [['Microsoft Entra ID', 'service', 'MIG Authentication, Authorisation and Access Control system']] },
  ],
};
// Library lists follow the patterns' on-system parts (§4): Starlink and OneWeb
// are transport, not encryption, and leave PR.DS-02.
const LIBRARY_REMOVE = { 'PR.DS-02': ['Starlink LEO portable terminal'] };

// §6 — the deliberate problems, each on a named part, with a reason.
const DEGRADED_PARTS = [
  ['MIG Corporate Email', 'MS Exchange 2019', 'Out of mainstream support since 14 October 2025; migration to Exchange Online is planned.'],
  ['Approach radar', 'Wazuh agent', 'Wazuh agents on the radar hosts are two versions behind the manager; the vendor has not yet certified the upgrade.'],
  ['Water Distribution', 'Veeam Backup', 'The last quarterly restore test of the historian failed; the job is being rebuilt.'],
  ['MIG Remote Access VPN', 'PaloAlto GlobalProtect gateway', 'MFA is not enforced for agency contractors connecting through the gateway.'],
  ['Student Desktop', 'Crowdstrike Falcon Agent', 'Deployed to only some of the shared lab PCs; the rest await re-imaging.'],
  ['Criminal Records and Firearms Licensing System', 'OSSEC agent', 'Being retired as CrowdStrike takes over; no longer tuned.'],
];
// Systems whose endpoint agents cannot run (§6.2): Windows 7.
const NO_AGENT = new Set(['Prison Management System', 'Information Security Playbooks']);
// Assets deliberately left incompletely rated (the finding stays realistic).
const INCOMPLETE_ASSETS = new Set(['Cyber Response Playbooks', 'Information Risk Knowledge', 'Generation Fuel logistics information',
                                   'Aviation Band Radio Traffic for ATC']);
const RERATE_SEVERE = { 'Criminal Records': [5, 5, 3], 'Firearms and Explosives Licensing Information': [5, 5, 3] };  // §8.3

// ── 1. Systems ──────────────────────────────────────────────────────────────────
const renameIn = (slug, col, map) => { for (const r of rows(slug)) if (map[r[col]]) r[col] = map[r[col]]; };
const dedupe = (slug, keyFn) => { const seen = new Set(); data[slug].rows = rows(slug).filter((r) => { const k = keyFn(r); if (seen.has(k)) return false; seen.add(k); return true; }); };
for (const [slug, col] of [['systems', 'name'], ['system-assets', 'system_name'], ['system-components', 'system_name'],
  ['system-threats', 'system_name'], ['system-controls', 'system_name'], ['business-service-systems', 'system_name'],
  ['supplier-relationships', 'system_name'], ['supplier-evidence', 'system_name'], ['scope-systems', 'system_name']]) {
  if (data[slug]) renameIn(slug, col, SYSTEM_RENAMES);
}
dedupe('systems', (r) => r.name);
dedupe('system-assets', (r) => `${r.system_name}|${r.asset_name}`);
dedupe('system-components', (r) => `${r.system_name}|${r.component_name}|${r.component_type}`);
dedupe('system-threats', (r) => `${r.system_name}|${r.threat_name}`);
dedupe('system-controls', (r) => `${r.system_name}|${r.control_title}`);
dedupe('business-service-systems', (r) => `${r.service_name}|${r.system_name}`);
for (const s of NEW_SYSTEMS) {
  rows('systems').push({ name: s.name, description: s.description, department_name: s.department_name,
    owner_email: IAO.infosec, manager_email: IAM.infosec, is_shared: 'false', is_active: 'true' });
}
for (const r of rows('systems')) if (DESCRIPTIONS[r.name] && !r.description) r.description = DESCRIPTIONS[r.name];
for (const r of rows('systems')) if (!classOf[r.name]) throw new Error(`no hosting class for system "${r.name}"`);

// The new service systems hold the asset that IS their function (modelling pattern).
rows('system-assets').push({ system_name: 'MIG Remote Access VPN', asset_name: 'MIG Government Communications Traffic', notes: '' });
rows('system-assets').push({ system_name: 'Microsoft Defender for Cloud', asset_name: 'Detective Monitoring Events', notes: '' });
rows('system-assets').push({ system_name: 'IT Support Ticketing System', asset_name: 'IT Support Activity', notes: '' });
for (const t of ['Stolen or compromised credentials', 'Denial of service (DoS/DDoS)', 'Supply chain or third-party compromise', 'Security misconfiguration']) {
  rows('system-threats').push({ system_name: 'MIG Remote Access VPN', threat_name: t });
}
for (const t of ['Stolen or compromised credentials', 'Supply chain or third-party compromise', 'Security misconfiguration']) {
  rows('system-threats').push({ system_name: 'Microsoft Defender for Cloud', threat_name: t });
}
dedupe('system-assets', (r) => `${r.system_name}|${r.asset_name}`);

// ── 2. Components ───────────────────────────────────────────────────────────────
for (const [slug, col] of [['components', 'name'], ['control-component-links', 'component_name'], ['system-components', 'component_name'],
  ['component-relationships', 'source_name'], ['component-relationships', 'target_name'], ['supplier-relationships', 'component_name'],
  ['component-ip-addresses', 'component_name']]) {
  if (data[slug]) renameIn(slug, col, COMPONENT_RENAMES);
}
dedupe('components', (r) => `${r.name}|${r.component_type}`);
dedupe('control-component-links', (r) => `${r.control_title}|${r.component_name}|${r.component_type}`);
dedupe('system-components', (r) => `${r.system_name}|${r.component_name}|${r.component_type}`);
for (const [name, type, inst, description] of NEW_COMPONENTS) {
  rows('components').push({ name, component_type: type, status: 'operational', description, created_by_email: 'ciso@mig.local', instantiation: inst });
}
for (const r of rows('components')) {
  r.instantiation = r.component_type === 'technology' ? (ORGANISATIONAL_TECH.has(r.name) ? 'organisational' : 'per_system') : 'organisational';
  if (r.status === 'unknown') r.status = 'operational';
}
const typeOf = Object.fromEntries(rows('components').map((r) => [r.name, r.component_type]));

// ── 3. What is on each system, from its class ───────────────────────────────────
const onSystem = {};   // system → Map(component → { status, role })
for (const r of rows('system-components')) {
  (onSystem[r.system_name] ||= new Map()).set(r.component_name, { status: r.status === 'unknown' ? 'operational' : r.status, role: r.role });
}
const put = (s, c, status = 'operational') => { (onSystem[s] ||= new Map()).set(c, { status, role: '' }); };
const drop = (s, c) => onSystem[s]?.delete(c);
const SAAS_PRODUCT = { 'IT Support Ticketing System': 'Helix ServiceDesk', 'Support Knowledge base': 'Helix ServiceDesk',
  'HR System': 'PeopleFirst HR', 'Flight operations system': 'SkyPlan Ops', 'Schools facilities management': 'FacilityFlow',
  'MIG Banking System': 'Island Mutual online banking' };
for (const sys of Object.keys(classOf)) {
  const k = classOf[sys];
  if (k === 'IT') {
    if (!NO_AGENT.has(sys)) put(sys, 'Crowdstrike Falcon Agent');
    if (sys !== 'Information Security Playbooks') { put(sys, 'Veeam Backup'); put(sys, 'TLS 1.2+ configuration'); }
    drop(sys, 'Wazuh');
  } else if (k === 'AZ') {
    put(sys, 'Microsoft Defender for Servers'); put(sys, 'Azure Backup'); put(sys, 'TLS 1.2+ configuration');
  } else if (k === 'SAAS') {
    for (const c of ['Crowdstrike Falcon Agent', 'Veeam Backup', 'PaloAlto GlobalProtect VPN', 'Advanced Threat Prevention Network Intrusion Detection platform',
      'ExtremeCloud IQ Site Engine', 'Crowdstrike SaaS']) drop(sys, c);
    if (SAAS_PRODUCT[sys]) put(sys, SAAS_PRODUCT[sys]);
  } else if (k === 'OT') {
    drop(sys, 'Crowdstrike Falcon Agent'); drop(sys, 'Crowdstrike SaaS'); drop(sys, 'Wazuh');
    if (!['Maritime and Aviation Radio Communications System', 'Aircraft fuelling'].includes(sys)) put(sys, 'Wazuh agent');
  }
}
// Infrastructure and security services (§3).
put('MIGNet', 'Syslog forwarding to Wazuh');
put('MIGNet', 'Network configuration backup');
for (const sys of ['MIGNet', 'Network Intrusion Detection System', 'Security monitoring platform', 'Host Intrusion Detection System']) put(sys, 'TLS 1.2+ configuration');
for (const sys of ['Network Intrusion Detection System', 'Host Intrusion Detection System', 'Approach radar', 'Power Distribution']) put(sys, 'Veeam Backup');
put('Network Intrusion Detection System', 'Syslog forwarding to Wazuh');
put('Network Intrusion Detection System', 'PaloAlto ATP');
put('MIG Authentication, Authorisation and Access Control system', 'Crowdstrike Falcon Agent');
put('MIG Authentication, Authorisation and Access Control system', 'Veeam Backup');
put('MIG Authentication, Authorisation and Access Control system', 'Microsoft Entra ID');
put('MIG Authentication, Authorisation and Access Control system', 'IT Administrators');
put('MIG Authentication, Authorisation and Access Control system', 'TLS 1.2+ configuration');
put('MIG Backup', 'Veeam Backup & Replication server');
for (const c of ['PaloAlto GlobalProtect gateway', 'PaloAlto 850-22', 'Syslog forwarding to Wazuh', 'IT Administrators', 'Bank Street server room', 'TLS 1.2+ configuration']) put('MIG Remote Access VPN', c);
for (const c of ['Microsoft Defender XDR console', 'InfoSec Team', 'MS O365 UK South']) put('Microsoft Defender for Cloud', c);
put('MIG Desktop (remote)', 'PaloAlto GlobalProtect VPN');
put('Environmental GIS research platform', 'PaloAlto GlobalProtect VPN');
drop('Criminal Records and Firearms Licensing System', 'PaloAlto GlobalProtect VPN');
put('MIG Desktop (internal)', 'Agency IT contractors');
put('IT Support Ticketing System', 'Agency IT contractors');
put('MIG Document Management', 'Microsoft 365 Backup');
put('MIG Corporate Email', 'MS Exchange 2019');
for (const [sys, comp] of DEGRADED_PARTS) {
  if (!onSystem[sys]?.has(comp)) throw new Error(`deliberate problem names ${comp} on ${sys}, which the story does not put there`);
  onSystem[sys].get(comp).status = 'degraded';
}
const notesFor = Object.fromEntries(DEGRADED_PARTS.map(([s, c, why]) => [`${s}|${c}`, why]));
data['system-components'].rows = [];
for (const [sys, m] of Object.entries(onSystem)) {
  if (!classOf[sys]) continue;
  for (const [comp, v] of m) {
    if (!typeOf[comp]) throw new Error(`component "${comp}" on ${sys} is not in the library`);
    rows('system-components').push({ system_name: sys, component_name: comp, component_type: typeOf[comp], role: v.role || '', status: v.status });
  }
}

// ── 4. Library: links and delivery patterns ─────────────────────────────────────
const titleByRef = {};
for (const r of rows('control-mappings')) if (r.standard === 'nist_csf') titleByRef[r.standard_ref] = r.control_title;
const T = (ref) => { if (!titleByRef[ref]) throw new Error(`no objective for ${ref}`); return titleByRef[ref]; };
const refOfTitle = (title) => Object.keys(titleByRef).find((ref) => titleByRef[ref] === title);
for (const [ref, names] of Object.entries(LIBRARY_REMOVE)) {
  data['control-component-links'].rows = rows('control-component-links').filter((r) => !(r.control_title === T(ref) && names.includes(r.component_name)));
}
// Security solutions (v147): one row per solution, the objectives it delivers,
// and its parts once. A name used for several objectives must mean the same parts.
data['delivery-patterns'] = { columns: ['name', 'kind', 'notes'], rows: [] };
data['delivery-pattern-objectives'] = { columns: ['pattern_name', 'control_title'], rows: [] };
data['delivery-pattern-parts'] = { columns: ['pattern_name', 'component_name', 'component_type', 'location', 'service_system_name'], rows: [] };
const solutionParts = {};
for (const [ref, patterns] of Object.entries(PATTERNS)) {
  for (const p of patterns) {
    rows('delivery-pattern-objectives').push({ pattern_name: p.name, control_title: T(ref) });
    const sig = JSON.stringify(p.parts || []);
    if (solutionParts[p.name] !== undefined) {
      if (solutionParts[p.name] !== sig) throw new Error(`security solution "${p.name}" has different parts on different objectives`);
    } else {
      solutionParts[p.name] = sig;
      rows('delivery-patterns').push({ name: p.name, kind: p.kind || 'parts', notes: '' });
      for (const [comp, location, service] of p.parts || []) {
        if (!typeOf[comp]) throw new Error(`pattern part "${comp}" is not in the library`);
        rows('delivery-pattern-parts').push({ pattern_name: p.name, component_name: comp,
          component_type: typeOf[comp], location, service_system_name: service || '' });
      }
    }
    for (const [comp, location] of p.parts || []) {
      // Keep the library list in step: an on-system part is a component the objective uses.
      if (location === 'on_system' && !rows('control-component-links').some((l) => l.control_title === T(ref) && l.component_name === comp)) {
        rows('control-component-links').push({ control_title: T(ref), component_name: comp, component_type: typeOf[comp], role: '' });
      }
    }
  }
}

// The new systems' deployments.
for (const [sys, refs] of [['MIG Remote Access VPN', ['DE.CM-09', 'PR.AA-05', 'DE.CM-01', 'PR.DS-02']],
                           ['Microsoft Defender for Cloud', ['DE.CM-09', 'PR.AA-05']]]) {
  for (const ref of refs) {
    rows('system-controls').push({ system_name: sys, control_title: T(ref), status: 'unknown',   // derived in section 6
      provenance: 'recorded', notes: '', exclusion_reason: '' });
  }
}

// ── 5. Suppliers and evidence (§5, fictional names carry the problems) ──────────
const setTitles = {};   // applies_to → [titles]
for (const r of rows('supplier-type-objectives')) (setTitles[r.applies_to] ||= []).push(r.control_title);
// v146: a supplier relied on to deliver an objective on the system it touches
// is expected to evidence it, as well as its type's set.
const ownPatternInPlay = (sys, ref) => (PATTERNS[ref] || []).some((p) => p.kind !== 'supplier'
  && (p.parts.every(([, loc]) => loc !== 'on_system') || p.parts.some(([c, loc]) => loc === 'on_system' && onSystem[sys]?.has(c))));
const supplierDelivered = (sys) => rows('system-controls')
  .filter((r) => r.system_name === sys && r.status !== 'not_applicable'
    && (PATTERNS[refOfTitle(r.control_title)] || []).some((p) => p.kind === 'supplier')
    && !ownPatternInPlay(sys, refOfTitle(r.control_title)))
  .map((r) => r.control_title);
let expectedSys = null;
const expected = (type) => [...new Set([...(setTitles.all || []), ...(setTitles[type] || []), ...(expectedSys ? supplierDelivered(expectedSys) : [])])];
const forSystem = (sys, fn) => { expectedSys = sys; try { return fn(); } finally { expectedSys = null; } };
const except = (list, ...refs) => list.filter((t) => !refs.map(T).includes(t));
const SUPPLIERS = [
  ['Island Mutual Bank', 'Fictional. Provides the payments portal used by Treasury.'],
  ['Helix ServiceDesk', 'Fictional. Hosts the IT service desk and knowledge base.'],
  ['PeopleFirst HR', 'Fictional. Hosts the HR system.'],
  ['SkyPlan Ops', 'Fictional. Hosts flight operations planning.'],
  ['FacilityFlow', 'Fictional. Hosts schools facilities management.'],
  ['Aerowatch Systems', 'Fictional. Maintains the approach radar under contract.'],
  ['Harbour Fuel Services', 'Fictional. Operates the airport fuel control system under contract.'],
  ['Gridline Controls', 'Fictional. Maintains the power control systems under contract.'],
  ['Island Staffing Agency', 'Fictional. Supplies contract IT staff who work on MIG equipment.'],
  ['Palo Alto Networks', 'Firewall, intrusion prevention and VPN products.'],
  ['Veeam', 'Backup software.'],
  ['Plotnet', 'Secure radio equipment.'],
];
for (const [name, notes] of SUPPLIERS) rows('suppliers').push({ name, notes });
const rel = (supplier, type, dept, system, component, extra = {}) => rows('supplier-relationships').push({
  supplier_name: supplier, relationship_type: type, department_name: dept, system_name: system || '', component_name: component || '',
  component_type: component ? typeOf[component] : '', description: extra.description || '', contract_ref: extra.ref || '',
  contract_url: '', contract_start: extra.start || day(-500), contract_end: extra.end || day(600), status: extra.status || 'active' });
const ev = (supplier, type, system, component, kind, title, reference, expires, titles, issued) => rows('supplier-evidence').push({
  supplier_name: supplier, relationship_type: type, system_name: system || '', component_name: component || '',
  component_type: component ? typeOf[component] : '', kind, title, reference, url: '', issued_on: issued || day(-120),
  expires_on: expires || '',
  control_titles: (typeof titles === 'function' ? forSystem(system, titles) : titles).join(' | ') });
const DEPT = Object.fromEntries(rows('systems').map((r) => [r.name, r.department_name]));
// SaaS hosted for us.
const SP = 'service_provider';
rel('Island Mutual Bank', SP, DEPT['MIG Banking System'], 'MIG Banking System', null, { ref: 'IMB-PAY-2024' });
ev('Island Mutual Bank', SP, 'MIG Banking System', null, 'report', 'SOC 2 Type II report', 'Island Audit LLP', day(240), () => except(expected(SP), 'GV.SC-10'));
ev('Island Mutual Bank', SP, 'MIG Banking System', null, 'contract_terms', 'Payments services agreement, schedule 7 (exit and data return)', 'IMB-PAY-2024 sch.7', '', [T('GV.SC-10')]);
for (const s of ['IT Support Ticketing System', 'Support Knowledge base']) rel('Helix ServiceDesk', SP, DEPT[s], s, null, { ref: 'HSD-0931' });
ev('Helix ServiceDesk', SP, 'IT Support Ticketing System', null, 'report', 'ISO/IEC 27001 surveillance audit report', 'Certification body report', day(300), () => expected(SP));
ev('Helix ServiceDesk', SP, 'Support Knowledge base', null, 'contract_terms', 'Master subscription agreement, clause 12 (security)', 'HSD-0931 cl.12', '',
   () => except(expected(SP), 'PR.DS-11', 'RC.RP-01'));
rel('PeopleFirst HR', SP, DEPT['HR System'], 'HR System', null, { ref: 'PF-HR-7710' });
ev('PeopleFirst HR', SP, 'HR System', null, 'report', 'SOC 2 Type II report', 'Independent service auditor', day(200), () => except(expected(SP), 'GV.SC-10'));
rel('SkyPlan Ops', SP, DEPT['Flight operations system'], 'Flight operations system', null, { ref: 'SKY-OPS-12', start: day(-60) });
rel('FacilityFlow', SP, DEPT['Schools facilities management'], 'Schools facilities management', null, { ref: 'FF-EDU-3' });
ev('FacilityFlow', SP, 'Schools facilities management', null, 'contract_terms', 'Education services agreement, security schedule', 'FF-EDU-3 sch.2', '', () => expected(SP));
// Super Bill (existing): its SOC 2 report has expired (§6.8).
ev('Super Bill', SP, 'Billing and meter reading', null, 'report', 'SOC 2 Type II report (last year)', 'Independent service auditor', day(-45), () => except(expected(SP), 'GV.SC-10'), day(-410));
ev('Super Bill', SP, 'Billing and meter reading', null, 'contract_terms', 'Billing services contract, exit clause', 'SB-UTIL-09 cl.21', '', [T('GV.SC-10')]);
// Microsoft hosts more than video conferencing.
const MS_TERMS = 'Microsoft Online Services agreement and Data Protection Addendum';
for (const s of ['MIG Telephony and Messaging', 'MIG Document Management', 'Information Security Management System', 'Microsoft Defender for Cloud',
                 'GIS Land Register', 'Electoral Roll']) {
  rel('Microsoft', SP, DEPT[s], s, null, { ref: 'MS-EA-2024' });
  ev('Microsoft', SP, s, null, 'contract_terms', MS_TERMS, 'MS-EA-2024', '', () => expected(SP));
}
// Contracted-out services (operate our systems).
const CS = 'contracted_service';
rel('Aerowatch Systems', CS, DEPT['Approach radar'], 'Approach radar', null, { ref: 'AW-RADAR-5' });
ev('Aerowatch Systems', CS, 'Approach radar', null, 'contract_terms', 'Radar maintenance contract, security schedule', 'AW-RADAR-5 sch.4', '', () => expected(CS));
rel('Harbour Fuel Services', CS, DEPT['Aircraft fuelling'], 'Aircraft fuelling', null, { ref: 'HFS-22' });
ev('Harbour Fuel Services', CS, 'Aircraft fuelling', null, 'contract_terms', 'Fuel services contract', 'HFS-22', '', () => except(expected(CS), 'DE.CM-06', 'PR.PS-04'));
for (const s of ['Power Generation', 'Power Distribution']) rel('Gridline Controls', CS, DEPT[s], s, null, { ref: 'GLC-2025' });
ev('Gridline Controls', CS, 'Power Generation', null, 'contract_terms', 'Control systems support contract, security schedule', 'GLC-2025 sch.3', '', () => expected(CS));
ev('Gridline Controls', CS, 'Power Distribution', null, 'contract_terms', 'Control systems support contract, security schedule', 'GLC-2025 sch.3', '', () => except(expected(CS), 'DE.CM-06'));
// Onshore contractors.
rel('Island Staffing Agency', 'onshore', 'Department of Communications', null, 'Agency IT contractors', { ref: 'ISA-IT-4' });
ev('Island Staffing Agency', 'onshore', null, 'Agency IT contractors', 'contract_terms', 'Agency terms: vetting and induction', 'ISA-IT-4 cl.6', '',
   [T('GV.RR-04'), T('PR.AT-01'), T('PR.AA-02')]);
// Products (real vendors as products only: our own contract terms, no claims about them).
const PR = 'product';
rel('Palo Alto Networks', PR, 'Department of Information Security', null, 'PaloAlto 850-22', { ref: 'PAN-SUP-3' });
ev('Palo Alto Networks', PR, null, 'PaloAlto 850-22', 'contract_terms', 'Support and subscription contract', 'PAN-SUP-3', '', [T('ID.RA-01'), T('PR.PS-02'), T('GV.SC-10')]);
rel('Veeam', PR, 'Department of Information Security', null, 'Veeam Backup', { ref: 'VEEAM-UL-9' });
rel('Plotnet', PR, 'Disaster and Emergency Management', null, 'Plotnet Secure Radio', { ref: 'PLT-77' });
ev('CrowdStrike', PR, null, 'Crowdstrike Falcon Agent', 'contract_terms', 'Falcon subscription agreement, support schedule', 'CS-FAL-2025', '', [T('ID.RA-01'), T('PR.PS-02')]);

// ── 6. Control status on each system, derived from the patterns ─────────────────
const statusOn = (sys, comp) => onSystem[sys]?.get(comp)?.status;
const orgState = (comp) => (rows('components').find((r) => r.name === comp)?.status) || 'operational';
const liveSupplierEvidence = (sys, title) => rows('supplier-relationships').some((r) => r.system_name === sys && r.status === 'active'
  && [SP, CS].includes(r.relationship_type)
  && rows('supplier-evidence').some((e) => e.supplier_name === r.supplier_name && e.system_name === sys
      && (!e.expires_on || e.expires_on >= day(0)) && e.control_titles.split(' | ').includes(title)));
function delivered(sys, ref) {
  let best = null;
  for (const p of PATTERNS[ref]) {
    let inPlay; let state;
    if (p.kind === 'supplier') {
      inPlay = rows('supplier-relationships').some((r) => r.system_name === sys && r.status === 'active' && [SP, CS].includes(r.relationship_type));
      state = liveSupplierEvidence(sys, T(ref)) ? 'complete' : 'incomplete';
    } else {
      const st = p.parts.map(([c, loc, svc]) => (loc === 'on_system' ? statusOn(sys, c) : loc === 'service' ? statusOn(svc, c) : orgState(c)));
      const onSys = p.parts.filter(([, loc]) => loc === 'on_system');
      inPlay = onSys.length === 0 || onSys.some(([c]) => statusOn(sys, c));
      state = st.some((x) => !x || !['operational', 'degraded'].includes(x)) ? 'incomplete' : st.includes('degraded') ? 'degraded' : 'complete';
    }
    const rank = (inPlay ? 0 : 10) + { complete: 0, degraded: 1, incomplete: 2 }[state];
    if (!best || rank < best.rank) best = { rank, state, inPlay };
  }
  return best && best.inPlay ? best.state : 'none';
}
const refOf = Object.fromEntries(Object.entries(titleByRef).map(([ref, t]) => [t, ref]));
const DEGRADED_PATCHING = new Set(Object.entries(onSystem).filter(([, m]) => m.get('ME End-Point Central')?.status === 'degraded').map(([s]) => s));
for (const r of rows('system-controls')) {
  if (r.status === 'not_applicable') continue;
  const ref = refOf[r.control_title];
  if (PATTERNS[ref]) {
    const d = delivered(r.system_name, ref);
    r.status = { complete: 'operational', degraded: 'degraded' }[d] || 'missing';
  } else if (ref === 'PR.PS-02' && (DEGRADED_PATCHING.has(r.system_name) || r.system_name === 'MIG Corporate Email')) {
    r.status = 'degraded';   // §6.7 patching server degraded; §6.1 Exchange out of support
  } else if (r.status === 'unknown' || r.status === 'degraded') {
    r.status = 'operational';   // assessed; degradation lives on named parts now
  }
}
// §6.2 — Prison: someone marked endpoint monitoring operational; nothing delivers it.
for (const r of rows('system-controls')) {
  if (r.system_name === 'Prison Management System' && refOf[r.control_title] === 'DE.CM-09') r.status = 'operational';
}
// ── 7. Ratings: every asset assessed against every mandatory table ───────────────
const mandatory = rows('impact-tables').filter((t) => t.mandatory === 'true').map((t) => t.name);
const assetCia = Object.fromEntries(rows('information-assets').map((a) => [a.name, null]));
const ratings = rows('asset-impact-ratings');
for (const a of Object.keys(assetCia)) {
  const mine = ratings.filter((r) => r.asset_name === a);
  const c = Math.max(1, ...mine.map((r) => +r.c_level || +r.rated_level || 1));
  const i = Math.max(1, ...mine.map((r) => +r.i_level || +r.rated_level || 1));
  const av = Math.max(1, ...mine.map((r) => +r.a_level || +r.rated_level || 1));
  assetCia[a] = [c, i, av];
}
for (const [asset, [c, i, a]] of Object.entries(RERATE_SEVERE)) {
  const r = ratings.find((x) => x.asset_name === asset && x.impact_table_name === 'Life, safety and liberty');
  const row = r || (ratings.push({ asset_name: asset, impact_table_name: 'Life, safety and liberty' }), ratings.at(-1));
  Object.assign(row, { rated_level: Math.max(c, i, a), c_level: c, i_level: i, a_level: a });
}
for (const asset of Object.keys(assetCia)) {
  if (INCOMPLETE_ASSETS.has(asset)) continue;
  for (const table of mandatory) {
    if (ratings.some((r) => r.asset_name === asset && r.impact_table_name === table)) continue;
    // Assessed against the table at the asset's existing levels, so no impact moves.
    const [c, i, a] = assetCia[asset];
    ratings.push({ asset_name: asset, impact_table_name: table, rated_level: Math.max(c, i, a), c_level: c, i_level: i, a_level: a });
  }
}
// Never-rated assets stay never rated only where the story says so.
data['asset-impact-ratings'].rows = ratings.filter((r) => !(INCOMPLETE_ASSETS.has(r.asset_name) && ['Cyber Response Playbooks', 'Information Risk Knowledge'].includes(r.asset_name)));

// ── Write ───────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const slug of Object.keys(data)) write(slug);
const count = (slug) => rows(slug).length;
console.log(`[misty-isles] wrote ${Object.keys(data).length} datasets to ${path.relative(process.cwd(), OUT)}/`);
console.log(`  systems ${count('systems')} · components ${count('components')} · system components ${count('system-components')}`
  + ` · control deployments ${count('system-controls')} · delivery patterns ${count('delivery-patterns')}`
  + ` · suppliers ${count('suppliers')} · relationships ${count('supplier-relationships')} · evidence ${count('supplier-evidence')}`);
const st = rows('system-controls').reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log('  control status:', JSON.stringify(st));
