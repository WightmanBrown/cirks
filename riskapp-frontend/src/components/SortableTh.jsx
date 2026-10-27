// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import styles from './SortableTh.module.css';

// A sortable table-header cell. Pair with the useTableSort hook:
//   const { sorted, sortKey, sortDir, toggleSort } = useTableSort(rows, {...});
//   <SortableTh column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Name</SortableTh>
// Clicking cycles ascending → descending → default order. Renders a real <th>,
// so it inherits the table's existing header styling; className is merged through.
// `helpKey` adds an ⓘ after the label — outside the sort button, so opening help
// does not sort.
export function SortableTh({ column, sortKey, sortDir, onSort, children, className = '', helpKey, helpPlacement = 'bottom', ...rest }) {
  const active = sortKey === column;
  return (
    <th
      className={className}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...rest}
    >
      <button type="button" className={styles.btn} onClick={() => onSort(column)} title="Sort by this column">
        <span>{children}</span>
        <span className={`${styles.arrow} ${active ? styles.arrowActive : ''}`} aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
      {helpKey && <HelpDot k={helpKey} placement={helpPlacement} />}
    </th>
  );
}
