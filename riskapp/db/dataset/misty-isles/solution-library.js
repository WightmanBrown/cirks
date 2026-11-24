#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles: the policy library and the security solutions built on it
// (owner, 2026-11-16, "Adding some more security solutions").
//
//   CIRKS_PASSWORD=… node db/dataset/misty-isles/solution-library.js --base <api> [--as ciso@mig.local] [--dry-run]
//
// Runs after objective-solutions.js (install.js step 4b), through the API as the
// CISO, before any risk is assessed. Idempotent: a document, solution, objective
// or part already there is left alone.
//
// What it does, in the order the owner gave it:
//   1. The documents MIG holds. The owner's list: policies, standards and
//      guidelines, the poorly titled ones given clear names; plus the policies
//      the central security services were missing, and the records that show a
//      document was read, a process ran, a plan was exercised or a site was
//      assessed (a record fills a slot only when said, so each is placed).
//   2. P1 governing documents: each policy as a solution delivering its own
//      policy objective, communicated to its audience, with a training record.
//      Guidelines deliver nothing (a guideline cannot, v139), so they are only
//      recorded. Standards that configure something sit in that solution instead
//      (the backup policy in the backups, CIS benchmarks in configuration monitoring).
//   3. P2: the ISMS process CIRKS supports, defined by the information risk
//      management policy. P3: the registers CIRKS keeps, each with a standard
//      saying what it must hold. P4: incident response planning and exercises.
//   4. P5: each central security service given its policy and its team.
//   5. P6 and P8 filled in, and the physical sites assessed and maintained.
//
//   6. Two P5 examples the owner asked about: isolating a legacy system (chosen
//      on the Prison Management System) and brokered supplier access, like a KVM
//      switch (in place on Power Generation). Neither is a new pattern.
//
// Gaps are left on purpose, at least one in each pattern with more than one
// solution, so the patterns page and the solutions list have something to show:
//   P1  Technology and cloud service assessment policy: new, not yet briefed (no training record)
//   P3  Information Security Management and Information Risk Knowledge: no standard for the supplier register
//   P4  Failover to the Castle Vaults DR room: no team named, never exercised
//   P5  OSSEC agent (being retired): no team, no policy
//       Rapid 7 network scanning: no team named
//       Entra ID (cloud): no team named
//       Remote-access VPN: no team named
//       Patch and configuration management: nothing on the system shows it
//   P6  Signal secure messaging: no standard
//   P8  Secure datacentre — Shark Point: never assessed; The Castle server room
//       itself is degraded (the owner's, October 2026)
// None of this moves a score: a pattern's fit is report only (v176), and every
// part added here is in place, so no solution's state changes.

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const BASE = opt('--base', 'http://localhost:3000/api/v1');
const DRY = args.includes('--dry-run');
// --components-only: section 1 alone (the documents, records, technology and
// processes, and the renames). install.js runs it before objective-solutions.js,
// whose solutions use some of them as parts, and runs the whole script after it,
// whose solutions add parts to some of objective-solutions.js's (2026-11-23).
const COMPONENTS_ONLY = args.includes('--components-only');
const AS = opt('--as', 'ciso@mig.local');
const PASSWORD = process.env.CIRKS_PASSWORD;
if (!PASSWORD) { console.error('Set CIRKS_PASSWORD to the password of the account this signs in as (--as).'); process.exit(1); }
const { patternFor } = require('./solution-patterns');

const day = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

