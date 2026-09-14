/**
 * EligibilityResult -- summary card showing the latest determination outcome.
 */

import { ShieldCheck, ShieldX, Clock, HelpCircle } from 'lucide-react';
import { Badge, Card, CardContent } from '../ui';
import { cn, fmtDate, formatCategory, toCalendarDate } from '../../lib/utils';
import type { EEDetermination } from '../../types/ee';

export interface EligibilityResultProps {
  determination: EEDetermination | null;
}

const STATUS_CONFIG = {
  ELIGIBLE: {
    icon: ShieldCheck,
    label: 'Eligible',
    badgeVariant: 'default' as const,
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
    borderClass: 'border-emerald-200 dark:border-emerald-900',
  },
  INELIGIBLE: {
    icon: ShieldX,
    label: 'Ineligible',
    badgeVariant: 'destructive' as const,
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/5',
    borderClass: 'border-destructive/20',
  },
  PENDING: {
    icon: Clock,
    label: 'Pending',
    badgeVariant: 'secondary' as const,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/30',
    borderClass: 'border-muted',
  },
  DEFERRED: {
    icon: HelpCircle,
    label: 'Deferred',
    badgeVariant: 'secondary' as const,
    iconClass: 'text-amber-600',
    bgClass: 'bg-amber-50 dark:bg-amber-950/20',
    borderClass: 'border-amber-200 dark:border-amber-900',
  },
} as const;

export function EligibilityResult({ determination }: EligibilityResultProps) {
  if (!determination) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Eligibility Result</h3>
          <p className="text-sm text-muted-foreground">No determination available for this case.</p>
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[determination.status];
  const Icon = config.icon;

  return (
    <Card className={cn('border', config.borderClass)}>
      <CardContent className={cn('p-5', config.bgClass)}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Eligibility Result</h3>
          <Badge variant={config.badgeVariant} className="text-xs">
            {config.label}
          </Badge>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Icon className={cn('h-8 w-8 shrink-0', config.iconClass)} />
          <div>
            <p className="text-sm font-medium">
              {determination.person ? `${determination.person.firstName} ${determination.person.lastName}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{formatCategory(determination.category)} Determination</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Effective Date</dt>
            <dd className="mt-0.5">{fmtDate(toCalendarDate(determination.effectiveDate))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Expiration Date</dt>
            <dd className="mt-0.5">{fmtDate(toCalendarDate(determination.expirationDate))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Determined At</dt>
            <dd className="mt-0.5">{fmtDate(determination.determinedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Category</dt>
            <dd className="mt-0.5">{formatCategory(determination.category)}</dd>
          </div>
        </dl>

        {determination.denialReason && (
          <div className="mt-3 rounded-md bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">Denial Reason</p>
            <p className="text-sm text-foreground mt-1">{determination.denialReason}</p>
          </div>
        )}

        {determination.notes && (
          <div className="mt-3 rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{determination.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
