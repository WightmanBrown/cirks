// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { WalkableGraph } from '../components/WalkableGraph';
import { EntityKind } from '../components/EntityKind';
import { HelpDot } from '../components/HelpDot';

export function GraphExplorerPage() {
  const { type, id } = useParams();

  return (
    <Shell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: 'calc(100vh - 150px)' }}>
        <div>
          <BackButton />
          <h1 style={{ margin: '0.25rem 0 0' }}>
            Graph explorer<EntityKind kind="knowledge" /> <HelpDot k="graph_explorer.title" placement="bottom" />
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Click a node to see its details and walk one hop further. Dashed nodes can still be expanded.
          </p>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <WalkableGraph rootType={type} rootId={id} />
        </div>
      </div>
    </Shell>
  );
}
