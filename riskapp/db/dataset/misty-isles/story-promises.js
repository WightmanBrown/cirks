// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// What a Misty Isles training instance promises, checked by story-check.js
// against a freshly built instance (CI job "Misty Isles story check").
//
// The application changes independently of the training dataset, and a change
// can quietly stop the story being true without breaking anything: on
// 2026-10-28 the install was found to have mended Approach radar's out-of-date
// Wazuh agents in every build, a problem the walkthrough asks people to find.
// So the story is written down here and checked on every change.
//
// When a check fails, decide consciously: either the change is wrong (fix it),
// or the story has legitimately changed (update this file, and the documents
// that quote it: the dataset README, docs/INSTALL.md, README.md and
// docs/dataset/misty-isles-walkthrough.md, in the same pull request).

module.exports = {
  // The organisation
  counts: {
    departments: { expect: 12, why: 'the twelve departments of the story' },
    people: { expect: 31, why: 'the cast in the walkthrough' },
    systems: { expect: 52, why: 'README, INSTALL.md and the walkthrough say 52' },

    // The risk register
    risks: { expect: 227, why: 'the documents quote 227' },
    risksAtOrAbove12: { expect: 69, why: 'the documents quote 69 at or above the mandatory-action score' },
    awaitingValidation: { expect: 4, why: 'the CISO\'s validation backlog' },
    returned: { expect: 1, why: 'one risk returned to the analyst' },
    identifiedNotAssessed: { expect: 16, why: 'identified exposures deliberately left unassessed' },

    // Security actions
    actions: { expect: 8, why: 'the documents quote 8' },
    actionsAwaitingAcceptance: { expect: 3, why: '"three were deliberately left in the queue" (walkthrough)' },
    actionItemsCompleted: { expect: 2, why: 'work done this year, never on a deliberate problem' },

    // Exceptions, meetings, review cycles
    exceptions: { expect: 5, why: 'the documents quote 5' },
    exceptionsInBreach: { expect: 1, why: 'one lapsed exception in the breach queue' },
    meetings: { expect: 5, why: 'four minuted SWG meetings and the next one planned' },
    meetingsWithMinutes: { expect: 4, why: 'the walkthrough\'s past meetings with issued minutes' },
    reviewCycles: { expect: 4, why: 'four quarterly review cycles' },
    reviewCyclesClosed: { expect: 3, why: 'three closed and signed off, the current one open' },
  },

  // Every deliberate problem is a degraded part with a reason (build.js
  // DEGRADED_PARTS and the sheet's §6). Each must still be degraded, and
  // nothing else may be.
  degradedParts: [
    ['Approach radar', 'Wazuh agent'],
    ['Case Management System', 'ME End-Point Central'],
    ['Case Management System', 'The Castle server room'],
    ['Court Management System', 'ME End-Point Central'],
    ['Criminal Records and Firearms Licensing System', 'OSSEC agent'],
    ['Emergency Communications System', 'ME End-Point Central'],
    ['Environmental GIS research platform', 'ME End-Point Central'],
    ['Fisheries management system', 'ME End-Point Central'],
    ['Flight information display', 'ME End-Point Central'],
    ['Medical Imaging System', 'ME End-Point Central'],
    ['Medical Planning System', 'ME End-Point Central'],
    ['Medical Records System', 'ME End-Point Central'],
    ['MIG Authentication, Authorisation and Access Control system', 'The Castle server room'],
    ['MIG Backup', 'ME End-Point Central'],
    ['MIG Corporate Email', 'MS Exchange 2019'],
    ['MIG Corporate Email', 'The Castle server room'],
    ['MIG Desktop (internal)', 'ME End-Point Central'],
    ['MIG Desktop (remote)', 'ME End-Point Central'],
    ['MIG File storage', 'The Castle server room'],
    ['MIG Remote Access VPN', 'PaloAlto GlobalProtect gateway'],
    ['Pharmacy Inventory System', 'ME End-Point Central'],
    ['Port operations system', 'ME End-Point Central'],
    ['Power Generation', 'ME End-Point Central'],
    ['Prison Management System', 'Microsoft Access'],
    ['Prison Management System', 'The Castle server room'],
    ['Prison Management System', 'Windows 7'],
    ['Pupil/student records system', 'ME End-Point Central'],
    ['Risk Management System', 'ME End-Point Central'],
    ['Security monitoring platform', 'ME End-Point Central'],
    ['Student Desktop', 'Crowdstrike Falcon Agent'],
    ['Tax Records System', 'ME End-Point Central'],
    ['Treasury Accounting System', 'ME End-Point Central'],
    ['Water Distribution', 'ME End-Point Central'],
    ['Water Distribution', 'Veeam Backup'],
  ],

  // Named facts the walkthrough's exercises depend on.
  facts: [
    { what: 'The Prison Management System\'s unpatched-vulnerability risk is accepted by an active exception',
      why: 'walkthrough: the Windows 7 exception (IAO, exercises)',
      sql: `SELECT count(*)::int AS n FROM exceptions e JOIN risks r ON r.id = e.risk_id
              JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
             WHERE s.name = 'Prison Management System' AND t.name = 'Exploitation of an unpatched vulnerability'
               AND e.status::text = 'active'`, expect: 1 },
    { what: 'Student Desktop\'s malware exception has lapsed',
      why: 'walkthrough: the exception in breach (CISO, SIRO, exercises)',
      sql: `SELECT count(*)::int AS n FROM exceptions e JOIN risks r ON r.id = e.risk_id
              JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
             WHERE s.name = 'Student Desktop' AND t.name = 'Malware infection' AND e.status::text = 'expired'`, expect: 1 },
    { what: 'Water Distribution\'s ransomware risk has an action waiting in the Acceptance Queue',
      why: 'walkthrough §6, step 5: the CISO accepts it',
      sql: `SELECT count(*)::int AS n FROM security_actions a
              JOIN security_action_risks sar ON sar.action_id = a.id JOIN risks r ON r.id = sar.risk_id
              JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
             WHERE s.name = 'Water Distribution' AND t.name = 'Ransomware' AND a.accepted_at IS NULL`, expect: 1 },
    { what: 'Super Bill\'s supplier assurance reads expired',
      why: 'walkthrough exercises: the expired SOC 2 report',
      sql: `SELECT count(*)::int AS n FROM v_supplier_assurance_findings
             WHERE supplier_name = 'Super Bill' AND reason = 'expired'`, expect: 1 },
    { what: 'PeopleFirst HR\'s supplier assurance reads partial',
      why: 'walkthrough exercises: the contract with no exit terms',
      sql: `SELECT count(*)::int AS n FROM v_supplier_assurance_findings
             WHERE supplier_name = 'PeopleFirst HR' AND reason = 'partial'`, expect: 1 },
  ],
};
