// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { getSiroActionPending } from '../api';
import { CountWidget } from './CountWidget';

export function SiroActionsWidget() {
  return (
    <CountWidget
      title="Security Actions"
      helpKey="widget.siro_actions"
      badge="SIRO"
      fetchCount={async () => (await getSiroActionPending()).count}
      errorText="Could not load pending actions."
      singular="action awaiting sign-off"
      plural="actions awaiting sign-off"
      accent="amber"
      to="/actions"
      linkLabel="View actions →"
    />
  );
}
