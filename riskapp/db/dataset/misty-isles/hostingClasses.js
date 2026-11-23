'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// §2 of docs/dataset/misty-isles-architecture.md — the hosting class of every
// Misty Isles system: IT on premises, Azure (AZ), SaaS, OT, infrastructure (INF).
// build.js derives each system's components from it; architecture.js derives
// each system's answers to the membership groups from it.
module.exports = {
  IT: ['Environmental GIS research platform', 'Fisheries management system', 'MIG Corporate Email', 'MIG Desktop (internal)',
       'MIG Desktop (remote)', 'MIG File storage', 'Pupil/student records system', 'Student Desktop', 'Information Security Playbooks',
       'Driver and Vehicle Licensing System', 'Flight information display', 'Emergency Communications System', 'Port operations system',
       'Case Management System', 'Court Management System', 'Criminal Records and Firearms Licensing System', 'Prison Management System',
       'Tax Records System', 'Treasury Accounting System', 'Risk Management System', 'Medical Imaging System', 'Medical Planning System',
       'Medical Records System', 'Pharmacy Inventory System',
       // Added by the owner on CIRKS-dev, October 2026 (OWNER_MODELLING in build.js).
       'Bus Information Displays', 'Tourist Information Points – back end'],
  AZ: ['GIS Land Register', 'Electoral Roll'],
  SAAS: ['IT Support Ticketing System', 'Support Knowledge base', 'MIG Document Management', 'MIG Telephony and Messaging',
         'MIG Video Conferencing', 'Schools facilities management', 'Information Security Management System', 'Flight operations system',
         'MIG Banking System', 'Billing and meter reading', 'HR System', 'Microsoft Defender for Cloud'],
  OT: ['Aircraft fuelling', 'Approach radar', 'Maritime and Aviation Radio Communications System', 'Coastal Radar and Ship Tracking',
       'Power Distribution', 'Power Generation', 'Water Distribution'],
  INF: ['MIG Authentication, Authorisation and Access Control system', 'MIG Backup', 'MIGNet', 'Host Intrusion Detection System',
        'Network Intrusion Detection System', 'Security monitoring platform', 'MIG Remote Access VPN',
        'Vulnerability Scanning System', 'CIRKS'],
  // Systems the IT template's class answers do not fit: what they record is
  // their own (the CCTV system's pattern), or nothing yet (the kiosks). The
  // owner's backlog item: more than one kind of systems architecture template.
  OTHER: ['MIG CCTV system', 'Tourist Information Points – kiosks'],
};
