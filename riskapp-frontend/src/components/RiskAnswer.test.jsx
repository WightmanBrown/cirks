// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { riskAnswerSample } from './RiskAnswer.sample';

let answer;
vi.mock('../api', () => ({ getRiskAnswer: vi.fn(async () => answer) }));
const { RiskAnswer } = await import('./RiskAnswer');
const show = (lead) => render(<MemoryRouter><RiskAnswer riskId="r1" lead={lead} /></MemoryRouter>);
const questions = () => screen.getAllByText(/\?$/, { selector: 'span' }).map((e) => e.textContent.trim());

beforeEach(() => { answer = riskAnswerSample(); });

describe('RiskAnswer', () => {
  test('answers the four questions, the lead first, each linking to its section', async () => {
    show('decision');
    await screen.findByText('Mitigate, not agreed');
    expect(questions()).toEqual(['Who decided what?', 'How bad is it?', 'Why this score?', 'What is being done?']);
    expect(screen.getByRole('link', { name: /The objectives/ })).toHaveAttribute('href', '/risks/r1#why');
    expect(screen.getByText(/Agreement needs a minuted Security Working Group decision/)).toBeInTheDocument();
  });

  test('a section with no answer of its own (#about) keeps the usual order and leads with none', async () => {
    show('about');
    await screen.findByText('Mitigate, not agreed');
    expect(questions()).toEqual(['How bad is it?', 'Why this score?', 'What is being done?', 'Who decided what?']);
  });

  test('says when nothing in place lowers the score, and the fix that would', async () => {
    show();
    expect(await screen.findByText('Nothing in place lowers it')).toBeInTheDocument();
    expect(screen.getByText(/1 judged not to lower confidentiality; 1 not judged/)).toBeInTheDocument();
    expect(screen.getByText('BRR-02 Backups are protected')).toBeInTheDocument();
    expect(screen.getByText(/would bring it to 8/)).toBeInTheDocument();
  });

  test('names the objective holding the likelihood down', async () => {
    answer = riskAnswerSample({
      score: { ...riskAnswerSample().score, now: 12, probability: { c: 3, i: 2, a: 2 } },
      why: { ...riskAnswerSample().why, best_fix: null,
             setting: { dimension: 'c', probability: 3, threat_probability: 5,
                        by: [{ control_id: 'c1', ref: 'CIRKS1.IDA-04', title: 'Strong authentication', status: 'operational', judged: true }] } },
    });
    show();
    expect(await screen.findByText('Set by IDA-04 Strong authentication')).toBeInTheDocument();
    expect(screen.getByText(/holds the confidentiality likelihood at 3, down from the threat’s own 5/)).toBeInTheDocument();
  });

  test('a risk with no action and a mitigate decision reads as nothing being done', async () => {
    show();
    expect(await screen.findByText('No security action')).toBeInTheDocument();
    expect(screen.getByText(/The treatment is mitigate, but no action has been built/)).toBeInTheDocument();
  });

  test('an open action shows its progress, and a score above the owner limit says so', async () => {
    answer = riskAnswerSample({
      score: { ...riskAnswerSample().score, now: 20 },
      work: { open: 1, overdue: 1, actions: [{ id: 'a1', title: 'Protect the backups', status: 'in_progress', target_date: '2026-01-31',
                                               accepted: true, owner_name: 'Ada Owner', overdue: true, items: 3, items_done: 1 }] },
    });
    show();
    expect(await screen.findByText('1 security action open')).toBeInTheDocument();
    expect(screen.getByText(/“Protect the backups”: 1 of 3 items done, due 31 Jan 2026 \(overdue\)/)).toBeInTheDocument();
    expect(screen.getByText(/Above 19: beyond the risk owner’s authority to accept/)).toBeInTheDocument();
  });
});
