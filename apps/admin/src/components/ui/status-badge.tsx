import * as React from 'react';

type StatusStyle = React.CSSProperties;

const STATUS_MAP: Record<string, StatusStyle> = {
  active: { background: 'var(--civic-green-3)', color: 'var(--civic-green-11)' },
  enrolled: { background: 'var(--civic-green-3)', color: 'var(--civic-green-11)' },
  pending: { background: 'var(--civic-amber-3)', color: 'var(--civic-amber-11)' },
  'in review': { background: 'var(--civic-amber-3)', color: 'var(--civic-amber-11)' },
  processing: { background: 'var(--civic-amber-3)', color: 'var(--civic-amber-11)' },
  closed: { background: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' },
  inactive: { background: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' },
  denied: { background: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' },
  draft: { background: 'var(--civic-bg-component)', color: 'var(--civic-text-primary)' },
  urgent: { background: 'var(--civic-red-3)', color: 'var(--civic-red-11)' },
  critical: { background: 'var(--civic-red-3)', color: 'var(--civic-red-11)' },
};

const DEFAULT_STYLE: StatusStyle = {
  background: 'var(--civic-bg-component)',
  color: 'var(--civic-text-secondary)',
};

type StatusBadgeSize = 'default' | 'sm';

interface StatusBadgeProps {
  status: string;
  size?: StatusBadgeSize;
  className?: string;
  /** @deprecated Use size="sm" instead */
  variant?: 'default' | 'small';
}

/**
 * Use this to show the current status of a case or record, such as active, pending, closed, denied, and others. Pass the status string and the label and color are applied automatically. Don't create ad hoc colored badges; using this component consistently is what makes status scannable across the whole product.
 */
function StatusBadge({ status, size = 'default', variant, className }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const style = STATUS_MAP[key] ?? DEFAULT_STYLE;

  return (
    <span data-slot="status-badge" data-size={size} data-variant={variant} className={className} style={style}>
      {status}
    </span>
  );
}

export { StatusBadge };
