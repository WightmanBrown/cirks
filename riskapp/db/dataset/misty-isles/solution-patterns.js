'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles: the security solution pattern each solution implements (v176,
// src/lib/solutionPatterns.js), proposed from each solution's parts and shown to
// the owner in the mock-up of 2026-11-09, which the owner approved on 2026-11-10.
// build.js writes them for the solutions it builds; objective-solutions.js sets
// them on the ones it creates through the API.
//
// [pattern, slots this solution does not need]. A network-only service (a
// scanner, a firewall, an identity service) has no part on the system.

const NETWORK_ONLY = ['on_system'];

const MIG_SOLUTION_PATTERNS = {
  // P5 — central security service
  'CrowdStrike EDR': ['P5'],
  'CrowdStrike host containment': ['P5'],
  'Microsoft Defender for Servers (Azure)': ['P5'],
  'Wazuh agent (OT)': ['P5'],
  'Syslog to Wazuh (network appliances)': ['P5'],
  'OSSEC agent (being retired)': ['P5'],
  'AI agent monitoring': ['P5'],
  'Wazuh configuration monitoring': ['P5'],
  'Rapid 7 authenticated scanning': ['P5'],
  'Rapid 7 network scanning': ['P5', NETWORK_ONLY],
  'NIDS (Palo Alto ATP)': ['P5', NETWORK_ONLY],
  'Perimeter firewall and segmentation': ['P5', NETWORK_ONLY],
  'Network isolation': ['P5', NETWORK_ONLY],
  'Central security monitoring': ['P5', NETWORK_ONLY],
  'Legacy system isolation': ['P5', NETWORK_ONLY],
  'Brokered supplier access': ['P5'],
  'Active Directory (on-premises)': ['P5', NETWORK_ONLY],
  'Entra ID (cloud)': ['P5', NETWORK_ONLY],
  'Remote-access VPN': ['P5'],
  'Veeam backup': ['P5'],
  'Azure Backup': ['P5'],
  'Patch and configuration management (ME End-Point Central)': ['P5'],
  // P6 — security configuration setting
  'TLS': ['P6'],
  'Data-at-rest encryption (BitLocker)': ['P6'],
  'Data-at-rest encryption (FileVault)': ['P6'],
  'Secure radio': ['P6'],
  'Signal secure messaging': ['P6'],
  'Configuration backup (network appliances)': ['P6'],
  'Microsoft 365 Backup': ['P6'],
  // P8 — physical security
  'Secure datacentre — Bank Street': ['P8'],
  'Secure datacentre — The Castle': ['P8'],
  'Secure datacentre — Shark Point': ['P8'],
  'Secure premises — MIG Official Premises': ['P8'],
  // P4 — plan and exercise
  'Incident response planning and exercises': ['P4'],
  'Incident containment and recovery': ['P4'],
  'Failover to the Castle Vaults DR room': ['P4'],
  // P3 — register
  'Information asset register (CIRKS)': ['P3'],
  'Systems register (CIRKS)': ['P3'],
  'Risk register (CIRKS)': ['P3'],
  // P2 — managed process
  'Information security management (ISMS) process': ['P2'],
  'Information Security Management and Information Risk Knowledge': ['P3'],
  // P1 — governing document (owner, 2026-11-16; solution-library.js)
  'Acceptable Use Policy': ['P1'],
  'Information classification and handling policy': ['P1'],
  'Encryption policy and standard': ['P1'],
  'Backup and recovery policy': ['P1'],
  'Detective monitoring policy': ['P1'],
  'Logging standard': ['P1'],
  'ISMS roles and responsibilities': ['P1'],
  'Access control and account management policy': ['P1'],
  'Network security policy': ['P1'],
  'Vulnerability management policy': ['P1'],
  'Supply chain security policy': ['P1'],
  'Technology and cloud service assessment policy': ['P1'],
  'AI usage policy': ['P1'],
  // §9 of docs/dataset/misty-isles-objective-solutions.md (owner, 2026-11-23)
  'Security awareness programme (KnowBe4)': ['P2'],
  'Role-based security training': ['P2'],
  'Access review': ['P2'],
  'Defined roles and separation': ['P2'],
  'Service account management': ['P2'],
  'Asset return and disposal': ['P2'],
  'Equipment maintenance': ['P2'],
  'Vulnerability report handling': ['P2'],
  'Recovery planning and exercise': ['P4'],
  'Device inventory': ['P3'],
  'Software inventory': ['P3'],
  'Security monitoring coverage': ['P5', NETWORK_ONLY],
  'Network access control (ExtremeCloud IQ Site Engine)': ['P5'],
  // §10 of docs/dataset/misty-isles-objective-solutions.md (owner, 2026-11-23)
  'Incident management process': ['P2'],
  'Account management process': ['P2'],
  'HR security process': ['P2'],
  'Security testing and audit': ['P2'],
  'Change management': ['P2'],
  // §11 — the owner's answers T1–T19 (2026-11-23)
  'Web and email filtering (PAN-OS and Defender)': ['P5'],
  'Email authentication (SPF, DKIM, DMARC)': ['P6'],
  'DNSSEC (GoDaddy)': ['P6'],
  'DDoS protection (Azure and Unsure Networks)': ['P5'],
  'Wireless (ExtremeCloud IQ)': ['P5'],
  'Network services hardening': ['P6'],
  'Secure administration (GlobalProtect with MFA)': ['P5'],
  'Mobile device management (Microsoft Intune)': ['P5'],
  'Mobile device management (Jamf)': ['P5'],
  'Time from Active Directory (GPS source)': ['P6'],
  'Time from PAN-OS (GPS source)': ['P6'],
  'Application logging (Wazuh and syslog)': ['P5'],
  'Central account record (Active Directory and Entra ID)': ['P3'],
  'Application role-based access': ['P6'],
  'OT zero trust isolation': ['P5'],
  'Public certificates (MIG CA Operation Ltd)': ['P5'],
  // P7 — agreement, checked per supplier relationship
  'Provided by the supplier': ['P7'],
};

/** { solution_pattern, slots_not_needed } for a solution, or nulls when it has none. */
function patternFor(name) {
  const [code, notNeeded = []] = MIG_SOLUTION_PATTERNS[name] || [];
  return { solution_pattern: code || null, slots_not_needed: notNeeded };
}

module.exports = { MIG_SOLUTION_PATTERNS, patternFor };
