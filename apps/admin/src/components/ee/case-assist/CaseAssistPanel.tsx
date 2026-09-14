/**
 * CaseAssistPanel — the caseworker-facing Case Assist rail for a case.
 *
 *   ┌ Case Assist ✦   Narrative by Claude · 2 hours ago ┐
 *   │ narrative paragraph                               │
 *   │ [Out-of-state coverage card — ONE finding: status, │
 *   │  evidence, suggested actions, flag controls, notes]│
 *   │ other recommendation cards ordered by priority    │
 *   └───────────────────────────────────────────────────┘
 *
 * Data comes from `medicaidEeCase.caseAssist` (rule-based recommendations
 * + optional Claude narrative) and `medicaidEeCase.identityVerification`
 * (CLEAR / Verify Assist). The panel only knows how to perform the
 * suggested actions it is given handlers for (issue an RFI pre-filled with
 * the disenrollment proof, hold determination); everything else renders as
 * a session checklist.
 */

import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { CaseAssistRecommendation, CaseAssistResult, EECase, IdentityVerification } from '../../../types/ee';
import { hasOutOfStateCoverage } from '../../../types/ee';
import { formatRelativeTime } from '../../../lib/format-relative-time';
import { RecommendationCard } from './RecommendationCard';
import { OutOfStateCoverageCard } from './OutOfStateCoverageCard';

/** Recommendation id the server uses for the out-of-state Medicaid finding. */
export const OOS_MEDICAID_RECOMMENDATION_ID = 'oos-medicaid' as const;
/** Suggested action text (verbatim from the server) that opens the RFI modal. */
export const OOS_RFI_ACTION = 'Issue RFI for proof of SC Medicaid disenrollment' as const;
/** Pre-filled RFI item for the out-of-state disenrollment proof. */
export const OOS_RFI_ITEM = 'Proof of South Carolina Medicaid disenrollment (termination letter or SCDHHS confirmation)' as const;

function isRfiAction(action: string): boolean {
  return /issue rfi/i.test(action);
}

function isHoldAction(action: string): boolean {
  return /hold determination/i.test(action);
}

export interface CaseAssistPanelProps {
  eeCase: EECase;
  caseAssist: CaseAssistResult | null | undefined;
  identityVerification: IdentityVerification | null | undefined;
  /** Open the RFI modal pre-filled with the given items. */
  onIssueRfi: (items: string[]) => void;
  /** Refetch the case after a flag update. */
  onFlagUpdated?: () => Promise<unknown> | void;
  actorEmail?: string | null;
  className?: string;
}

export function CaseAssistPanel({
  eeCase,
  caseAssist,
  identityVerification: iv,
  onIssueRfi,
  onFlagUpdated,
  actorEmail,
  className,
}: CaseAssistPanelProps) {
  const narrative = caseAssist?.narrative ?? eeCase.caseAssistNarrative ?? null;
  const source = caseAssist?.narrativeSource === 'claude' ? 'Narrative by Claude' : 'Rule-based';
  const recommendations = [...(caseAssist?.recommendations ?? [])].sort(
    (a, b) => a.priority - b.priority || severityRank(a.severity) - severityRank(b.severity),
  );
  // The out-of-state finding is stated exactly once, by OutOfStateCoverageCard
  // (which also owns the flag controls); it is pulled out of the generic list.
  const oos = hasOutOfStateCoverage(iv) || !!iv?.flag;
  const oosRecommendation = recommendations.find((r) => r.id === OOS_MEDICAID_RECOMMENDATION_ID) ?? null;
  const otherRecommendations = recommendations.filter((r) => r.id !== OOS_MEDICAID_RECOMMENDATION_ID);

  function canPerform(rec: CaseAssistRecommendation, action: string): boolean {
    if (rec.id === OOS_MEDICAID_RECOMMENDATION_ID && isRfiAction(action)) return true;
    if (isHoldAction(action)) return true;
    return false;
  }

  function handleAction(rec: CaseAssistRecommendation, action: string): boolean {
    if (rec.id === OOS_MEDICAID_RECOMMENDATION_ID && isRfiAction(action)) {
      onIssueRfi([OOS_RFI_ITEM]);
      return true;
    }
    if (isHoldAction(action)) {
      toast.info('Determination on hold', {
        description: 'The Verify Assist flag stays open — Approve will warn until it is resolved or dismissed.',
      });
      return true;
    }
    return false;
  }

  return (
    <aside
      className={className}
      aria-labelledby="case-assist-panel-title"
      data-slot="case-assist-panel"
      data-narrative-source={caseAssist?.narrativeSource ?? 'none'}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
            style={{ backgroundColor: 'var(--civic-accent-solid, #4f46e5)' }}
            aria-hidden="true"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h2 id="case-assist-panel-title" className="text-sm font-semibold text-foreground leading-tight">
              Case Assist
            </h2>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {source}
              {caseAssist?.generatedAt && <> · {formatRelativeTime(caseAssist.generatedAt)}</>}
            </p>
          </div>
        </div>
        {recommendations.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5 flex-shrink-0">
            {recommendations.length} finding{recommendations.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Narrative */}
      {narrative ? (
        <p className="text-xs text-foreground leading-relaxed mb-3" data-slot="case-assist-narrative">
          {narrative}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          No narrative yet — recommendations below are derived from the case data.
        </p>
      )}

      <div className="space-y-2.5">
        {/* The out-of-state finding — one card, first, whatever its state */}
        {oos && iv && (
          <OutOfStateCoverageCard
            recommendation={oosRecommendation}
            flag={iv.flag}
            determination={iv.determination}
            resolution={iv.resolution}
            canPerform={canPerform}
            onAction={handleAction}
            actorEmail={actorEmail}
            onUpdated={onFlagUpdated}
          />
        )}

        {recommendations.length === 0 && !oos && (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
            No recommendations for this case.
          </p>
        )}

        {otherRecommendations.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            canPerform={canPerform}
            onAction={handleAction}
          />
        ))}
      </div>
    </aside>
  );
}

function severityRank(severity: string): number {
  return severity === 'critical' ? 0 : severity === 'warning' ? 1 : 2;
}
