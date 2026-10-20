// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { PatternChip } from './PatternChip';
import { objectiveName } from '../utils/componentRecord';

// One reason of the component-record finding: what kind of pattern it is about,
// what is wrong, and — where the reason is about control objectives — each one
// named and linked, so the reader can go to it (owner, 2026-10-06).
export function FindingReason({ item }) {
  return (
    <>
      {item.pattern && <><PatternChip kind={item.pattern} iconOnly />{' '}</>}
      {item.text}
      {item.objectives && <>: {item.objectives.map((o, i) => (
        <span key={o.id}>{i > 0 && ', '}<Link to={`/controls/${o.id}`}>{objectiveName(o)}</Link></span>
      ))}</>}
    </>
  );
}
