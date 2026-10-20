// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { mayCompleteItem } from './itemCompletion';

const OWNER = 'owner-uuid';
const base = {
  actionStatus: 'in_progress',
  itemStatus: 'pending',
  role: 'information_asset_owner',
  userId: OWNER,
  systemOwnerUserId: OWNER,
};

describe('mayCompleteItem', () => {
  // The regression this whole change exists for: the server allows the system
  // owner, the UI gated on canEdit (ciso/admin/analyst) and hid the button.
  it('allows the system owner even with no privileged role', () => {
    expect(mayCompleteItem(base)).toBe(true);
  });

  it.each(['ciso', 'risk_analyst', 'admin'])('allows %s regardless of ownership', (role) => {
    expect(mayCompleteItem({ ...base, role, userId: 'someone-else', systemOwnerUserId: OWNER }))
      .toBe(true);
  });

  it('refuses an unprivileged user who does not own the system', () => {
    expect(mayCompleteItem({ ...base, userId: 'someone-else' })).toBe(false);
  });

  // Two missing ids must not read as a match — the failure mode that would hand
  // the affordance to every viewer on a system with no recorded owner.
  it('refuses when neither the viewer nor the system owner is known', () => {
    expect(mayCompleteItem({ ...base, userId: undefined, systemOwnerUserId: undefined }))
      .toBe(false);
    expect(mayCompleteItem({ ...base, userId: null, systemOwnerUserId: null })).toBe(false);
  });

  it('refuses when the system has no recorded owner', () => {
    expect(mayCompleteItem({ ...base, systemOwnerUserId: null })).toBe(false);
  });

  it.each(['proposed', 'completed', 'cancelled'])(
    'refuses while the action is %s — items need acceptance first', (actionStatus) => {
      expect(mayCompleteItem({ ...base, actionStatus, role: 'ciso' })).toBe(false);
    });

  it('refuses an already-completed item', () => {
    expect(mayCompleteItem({ ...base, itemStatus: 'completed', role: 'ciso' })).toBe(false);
  });
});
