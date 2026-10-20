// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { getProbabilitySignals } from '../api';
import { CountWidget } from './CountWidget';

export function AnalystSignalsWidget() {
  return (
    <CountWidget
      title="Open Probability Signals"
      badge="ANALYST"
      fetchCount={async () => (await getProbabilitySignals()).count}
      errorText="Could not load probability signals."
      singular="signal awaiting resolution"
      plural="signals awaiting resolution"
    />
  );
}
