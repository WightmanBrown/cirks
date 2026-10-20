// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Fixed identifiers from the deterministic seed (riskapp/test/e2e/db/seed.sql).
// Keep in sync with that file — specs reference these by name, never by literal.

export const PASSWORD = 'Riskapp123';

export const USERS = {
  admin:      { email: 'admin@org.local',              id: '11111111-0000-0000-0000-000000000001', role: 'admin' },
  ciso:       { email: 'ciso@org.local',               id: '11111111-0000-0000-0000-000000000002', role: 'ciso' },
  analyst:    { email: 'risk.analyst@org.local',       id: '11111111-0000-0000-0000-000000000003', role: 'risk_analyst' },
  iam:        { email: 'iam.it@org.local',             id: '11111111-0000-0000-0000-000000000004', role: 'information_asset_manager' },
  business:   { email: 'business.user.it@org.local',   id: '11111111-0000-0000-0000-000000000005', role: 'information_asset_owner' },
  consultant: { email: 'security.consultant@org.local',id: '11111111-0000-0000-0000-000000000006', role: 'security_consultant' },
  siro:       { email: 'siro@org.local',               id: '11111111-0000-0000-0000-000000000007', role: 'siro' },
  secretary:  { email: 'meeting.secretary@org.local',  id: '11111111-0000-0000-0000-000000000008', role: 'meeting_secretary' },
};

export const RISKS = {
  pending:     '66666666-0000-0000-0000-000000000001', // critical, awaiting CISO validation
  validatedA:  '66666666-0000-0000-0000-000000000002', // hosts in_progress + completed actions
  validatedB:  '66666666-0000-0000-0000-000000000003', // hosts proposed + planned + verified actions
};

export const ACTIONS = {
  proposed:    '77777777-0000-0000-0000-000000000001',
  planned:     '77777777-0000-0000-0000-000000000002',
  inProgress:  '77777777-0000-0000-0000-000000000003',
  completed:   '77777777-0000-0000-0000-000000000004',
  verified:    '77777777-0000-0000-0000-000000000005',
};

export const CYCLES = {
  draft:        '88888888-0000-0000-0000-000000000001', // available for plan-meeting flow
  active:       '88888888-0000-0000-0000-000000000002', // linked to the open meeting
  minutesCycle: '88888888-0000-0000-0000-000000000003', // linked to the closed meeting
};

export const MEETINGS = {
  open:           '99999999-0000-0000-0000-000000000001', // planned, not closed
  closedUnissued: '99999999-0000-0000-0000-000000000002', // closed, minutes not issued
};
