/**
 * Empty state shown by the fixture-backed drawer tabs (Application Data,
 * Messages & Notices) when the current case has no fixture in
 * `data/case-details.ts`. (Documents was de-wired from the fixture in
 * #1529 and renders live data, so it no longer uses this component.)
 *
 * Why this exists: the previous behavior was to fall back to a hardcoded
 * default fixture (Robert Mitchell, IA-2026-045866). That caused tabs to
 * display somebody else's identity, income, documents, and portal
 * messages on every non-fixtured case (e.g., the freshly-submitted
 * resident cases all looked like Robert Mitchell). The empty state makes
 * the gap explicit instead of misleading the caseworker.
 *
 * Caller passes the tab label so the copy can be tab-specific without
 * needing a dedicated component per tab.
 */

import { FileQuestion } from 'lucide-react';
import type { DrawerCaseRow } from './types';

export interface DrawerEmptyStateProps {
  /** Tab-specific label (e.g., "Application data", "Documents"). */
  label: string;
  /** Pulled into the message so the caseworker sees which case it's about. */
  caseRow: DrawerCaseRow;
}

export function DrawerEmptyState({ label, caseRow }: DrawerEmptyStateProps) {
  const caseLabel = caseRow.caseNumber ?? caseRow.id.slice(-8).toUpperCase();
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center text-center gap-3"
      style={{
        backgroundColor: 'var(--civic-bg-card)',
        borderColor: 'var(--civic-border-subtle)',
      }}
    >
      <FileQuestion className="w-8 h-8" style={{ color: 'var(--civic-text-placeholder)' }} aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
          {label} not yet wired for this case
        </p>
        <p className="text-xs leading-relaxed max-w-md" style={{ color: 'var(--civic-text-secondary)' }}>
          Case <span className="font-mono">{caseLabel}</span> ({caseRow.applicantName}) is sourced from real backend
          data, but per-tab snapshots in the case-details drawer are still backed by hand-authored fixtures. The
          fallback render was hiding this — we now show nothing rather than a different applicant's data.
        </p>
      </div>
    </div>
  );
}
