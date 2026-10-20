// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { getComponentColor } from '../utils/componentColors';
import styles from './ComponentPill.module.css';

const STATUS_COLOR = {
  operational:    '#34d399',
  degraded:       '#f59e0b',
  planned:        '#94a3b8',
  decommissioned: '#ef4444',
  unknown:        '#475569',
};

/**
 * Shared PPITF component pill — solid or subtle variant.
 *
 * solid:  full type-color background (matches graph nodes)
 * subtle: translucent bg + type-color border (non-highlighted state)
 */
export function ComponentPill({
  component,
  variant = 'solid',
  showStatus = false,
  onRemove,
  onAction,
  actionLabel,
  onClick,
  title,
  className = '',
}) {
  const { bg, border, text } = getComponentColor(component.component_type);

  const style = variant === 'solid'
    ? { background: bg, borderColor: border, color: text }
    : { background: `${bg}26`, borderColor: border, color: 'var(--text-secondary)' };

  return (
    <span
      className={`${styles.pill} ${styles[variant]} ${onClick ? styles.clickable : ''} ${className}`}
      style={style}
      onClick={onClick}
      title={title}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e); } : undefined}
    >
      {showStatus && (
        <span
          className={styles.statusDot}
          style={{ background: STATUS_COLOR[component.status] ?? '#475569' }}
          title={component.status}
        />
      )}
      <span className={styles.name}>{component.name}</span>
      {onAction && (
        <button
          type="button"
          className={styles.actionBtn}
          style={{ borderColor: border, color: variant === 'solid' ? text : 'var(--text-muted)' }}
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          aria-label={`${actionLabel || 'Action'}: ${component.name}`}
        >
          {actionLabel || 'Mark'}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${component.name}`}
          title="Remove"
        >×</button>
      )}
    </span>
  );
}

/**
 * Small type label chip — used as a group header in list views.
 */
export function TypeBadge({ type, small = false }) {
  const { bg, text } = getComponentColor(type);
  return (
    <span
      className={`${styles.typeBadge} ${small ? styles.typeBadgeSmall : ''}`}
      style={{ background: bg, color: text }}
    >
      {type}
    </span>
  );
}
