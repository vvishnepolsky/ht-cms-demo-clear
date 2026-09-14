import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { type EECaseStatus, WORKFLOW_STATUS_ACTION_NEEDED, WORKFLOW_STATUS_WAITING_APPLICANT } from '../../types/ee';
import { eeFlagClasses, eeFlagLabel } from '../../lib/ee-flags';
import { ClearVerifiedChip } from './ClearVerifiedChip';
import { FULL_CASE_DETAILS_LABEL } from '../../lib/workspace-constants';

function deriveLiveStatus(status: EECaseStatus, hasRfi: boolean): { cls: string; label: string } {
  if (status === 'APPROVED') return { cls: 'bg-green-50 text-green-700 border-green-200', label: 'Completed' };
  if (status === 'DENIED') return { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Denied' };
  if (status === 'CANCELED') return { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Canceled' };
  if (hasRfi) return { cls: 'bg-blue-50 text-blue-700 border-blue-200', label: WORKFLOW_STATUS_WAITING_APPLICANT };
  return { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: WORKFLOW_STATUS_ACTION_NEEDED };
}

function formatDueDate(daysRemaining: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysRemaining);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function dueDateColor(daysRemaining: number): string | undefined {
  if (daysRemaining <= 5) return '#dc2626';
  if (daysRemaining <= 14) return '#d97706';
  return undefined;
}

export interface CaseNavBarProps {
  applicantName: string;
  caseDisplayId: string;
  status: EECaseStatus;
  flags: string[];
  hasRfi: boolean;
  daysRemaining: number | null;
  /** Show the "Verified by CLEAR" chip next to the applicant name. */
  clearVerified?: boolean;
  prevCaseId: string | null;
  nextCaseId: string | null;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onViewDetails: () => void;
}

export function CaseNavBar({
  applicantName,
  caseDisplayId,
  status,
  flags,
  hasRfi,
  daysRemaining,
  clearVerified = false,
  prevCaseId,
  nextCaseId,
  onBack,
  onPrev,
  onNext,
  onViewDetails,
}: CaseNavBarProps) {
  const liveStatus = deriveLiveStatus(status, hasRfi);
  const isTerminal = status === 'APPROVED' || status === 'DENIED';

  return (
    <div className="bg-card border-b border-border px-5 h-11 flex items-center justify-between flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Cases
        </button>

        <div
          className="w-px h-4 flex-shrink-0"
          style={{ backgroundColor: 'var(--civic-border-component)' }}
          aria-hidden="true"
        />

        <span className="font-semibold text-foreground text-sm truncate">{applicantName}</span>
        {clearVerified && <ClearVerifiedChip compact className="flex-shrink-0" />}

        <span className="text-xs text-muted-foreground flex-shrink-0">{caseDisplayId}</span>

        {/* Live status badge — suppressed for terminal states; the flag
            badges (Auto-Approved / NO-TOUCH / etc.) convey the outcome. */}
        {!isTerminal && (
          <span
            className={`inline-flex items-center font-medium rounded-md text-xs px-1.5 py-0.5 border whitespace-nowrap flex-shrink-0 ${liveStatus.cls}`}
          >
            {liveStatus.label}
          </span>
        )}

        {/* Flag badges */}
        {flags.map((f) => (
          <span
            key={f}
            title={eeFlagLabel(f)}
            className={`inline-flex items-center font-medium rounded-md text-xs px-1.5 py-0.5 border whitespace-nowrap flex-shrink-0 ${eeFlagClasses(f)}`}
          >
            {f}
          </span>
        ))}

        {/* Full Case Details — hidden on terminal-state pages per design
            (the page has Overview / Messages / Audit Log tabs that already
            surface the drawer's content inline). */}
        {!isTerminal && (
          <>
            <div
              className="w-px h-4 flex-shrink-0"
              style={{ backgroundColor: 'var(--civic-border-component)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={onViewDetails}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              {FULL_CASE_DETAILS_LABEL}
            </button>
          </>
        )}
      </div>

      {/* Right — hidden on terminal-state pages (no due date, no prev/next
          navigation since the caseworker isn't actively triaging). */}
      {!isTerminal && (
        <div className="flex items-center gap-3 flex-shrink-0">
          {daysRemaining !== null && (
            <span className="text-xs text-muted-foreground">
              Due{' '}
              <span
                className="font-semibold"
                style={dueDateColor(daysRemaining) ? { color: dueDateColor(daysRemaining) } : undefined}
              >
                {formatDueDate(daysRemaining)}
              </span>
            </span>
          )}

          <div className="w-px h-4" style={{ backgroundColor: 'var(--civic-border-component)' }} aria-hidden="true" />

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!prevCaseId}
              aria-label="Previous case"
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!nextCaseId}
              aria-label="Next case"
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
