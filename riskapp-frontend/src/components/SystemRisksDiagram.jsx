// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRiskAnswer } from '../api';
import { RelationDiagram } from './RelationDiagram';
import { riskScoreNodes } from './RiskScoreDiagram';
import { HelpDot } from './HelpDot';
import { RatingChip } from './RatingChip';
import { scoreLevel } from '../utils/riskColors';
import styles from './SystemRisksDiagram.module.css';

// "Risks on this system" as a picture (owner, 2026-11-19; docs/relation-diagrams.md).
// The system's risks are a column of boxes on the left, worst first. Each risk
// is a layer: selecting one draws its How bad is it? picture beside it, the
// same picture as on the risk page, joined to the risk:
//
//   Risk ●──┬─ objective ─┬─▶ Likelihood now ──╮
//   Risk    ├─ objective ─┘                    ▼
//   Risk    │                            ┌──────────┐
//           Information asset ──────────▶│ the grid │
//
// The selected risk stands for its threat (on this system a risk IS a threat
// against it), so the picture's threat box is folded into it. A box in the
// picture opens that risk's page at the record, as it does on the risk page.
//
// `risks` is GET /systems/:id's risk_paths: [{ risk_id, risk_score, threat_name }].

const BAND = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical', catastrophic: 'Catastrophic', none: 'Not scored' };
const TONE = { high: 'warn', critical: 'bad', catastrophic: 'bad' };
// A risk's colour: its band's. The box, the chip naming it and its row in the
// list beneath all wear it.
export function bandStripe(score) {
  const level = scoreLevel(score);
  if (level === 'none') return undefined;
  return level === 'catastrophic' ? 'var(--band-catastrophic-edge)' : `var(--band-${level}-fg)`;
}

export function systemRisksNodes(risks, selectedId, answer, { onSelect = () => {}, onGo = () => {} } = {}) {
  const sel = Math.max(0, risks.findIndex((r) => r.risk_id === selectedId));
  const picture = answer ? riskScoreNodes(answer, onGo) : null;
  const threat = picture?.nodes.find((n) => n.id === 'threat');
  // Line the picture's threat row up with the selected risk where it can.
  const offset = threat ? Math.max(0, sel - threat.row) : 0;

  const nodes = risks.map((r, k) => {
    const level = scoreLevel(r.risk_score);
    const chosen = k === sel;
    return {
      id: `r-${r.risk_id}`, col: 0, row: k, kind: 'threat', tone: TONE[level], selected: chosen, stripe: bandStripe(r.risk_score),
      // The value always, in its band's colour, beside the band's word.
      tag: BAND[level], title: r.threat_name,
      badge: r.risk_score != null ? <RatingChip value={r.risk_score} scale="risk" variant="number" /> : null,
      onClick: () => onSelect(r.risk_id),
    };
  });
  const links = [];
  if (picture) {
    const riskId = `r-${risks[sel].risk_id}`;
    for (const n of picture.nodes) {
      if (n.id === 'threat') continue;
      nodes.push({ ...n, col: n.col + 1, row: n.row + offset });
    }
    for (const l of picture.links) links.push({ ...l, from: l.from === 'threat' ? riskId : l.from });
  }
  const label = `${risks.length} risk${risks.length === 1 ? '' : 's'} on this system, worst first: `
    + risks.map((r) => `${r.threat_name} (${r.risk_score ?? 'not scored'})`).join(', ')
    + `. ${picture ? `Showing ${risks[sel].threat_name}: ${picture.label}` : ''}`;
  return { nodes, links, label };
}

// `onPick(id)` tells the page which risk was chosen (it unfolds that risk in its list).
export function SystemRisksDiagram({ risks, title = 'Risks on this system', helpKey, onPick }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(risks[0]?.risk_id ?? null);
  const [answers, setAnswers] = useState({});
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!selected || answers[selected]) return undefined;
    let live = true;
    getRiskAnswer(selected)
      .then((a) => { if (live) setAnswers((cur) => ({ ...cur, [selected]: a })); })
      .catch(() => { if (live) setFailed(selected); });
    return () => { live = false; };
  }, [selected, answers]);

  if (!risks.length) return null;
  // A box in the picture opens the risk's page at its record (the risk page reads
  // the section from the address and the record from the navigation state).
  const onGo = (section, element) => navigate(`/risks/${selected}#${section}`, { state: { go: element } });
  const choose = (id) => { setSelected(id); onPick?.(id); };
  const { nodes, links, label } = systemRisksNodes(risks, selected, answers[selected], { onSelect: choose, onGo });
  const current = risks.find((r) => r.risk_id === selected) || risks[0];

  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title} <HelpDot k={helpKey} placement="bottom" /></h2>
        <span className={styles.hint}>Select a risk on the left to see how bad it is; select any box to open the record.</span>
        <button type="button" className={styles.open} onClick={() => navigate(`/risks/${current.risk_id}`)}>
          Open {current.threat_name} →
        </button>
      </div>
      {failed === selected && <p className={styles.note} role="alert">Could not load this risk&rsquo;s picture.</p>}
      <RelationDiagram nodes={nodes} links={links} label={label} />
    </section>
  );
}
