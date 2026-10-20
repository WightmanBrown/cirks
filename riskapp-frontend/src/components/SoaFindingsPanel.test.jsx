// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SoaFindingsPanel from './SoaFindingsPanel';

const data = { findings: [
  { finding_type: 'deployed_where_not_applicable', control_id: 'c1', ref: 'ID.RA-09', title: 'Authenticity of hardware',
    system_id: 's1', system_name: 'Payroll', system_status: 'operational', why: 'not_applicable', risks_affected: 4 },
  { finding_type: 'not_applicable_without_reason', control_id: 'c1', ref: 'ID.RA-09', title: 'Authenticity of hardware', risks_affected: 0 },
] };
const renderPanel = (props) => render(<MemoryRouter><SoaFindingsPanel {...props} /></MemoryRouter>);

describe('SoaFindingsPanel', () => {
  it('names each contradiction, what resolves it, and the systems and risks it touches', async () => {
    renderPanel({ findingsData: data });
    expect(await screen.findByText(/Recorded where it does not apply/)).toBeInTheDocument();
    expect(screen.getByText(/Not applicable, with no reason/)).toBeInTheDocument();
    expect(screen.getAllByText(/Resolved by:/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Payroll/ })).toHaveAttribute('href', '/systems/s1');
    expect(screen.getByText('counts on 4 risks')).toBeInTheDocument();
  });

  // Naming the act and leaving the reader to find the form is most of the way to
  // saying nothing (owner, 2026-09-24).
  it('links straight to the decision form', async () => {
    renderPanel({ findingsData: data });
    const links = await screen.findAllByRole('link', { name: /Change the decision/ });
    expect(links[0]).toHaveAttribute('href', '/controls/c1?decide=1');
  });

  it('on the objective page, opens the form in place instead of linking', async () => {
    const onDecide = vi.fn();
    renderPanel({ controlId: 'c1', findingsData: data, onDecide });
    await userEvent.click((await screen.findAllByRole('button', { name: /Change the decision/ }))[0]);
    expect(onDecide).toHaveBeenCalled();
  });

  it('offers no decision link to someone who cannot decide', async () => {
    renderPanel({ findingsData: data, canDecide: false });
    expect(await screen.findByText(/Recorded where it does not apply/)).toBeInTheDocument();
    expect(screen.queryByText(/Change the decision/)).not.toBeInTheDocument();
  });

  it('says plainly when there is nothing to find', async () => {
    renderPanel({ findingsData: { findings: [] } });
    expect(await screen.findByText(/No findings: what is deployed agrees with the SoA/)).toBeInTheDocument();
  });

  it('on an objective page, stays silent when there is nothing to find', () => {
    const { container } = renderPanel({ controlId: 'c9', findingsData: { findings: [] } });
    expect(container).toBeEmptyDOMElement();
  });
});
