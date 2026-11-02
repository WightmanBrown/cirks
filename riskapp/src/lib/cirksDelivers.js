'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS as a security solution (owner, 2026-10-23). CIRKS itself is the solution,
// or part of it, for some control objectives: one asks that suppliers be
// known, recorded and prioritised by criticality, and the supplier register with its
// derived criticality does exactly that (CIRKS1.SCM-02 Suppliers are recorded).
//
// This list is a fact about the PRODUCT, so it lives in the code and changes with
// a release; it is not organisation data. Nothing here makes any objective
// delivered or met. An organisation CHOOSES CIRKS for an objective, one at a time,
// on the objective's page (POST /controls/:id/patterns/cirks): the first choice
// creates the CIRKS component and security solution, as the person choosing, and
// each choice is audited. The SoA still says whether the objective is
// implemented: CIRKS being installed is not CIRKS being used.
//
// Keyed by the CIRKS objective (v1.1): the library CIRKS ships. Chosen by what
// each objective MEANS, not by the NIST primaries the dataset uses: CIRKS records
// exceptions (IRM-08 Risk acceptance), it does not control configuration change.
// Each reason says what in CIRKS does the work, so the person choosing can see
// what is being claimed.

const CIRKS_NAME = 'CIRKS';
const CIRKS_OWN_REF = /^CIRKS[0-9]+\.[A-Z]+-[0-9]{2}$/;

const CIRKS_DELIVERS = {
  'CIRKS1.SCM-02': 'The supplier register records every supplier relationship and what it provides (the system it hosts or operates, or the component it supplies), and derives each one\'s criticality from the impact of the systems it touches.',
  'CIRKS1.SCM-05': 'Each supplier relationship carries the control objectives expected of it, the assurance evidence that meets them, and a finding when evidence is missing or has expired.',
  'CIRKS1.EST-01': 'The information asset register records each asset with its owner, manager, the systems holding it, and its impact ratings against the impact tables.',
  'CIRKS1.RAST-01': 'Each risk records the threat against a system, its likelihood, and the impact derived from the information the system holds.',
  'CIRKS1.IRM-01': 'CIRKS applies one method to every risk: the same impact tables, likelihood scale and scoring, documented in its guides.',
  'CIRKS1.IRM-04': 'Risk scores combine threat likelihood, the controls in place and derived impact, and order the register for response.',
  'CIRKS1.IRM-05': 'Security actions record the chosen response to each risk, its owner and progress.',
  'CIRKS1.IRM-08': 'Exceptions record each accepted risk or finding with its reason, who accepted it and until when, and lapse when they expire.',
  'CIRKS1.IRM-09': 'Security working group meetings review the risk register, actions and findings, and their decisions are minuted.',
};

// An install whose library is still NIST CSF (before v1.1): the same offers, by
// NIST subcategory. Used ONLY for an objective with no CIRKS reference of its own.
const CIRKS_STANDARD = 'nist_csf';
const NIST_DELIVERS = {
  'GV.SC-04': CIRKS_DELIVERS['CIRKS1.SCM-02'],
  'ID.AM-04': CIRKS_DELIVERS['CIRKS1.SCM-02'],
  'GV.SC-07': CIRKS_DELIVERS['CIRKS1.SCM-05'],
  'ID.AM-05': CIRKS_DELIVERS['CIRKS1.EST-01'],
  'ID.AM-07': CIRKS_DELIVERS['CIRKS1.EST-01'],
  'ID.RA-04': CIRKS_DELIVERS['CIRKS1.RAST-01'],
  'GV.RM-06': CIRKS_DELIVERS['CIRKS1.IRM-01'],
  'ID.RA-05': CIRKS_DELIVERS['CIRKS1.IRM-04'],
  'ID.RA-06': CIRKS_DELIVERS['CIRKS1.IRM-05'],
  'ID.RA-07': CIRKS_DELIVERS['CIRKS1.IRM-08'],
  'GV.OV-03': CIRKS_DELIVERS['CIRKS1.IRM-09'],
};

const CIRKS_COMPONENT_DESCRIPTION =
  'CIRKS, the information risk system: the registers of information assets, systems, suppliers and risks, and the security actions and exceptions that answer them.';
const CIRKS_SOLUTION_NOTES =
  'CIRKS itself, used as the record for the control objectives it delivers. Chosen objective by objective.';

// The reason CIRKS can deliver this objective, or null. A CIRKS objective is
// matched by its own reference and nothing else; any other objective by its NIST
// CSF mapping, for an install whose library is still NIST.
function cirksReasonFor(standardRefs, referenceCode = null) {
  if (referenceCode && CIRKS_OWN_REF.test(referenceCode)) {
    return CIRKS_DELIVERS[referenceCode] ? { ref: referenceCode, reason: CIRKS_DELIVERS[referenceCode] } : null;
  }
  for (const r of standardRefs || []) {
    if (r.standard === CIRKS_STANDARD && NIST_DELIVERS[r.ref]) return { ref: r.ref, reason: NIST_DELIVERS[r.ref] };
  }
  return null;
}

module.exports = { CIRKS_NAME, CIRKS_STANDARD, CIRKS_DELIVERS, NIST_DELIVERS, CIRKS_COMPONENT_DESCRIPTION, CIRKS_SOLUTION_NOTES, cirksReasonFor };
