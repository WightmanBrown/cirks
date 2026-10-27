// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

const helpState = { entries: {}, drafts: true, editMode: false, canEditHelp: false };
vi.mock('../context/HelpContext', () => ({
  useHelp: () => ({
    help: (k) => helpState.entries[k] || null,
    editMode: helpState.editMode,
    canEditHelp: helpState.canEditHelp,
    saveHelp: async () => {},
    ensureKey: () => {},
    drafts: helpState.drafts,
  }),
}));

import { HelpDot, placePopover } from './HelpDot';
import { Th } from './Th';
import { SortableTh } from './SortableTh';

beforeEach(() => {
  helpState.entries = {};
  helpState.drafts = true;
});

describe('HelpDot draft text', () => {
  it('shows the shipped draft when nobody has written their own', () => {
    render(<HelpDot k="col.impact" />);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/derived from the information assets/);
  });

  it('shows the saved text in place of the draft', () => {
    helpState.entries['col.impact'] = { title: 'Impact', body: 'Our own words.' };
    render(<HelpDot k="col.impact" />);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Our own words.');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(/derived/);
  });

  it('renders nothing outside the help provider (drafts off) when there is no text', () => {
    helpState.drafts = false;
    const { container } = render(<HelpDot k="col.impact" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a key with no draft and no text', () => {
    const { container } = render(<HelpDot k="no.such.key" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('column headers with help', () => {
  it('Th puts the dot after the label', () => {
    render(<table><thead><tr><Th helpKey="col.impact">Impact</Th></tr></thead></table>);
    expect(screen.getByRole('columnheader')).toHaveTextContent('Impact');
    expect(screen.getByRole('button', { name: 'About Impact' })).toBeInTheDocument();
  });

  it('opening help on a sortable header does not sort it', () => {
    const onSort = vi.fn();
    render(
      <table><thead><tr>
        <SortableTh column="impact" sortKey={null} sortDir="asc" onSort={onSort} helpKey="col.impact">Impact</SortableTh>
      </tr></thead></table>
    );
    fireEvent.click(screen.getByRole('button', { name: 'About Impact' }));
    expect(onSort).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Sort by this column'));
    expect(onSort).toHaveBeenCalledWith('impact');
  });
});

describe('inside something clickable', () => {
  it('Enter on the dot does not reach the parent', () => {
    const onKeyDown = vi.fn();
    render(<div role="link" tabIndex={0} onKeyDown={onKeyDown}><HelpDot k="col.impact" /></div>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'About Impact' }), { key: 'Enter' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

describe('placePopover', () => {
  const view = { width: 1000, height: 800 };
  const pop = { width: 280, height: 100 };
  const at = (left, top) => ({ left, top, right: left + 14, bottom: top + 14, width: 14, height: 14 });

  it('centres below the dot when asked for bottom', () => {
    expect(placePopover(at(500, 100), pop, 'bottom', view)).toEqual({ left: 367, top: 120 });
  });

  it('slides along to stay inside the window at the left edge', () => {
    expect(placePopover(at(20, 100), pop, 'bottom', view).left).toBe(8);
  });

  it('flips to the other side when there is no room', () => {
    expect(placePopover(at(500, 20), pop, 'top', view).top).toBe(40);   // below instead
    expect(placePopover(at(500, 760), pop, 'bottom', view).top).toBe(654); // above instead
  });
});