// ── 1. Documents and records ─────────────────────────────────────────────────
// [name, kind, description]. kind: policy | standard | procedure | guideline, or
// null for a record (information that evidences something; never a document).
const RENAMES = {
  // The owner's "information classification and handling policy" is the policy MIG already had.
  'Data handling policy': 'Information Classification and Handling Policy',
};
const DOCUMENTS = [
  // The owner's list
  ['Data Backup and Recovery Policy', 'policy', 'What is backed up, how often, how long it is kept, how backups are protected, and how often restores are tested.'],
  ['Detective Monitoring Policy', 'policy', 'What is monitored, by whom, how alerts are triaged and escalated, and how long monitoring data is kept.'],
  ['Encryption Guidelines', 'guideline', 'Advice on choosing and using encryption. Guidance only: the Encryption Standard is what must be done.'],
  ['Information Risk Management Policy', 'policy', 'How MIG identifies, assesses, treats, accepts and reports information risk, and who decides at each step.'],
  ['ISMS Roles and Responsibilities', 'policy', 'The roles in the information security management system (SIRO, CISO, risk analysts, information asset owners and managers) and what each is accountable for.'],
  ['Logging Standard', 'standard', 'What every system must log, for how long, and where the logs go; includes the logging required of AI agents.'],
  ['Risk Assessment Guidelines', 'guideline', 'How to work through a risk assessment in CIRKS, with worked examples.'],
  ['Risk Register Guidelines', 'guideline', 'How to write a risk in the register so others can understand and act on it.'],
  // Titled "technology and cloud assessment management policy" in the owner's list ("poorly titled").
  ['Technology and Cloud Service Assessment Policy', 'policy', 'How a new technology or cloud service is assessed for security before MIG adopts it, and reassessed while in use.'],
  ['Vulnerability Management Policy', 'policy', 'How vulnerabilities are found, rated and fixed, the target timescales for patching, and how exceptions are risk managed.'],
  ['CIS Benchmarks — operating systems', 'standard', 'The CIS benchmarks MIG adopts for its Windows, Linux and macOS builds, with MIG’s recorded deviations.'],
  ['CIS Benchmarks — applications', 'standard', 'The CIS benchmarks MIG adopts for its browsers, Microsoft 365 and web servers, with MIG’s recorded deviations.'],
  // The registers' standards: the facts each register must record (owner: "a series of standards").
  ['Information Asset Register Standard', 'standard', 'What every information asset record must hold: its owner and manager, the systems holding it, and its rating against every mandatory impact table.'],
  ['Systems Register Standard', 'standard', 'What every system record must hold: owner, manager, system pattern, components, information assets and the business services using it.'],
  ['Risk Register Standard', 'standard', 'What every risk must record: the system and threat, the controls relied on, the scores now and after committed work, the treatment and who agreed it.'],
  // The policies the central security services were missing
  ['Access Control and Account Management Policy', 'policy', 'Who may have access to what, how accounts are created, changed, reviewed and removed, and how privileged accounts are controlled.'],
  ['Network Security Policy', 'policy', 'How MIG’s networks are zoned and protected: firewall rules, intrusion detection, isolation and remote access.'],
  ['Endpoint Protection Standard', 'standard', 'The required configuration of endpoint protection: what is detected, what is blocked, and which devices must carry an agent.'],
  ['AI Usage Policy', 'policy', 'Which AI services and agents may be used, for what, with what data, and how their use is approved and monitored.'],
  ['Incident Response Plan', 'procedure', 'Who does what when a security incident is declared: roles, contacts, decisions and the playbooks to follow.'],
  ['Third-Party Access Standard', 'standard', 'How a supplier may reach a MIG system: only through the supplier access gateway, never directly, with every session approved, watched and recorded.'],
  // Records
  ['Security awareness completions (KnowBe4)', null, 'Each person’s completion of the annual awareness course, including reading and accepting the policies set for everyone.'],
  ['Policy acknowledgements — IT and security staff', null, 'Each IT or security staff member’s signed acknowledgement of the technical policies that apply to their role.'],
  ['ISMS role acceptance records', null, 'Each holder of an ISMS role’s signed acceptance of it.'],
  ['Procurement policy briefing records', null, 'Who in the procurement team has been briefed on the supply chain policies, and when.'],
  ['SWG minutes and risk review records', null, 'Issued Security Working Group minutes and the quarterly risk reviews: the evidence the ISMS process runs.'],
  ['Incident response exercise reports', null, 'The report of each incident response exercise: the scenario, who took part, what worked and the actions raised.'],
  ['Bank Street physical security assessment', null, 'The annual physical security review of the Bank Street server room.'],
  ['The Castle physical security assessment', null, 'The annual physical security review of The Castle server room.'],
  ['MIG Official Premises physical security assessment', null, 'The annual physical security review of the official premises.'],
  ['Physical security maintenance log', null, 'Service visits to the door controllers, CCTV, HVAC and fire suppression at every MIG site.'],
  ['Supplier session recordings', null, 'The recording of every supplier session through the supplier access gateway, kept for a year.'],
];
// Technology the services were missing.
const TECHNOLOGY = [
  // "I see a backup is missing its security system" (owner): Azure Backup had nothing central.
  ['Azure Recovery Services vault', 'The Recovery Services vault that holds the Azure servers’ backups, with soft delete and immutability on.'],
  // Brokered supplier access (owner, 2026-11-16): the equivalent of a KVM switch.
  // §11 (owner's answers T1-T19, 2026-11-23)
  ['Microsoft 365 email (Exchange Online)', 'MIG’s email, hosted in Microsoft 365.'],
  ['SPF, DKIM and DMARC records', 'The DNS records that let receiving mail servers check that mail claiming to be from MIG is genuine.'],
  ['GoDaddy DNS hosting', 'MIG’s public DNS zones, hosted and signed (DNSSEC) at GoDaddy.'],
  ['Unsure Networks internet link', 'The internet connection from Unsure Networks, MIG’s ISP, with its DDoS protection.'],
  ['Microsoft Intune', 'Mobile device management for MIG’s Windows and Android phones, tablets and laptops.'],
  ['Jamf', 'Mobile device management for MIG’s Apple devices.'],
  ['MIG CA Operation Ltd', 'The certificate authority that issues the certificates for MIG’s public services.'],
  ['GPS time source', 'The GPS-disciplined clock that Active Directory and PAN-OS take the time from.'],
  ['Syslog server', 'The central syslog server that applications and appliances send their logs to, alongside Wazuh.'],
  ['Supplier access gateway', 'The only route a supplier has to a sensitive MIG system: the supplier works through the gateway’s screen, keyboard and mouse and never connects to the system directly. Sessions are approved, watched and recorded.'],
];
// Processes the library was missing (§10).
const PROCESSES = [
  ['Change management', 'How a change to a system is requested, assessed for its security impact, approved, made and recorded.'],
];
// Technology that exists once per system.
const PER_SYSTEM_TECHNOLOGY = [
  ['Accepts connections only from the supplier access gateway', 'The system’s remote access is closed to everything except the supplier access gateway.'],
  // §11 T17: an application's own roles (CIRKS has them).
  ['Role-based access in the application', 'The application grants access by role, managed in the application itself.'],
];

