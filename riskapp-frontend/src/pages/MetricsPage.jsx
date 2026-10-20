// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';

export function MetricsPage() {
  return (
    <Shell>
      <div style={{ padding: '2rem' }}>
        <BackButton />
        <h1 style={{ marginBottom: '0.5rem' }}>Metrics &amp; Reporting</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Audit evidence and ISMS performance reporting — coming soon.
        </p>
      </div>
    </Shell>
  );
}
