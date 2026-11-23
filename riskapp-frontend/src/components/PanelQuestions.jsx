// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import styles from './PanelQuestions.module.css';

// The questions an insight panel raises, written as questions, each opening
// the question page that answers it (docs/insights-drilldown.md, decision 2).
// questions: [{ label: 'Which systems are worst covered?', to: '/reporting/coverage?by=system' }]
export function PanelQuestions({ questions }) {
  if (!questions?.length) return null;
  return (
    <div className={styles.asks} data-print="hide">
      <span className={styles.label}>This raises</span>
      {questions.map((q) => <Link key={q.to + q.label} className={styles.ask} to={q.to}>{q.label} →</Link>)}
    </div>
  );
}
