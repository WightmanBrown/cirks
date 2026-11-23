// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Audit readiness — the CISO's C7 (docs/reporting-ciso.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const report = {
  generated_at: '2026-11-05T10:00:00Z', thresholds: { action: 12 },
  headline: { lines: 3, complete: 1, soa_approved: false },
  lines: [
    { key: 'review_minutes', clause: '9.3.3', title: 'Minutes issued for every meeting held', met: 4, of: 4, state: 'complete', detail: '4 of 4 meetings held have their minutes issued.', link: '/meetings' },
    { key: 'soa_approved', clause: '6.1.3 d), 7.5.3', title: 'The Statement of Applicability is approved, and current', met: 0, of: 1, state: 'none', detail: 'No version has ever been approved.', link: '/soa', approved: null },
    { key: 'documents', clause: '5.2, 7.5', title: 'Policies, standards and procedures published, owned, approved and in date', met: 5, of: 6, state: 'part', detail: '5 of 6 documents are; 1 is not.', link: '/policies-documents',
      rows: [{ id: 'd1', name: 'Architecture Standard', document_kind: 'standard', why: ['no owner'] }] },
    { key: 'standard:nist_800_53', clause: 'NIST SP 800-53', title: 'NIST SP 800-53: requirements met', met: 0, of: 0, state: 'na', detail: 'Its requirements are not loaded.', link: '/setup/control-sets' },
  ],
};
let caps;
vi.mock('../api', () => ({ getAuditReadiness: vi.fn(async () => report) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { AuditReadinessPage } = await import('./AuditReadinessPage');
const page = () => render(<MemoryRouter><AuditReadinessPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('Audit readiness', () => {
  test('needs reports.read', () => {
    caps = [];
    page();
    expect(screen.getByText(/Insufficient permissions/i)).toBeInTheDocument();
  });

  test('each line names its clause and its state in words', async () => {
    page();
    expect(await screen.findByText('9.3.3')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText('Partly')).toBeInTheDocument();
    expect(screen.getByText('Nothing to measure')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 pieces of evidence are complete/)).toBeInTheDocument();
    expect(screen.getByText(/has never been approved: that is the first thing/)).toBeInTheDocument();
  });

  test('a line opens where the work is done, and lists what is not ready', async () => {
    page();
    const links = await screen.findAllByRole('link', { name: 'Open →' });
    expect(links.map((l) => l.getAttribute('href'))).toContain('/soa');
    fireEvent.click(screen.getByRole('button', { name: 'Which' }));
    expect(screen.getByText('Architecture Standard')).toBeInTheDocument();
    expect(screen.getByText(/no owner/)).toBeInTheDocument();
  });
});
