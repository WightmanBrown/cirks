// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState } from 'react';
import { parseDateInput, formatForTyping, describeDate } from '../utils/dateInput';
import styles from './DateField.module.css';

// A date you can TYPE the way you write it — 31/03/2027, 31-3-27, 2027-03-31,
// 31 Mar 2027 — with a calendar button for anyone who prefers to pick. It shows
// how it read the date, and says plainly when it cannot read one. It replaces
// <input type="date">, whose typing rules depend on the browser's locale and
// whose only complaint is "invalid date" (owner, 2026-09-30).
//
// Drop-in: the same props as the input it replaces, and onChange still receives
// { target: { value } } with the date as YYYY-MM-DD (or '' when empty), so every
// caller's handler is unchanged. While the text cannot be read the field reports
// '' to the caller and marks itself invalid, so a form cannot submit it.
export function DateField({ value = '', onChange, min, max, required, disabled, className, id, placeholder = 'DD/MM/YYYY', ...rest }) {
  const [text, setText] = useState(() => formatForTyping(value));
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  const iso = parseDateInput(text);
  const problem = !text.trim() ? (required ? 'Enter a date.' : null)
    : !iso ? 'Not a date CIRKS can read. Type it as day/month/year, e.g. 31/03/2027.'
    : min && iso < min ? `Choose a date on or after ${describeDate(min)}.`
    : max && iso > max ? `Choose a date on or before ${describeDate(max)}.`
    : null;

  // Follow a value set from outside (a reset, the calendar) without wiping
  // something half-typed that does not parse yet.
  useEffect(() => {
    const read = parseDateInput(text) || '';
    if ((value || '') !== read && !(value === '' && read === '' )) setText(formatForTyping(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // The native form check uses our words, and blocks submitting what we cannot read.
  useEffect(() => {
    inputRef.current?.setCustomValidity(problem && (text.trim() || touched) ? problem : '');
  }, [problem, text, touched]);

  const emit = (v) => onChange?.({ target: { value: v } });

  function type(e) {
    const t = e.target.value;
    setText(t);
    emit(parseDateInput(t) || '');
  }

  function pick(e) {
    const v = e.target.value;
    setText(formatForTyping(v));
    setTouched(true);
    emit(v);
  }

  function openPicker() {
    const p = pickerRef.current;
    if (!p) return;
    try { p.showPicker(); } catch { p.focus(); p.click(); }
  }

  return (
    <span className={styles.wrap}>
      <span className={styles.row}>
        <input
          {...rest}
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={className}
          value={text}
          placeholder={placeholder}
          onChange={type}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(problem && touched)}
        />
        <button type="button" className={styles.calendar} onClick={openPicker} disabled={disabled}
                aria-label="Choose from a calendar" title="Choose from a calendar">📅</button>
        <input ref={pickerRef} type="date" className={styles.hiddenPicker} tabIndex={-1} aria-hidden="true"
               value={iso || ''} min={min} max={max} onChange={pick} disabled={disabled} />
      </span>
      {touched && problem ? <span className={styles.problem} role="alert">{problem}</span>
        : iso ? <span className={styles.read}>{describeDate(iso)}</span> : null}
    </span>
  );
}
