/**
 * PendingRfiBanner — surfaces a pending RFI on a case workspace.
 *
 * Thin wrapper around UnifiedCaseBanner. Maps the deadline-urgency tone
 * (overdue → red, urgent → amber, normal → grey) and renders the RFI-specific
 * detail (items requested, applicant note, resolve form) as banner children.
 */

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '../ui';
import { UnifiedCaseBanner, type CtaProps, type UnifiedCaseBannerTone } from './UnifiedCaseBanner';
import type { EERfiDetails } from '../../types/ee';

export interface PendingRfiBannerProps {
  rfi: EERfiDetails;
  resolving: boolean;
  onResolve: () => void;
}

function daysRemaining(deadlineIso: string): { label: string; tone: 'normal' | 'urgent' | 'overdue' } {
  const deadline = new Date(deadlineIso).getTime();
  const diffMs = deadline - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return { label: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`, tone: 'overdue' };
  }
  if (diffDays === 0) return { label: 'Due today', tone: 'urgent' };
  if (diffDays <= 3) return { label: `${diffDays} day${diffDays === 1 ? '' : 's'} remaining`, tone: 'urgent' };
  return { label: `${diffDays} days remaining`, tone: 'normal' };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DEADLINE_TONE_MAP: Record<'normal' | 'urgent' | 'overdue', UnifiedCaseBannerTone> = {
  overdue: 'red',
  urgent: 'amber',
  normal: 'grey',
};

export function PendingRfiBanner({ rfi, resolving, onResolve }: PendingRfiBannerProps) {
  const [showResolve, setShowResolve] = useState(false);

  const { label: countdown, tone: deadlineTone } = daysRemaining(rfi.deadline);
  const bannerTone = DEADLINE_TONE_MAP[deadlineTone];

  function handleConfirm() {
    onResolve();
  }

  function handleCancel() {
    setShowResolve(false);
  }

  const resolveCta: CtaProps = showResolve ? {} : { ctaLabel: 'Mark as resolved', onCta: () => setShowResolve(true) };

  return (
    <>
      {/*
        Live region scoped to a static string only (per
        standards/a11y-frontend.md Rule 4). Previously the entire banner was
        role="status" aria-live="polite", which would auto-announce
        server-supplied content (itemsRequested, deadline, noteToApplicant)
        on every mount.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        Request for additional information pending for this case.
      </span>
      <UnifiedCaseBanner
        tone={bannerTone}
        action="Request for additional information pending"
        context={
          <p className="inline-flex items-center gap-1 text-xs font-medium">
            <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
            Due {formatDate(rfi.deadline)} · {countdown}
          </p>
        }
        {...resolveCta}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-80">Items requested</p>
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {rfi.itemsRequested.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {rfi.noteToApplicant && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-80">Note to applicant</p>
            <p className="text-sm whitespace-pre-wrap">{rfi.noteToApplicant}</p>
          </div>
        )}

        <p className="text-xs opacity-70">Issued {formatDate(rfi.issuedAt)}.</p>

        {showResolve && (
          <div className="rounded border border-current/30 bg-card p-3 space-y-2">
            <p className="text-sm text-foreground">Mark this request for information as resolved?</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={resolving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={resolving}>
                {resolving ? 'Resolving...' : 'Confirm resolve'}
              </Button>
            </div>
          </div>
        )}
      </UnifiedCaseBanner>
    </>
  );
}