// ── 2–5. Solutions ───────────────────────────────────────────────────────────
// parts: [component, slot]. Every part here is once for the organisation, so
// its location is 'organisation'. slot is the pattern slot it fills (null: let
// the pattern match it by type).
const EVERYONE = 'All desktop users';
const IT_STAFF = 'Policy acknowledgements — IT and security staff';
const AWARE = 'Security awareness completions (KnowBe4)';
const KEPT = ['Microsoft Sharepoint', 'kept_in'];    // the ISMS lives in SharePoint
const governing = (name, document, objectives, audience, record) => ({
  name, objectives, parts: [[document, 'document'], [audience, 'audience'], ...(record ? [[record, 'training_record']] : []), KEPT],
});
const NEW_SOLUTIONS = [
  // P1 — governing documents
  governing('Information classification and handling policy', 'Information Classification and Handling Policy', ['CIRKS1.DCH-01', 'CIRKS1.DCH-02',
    // §10 (owner, 2026-11-23)
    'CIRKS1.DCH-07', 'CIRKS1.DCH-08', 'CIRKS1.DCH-10', 'CIRKS1.DCH-11'], EVERYONE, AWARE),
  governing('Encryption policy and standard', 'Encryption Standard', ['CIRKS1.DCH-03'], 'IT Administrators', IT_STAFF),
  governing('Backup and recovery policy', 'Data Backup and Recovery Policy', ['CIRKS1.BRR-01'], 'IT Administrators', IT_STAFF),
  governing('Detective monitoring policy', 'Detective Monitoring Policy', ['CIRKS1.DM-01'], 'InfoSec Team', IT_STAFF),
  governing('Logging standard', 'Logging Standard', ['CIRKS1.DM-02'], 'IT Administrators', IT_STAFF),
  governing('ISMS roles and responsibilities', 'ISMS Roles and Responsibilities', ['CIRKS1.IRM-03'], 'Expert People Group', 'ISMS role acceptance records'),
  governing('Access control and account management policy', 'Access Control and Account Management Policy', ['CIRKS1.AA-01'], 'IT Administrators', IT_STAFF),
  governing('Network security policy', 'Network Security Policy', ['CIRKS1.CS-01'], 'IT Administrators', IT_STAFF),
  governing('Vulnerability management policy', 'Vulnerability Management Policy', ['CIRKS1.SVM-01', 'CIRKS1.SVM-05'], 'IT Administrators', IT_STAFF),   // §10: exceptions
  governing('Supply chain security policy', 'Supply Chain Security Policy', ['CIRKS1.SCM-01',
    'CIRKS1.SCM-04', 'CIRKS1.SCM-07', 'CIRKS1.SCM-09', 'CIRKS1.SD-09'], 'Procurement Team', 'Procurement policy briefing records'),   // §10
  governing('Technology and cloud service assessment policy', 'Technology and Cloud Service Assessment Policy', ['CIRKS1.SCM-06'], 'Procurement Team', null),
  governing('AI usage policy', 'AI Usage Policy', ['CIRKS1.AI-01', 'CIRKS1.AI-02', 'CIRKS1.AI-03', 'CIRKS1.AI-07', 'CIRKS1.AI-08'], EVERYONE, AWARE),   // §10
  // P2 — the ISMS process CIRKS supports
  { name: 'Information security management (ISMS) process', objectives: ['CIRKS1.IRM-02',
      // §10: the rest of running the ISMS
      'CIRKS1.IRM-07', 'CIRKS1.IRM-10', 'CIRKS1.IRM-11', 'CIRKS1.IRM-12', 'CIRKS1.IRM-13', 'CIRKS1.IRM-14', 'CIRKS1.IRM-15'],
    parts: [['CIRKS Information Risk Management Process', 'process'], ['InfoSec Team', 'responsible'],
            ['Information Risk Management Policy', 'defined_by'], ['SWG minutes and risk review records', 'evidence'], ['CIRKS', null]] },
  // P3 — the registers CIRKS keeps
  { name: 'Information asset register (CIRKS)', objectives: ['CIRKS1.EST-01'],
    parts: [['CIRKS', 'record'], ['Asset management', 'maintained_by'], ['Information Asset Register Standard', 'standard']] },
  { name: 'Systems register (CIRKS)', objectives: ['CIRKS1.EST-02'],
    parts: [['CIRKS', 'record'], ['Asset management', 'maintained_by'], ['Systems Register Standard', 'standard']] },
  { name: 'Risk register (CIRKS)', objectives: ['CIRKS1.IRM-04'],
    parts: [['CIRKS', 'record'], ['CIRKS Information Risk Management Process', 'maintained_by'], ['Risk Register Standard', 'standard']] },
  // P5 — two shapes the owner asked about (2026-11-16), neither a new pattern.
  // Isolating a legacy system that cannot be fixed but is still worth running:
  // the firewall does the work and nothing is installed on the system (P5's
  // network-only form). The decision to keep running it is the exception on its
  // risk. Chosen on the Windows 7 Prison Management System below.
  { name: 'Legacy system isolation', objectives: ['CIRKS1.CS-04', 'CIRKS1.SVM-04', 'CIRKS.OT.T-01'],   // §11 T19
    parts: [['PaloAlto 850-22', 'security_system'], ['IT Administrators', 'team'], ['Network Security Policy', 'policy']] },
  // Brokered supplier access, like a KVM switch: the supplier never touches the
  // system directly. The part on the system is that it accepts nothing else.
  { name: 'Brokered supplier access', objectives: ['CIRKS1.SCM-10', 'CIRKS1.AA-07'],
    parts: [['Supplier access gateway', 'security_system'], ['IT Administrators', 'team'],
            ['Accepts connections only from the supplier access gateway', 'on_system', 'on_system'],
            ['Third-Party Access Standard', 'policy'], ['Supplier session recordings', null]] },
  // P4 — incident response planning and exercises
  { name: 'Incident response planning and exercises', objectives: ['CIRKS1.IR-01', 'CIRKS1.IR-08'],
    parts: [['Incident Response Plan', 'plan'], ['InfoSec Team', 'team'], ['Incident response exercise reports', 'exercise']] },
  // §10 (owner, 2026-11-23) — P2 managed processes, from components already in
  // the library; non-technical, so no product had to be chosen.
  { name: 'Incident management process', objectives: ['CIRKS1.IR-02', 'CIRKS1.IR-03', 'CIRKS1.IR-05', 'CIRKS1.IR-06', 'CIRKS1.IR-07'],
    parts: [['Incident management', 'process'], ['InfoSec Team', 'responsible'], ['Incident response policy', 'defined_by'],
            ['Incident response playbooks', null], ['Incident Response Plan', null]] },
  { name: 'Account management process', objectives: ['CIRKS1.AA-02', 'CIRKS1.AA-04', 'CIRKS1.AA-10', 'CIRKS1.IDA-02', 'CIRKS1.IDA-03', 'CIRKS1.PER-04',
      'CIRKS1.CS-13'],   // §11 T9: admin accounts, a procedural control backed by the policy
    parts: [['User account management process', 'process'], ['IT Administrators', 'responsible'],
            ['Access Control and Account Management Policy', 'defined_by'], ['HR Team', null]] },
  { name: 'HR security process', objectives: ['CIRKS1.PER-01', 'CIRKS1.PER-03'],
    parts: [['Background HR checks', 'process'], ['HR Team', 'responsible'], ['Acceptable Use Policy', 'defined_by']] },
  { name: 'Security testing and audit', objectives: ['CIRKS1.RAST-02', 'CIRKS1.RAST-03', 'CIRKS1.RAST-04', 'CIRKS1.RAST-05', 'CIRKS1.RAST-06'],
    parts: [['Annual Audit Process', 'process'], ['InfoSec Team', 'responsible'], ['Vulnerability Management Policy', 'defined_by'],
            ['Vulnerability management', null]] },
  // No change procedure is written yet, so its defined-by slot is left empty
  // and the pattern says so.
  { name: 'Change management', objectives: ['CIRKS1.CVM-03', 'CIRKS1.SD-08'],
    parts: [['Change management', 'process'], ['IT Administrators', 'responsible'], ['System configuration', null]] },
  // §11 — the owner's answers to the technical questions T1–T19 (2026-11-23).
  { name: 'Web and email filtering (PAN-OS and Defender)', objectives: ['CIRKS1.CS-07'],          // T1
    parts: [['PaloAlto 850-22', 'security_system'], ['Microsoft Defender XDR console', null], ['InfoSec Team', 'team'], ['Network Security Policy', 'policy']] },
  { name: 'Email authentication (SPF, DKIM, DMARC)', objectives: ['CIRKS1.CS-14'],                // T2
    parts: [['SPF, DKIM and DMARC records', 'setting'], ['Microsoft 365 email (Exchange Online)', null], ['GoDaddy DNS hosting', null], ['Network Security Policy', 'standard']] },
  { name: 'DNSSEC (GoDaddy)', objectives: ['CIRKS1.CS-10'],                                        // T3
    parts: [['GoDaddy DNS hosting', 'setting'], ['Network Security Policy', 'standard']] },
  { name: 'DDoS protection (Azure and Unsure Networks)', objectives: ['CIRKS1.CS-11'],             // T5
    parts: [['Azure cloud network', 'security_system'], ['Unsure Networks internet link', null], ['IT Administrators', 'team'], ['Network Security Policy', 'policy']] },
  { name: 'Wireless (ExtremeCloud IQ)', objectives: ['CIRKS1.CS-06'],                              // T6
    parts: [['ExtremeCloud IQ Site Engine', 'security_system'], ['IT Administrators', 'team'], ['Network Security Policy', 'policy']] },
  { name: 'Network services hardening', objectives: ['CIRKS1.CS-05'],                              // T7
    parts: [['PAN-OS', 'setting'], ['Microsoft Active Directory Domain Services', null], ['CIS Benchmarks — operating systems', 'standard']] },
  { name: 'Secure administration (GlobalProtect with MFA)', objectives: ['CIRKS1.CS-08'],          // T8
    parts: [['PaloAlto GlobalProtect gateway', 'security_system'], ['Entra ID sign-in', null], ['IT Administrators', 'team'],
            ['Access Control and Account Management Policy', 'policy']] },
  { name: 'Mobile device management (Microsoft Intune)', objectives: ['CIRKS1.CVM-06'],            // T11
    parts: [['Microsoft Intune', 'security_system'], ['IT Administrators', 'team'], ['Endpoint Protection Standard', 'policy']] },
  { name: 'Mobile device management (Jamf)', objectives: ['CIRKS1.CVM-06'],
    parts: [['Jamf', 'security_system'], ['IT Administrators', 'team'], ['Endpoint Protection Standard', 'policy']] },
  { name: 'Time from Active Directory (GPS source)', objectives: ['CIRKS1.DM-03'],                 // T13
    parts: [['Microsoft Active Directory Domain Services', 'setting'], ['GPS time source', null], ['Logging Standard', 'standard']] },
  { name: 'Time from PAN-OS (GPS source)', objectives: ['CIRKS1.DM-03'],
    parts: [['PAN-OS', 'setting'], ['GPS time source', null], ['Logging Standard', 'standard']] },
  { name: 'Application logging (Wazuh and syslog)', objectives: ['CIRKS1.DM-10'],                  // T14
    parts: [['Wazuh', 'security_system'], ['Syslog server', null], ['InfoSec Team', 'team'], ['Logging Standard', 'policy']] },
  // T15: the Linux servers sign in through the directory too (15 joined to AD,
  // one through Entra ID), so their user accounts are in this record.
  { name: 'Central account record (Active Directory and Entra ID)', objectives: ['CIRKS1.IDA-07'],
    parts: [['Microsoft Active Directory Domain Services', 'record'], ['Microsoft Entra ID', null],
            ['User account management process', 'maintained_by'], ['Access Control and Account Management Policy', 'standard']] },
  { name: 'Application role-based access', objectives: ['CIRKS1.AA-11'],                           // T17
    parts: [['Role-based access in the application', 'setting', 'on_system'], ['Access Control and Account Management Policy', 'standard']] },
  { name: 'Public certificates (MIG CA Operation Ltd)', objectives: ['CIRKS1.CS-09'],                // T4
    parts: [['MIG CA Operation Ltd', 'security_system'], ['IT Administrators', 'team'], ['Encryption Standard', 'policy']] },
  { name: 'OT zero trust isolation', objectives: ['CIRKS.OT.T-01'],                                // T19
    parts: [['Zero trust isolation', 'security_system'], ['IT Administrators', 'team'], ['Network Security Policy', 'policy']] },
];

