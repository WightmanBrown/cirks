'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles: the system pattern each business system follows (v177,
// src/lib/systemPatterns.js), found by reading the 49 business systems and shown
// to the owner in the mock-up of 2026-11-10, which the owner agreed the same day
// (CCTV and the kiosks are dedicated equipment; the Microsoft 365 services are
// a variant of S2; the playbooks are a document record). On 2026-11-18 the
// applications followed the cloud service models (v181) and the owner moved the
// two Azure servers from S1 to S7, application on cloud infrastructure (IaaS). architecture.js sets them through the API.
//
// [pattern, { slot: component recorded on the system that fills it }]. Only the
// slots no membership group answers are named here: the application, the
// service, the control system. Where none is recorded the slot is left empty on
// purpose — an optional application shows as not recorded, a required service
// or control system as a gap (Billing, the ISMS, the radio system, the kiosks).
// Security systems have no pattern here: they are asked every group, as before.

const SYSTEM_PATTERNS = {
  // S7 — application on cloud infrastructure (IaaS): Azure virtual servers; the
  // cloud provider (Microsoft) is a supplier relationship on each.
  'Electoral Roll': ['S7'],
  'GIS Land Register': ['S7'],

  // S1 — application on premises
  'Bus Information Displays': ['S1'],
  'Case Management System': ['S1', { application: 'ITsafaircop' }],
  'Court Management System': ['S1', { application: 'Bantorights' }],
  'Criminal Records and Firearms Licensing System': ['S1'],
  'Driver and Vehicle Licensing System': ['S1'],
  'Emergency Communications System': ['S1', { application: 'Plotnet Secure Radio' }],
  'Environmental GIS research platform': ['S1', { application: 'ArcGIS' }],
  'Fisheries management system': ['S1'],
  'Flight information display': ['S1', { application: 'SITA AirportVision Evolved' }],
  'Medical Imaging System': ['S1', { application: 'Bahmni radiology integration' }],
  'Medical Planning System': ['S1', { application: 'Bahmni Appointment Scheduling module' }],
  'Medical Records System': ['S1', { application: 'OpenMRS' }],
  'MIG Corporate Email': ['S1', { application: 'MS Exchange 2019' }],
  'MIG File storage': ['S1'],
  'Pharmacy Inventory System': ['S1', { application: 'Bahmni Pharmacy' }],
  'Port operations system': ['S1', { application: 'Open-TOS' }],
  'Prison Management System': ['S1', { application: 'Microsoft Access' }],
  'Pupil/student records system': ['S1', { application: 'Gibbon SMS' }],
  'Risk Management System': ['S1', { application: 'CIRKS Platform' }],
  'Tax Records System': ['S1', { application: 'DataTorque RMS' }],
  'Tourist Information Points – back end': ['S1'],
  'Treasury Accounting System': ['S1', { application: 'Sage accounting' }],

  // S2 — supplier-run service (the two Microsoft 365 services are its own-tenancy variant)
  'Billing and meter reading': ['S2'],
  'Flight operations system': ['S2', { service: 'SkyPlan Ops' }],
  'HR System': ['S2', { service: 'PeopleFirst HR' }],
  'Information Security Management System': ['S2'],
  'IT Support Ticketing System': ['S2', { service: 'Helix ServiceDesk' }],
  'MIG Banking System': ['S2', { service: 'Island Mutual online banking' }],
  'MIG Document Management': ['S2', { service: 'Microsoft Sharepoint' }],
  'MIG Telephony and Messaging': ['S2', { service: 'MS Teams client' }],
  'MIG Video Conferencing': ['S2', { service: 'MS Teams On-line SaaS' }],
  'Schools facilities management': ['S2', { service: 'FacilityFlow' }],
  'Support Knowledge base': ['S2', { service: 'Helix ServiceDesk' }],

  // S3 — dedicated equipment
  'Aircraft fuelling': ['S3', { control_system: 'Shell Aviation FCS' }],
  'Approach radar': ['S3', { control_system: 'Thales STAR NG' }],
  'Coastal Radar and Ship Tracking': ['S3', { control_system: 'SCANTER' }],
  'Maritime and Aviation Radio Communications System': ['S3'],
  'MIG CCTV system': ['S3', { control_system: 'MIG CCTV system' }],
  'Power Distribution': ['S3', { control_system: 'ABB Switching and protection' }],
  'Power Generation': ['S3', { control_system: 'Wartsila Control' }],
  'Tourist Information Points – kiosks': ['S3'],
  'Water Distribution': ['S3', { control_system: 'Seven Seas Control Desk' }],

  // S4 — end-user device
  'MIG Desktop (internal)': ['S4', { applications: 'Microsoft 365 Apps' }],
  'MIG Desktop (remote)': ['S4', { applications: 'Microsoft 365 Apps' }],
  'Student Desktop': ['S4'],

  // S5 — network infrastructure
  MIGNet: ['S5', { equipment: ['Core Switch 1', 'Core Switch 2', 'Core Switch 3', 'Core Switch 4'],
                   management: 'ExtremeCloud IQ Site Engine' }],

  // S6 — document record. The printed playbooks are recorded as a document; who
  // owns them and the register of copies are not recorded (two honest gaps).
  'Information Security Playbooks': ['S6', { document: 'Information Security Playbooks (printed)' }],
};

// The document the playbooks are, created by architecture.js if missing.
const PLAYBOOKS_DOCUMENT = {
  name: 'Information Security Playbooks (printed)',
  description: 'The printed incident response playbooks, kept in the Castle Vaults DR room and the Crow\'s Nest Disaster Management Centre for use when systems are down.',
};

/** [pattern code, { slot: [component names] }] for a system, or null. */
function systemPatternFor(name) {
  const e = SYSTEM_PATTERNS[name];
  if (!e) return null;
  const slots = Object.fromEntries(Object.entries(e[1] || {}).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  return { system_pattern: e[0], slots };
}

module.exports = { SYSTEM_PATTERNS, PLAYBOOKS_DOCUMENT, systemPatternFor };
