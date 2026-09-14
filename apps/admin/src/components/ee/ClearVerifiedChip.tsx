/**
 * ClearVerifiedChip — small green "Verified by CLEAR" pill shown next to the
 * applicant name when the linked Verify Assist identity verification
 * succeeded. Shared by ApplicantSidebar, CaseNavBar, and the dashboard.
 */

import { ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ClearVerifiedChipProps {
  className?: string;
  /** Compact form renders the icon only (label in the tooltip). */
  compact?: boolean;
}

export function ClearVerifiedChip({ className, compact = false }: ClearVerifiedChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 text-green-700 font-semibold whitespace-nowrap',
        compact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
        className,
      )}
      title="Identity verified by CLEAR"
      data-slot="clear-verified-chip"
    >
      <ShieldCheck className="w-3 h-3" aria-hidden="true" />
      {compact ? <span className="sr-only">Verified by CLEAR</span> : 'Verified by CLEAR'}
    </span>
  );
}
