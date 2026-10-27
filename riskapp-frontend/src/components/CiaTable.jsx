// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import { chipClass, rawColorClass } from '../utils/riskColors';
import { RatingChip } from './RatingChip';
import { RatingScaleRow } from './RatingScaleRow';
import styles from './CiaTable.module.css';

// ── ChipSelector ──────────────────────────────────────────────────────────────
// Clickable 1–5 severity chip row used in edit mode.
// Active chip is full-opacity; inactive chips use rgba alpha so the border
// stays white at full opacity.
// `wordScale` ('impact' | 'probability') adds a live word chip beside the row
// that updates as the value changes — plain-English feedback for the level set.
// `max` caps the selectable range (default 5) — e.g. a per-control probability
// can't exceed the threat inherent. `disabled` renders a read-only chip row.
export function ChipSelector({ value, onChange, wordScale, max = 5, disabled = false }) {
  return (
    <span className={styles.chipSelector}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          className={`${rawColorClass(n)} ${styles.chipSelectorBtn} ${value !== n ? styles.chipSelectorDim : ''}`}
          onClick={() => onChange(n)}
          aria-label={String(n)}
          aria-pressed={value === n}
        >{n}</button>
      ))}
      {wordScale && value > 0 && (
        <span className={styles.chipSelectorWord}>
          <RatingChip value={value} scale={wordScale} variant="word" />
        </span>
      )}
    </span>
  );
}

// ── CiaValueCell ──────────────────────────────────────────────────────────────
// Display-only cell. Numeric → coloured chip. String → column header text.
// Null/undefined → plain "—". Used in asset breakdown rows.
export function CiaValueCell({ value, isHeader = false }) {
  const numeric = typeof value === 'number';
  return (
    <span className={styles.ciaLineCell}>
      {isHeader
        ? <span className={styles.ciaColumnHeader}>{value ?? '—'}</span>
        : numeric
          ? <span className={`${chipClass()} ${rawColorClass(value)}`}>{value}</span>
          : <span className={styles.ciaPlainValue}>{value ?? '—'}</span>
      }
    </span>
  );
}

// ── CiaSectionLabel ───────────────────────────────────────────────────────────
// A full-width divider row with a heading centred at the Integrity column.
// Used to label groups of rows (e.g. "Impact", "Probability") inside a panel.
export function CiaSectionLabel({ label }) {
  return (
    <div className={styles.ciaSectionLabelRow}>
      <span />
      <span />
      <span className={styles.ciaSectionLabel}>{label}</span>
      <span />
    </div>
  );
}

// ── CiaTableHeader ────────────────────────────────────────────────────────────
// Header row: [label] C | I | A (expert) or [label] Max CIA (simple).
// Pass className for page-level overrides.
export function CiaTableHeader({ label, simpleMode = false, className = '' }) {
  return (
    <div className={`${styles.ciaLine} ${className}`}>
      <span className={styles.ciaHeaderLabel}>{label}</span>
      {simpleMode
        ? <>
            <span className={styles.ciaLineCell} />
            <span className={styles.ciaLineCell}>
              <span className={styles.ciaColumnHeader}>Max CIA <HelpDot k="cia_table.col.max" placement="bottom" /></span>
            </span>
            <span className={styles.ciaLineCell} />
          </>
        : <>
            <CiaValueCell value={<>Confidentiality <HelpDot k="cia_table.col.c" placement="bottom" /></>} isHeader />
            <CiaValueCell value={<>Integrity <HelpDot k="cia_table.col.i" placement="bottom" /></>} isHeader />
            <CiaValueCell value={<>Availability <HelpDot k="cia_table.col.a" placement="bottom" /></>} isHeader />
          </>
      }
    </div>
  );
}

