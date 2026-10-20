// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import {
  buildNarrative, itemNarrative, noteNarrative, personLabel, roleLabel,
} from './actionNarrative';

const item = (over = {}) => ({
  id: 'i1', element_type: 'control', change_kind: 'control_add', status: 'pending',
  label: 'Backups of data are created, protected, maintained, and tested',
  framework_ref: 'PR.DS-11',
  system: { id: 's1', name: 'Power Generation' },
  owner: { user_id: 'u1', name: 'Edwina Lectric', role: 'information_asset_owner' },
  target: { c: 2, i: 2, a: 2 },
  confirmed: null,
  comment: 'Currently missing on this system.',
  completed_by: null, completed_at: null,
  ...over,
});

describe('roleLabel / personLabel', () => {
  it('renders a role as a human title', () => {
    expect(roleLabel('information_asset_owner')).toBe('Information Asset Owner');
    expect(roleLabel('ciso')).toBe('CISO');
  });

  it('falls back to a de-underscored role it does not know', () => {
    expect(roleLabel('some_new_role')).toBe('some new role');
  });

  it('names the person and the role they act in', () => {
    expect(personLabel({ name: 'Edwina Lectric', role: 'information_asset_owner' }))
      .toBe('Edwina Lectric (Information Asset Owner)');
  });

  it('degrades to the bare name, then to nothing', () => {
    expect(personLabel({ name: 'Edwina Lectric' })).toBe('Edwina Lectric');
    expect(personLabel(null)).toBeNull();
    expect(personLabel({})).toBeNull();
  });
});

describe('itemNarrative', () => {
  it('states the change, the element and the system in one sentence', () => {
    expect(itemNarrative(item()).headline)
      .toBe('Add the control “PR.DS-11 — Backups of data are created, protected, maintained, and tested” on Power Generation.');
  });

  it('carries the rationale that was recorded at build time', () => {
    expect(itemNarrative(item()).rationale).toBe('Currently missing on this system.');
    expect(itemNarrative(item({ comment: '   ' })).rationale).toBeNull();
  });

  // The distinction an auditor cares about: what was planned vs what was accepted
  // as the outcome. The residual is editable at completion, so they can differ.
  it('keeps the planned target and the confirmed residual apart', () => {
    const n = itemNarrative(item({
      status: 'completed',
      confirmed: { c: 3, i: 3, a: 3 },
      completed_by: { name: 'Rosalind Franklin', role: 'information_asset_manager' },
      completed_at: '2026-08-11T12:57:50Z',
    }));
    expect(n.target).toBe('2/2/2');
    expect(n.confirmed).toBe('3/3/3');
    expect(n.completion).toEqual({
      by: 'Rosalind Franklin (Information Asset Manager)',
      on: '11 August 2026',
    });
  });

  it('records completion even when the actor was not captured', () => {
    const n = itemNarrative(item({ status: 'completed', completed_at: '2026-08-11T12:00:00Z' }));
    expect(n.completion.by).toBe('an unrecorded user');
  });
});

describe('buildNarrative', () => {
  const action = (over = {}) => ({
    title: 'Treat “Ransomware” on Power Generation',
    status: 'in_progress',
    owner_name: 'Edwina Lectric', owner_role: 'information_asset_owner',
    accepted_at: '2026-08-11T12:57:50Z', accepted_by_name: 'Ada Lovelace',
    target_date: null,
    items: [item(), item({ id: 'i2', status: 'completed', completed_at: '2026-08-12T09:00:00Z' })],
    risks: [{
      risk_id: 'r1', threat_name: 'Ransomware', system_name: 'Power Generation',
      department: 'Misty Islands Utilities', risk_score: 25,
      baseline_risk_score: 25, baseline_risk_c: 12, baseline_risk_i: 25, baseline_risk_a: 25,
    }],
    ...over,
  });

  it('summarises the action and counts its items', () => {
    const n = buildNarrative(action());
    expect(n.summary.itemsTotal).toBe(2);
    expect(n.summary.itemsDone).toBe(1);
    expect(n.summary.accepted).toEqual({ by: 'Ada Lovelace (CISO)', on: '11 August 2026' });
    expect(n.summary.owner).toBe('Edwina Lectric (Information Asset Owner)');
  });

  it('reports the accept-time baseline beside the current score', () => {
    const [r] = buildNarrative(action()).risks;
    expect(r.baseline).toBe('25 (12/25/25)');
    expect(r.now).toBe(25);
  });

  // An audit document that hides its own holes is worse than one that names them.
  it('names what the record cannot answer', () => {
    const n = buildNarrative(action({
      items: [item({ comment: null, owner: null })],
    }));
    expect(n.gaps).toContain('Some items carry no recorded rationale.');
    expect(n.gaps).toContain(
      'Some items name no Responsible person, so they fall to the system owner by default.');
  });

  it('flags an action in flight with no recorded acceptance', () => {
    const n = buildNarrative(action({ accepted_at: null }));
    expect(n.summary.accepted).toBeNull();
    expect(n.gaps).toContain('No acceptance is recorded against this action.');
  });

  it('does not flag a proposed action for lacking acceptance', () => {
    const n = buildNarrative(action({ accepted_at: null, status: 'proposed' }));
    expect(n.gaps).not.toContain('No acceptance is recorded against this action.');
  });

  it('returns null for no action', () => {
    expect(buildNarrative(null)).toBeNull();
  });
});

