// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi } from 'vitest';

// Mock the api module so importing the widget never instantiates the axios client.
// buildItems only references these in closures (it does not call them), so empty
// mocks suffice for testing the role → items contract.
vi.mock('../api', () => ({
  getPendingRisks:        vi.fn(),
  getActionStats:         vi.fn(),
  getSiroCyclePending:    vi.fn(),
  getSiroActionPending:   vi.fn(),
  getMyInProgressActions: vi.fn(),
  updateActionProgress:   vi.fn(),
  getAcceptanceQueue:     vi.fn(),
  getMeetings:            vi.fn(),
  getReturnedToMe:        vi.fn(),
}));

const { buildItems } = await import('./MyActionsWidget');

const labels = (role) => buildItems(role).map(i => i.label);

describe('MyActionsWidget buildItems: role → items contract', () => {
  test('ciso gets validation, acceptance and open-items rows', () => {
    const l = labels('ciso');
    expect(l).toContain('Risks awaiting validation');
    expect(l).toContain('Proposed actions awaiting acceptance');
    expect(l).toContain('Remediation items still open');
  });

  test('risk_analyst gets the returned-risks and open-items rows', () => {
    expect(labels('risk_analyst')).toEqual([
      'Risks returned to you — need rework',
      'Remediation items still open',
    ]);
  });

  // Verification is retired: an action completes when its last item does, so no
  // role should be pointed at a verification queue any more.
  test('no role surfaces a verification item', () => {
    const roles = [
      'ciso', 'risk_analyst', 'siro', 'admin', 'meeting_secretary',
      'information_asset_manager', 'information_asset_owner', 'security_consultant',
    ];
    for (const role of roles) {
      expect(labels(role)).not.toContain('Actions awaiting your verification');
      expect(buildItems(role).map(i => i.path)).not.toContain('/verification');
    }
  });

  test('meeting_secretary gets the closed-meetings item', () => {
    expect(labels('meeting_secretary')).toEqual(['Meetings closed — minutes not yet issued']);
  });

  // Regression guard: IAM/IAO/consultant previously had ONLY the retired
  // "System CIA gaps detected" item, which 403-stormed. They must now resolve
  // to an empty list (the widget renders a clean empty state).
  test.each(['information_asset_manager', 'information_asset_owner', 'security_consultant'])(
    '%s gets an empty item list (no 403-storm item)',
    (role) => {
      expect(buildItems(role)).toEqual([]);
    }
  );

  // The retired system-detected-risks feature must not reappear for ANY role.
  test('no role surfaces the retired "System CIA gaps detected" item', () => {
    const roles = [
      'ciso', 'risk_analyst', 'siro', 'admin', 'meeting_secretary',
      'information_asset_manager', 'information_asset_owner', 'security_consultant',
    ];
    for (const role of roles) {
      expect(labels(role)).not.toContain('System CIA gaps detected');
    }
  });
});