// ── CiaLine ───────────────────────────────────────────────────────────────────
// Label + editable or display C/I/A row.
//   editing && !readOnly → ChipSelector per dimension (or one for all in simple)
//   display              → chips with white border (.chipEditable) on user-set values
export function CiaLine({
  label, sub,
  values,
  editing = false, readOnly = false,
  onChange,
  simpleMode = false,
  className = '',
}) {
  const interactive = editing && !readOnly;
  const maxVal = Math.max(values.c ?? 0, values.i ?? 0, values.a ?? 0) || null;

  return (
    <div className={`${styles.ciaLine} ${className}`}>
      <span className={styles.ciaLineLabel}>
        {label}
        {sub && <span className={styles.ciaLineSub}>{sub}</span>}
      </span>
      {simpleMode
        ? (interactive
            ? <>
                <span className={styles.ciaLineCell} />
                <span className={styles.ciaLineCell}>
                  <ChipSelector
                    value={maxVal}
                    onChange={v => { onChange?.('c', v); onChange?.('i', v); onChange?.('a', v); }}
                    wordScale="impact"
                  />
                </span>
                <span className={styles.ciaLineCell} />
              </>
            : <span className={styles.ciaLineScaleCell}>
                {maxVal
                  ? <RatingScaleRow value={maxVal} scale="impact" />
                  : <span className={styles.ciaPlainValue}>—</span>}
              </span>
          )
        : ['c', 'i', 'a'].map(dim => (
            <span key={dim} className={styles.ciaLineCell}>
              {interactive
                ? <ChipSelector
                    value={values[dim] ?? null}
                    onChange={v => onChange?.(dim, v)}
                  />
                : values[dim] != null
                  ? <span className={`${chipClass()} ${rawColorClass(values[dim])} ${styles.chipEditable}`}>{values[dim]}</span>
                  : <span className={styles.ciaPlainValue}>—</span>
              }
            </span>
          ))
      }
    </div>
  );
}

// ── ProbabilityLine ───────────────────────────────────────────────────────────
// Like CiaLine but for probability: simple mode treats the value as a single
// scalar (sets all three C/I/A dimensions to the same value).
export function ProbabilityLine({ label, values, editing = false, onChange, simpleMode = true }) {
  const val1d = Math.max(values.c ?? 1, values.i ?? 1, values.a ?? 1);

  function set1d(v) { onChange('c', v); onChange('i', v); onChange('a', v); }

  return (
    <div className={styles.ciaLine}>
      <span className={styles.ciaLineLabel}>{label}</span>
      {simpleMode
        ? (editing
            ? <>
                <span className={styles.ciaLineCell} />
                <span className={styles.ciaLineCell}>
                  <ChipSelector value={val1d} onChange={set1d} wordScale="probability" />
                </span>
                <span className={styles.ciaLineCell} />
              </>
            : <span className={styles.ciaLineScaleCell}>
                <RatingScaleRow value={val1d} scale="probability" />
              </span>
          )
        : ['c', 'i', 'a'].map(dim => (
            <span key={dim} className={styles.ciaLineCell}>
              {editing
                ? <ChipSelector
                    value={values[dim] ?? null}
                    onChange={v => onChange(dim, v)}
                  />
                : values[dim] != null
                  ? <span className={`${chipClass()} ${rawColorClass(values[dim])} ${styles.chipEditable}`}>{values[dim]}</span>
                  : <span className={styles.ciaPlainValue}>—</span>
              }
            </span>
          ))
      }
    </div>
  );
}

// ── SuggestedProbRow ──────────────────────────────────────────────────────────
// Display-only probability row from a threat profile. No chipEditable border —
// the user cannot edit this value directly.
export function SuggestedProbRow({ threatName, values, simpleMode = false }) {
  const maxVal = Math.max(values.c ?? 0, values.i ?? 0, values.a ?? 0) || null;
  return (
    <div className={styles.ciaLine}>
      <span className={styles.ciaLineLabel}>
        Threat probability
        {threatName && <span className={styles.ciaLineSub}>{threatName}</span>}
      </span>
      {simpleMode
        ? <span className={styles.ciaLineScaleCell}>
            {maxVal
              ? <RatingScaleRow value={maxVal} scale="probability" />
              : <span className={styles.ciaPlainValue}>—</span>}
          </span>
        : ['c', 'i', 'a'].map(dim => (
            <span key={dim} className={styles.ciaLineCell}>
              {values[dim] != null
                ? <span className={`${chipClass()} ${rawColorClass(values[dim])}`}>{values[dim]}</span>
                : <span className={styles.ciaPlainValue}>—</span>
              }
            </span>
          ))
      }
    </div>
  );
}