describe('the note stream', () => {
  const note = (over = {}) => ({
    id: 'n1', item_id: null, note: 'Vendor engaged.',
    created_at: '2026-09-01T10:00:00Z',
    author: { user_id: 'u9', name: 'Ada Lovelace', role: 'ciso' },
    ...over,
  });

  it('attributes and dates a note', () => {
    expect(noteNarrative(note())).toMatchObject({
      text: 'Vendor engaged.', by: 'Ada Lovelace (CISO)', on: '1 September 2026',
    });
  });

  it('says so plainly when the author was never recorded', () => {
    // The backfilled column never captured one; inventing an author would be worse.
    expect(noteNarrative(note({ author: null })).by).toBe('an unrecorded user');
  });

  it('carries item notes onto the item and action notes onto the action', () => {
    const n = buildNarrative({
      title: 'A', status: 'in_progress', items: [{
        id: 'i1', change_kind: 'control_add', label: 'X', status: 'pending',
        system: { name: 'S' }, notes: [note({ id: 'n2', note: '3 of 8 hosts done.' })],
      }],
      risks: [], notes: [note()],
    });
    expect(n.notes.map(x => x.text)).toEqual(['Vendor engaged.']);
    expect(n.items[0].notes.map(x => x.text)).toEqual(['3 of 8 hosts done.']);
  });

  // A record with no dialogue should admit it rather than look complete.
  it('flags an action with no progress recorded anywhere', () => {
    const n = buildNarrative({
      title: 'A', status: 'in_progress', accepted_at: '2026-08-01T00:00:00Z',
      accepted_by_name: 'Ada', items: [{ id: 'i1', change_kind: 'control_add', label: 'X',
        status: 'pending', system: { name: 'S' } }], risks: [], notes: [],
    });
    expect(n.gaps).toContain(
      'No progress has been recorded, so the record says nothing about how the work went.');
  });

  it('does not flag it once any note exists', () => {
    const n = buildNarrative({
      title: 'A', status: 'in_progress', accepted_at: '2026-08-01T00:00:00Z',
      accepted_by_name: 'Ada', items: [{ id: 'i1', change_kind: 'control_add', label: 'X',
        status: 'pending', system: { name: 'S' }, notes: [note()] }], risks: [], notes: [],
    });
    expect(n.gaps.join(' ')).not.toMatch(/No progress has been recorded/);
  });
});

describe('withdrawn items', () => {
  const base = (over = {}) => ({
    id: 'i1', change_kind: 'control_add', label: 'X', status: 'pending',
    system: { name: 'S' }, comment: 'why', owner: { name: 'Ada', role: 'ciso' },
    notes: [], ...over,
  });

  it('marks a withdrawn item as such rather than as outstanding', () => {
    const n = itemNarrative(base({ status: 'withdrawn' }));
    expect(n.withdrawn).toBe(true);
    expect(n.done).toBe(false);
  });

  // Withdrawn work is not outstanding work — it must leave the counts, or the
  // record asks someone to do a job that was deliberately called off.
  it('excludes withdrawn items from the item counts', () => {
    const n = buildNarrative({
      title: 'A', status: 'in_progress', risks: [], notes: [],
      accepted_at: '2026-08-01T00:00:00Z', accepted_by_name: 'Ada',
      items: [
        base({ id: 'a', status: 'completed' }),
        base({ id: 'b', status: 'pending' }),
        base({ id: 'c', status: 'withdrawn' }),
      ],
    });
    expect(n.summary.itemsTotal).toBe(2);
    expect(n.summary.itemsDone).toBe(1);
    expect(n.summary.itemsWithdrawn).toBe(1);
    // …but it is still rendered, so the decision stays visible.
    expect(n.items).toHaveLength(3);
  });

  it('does not report a withdrawn item as missing a rationale or an owner', () => {
    const n = buildNarrative({
      title: 'A', status: 'in_progress', risks: [], notes: [],
      accepted_at: '2026-08-01T00:00:00Z', accepted_by_name: 'Ada',
      items: [base({ status: 'withdrawn', comment: null, owner: null }),
              base({ id: 'b', notes: [{ id: 'n', note: 'x', created_at: null, author: null }] })],
    });
    expect(n.gaps.join(' ')).not.toMatch(/no recorded rationale|no Responsible person/);
  });
});
