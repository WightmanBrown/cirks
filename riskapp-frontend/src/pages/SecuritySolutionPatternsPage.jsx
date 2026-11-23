// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSolutionPatterns } from '../api';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { PatternDiagram } from '../components/PatternDiagram';
import shared from './ScopesPage.module.css';
import styles from './SecuritySolutionPatternsPage.module.css';

// The security solution patterns (v176, docs/meta-architecture.md §11): the
// eight shapes a security solution takes, each drawn as its slots. A security
// solution is the organisation's own instance of one; its page draws it in the
// same shape, with what it lacks.
export function SecuritySolutionPatternsPage() {
  const [patterns, setPatterns] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getSolutionPatterns().then(setPatterns).catch(() => setError('Could not load the security solution patterns.')); }, []);

  return (
    <Shell>
      <div className={shared.page}>
        <BackButton fallback="/security-solutions" />
        <div className={shared.header}>
          <div>
            <h1 className={shared.title}>Security solution patterns <HelpDot k="solution_patterns.title" placement="bottom" /></h1>
            <p className={shared.desc}>
              The eight shapes a security solution takes. Each is made of a few kinds of part: a person, process, document,
              technology or place, each in a defined role. A security solution is the organisation&rsquo;s own instance of one
              pattern, and it is complete only when it has every part its pattern requires. Each pattern below says why it
              matters, what it is made of, and gives an example.
            </p>
          </div>
        </div>
        {error && <div className={shared.error} role="alert">{error}</div>}
        {!patterns && !error && <p className={shared.muted}>Loading…</p>}
        {patterns && (<>
          <nav className={styles.grid} aria-label="The eight patterns">
            {patterns.map(p => (
              <a key={p.code} href={`#${p.code}`} className={styles.tile}>
                <span className={styles.code}>{p.code} · {p.solutions} solution{p.solutions === 1 ? '' : 's'}</span>
                <b>{p.name}</b>
                <span className={styles.tileText}>{p.why}</span>
              </a>
            ))}
          </nav>
          {patterns.map(p => (
            <section key={p.code} id={p.code} className={`${shared.section} ${styles.pattern}`}>
              <div className={styles.patternHead}>
                <h2 className={shared.sectionTitle}>{p.code} · {p.name} <HelpDot k="solution_patterns.pattern" placement="bottom" /></h2>
                <Link to={`/security-solutions?pattern=${p.code}`}>
                  {p.solutions === 0 ? 'No security solution is built from it yet' : `${p.solutions} security solution${p.solutions === 1 ? ' is' : 's are'} built from it`} →
                </Link>
              </div>
              <p className={styles.lead}><b>Why it matters.</b> {p.why}</p>
              <p className={styles.lead}><b>What it is.</b> {p.summary} <b>Complete when</b> {p.complete_when}.</p>
              <PatternDiagram pattern={p} />
              <p className={shared.note}>
                <b>Required:</b> {p.slots.filter(s => s.required).map(s => s.label.toLowerCase()).join(', ')}
                {p.slots.some(s => !s.required) && <>. <b>Optional:</b> {p.slots.filter(s => !s.required).map(s => s.label.toLowerCase()).join(', ')} (dashed)</>}.
              </p>
              {p.example && (
                <div className={styles.example}>
                  <p className={styles.exampleHead}><b>For example: {p.example.name.charAt(0).toLowerCase() + p.example.name.slice(1)}</b>
                    <span className={shared.note}> An illustration of the pattern, not a record in CIRKS.</span></p>
                  <dl className={styles.exampleParts}>
                    {p.slots.map(sl => (
                      <div key={sl.key}><dt>{sl.label}</dt><dd>{p.example.parts[sl.key]}</dd></div>
                    ))}
                  </dl>
                </div>
              )}
            </section>
          ))}
        </>)}
      </div>
    </Shell>
  );
}
