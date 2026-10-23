'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS as a security solution (owner, 2026-10-23). CIRKS itself is the solution,
// or part of it, for some control objectives: GV.SC-04 asks that suppliers be
// known and prioritised by criticality, and the supplier register with its
// derived criticality does exactly that.
//
// This list is a fact about the PRODUCT, so it lives in the code and changes with
// a release; it is not organisation data. Nothing here makes any objective
// delivered or met. An organisation CHOOSES CIRKS for an objective, one at a time,
// on the objective's page (POST /controls/:id/patterns/cirks): the first choice
// creates the CIRKS component and security solution, as the person choosing, and
// each choice is audited. The SoA still says whether the objective is
// implemented: CIRKS being installed is not CIRKS being used.
//
// Keyed by NIST CSF 2.0 subcategory. Each reason says what in CIRKS does the
// work, so the person choosing can see what is being claimed.

const CIRKS_NAME = 'CIRKS';
const CIRKS_STANDARD = 'nist_csf';

const CIRKS_DELIVERS = {
  'GV.SC-04': 'The supplier register records every supplier relationship, and derives each one\'s criticality from the impact of the systems it touches.',
  'GV.SC-07': 'Each supplier relationship carries the control objectives expected of it, the assurance evidence that meets them, and a finding when evidence is missing or has expired.',
  'ID.AM-04': 'The supplier register records what each supplier provides: the system it hosts or operates, or the component it supplies.',
  'ID.AM-05': 'Information assets are rated against impact tables, and each system\'s and business service\'s impact is derived from them.',
  'ID.AM-07': 'The information asset register records each asset with its owner, manager, the systems holding it, and its impact ratings.',
  'ID.RA-04': 'Each risk records the threat against a system, its likelihood, and the impact derived from the information the system holds.',
  'ID.RA-05': 'Risk scores combine threat likelihood, the controls in place and derived impact, and order the register for response.',
  'ID.RA-06': 'Security actions record the chosen response to each risk, its owner and progress; exceptions record accepted risks.',
  'ID.RA-07': 'Exceptions record each accepted risk or finding with its reason, who accepted it and until when, and lapse when they expire.',
  'GV.RM-06': 'CIRKS applies one method to every risk: the same impact tables, likelihood scale and scoring, documented in its guides.',
  'GV.OV-03': 'Security working group meetings review the risk register, actions and findings, and their decisions are minuted.',
};

const CIRKS_COMPONENT_DESCRIPTION =
  'CIRKS, the information risk system: the registers of information assets, systems, suppliers and risks, and the security actions and exceptions that answer them.';
const CIRKS_SOLUTION_NOTES =
  'CIRKS itself, used as the record for the control objectives it delivers. Chosen objective by objective.';

// The reason CIRKS can deliver this objective, given its standard references, or null.
function cirksReasonFor(standardRefs) {
  for (const r of standardRefs || []) {
    if (r.standard === CIRKS_STANDARD && CIRKS_DELIVERS[r.ref]) return { ref: r.ref, reason: CIRKS_DELIVERS[r.ref] };
  }
  return null;
}

module.exports = { CIRKS_NAME, CIRKS_STANDARD, CIRKS_DELIVERS, CIRKS_COMPONENT_DESCRIPTION, CIRKS_SOLUTION_NOTES, cirksReasonFor };
