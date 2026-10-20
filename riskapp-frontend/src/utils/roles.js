// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// One source for role display names. There were two — RiskCreateModal and
// UserManagementWidget each carried their own map, and they disagreed
// ("Security Consultant" vs "Sec. Consultant"). A third was about to appear.
//
// `soc_analyst`, `ai_agent` and `soc_integration` are here because they exist as
// roles even though none is assignable through the user-management UI; a person
// picker that meets one must still be able to name it rather than printing the
// raw enum. soc_integration is a MACHINE identity — only an API key ever holds
// it (v111), and it answers enrichment questions and nothing else.

export const ROLE_LABELS = {
  admin:                     'Admin',
  ciso:                      'CISO',
  risk_analyst:              'Risk Analyst',
  information_asset_manager: 'IAM',
  information_asset_owner:   'IAO',
  security_consultant:       'Sec. Consultant',
  siro:                      'SIRO',
  meeting_secretary:         'Secretary',
  soc_analyst:               'SOC Analyst',
  security_architect:        'Security Architect',
  ai_agent:                  'AI Agent',
  soc_integration:           'SOC Integration (machine)',
};

// Falls back to the raw value rather than to a blank: an unrecognised role is a
// data problem, and showing it is how anyone finds out.
export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '—';
}

// How a person is named wherever one is assigned. The brief: it must be
// possible to tell who someone is — their role and their department — without
// cross-referencing another screen.
//
//   "Grace Hopper — IAO, Misty Isles Department of Health"
//
// Department comes second because within one department every option repeats
// it, so the role is the discriminating part and belongs nearer the name.
export function personLabel(user) {
  if (!user) return '—';
  const bits = [roleLabel(user.role)];
  if (user.department_name) bits.push(user.department_name);
  return `${user.full_name} — ${bits.join(', ')}`;
}
