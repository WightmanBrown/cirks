// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { HelpDot } from './HelpDot';
import { PatternDiagram } from './PatternDiagram';
import shared from '../pages/ScopesPage.module.css';
import styles from './SolutionPatternSection.module.css';

// A security solution against its pattern (v176), on the solution's own page:
// which pattern it implements, the pattern drawn generically, and this solution
// drawn in the same shape directly under it, so what it lacks stands out. Then
// where it is on systems. Report only: no objective's state follows from this.
const BANNER = {
  incomplete: { cls: 'bad', text: (fit) => `Incomplete against its pattern. Missing: ${fit.missing.join(', ') || 'a part that is not yet in place'}.` },
  degraded: { cls: 'warn', text: () => 'Every part its pattern requires is recorded, and at least one is degraded.' },
  complete: { cls: 'good', text: () => 'Complete against its pattern: every part it requires is recorded and in place.' },
};

export function SolutionPatternSection({ s, patterns, canEdit, onSave }) {
  if (s.kind === 'supplier') {
    return (
      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Security solution pattern <HelpDot k="security_solution.pattern" placement="bottom" /></h2>
        <p className={shared.note}>Provided by the supplier: met by each supplier&rsquo;s evidence, so it is checked per supplier relationship, by supplier assurance.</p>
      </section>
    );
  }
  const fit = s.pattern_fit;
  const pattern = patterns.find(p => p.code === s.solution_pattern) || null;
  const banner = fit && BANNER[fit.state];
  const notNeeded = new Set(s.slots_not_needed || []);
  const toggleNotNeeded = (key) => {
    const next = new Set(notNeeded);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSave({ slots_not_needed: [...next] });
  };
  const degradedSystems = (s.systems || []).filter(x => x.state === 'degraded');
  const complete = (s.systems || []).filter(x => x.state === 'complete').length;
  const incomplete = (s.systems || []).filter(x => x.state === 'incomplete').length;
  const need = s.need_without || [];

  return (
    <section className={shared.section}>
      <h2 className={shared.sectionTitle}>Security solution pattern <HelpDot k="security_solution.pattern" placement="bottom" /></h2>
      <div className={styles.implements}>
        <span className={shared.muted}>Implements</span>
        {pattern
          ? <Link className={styles.patternLink} to={`/security-solution-patterns#${pattern.code}`}>{pattern.code} · {pattern.name}</Link>
          : <span className={shared.muted}>no pattern stated yet</span>}
        {canEdit && (
          <select className={shared.input} aria-label="The pattern this solution implements" value={s.solution_pattern || ''}
            onChange={e => onSave({ solution_pattern: e.target.value || null })}>
            <option value="">Not stated</option>
            {patterns.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
          </select>
        )}
      </div>

      {!pattern && (
        <p className={shared.note}>
          Say which of the <Link to="/security-solution-patterns">security solution patterns</Link> it implements, and its
          parts are checked against the pattern&rsquo;s slots.
        </p>
      )}

      {pattern && (<>
        {banner && <p className={`${styles.banner} ${styles[banner.cls]}`} role="status">{banner.text(fit)}</p>}
        <h3 className={styles.sub}>The pattern · {pattern.code} {pattern.name}</h3>
        <PatternDiagram pattern={pattern} muted />
        <h3 className={styles.sub}>{s.name}, in the same shape</h3>
        <PatternDiagram pattern={pattern} fit={fit} label={`${s.name} against ${pattern.name}`} />

        {canEdit && pattern.slots.some(x => x.required) && (
          <fieldset className={styles.notNeeded}>
            <legend>Not needed for this solution <HelpDot k="security_solution.not_needed" placement="bottom" /></legend>
            {pattern.slots.filter(x => x.required).map(x => (
              <label key={x.key} className={styles.check}>
                <input type="checkbox" checked={notNeeded.has(x.key)} onChange={() => toggleNotNeeded(x.key)} />
                {x.label}
              </label>
            ))}
          </fieldset>
        )}

        {fit.also.length > 0 && (
          <p className={shared.note}>
            <b>Also part of it, outside the pattern&rsquo;s slots:</b> {fit.also.map(p => p.name).join(', ')}.
            Where one of them is what a slot asks for (a record, say), choose its slot in the parts list below.
          </p>
        )}

        <h3 className={styles.sub}>On systems <HelpDot k="security_solution.on_systems" placement="bottom" /></h3>
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardTag}>Complete</span>
            <b className={styles.cardNum}>{complete} system{complete === 1 ? '' : 's'}</b>
            <span className={shared.muted}>every part working there</span>
          </div>
          <div className={`${styles.card} ${degradedSystems.length ? styles.cardWarn : ''}`}>
            <span className={styles.cardTag}>Degraded</span>
            <b className={styles.cardNum}>{degradedSystems.length} system{degradedSystems.length === 1 ? '' : 's'}</b>
            <span className={shared.muted}>
              {degradedSystems.length
                ? degradedSystems.slice(0, 3).map(x => `${x.system_name}${x.degraded_parts?.length ? ` (${x.degraded_parts.join(', ')})` : ''}`).join('; ')
                  + (degradedSystems.length > 3 ? ` and ${degradedSystems.length - 3} more` : '')
                : 'none'}
              {incomplete > 0 && `. Incomplete on ${incomplete} more.`}
            </span>
          </div>
          <div className={`${styles.card} ${need.length ? styles.cardBad : ''}`}>
            <span className={styles.cardTag}>Need it, none in place</span>
            <b className={styles.cardNum}>{need.length} system{need.length === 1 ? '' : 's'}</b>
            <span className={shared.muted}>
              {need.length
                ? <>need an objective it delivers, with no solution in place: {need.slice(0, 4).map((x, i) => (
                    <span key={x.id}>{i > 0 && ', '}<Link to={`/systems/${x.id}`}>{x.name}</Link></span>))}
                  {need.length > 4 && ` and ${need.length - 4} more`}</>
                : 'none'}
            </span>
          </div>
        </div>
      </>)}
    </section>
  );
}

/** Which slot a part is in, by the fit: stated by a person, or matched. */
export function slotOfPart(fit, partId) {
  const slot = (fit?.slots || []).find(x => x.parts.some(p => p.id === partId));
  return slot ? { key: slot.key, label: slot.label, stated: slot.parts.find(p => p.id === partId).stated } : null;
}
