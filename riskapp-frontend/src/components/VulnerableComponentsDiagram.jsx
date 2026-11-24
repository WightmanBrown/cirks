// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { getSystem, getSystemPatterns } from '../api';
import { PatternDiagram } from './PatternDiagram';
import { RelationDiagram } from './RelationDiagram';
import { isShared } from './SharedComponentChip';
import styles from './VulnerableComponentsDiagram.module.css';

// "Which components are vulnerable?" as a picture (owner, 2026-11-19): the system
// drawn in the shape of its pattern, exactly as on its Components tab, with each
// card holding a component marked vulnerable to this threat ringed and named.
// The one exception to the box-and-stick diagrams: a system already has a
// picture, so the risk page repeats it rather than inventing another.
//
// A card is a way into the record: `onGo('components', id)` opens the section
// at that component's row. A system with no pattern is drawn as itself and its
// vulnerable components, in the box-and-stick form.

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function VulnerableComponentsDiagram({ risk, onGo }) {
  const [system, setSystem] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [failed, setFailed] = useState(false);
  const componentsKey = (risk.components || []).map((c) => c.id).join(',');

  useEffect(() => {
    if (!risk.system_id) return undefined;
    let live = true;
    Promise.all([getSystem(risk.system_id), getSystemPatterns()])
      .then(([s, p]) => { if (live) { setSystem(s.system || s); setPatterns(p.patterns || []); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [risk.system_id, componentsKey]);

  if (failed) return null;
  if (!system || !patterns) return <p className={styles.note}>Drawing the system…</p>;

  const vulnerable = risk.components || [];
  const marked = new Set(vulnerable.map((c) => c.id));
  // The system's own components, as its Components tab counts them: the
  // organisation-wide ones its security solutions rely on (policies, teams, a
  // server room) are on every system, so they are said apart, not added in.
  const own = (system.components || []).filter((c) => !isShared(c)).length;
  const shared = (system.components || []).length - own;
  const total = own;
  const go = (id) => onGo('components', id ? `risk-component-${id}` : 'components');
  const sharedNote = shared ? ` It also relies on ${shared} organisation-wide component${shared === 1 ? '' : 's'}, shared with every system.` : '';
  const words = (vulnerable.length
    ? `${plural(vulnerable.length, 'component')} marked vulnerable to this threat: ${vulnerable.map((c) => c.name).join(', ')}. The system has ${plural(total, 'component')} of its own.`
    : `The system has ${plural(total, 'component')} of its own; none is marked vulnerable to this threat.`) + sharedNote;

  const pattern = patterns.find((p) => p.code === system.system_pattern);
  if (pattern && system.pattern_fit) {
    const inSlots = new Set(system.pattern_fit.slots.flatMap((s) => s.parts.map((x) => x.id)));
    const outside = vulnerable.filter((c) => !inSlots.has(c.id));
    return (
      <div className={styles.wrap}>
        <PatternDiagram pattern={pattern} fit={system.pattern_fit} marked={marked}
          label={`${system.name} in the shape of ${pattern.name}. ${words}`}
          onSlot={(key, parts) => go((parts.find((x) => marked.has(x.id)) || parts[0])?.id)} />
        <p className={styles.words}>
          {words}
          {outside.length > 0 && <> Outside the pattern&rsquo;s questions:{' '}
            {outside.map((c, i) => (
              <span key={c.id}>{i > 0 && ', '}<button type="button" className={styles.link} onClick={() => go(c.id)}>{c.name}</button></span>
            ))}.</>}
        </p>
      </div>
    );
  }

  // No pattern: the system and its vulnerable components, box and stick.
  const nodes = [{
    id: 'system', col: 0, row: Math.max(0, (vulnerable.length - 1) / 2), tag: 'System · no pattern stated', title: system.name,
    detail: plural(total, 'component'), onClick: () => go(null),
  }];
  const links = [];
  vulnerable.forEach((c, i) => {
    nodes.push({ id: c.id, col: 1, row: i, kind: c.component_type, tone: 'bad', tag: `${c.component_type} · vulnerable`,
      title: c.name, onClick: () => go(c.id) });
    links.push({ from: 'system', to: c.id });
  });
  return (
    <div className={styles.wrap}>
      <RelationDiagram nodes={nodes} links={links} label={`${system.name}. ${words}`} />
      <p className={styles.words}>{words}</p>
    </div>
  );
}
