// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Test fixtures: P5 as GET /controls/solution-patterns returns it, and CrowdStrike
// EDR's fit against it in Misty Isles (no policy, the agent degraded on one system).
export const P5 = {
  code: 'P5', name: 'Central security service', solutions: 20,
  why: 'Protects many systems consistently with one capability.',
  example: { name: 'Endpoint detection and response', parts: { security_system: 'The EDR service', team: 'The security operations team', on_system: 'The agent on each laptop', policy: 'The Endpoint Protection Standard' } },
  summary: 'A security system does the work centrally.', complete_when: 'every part is in place',
  slots: [
    { key: 'security_system', label: 'Security system', kind: 'Technology · security system', hint: 'the central service', position: 'centre', required: true },
    { key: 'team', label: 'Team that runs it', kind: 'People · team', hint: 'operates it', position: 'left', required: true, arrow: { dir: 'in', label: 'runs' } },
    { key: 'on_system', label: 'Part on the system', kind: 'Technology · on each system', hint: 'an agent', position: 'right', required: true, arrow: { dir: 'in', label: 'reports to' } },
    { key: 'policy', label: 'Policy', kind: 'Information · document', hint: 'says how it is configured', position: 'top', required: true, arrow: { dir: 'in', label: 'defines its configuration' } },
  ],
};

export const EDR_FIT = {
  pattern: 'P5', state: 'incomplete', missing: ['Policy'], also: [{ id: 'p4', name: 'Detective Monitoring' }],
  slots: [
    { key: 'security_system', label: 'Security system', required: true, state: 'complete', parts: [{ id: 'p2', name: 'Crowdstrike SaaS', degraded_on: 0, stated: false }] },
    { key: 'team', label: 'Team that runs it', required: true, state: 'complete', parts: [{ id: 'p3', name: 'InfoSec Team', degraded_on: 0, stated: false }] },
    { key: 'on_system', label: 'Part on the system', required: true, state: 'degraded', parts: [{ id: 'p1', name: 'Crowdstrike Falcon Agent', degraded_on: 1, stated: false }] },
    { key: 'policy', label: 'Policy', required: true, state: 'missing', parts: [] },
  ],
};
