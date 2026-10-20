// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Central glossary of domain terms surfaced through <InfoTip term="…" />.
//
// One definition per concept, defined once and reused wherever the term
// appears. Keeping them here (rather than inline on each usage) means a term
// reads identically across every page, and gives i18n a single place to
// translate (see the i18n sprint). Keep definitions to 1–2 plain-English
// sentences; the expert/ISO framing goes in the second clause.
export const GLOSSARY = {
  currentRisk: {
    term: 'Current risk',
    definition:
      'The level of risk today, with the controls currently in place. ' +
      'In ISO 27005 terms this is the residual risk under existing treatment.',
  },
  targetRisk: {
    term: 'Target risk',
    definition:
      'The level of risk you expect to reach once the planned actions are complete — ' +
      'the forecast residual risk after treatment.',
  },
  inherentImpact: {
    term: 'Inherent impact',
    definition:
      'The worst-case business harm if the threat occurred, before any controls. ' +
      "It comes from the value of the system's information assets, not from how likely the threat is.",
  },
};
