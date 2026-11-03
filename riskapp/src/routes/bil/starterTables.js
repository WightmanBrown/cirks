'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CIRKS starter impact tables (owner, 2026-11-02): six organisation-wide
// areas of harm most organisations rate against, each with five levels.
//
// The wording is QUALITATIVE and relative to the organisation, never a figure:
// "a loss a single team absorbs", not "up to £10,000". A figure is the
// organisation's own decision, and a plausible one shipped as a default would be
// a placeholder that looks like an answer. Each table is created UNPUBLISHED, so
// nothing can be rated against it until someone has read it, added their own
// thresholds where they want them, and published it.
//
// The same statement serves C, I and A at each level, as in the Misty Isles
// tables: the level describes the harm, whichever property was lost.

const STARTER_TABLES = [
  {
    name: 'Financial loss',
    description: 'Money lost, spent or put at risk: lost revenue, fraud, recovery costs, fines and compensation.',
    levels: [
      'A loss a single team absorbs within its own budget.',
      'A loss that needs a budget holder above the team to cover it.',
      'A loss that changes a department\'s plans for the year or needs senior approval to meet.',
      'A loss that changes the organisation\'s plans for the year or its reported results.',
      'A loss that threatens the organisation\'s solvency or its ability to keep operating.',
    ],
  },
  {
    name: 'Reputation and trust',
    description: 'How customers, the public, partners and regulators see the organisation.',
    levels: [
      'Noticed by a few people; no complaint is made and nothing is reported.',
      'Complaints or local attention, handled in the normal way.',
      'Sustained attention in the organisation\'s sector or region; partners or customers ask questions.',
      'National attention; the organisation\'s leadership must respond publicly and some customers or partners leave.',
      'Lasting loss of public trust; leadership changes or the organisation\'s licence to operate is questioned.',
    ],
  },
  {
    name: 'Legal and regulatory',
    description: 'Breaches of law, regulation or contract, and what follows from them.',
    levels: [
      'A minor technical breach, corrected without any external party being involved.',
      'A breach that must be recorded or reported but leads to no action against the organisation.',
      'A regulator or counterparty acts: a warning, an enforcement notice or a contractual claim.',
      'Significant penalties, litigation or restrictions placed on how the organisation operates.',
      'Prosecution of the organisation or its officers, or loss of a licence the organisation needs to operate.',
    ],
  },
  {
    name: 'Service delivery',
    description: 'The organisation\'s ability to deliver its services and meet its commitments.',
    levels: [
      'A service is degraded briefly; nobody outside the team notices.',
      'A service is unavailable or wrong for a short time; some users are affected and workarounds exist.',
      'An important service fails for long enough to miss commitments to customers or the public.',
      'Several important services fail, or one fails for long enough to cause serious harm to those who rely on it.',
      'The organisation cannot deliver its core services for an extended period.',
    ],
  },
  {
    name: 'Personal data and privacy',
    description: 'Harm to people whose personal data the organisation holds.',
    levels: [
      'Personal data of one or a few people is exposed or wrong, with no realistic harm to them.',
      'Personal data of a small group is affected; distress or inconvenience is possible.',
      'Personal data of many people, or sensitive data of a few, is affected; real harm to some is likely.',
      'Sensitive personal data of many people is affected, or serious harm to individuals is likely.',
      'Large-scale exposure of sensitive personal data, or harm to individuals that cannot be undone.',
    ],
  },
  {
    name: 'Health and safety',
    description: 'Physical harm to staff, customers or the public.',
    levels: [
      'No injury; a near miss at most.',
      'Minor injury needing first aid.',
      'Injury needing medical treatment, or harm to several people.',
      'Serious injury, or harm to many people.',
      'Loss of life.',
    ],
  },
];

module.exports = { STARTER_TABLES };
