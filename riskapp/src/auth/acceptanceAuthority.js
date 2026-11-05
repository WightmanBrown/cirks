'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Authority ladder for accepting a risk at a given score. Roles not listed
// cannot accept at all. Numeric acceptance authority (numbers-only banding):
// ciso/siro/admin may accept any risk; information_asset_owner up to
// exception_accept_owner_max; risk_analyst up to exception_accept_analyst_max.
// Caps are scores (1–25) read from org_config.
//
// security_consultant is phase-dependent (v75): while the org is in SETUP
// (org_config.setup_phase_active), the consultant stands up the initial risk
// picture and may accept any risk; once a consultant moves the org to
// OPERATIONAL (one-way), the consultant is capped at the same authority as a
// risk_analyst. See [[project-risk-treatment-policy]].
//
// Shared by the risk routes (which enforce it) and the SIRO report (which shows
// whether each acceptance in force is still within its accepter's authority).
function canAcceptRiskAtScore(score, role, analystMax, ownerMax, setupPhaseActive = false) {
  switch (role) {
    case 'ciso':
    case 'siro':
    case 'admin':
      return true;
    case 'security_consultant':
      return setupPhaseActive ? true : score <= analystMax;
    case 'information_asset_owner':
      return score <= ownerMax;
    case 'risk_analyst':
      return score <= analystMax;
    default:
      return false;
  }
}

module.exports = { canAcceptRiskAtScore };
