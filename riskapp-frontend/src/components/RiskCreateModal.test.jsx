// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { gapSignature } from './RiskCreateModal';

// The signature decides whether the wizard copies a rationale onto another
// system or asks the analyst to write a fresh one. A wrong "same gap" produces a
// rationale that does not describe the system it landed on — which is a false
// entry in the register, not a typo.

const ctl = (o = {}) => ({ id: 'ctl-1', on_system: true, system_status: 'operational', components: [], ...o });
const cmp = (o = {}) => ({ id: 'cmp-1', on_system: true, system_status: 'operational', ...o });
const sig = (...controls) => gapSignature({ controls });

describe('gapSignature', () => {
  it('is empty when everything is operational — nothing to explain', () => {
    expect(sig(ctl({ components: [cmp()] }))).toBe('');
  });

  it('is stable regardless of the order controls arrive in', () => {
    const a = ctl({ id: 'a', on_system: false });
    const b = ctl({ id: 'b', system_status: 'degraded' });
    expect(sig(a, b)).toBe(sig(b, a));
  });

  // The reason this was rewritten: `enterprise_status` is the catalogue default,
  // not the per-system health. Six component rows on CIRKS-test were degraded or
  // missing on a system while the catalogue called them operational, so two
  // materially different systems signed identically.
  it('counts a component that is degraded ON THIS SYSTEM, whatever the catalogue says', () => {
    const healthy  = ctl({ components: [cmp({ enterprise_status: 'operational' })] });
    const degraded = ctl({ components: [cmp({ enterprise_status: 'operational', system_status: 'degraded' })] });
    expect(sig(degraded)).not.toBe(sig(healthy));
  });

  it('does not count a component the catalogue dislikes but this system runs fine', () => {
    expect(sig(ctl({ components: [cmp({ enterprise_status: 'deprecated' })] }))).toBe('');
  });

  // Different work, so it must not read as the same gap.
  it('separates a DEGRADED control from a MISSING one', () => {
    expect(sig(ctl({ system_status: 'degraded' }))).not.toBe(sig(ctl({ on_system: false })));
  });

  it('counts a missing component under a control that is otherwise working', () => {
    expect(sig(ctl({ components: [cmp({ on_system: false })] }))).not.toBe('');
  });

  it('treats an excluded control as settled, not as a gap to explain', () => {
    expect(sig(ctl({ system_status: 'not_applicable' }))).toBe('');
  });

  it('matches two systems whose gaps really are identical', () => {
    const shape = () => ctl({ id: 'x', on_system: false, components: [cmp({ id: 'y', on_system: false })] });
    expect(sig(shape())).toBe(sig(shape()));
  });

  it('is empty for no gap payload at all', () => {
    expect(gapSignature(null)).toBe('');
  });
});
