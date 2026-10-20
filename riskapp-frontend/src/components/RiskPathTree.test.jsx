// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Regression: linking MIGNet to "Government communications" blanked the page.
//
// Under v104 a service reaches risks through its SYSTEMS, so a path carries an
// asset only when the service's department holds information in that system. A
// service with both kinds of system therefore produces a MIXED list — some
// paths with an asset, most without. `hasAsset` used `.some()`, so one
// asset-bearing path selected the asset-first tree for all of them, and the
// asset-name comparator then dereferenced null and took the whole page down.
//
// Dependency-only services never hit it (no path had an asset at all), which is
// why the workflow appeared to work right up until the first system that
// actually held something.

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RiskPathTree } from './RiskPathTree';

const path = (over = {}) => ({
  risk_id: 'r1', risk_score: 15,
  asset_id: null, asset_name: null,
  system_id: 's1', system_name: 'MIGNet',
  threat_id: 't1', threat_name: 'Denial of service',
  ...over,
});

const show = (paths, groupBy) =>
  render(
    <MemoryRouter>
      <RiskPathTree paths={paths} title="Risks to this service" groupBy={groupBy} collapsed />
    </MemoryRouter>,
  );

describe('RiskPathTree with v104 service paths', () => {
  test('renders when SOME paths carry an asset and others do not', () => {
    expect(() => show([
      path({ risk_id: 'a', asset_id: 'ia1', asset_name: 'Internal MIG user identity' }),
      path({ risk_id: 'b', system_id: 's2', system_name: 'MIG Corporate Email' }),
    ])).not.toThrow();
  });

  test('renders when NO path carries an asset', () => {
    expect(() => show([path(), path({ risk_id: 'b', system_id: 's2', system_name: 'MIG Telephony' })]))
      .not.toThrow();
  });

  test('renders when EVERY path carries an asset', () => {
    expect(() => show([
      path({ risk_id: 'a', asset_id: 'ia1', asset_name: 'Zebra records' }),
      path({ risk_id: 'b', asset_id: 'ia2', asset_name: 'Aardvark records' }),
    ])).not.toThrow();
  });

  test('groupBy="system" names each system — the service view', () => {
    show([
      path({ risk_id: 'a', asset_id: 'ia1', asset_name: 'Internal MIG user identity' }),
      path({ risk_id: 'b', system_id: 's2', system_name: 'MIG Corporate Email' }),
    ], 'system');
    expect(screen.getAllByText(/MIGNet/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MIG Corporate Email/).length).toBeGreaterThan(0);
  });

  test('a null system name does not crash the system grouping either', () => {
    expect(() => show([path({ system_name: null }), path({ risk_id: 'b', system_id: 's2' })], 'system'))
      .not.toThrow();
  });
});

// The service page opens with systems FOLDED: a service with a dozen systems
// otherwise arrives as a wall of threat rows, when the question on arrival is
// "which system is worst".

describe('collapsed system tree', () => {
  const paths = [
    path({ risk_id: 'a', risk_score: 20, system_id: 's1', system_name: 'MIGNet',   threat_name: 'Ransomware' }),
    path({ risk_id: 'b', risk_score: 8,  system_id: 's1', system_name: 'MIGNet',   threat_name: 'Phishing' }),
    path({ risk_id: 'c', risk_score: 12, system_id: 's2', system_name: 'Telephony', threat_name: 'Outage' }),
  ];

  test('shows each system with its headline, and no threats, on arrival', () => {
    show(paths, 'system');
    expect(screen.getByText('MIGNet')).toBeInTheDocument();
    expect(screen.getByText('Telephony')).toBeInTheDocument();
    expect(screen.queryByText('Ransomware')).not.toBeInTheDocument();
    expect(screen.queryByText('Outage')).not.toBeInTheDocument();
  });

  test('the headline is the system\'s WORST risk, not its first or last', () => {
    show(paths, 'system');
    // MIGNet holds a 20 (critical) and an 8 (medium); the header must show the 20.
    const header = screen.getByText('MIGNet').closest('button');
    expect(header.textContent).toMatch(/critical/i);
    expect(header.textContent).toMatch(/2 risks/);
  });

  test('worst system first', () => {
    show(paths, 'system');
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names[0]).toMatch(/MIGNet/);
    expect(names[1]).toMatch(/Telephony/);
  });

  test('clicking a system unfolds only that one', async () => {
    const user = userEvent.setup();
    show(paths, 'system');
    await user.click(screen.getByText('MIGNet'));
    expect(screen.getByText('Ransomware')).toBeInTheDocument();
    expect(screen.getByText('Phishing')).toBeInTheDocument();
    expect(screen.queryByText('Outage')).not.toBeInTheDocument();
  });

  test('clicking again folds it back', async () => {
    const user = userEvent.setup();
    show(paths, 'system');
    await user.click(screen.getByText('MIGNet'));
    await user.click(screen.getByText('MIGNet'));
    expect(screen.queryByText('Ransomware')).not.toBeInTheDocument();
  });

  test('the fold state is announced, not merely drawn', async () => {
    const user = userEvent.setup();
    show(paths, 'system');
    const header = screen.getByText('MIGNet').closest('button');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  test('without the collapsed flag every threat is listed, as before', () => {
    render(
      <MemoryRouter>
        <RiskPathTree paths={paths} title="Risks on this system" groupBy="system" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ransomware')).toBeInTheDocument();
    expect(screen.getByText('Outage')).toBeInTheDocument();
  });
});

// The panel hardcoded the band word in both modes, so expert mode silently lost
// the number it exists to show. Business shows the word, expert shows the score
// — the app-wide display model.

describe('business / expert display mode', () => {
  const paths = [
    path({ risk_id: 'a', risk_score: 20, system_id: 's1', system_name: 'MIGNet', threat_name: 'Ransomware' }),
  ];

  const showMode = (groupBy, isExpert, collapsed = false) =>
    render(
      <MemoryRouter>
        <RiskPathTree paths={paths} title="Risks" groupBy={groupBy} collapsed={collapsed} isExpert={isExpert} />
      </MemoryRouter>,
    );

  test('business mode shows the band word, not the score', () => {
    showMode('system', false);
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });

  test('expert mode shows the score, not the word', () => {
    showMode('system', true);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.queryByText(/critical/i)).not.toBeInTheDocument();
  });

  test('the folded headline honours the mode too', () => {
    showMode('system', true, true);
    const header = screen.getByText('MIGNet').closest('button');
    expect(header.textContent).toMatch(/20/);
    expect(header.textContent).not.toMatch(/critical/i);
  });

  test('the flat tree honours it as well', () => {
    render(
      <MemoryRouter>
        <RiskPathTree paths={paths} title="Risks" isExpert />
      </MemoryRouter>,
    );
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