// Parts added to solutions that exist (and the one part that goes).
const ADD_PARTS = {
  // P1
  'Acceptable Use Policy': [[EVERYONE, 'audience'], [AWARE, 'training_record'], KEPT],
  // P4: the containment plan is exercised with the rest of incident response
  'Incident containment and recovery': [['Incident response exercise reports', 'exercise']],
  // P5 — backups
  'Veeam backup': [['Data Backup and Recovery Policy', 'policy']],
  'Azure Backup': [['Azure Recovery Services vault', 'security_system'], ['Data Backup and Recovery Policy', 'policy']],
  // P5 — monitoring: the detective monitoring policy (owner)
  'Central security monitoring': [['Detective Monitoring Policy', 'policy']],
  'Wazuh agent (OT)': [['Detective Monitoring Policy', 'policy']],
  'Syslog to Wazuh (network appliances)': [['Detective Monitoring Policy', 'policy']],
  // P5 — endpoint protection. The policy slot is what DEFINES THE CONFIGURATION,
  // which for an agent is the Endpoint Protection Standard; the detective
  // monitoring policy reaches EDR through the Detective Monitoring process it
  // already has, and fills the slot in the services that only watch.
  'CrowdStrike EDR': [['Endpoint Protection Standard', 'policy']],
  'CrowdStrike host containment': [['Endpoint Protection Standard', 'policy']],
  'Microsoft Defender for Servers (Azure)': [['Endpoint Protection Standard', 'policy']],
  // P5 — AI agent monitoring: the logging standard says what an agent must log
  // (it fills the slot); the AI usage policy says what an agent may do.
  'AI agent monitoring': [['Logging Standard', 'policy'], ['AI Usage Policy', null]],
  // P5 — identity and network
  'Active Directory (on-premises)': [['Access Control and Account Management Policy', 'policy']],
  'Entra ID (cloud)': [['Access Control and Account Management Policy', 'policy']],
  'Perimeter firewall and segmentation': [['Network Security Policy', 'policy']],
  'NIDS (Palo Alto ATP)': [['Network Security Policy', 'policy']],
  'Network isolation': [['Network Security Policy', 'policy']],
  'Remote-access VPN': [['Network Security Policy', 'policy']],
  // P5 — vulnerability management. Wazuh's configuration checks ARE the CIS benchmarks.
  'Wazuh configuration monitoring': [['InfoSec Team', 'team'], ['CIS Benchmarks — operating systems', 'policy'],
                                     ['CIS Benchmarks — applications', null], ['Vulnerability Management Policy', null]],
  'Rapid 7 authenticated scanning': [['InfoSec Team', 'team'], ['Vulnerability Management Policy', 'policy']],
  'Rapid 7 network scanning': [['Vulnerability Management Policy', 'policy']],
  'Patch and configuration management (ME End-Point Central)': [['Vulnerability Management Policy', 'policy'],
                                                                ['CIS Benchmarks — operating systems', null]],
  // P6 — security configuration settings, each defined by a standard
  'Secure radio': [['Encryption Standard', 'standard']],
  'Microsoft 365 Backup': [['Data Backup and Recovery Policy', 'standard']],
  'Configuration backup (network appliances)': [['Data Backup and Recovery Policy', 'standard']],
  // P8 — physical security
  'Secure datacentre — Bank Street': [['Bank Street physical security assessment', 'assessment'], ['Physical security maintenance log', 'maintenance']],
  'Secure datacentre — The Castle': [['Server room HVAC', 'measures'], ['The Castle physical security assessment', 'assessment'],
                                    ['Physical security maintenance log', 'maintenance']],
  'Secure datacentre — Shark Point': [['Chubb electronic access control', 'measures'], ['Physical security maintenance log', 'maintenance']],
  'Secure premises — MIG Official Premises': [['Chubb electronic access control', 'measures'], ['MIG CCTV system', 'measures'],
                                             ['MIG Official Premises physical security assessment', 'assessment'],
                                             ['Physical security maintenance log', 'maintenance']],
};
// Objectives added to solutions that exist (§10, owner 2026-11-23).
const ADD_OBJECTIVES = {
  'Acceptable Use Policy': ['CIRKS1.PER-02', 'CIRKS1.DCH-12', 'CIRKS1.PHY-09', 'CIRKS1.CVM-07', 'CIRKS1.PHY-10'],
  // §11 T10, T16: removable media and privileged utilities, by CrowdStrike or ME End-Point Central
  'CrowdStrike EDR': ['CIRKS1.CVM-05', 'CIRKS1.AA-08'],
  'Patch and configuration management (ME End-Point Central)': ['CIRKS1.CVM-05', 'CIRKS1.AA-08'],
  // §11 T17: role-based access through directory groups
  'Active Directory (on-premises)': ['CIRKS1.AA-11'],
  'Entra ID (cloud)': ['CIRKS1.AA-11'],
};
// §11 T12: no data leakage prevention product; the finding is accepted for now.
const ACCEPT_FINDINGS = [
  ['objective-solution', 'CIRKS1.DCH-09', 'Accepted for now: there is no data leakage prevention product yet. Review when one is chosen (owner, 2026-11-23).'],
];
// CIRKS itself chosen as the solution where it is the thing that does the job
// (src/lib/cirksDelivers.js lists what it can deliver; offered, never assumed).
const CIRKS_CHOSEN = ['CIRKS1.IRM-01', 'CIRKS1.IRM-05', 'CIRKS1.IRM-08', 'CIRKS1.IRM-09', 'CIRKS1.RAST-01'];
// The backup policy replaces the handling policy that stood in for it.
const REMOVE_PARTS = { 'Azure Backup': ['Information Classification and Handling Policy'] };
// Where the two examples are in place: [system, solution, objective chosen for].
const CHOICES = [['Prison Management System', 'Legacy system isolation', 'CIRKS1.SVM-04']];
// [system, per-system component, status]: Gridline Controls maintain Power Generation through the gateway.
const RECORDED_ON = [['Power Generation', 'Accepts connections only from the supplier access gateway', 'operational']];

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
  const done = { renamed: 0, documents: 0, records: 0, technology: 0, solutions: 0, objectives: 0, parts: 0, removed: 0, choices: 0, recorded: 0 };

  // 1. Components
  let comps = (await api('GET', '/components?all=1')).components;
  for (const [from, to] of Object.entries(RENAMES)) {
    const c = comps.find((x) => x.name === from);
    if (c && !comps.some((x) => x.name === to)) { await api('PATCH', `/components/${c.id}`, { name: to }); done.renamed++; }
  }
  comps = (await api('GET', '/components?all=1')).components;
  for (const [name, kind, description] of DOCUMENTS) {
    if (comps.some((c) => c.name === name)) continue;
    await api('POST', '/components', { component_type: 'information', name, description, status: 'operational',
      // A record in use needs a review date too (v141 holds every information component to it).
      ...(kind ? { document_kind: kind, document_version: '1.0', document_approved_on: day(-120) } : {}), document_next_review: day(245) });
    done[kind ? 'documents' : 'records']++;
  }
  for (const [name, description] of TECHNOLOGY) {
    if (comps.some((c) => c.name === name)) continue;
    await api('POST', '/components', { component_type: 'technology', name, description, status: 'operational' });
    done.technology++;
  }
  for (const [name, description] of PROCESSES) {
    if (comps.some((c) => c.name === name)) continue;
    await api('POST', '/components', { component_type: 'process', name, description, status: 'operational' });
    done.technology++;
  }
  for (const [name, description] of PER_SYSTEM_TECHNOLOGY) {
    if (comps.some((c) => c.name === name)) continue;
    await api('POST', '/components', { component_type: 'technology', name, description, status: 'operational' });
    done.technology++;
  }
  comps = (await api('GET', '/components?all=1')).components;
  for (const [name] of PER_SYSTEM_TECHNOLOGY) {
    const c = comps.find((x) => x.name === name);
    if (c && !c.instantiation) await api('PATCH', `/components/${c.id}`, { instantiation: 'per_system' });
  }
  // Every one of them exists once for the organisation; say so, never assume it.
  for (const name of [...DOCUMENTS.map((d) => d[0]), ...TECHNOLOGY.map((t) => t[0]), ...PROCESSES.map((t) => t[0])]) {
    const c = comps.find((x) => x.name === name);
    if (c && !c.instantiation) await api('PATCH', `/components/${c.id}`, { instantiation: 'organisational' });
  }
  if (COMPONENTS_ONLY) { console.log('components:', JSON.stringify(done)); return; }
  const compId = (name) => {
    const c = comps.find((x) => x.name === name);
    if (!c) { if (DRY) return `<${name}>`; throw new Error(`component "${name}" is not in the library`); }
    return c.id;
  };

  const controls = (await api('GET', '/controls?limit=1000')).controls;
  const objective = (ref) => {
    const c = controls.find((x) => x.reference_code === ref);
    if (!c) throw new Error(`control objective ${ref} is not in the library`);
    return c;
  };
  let library = (await api('GET', '/controls/solutions')).solutions;
  const solution = (name) => library.find((s) => s.name === name);
  const refresh = async () => { library = (await api('GET', '/controls/solutions')).solutions; };

  async function addParts(s, parts) {
    const have = new Set((s.parts || []).map((p) => p.component_id));
    for (const [name, slot, location = 'organisation'] of parts) {
      if (have.has(compId(name))) continue;
      await api('POST', `/controls/solutions/${s.id}/parts`, { component_id: compId(name), location, slot_key: slot || null });
      done.parts++;
    }
  }

  // 2–3. New solutions
  for (const def of NEW_SOLUTIONS) {
    if (!solution(def.name)) {
      await api('POST', '/controls/solutions', { name: def.name, kind: 'parts' });
      done.solutions++;
      if (DRY) continue;
      await refresh();
    }
    const s = solution(def.name);
    if (!s) continue;
    const sp = patternFor(def.name);
    if (sp.solution_pattern && !s.solution_pattern) { await api('PATCH', `/controls/solutions/${s.id}`, sp); await refresh(); }
    for (const ref of def.objectives) {
      if (s.objectives.some((o) => o.id === objective(ref).id)) continue;
      await api('POST', `/controls/solutions/${s.id}/objectives`, { control_id: objective(ref).id });
      done.objectives++;
    }
    await addParts(solution(def.name), def.parts);
  }

  // 4–5. Existing solutions
  await refresh();
  for (const [name, gone] of Object.entries(REMOVE_PARTS)) {
    const s = solution(name);
    if (!s) throw new Error(`security solution "${name}" is not in the library`);
    for (const g of gone) {
      const p = s.parts.find((x) => x.component_id === compId(g));
      if (p) { await api('DELETE', `/controls/solutions/${s.id}/parts/${p.id}`); done.removed++; }
    }
  }
  await refresh();
  for (const [name, parts] of Object.entries(ADD_PARTS)) {
    const s = solution(name);
    if (!s) throw new Error(`security solution "${name}" is not in the library`);
    await addParts(s, parts);
  }

  for (const [name, refs] of Object.entries(ADD_OBJECTIVES)) {
    const s = solution(name);
    if (!s) throw new Error(`security solution "${name}" is not in the library`);
    for (const ref of refs) {
      if (s.objectives.some((o) => o.id === objective(ref).id)) continue;
      await api('POST', `/controls/solutions/${s.id}/objectives`, { control_id: objective(ref).id });
      done.objectives++;
    }
  }
  for (const [kind, ref, why] of DRY ? [] : ACCEPT_FINDINGS) {
    // A year from the build, so a training instance does not find it lapsed on day one.
    await api('POST', `/findings/${kind}/${objective(ref).id}/exceptions`,
      { justification: why, expires_at: day(365), review_cadence: 'annual' });
    done.objectives++;
  }
  for (const ref of CIRKS_CHOSEN) {
    const detail = await api('GET', `/controls/${objective(ref).id}`);
    if (detail.cirks?.chosen) continue;
    await api('POST', `/controls/${objective(ref).id}/patterns/cirks`);
    done.objectives++;
  }

  // The examples, in place
  const systemList = await api('GET', '/systems');
  const systems = Array.isArray(systemList) ? systemList : systemList.systems || [];
  const systemId = (name) => {
    const x = systems.find((y) => y.name === name);
    if (!x) throw new Error(`system "${name}" is not in the register`);
    return x.id;
  };
  await refresh();
  for (const [sys, sol, ref] of DRY ? [] : CHOICES) {
    await api('PUT', `/systems/${systemId(sys)}/solution-choices/${objective(ref).id}`,
      { pattern_id: solution(sol).id, notes: 'Isolated: it cannot be patched (Windows 7) but is still needed; the decision to keep it is the exception on its risk.' });
    done.choices++;
  }
  for (const [sys, name, status] of DRY ? [] : RECORDED_ON) {
    await api('POST', `/systems/${systemId(sys)}/components`, { component_id: compId(name) });
    await api('PATCH', `/systems/${systemId(sys)}/components/${compId(name)}`, { status });
    done.recorded++;
  }

  // One read of the findings settles every system (v152).
  if (!DRY) await api('GET', '/findings/component-record');
  console.log(`${DRY ? '[dry run] ' : ''}renamed ${done.renamed}; documents ${done.documents}; records ${done.records}; `
    + `technology ${done.technology}; solutions ${done.solutions}; objectives given a solution ${done.objectives}; `
    + `parts added ${done.parts}; parts removed ${done.removed}; solutions chosen ${done.choices}; parts recorded on systems ${done.recorded}.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
