/**
 * StatusBadge -- maps MedicaidEeCaseStatus enum values to styled badges
 * using Civic design token colors.
 */

import { type EECaseStatus, WORKFLOW_STATUS_ACTION_NEEDED } from '../types/ee';
import { cn } from '../lib/utils';

const STATUS_CONFIG: Record<EECaseStatus, { label: string; style: React.CSSProperties }> = {
  PENDING_VERIFICATION: {
    label: WORKFLOW_STATUS_ACTION_NEEDED,
    style: {
      background: 'var(--civic-warning-bg)',
      color: 'var(--civic-warning-text)',
      borderColor: 'var(--civic-amber-6)',
    },
  },
  IN_REVIEW: {
    label: 'In Review',
    style: {
      background: 'var(--civic-info-bg)',
      color: 'var(--civic-info-text)',
      borderColor: 'var(--civic-blue-6)',
    },
  },
  APPROVED: {
    label: 'Approved',
    style: {
      background: 'var(--civic-success-bg)',
      color: 'var(--civic-success-text)',
      borderColor: 'var(--civic-success-border)',
    },
  },
  DENIED: {
    label: 'Denied',
    style: {
      background: 'var(--civic-destructive-bg)',
      color: 'var(--civic-destructive-text)',
      borderColor: 'var(--civic-destructive-border)',
    },
  },
  CANCELED: {
    label: 'Canceled',
    style: {
      background: 'var(--civic-bg-component)',
      color: 'var(--civic-text-secondary)',
      borderColor: 'var(--civic-border-subtle)',
    },
  },
};

const FALLBACK_STYLE: React.CSSProperties = {
  background: 'var(--civic-bg-component)',
  color: 'var(--civic-text-secondary)',
  borderColor: 'var(--civic-border-subtle)',
};

export interface StatusBadgeProps {
  status: EECaseStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, style: FALLBACK_STYLE };

  return (
    <span
      className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}
      style={config.style}
    >
      {config.label}
    </span>
  );
}
