// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { getControls } from '../api';
import { CountWidget } from './CountWidget';

export function ControlEffectivenessWidget() {
  return (
    <CountWidget
      title="Control Effectiveness"
      badge="ANALYST"
      fetchCount={async () => (await getControls()).summary.needs_rating}
      errorText="Could not load control data."
      singular="control awaiting effectiveness rating"
      plural="controls awaiting effectiveness rating"
      zeroText="All controls have been rated."
      to="/controls"
      linkLabel="Open control library →"
      clickable
    />
  );
}
