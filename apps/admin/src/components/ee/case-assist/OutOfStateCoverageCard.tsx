/**
 * OutOfStateCoverageCard — THE one place the Case Assist panel states the
 * CLEAR / Verify Assist out-of-state Medicaid finding. It replaces the former
 * pair of a critical RecommendationCard plus a separate VerifyAssistFlagCard:
 *
 *   ┌ CRITICAL · P1 · Verify Assist · CLEAR              [Open] ┐
 *   │ Active out-of-state Medicaid coverage detected (SC)       │
 *   │ body (incl. the applicant's hosted-flow response)         │
 *   │ evidence: payer · plan status · member id · start · reply │
 *   │ actions: Issue RFI… → · Contact SC DHHS ☐ · Hold… →       │
 *   │          Mark flag in review · Resolve flag · Dismiss flag│
 *   │ ▸ 2 notes                                                 │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Once the flag is resolved/dismissed the server emits no recommendation and
 * the card collapses to a single muted summary line (disposition + date) that
 * still expands to the notes thread — it must not read as an open finding.
 * The flag mutation lives here; the parent refetches the case on success.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { AlertOctagon, ChevronDown, Flag, MessageSquare, Square, SquareCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { CaseAssistRecommendation, CoverageDetermination, VerifyAssistFlag } from '../../../types/ee';
import { UPDATE_VERIFY_ASSIST_FLAG_MUTATION } from '../../../lib/ee-operations';
import { cn, DASH, fmtDate } from '../../../lib/utils';
import { formatRelativeTime } from '../../../lib/format-relative-time';
import { FlagDispositionDialog, type FlagDisposition, DISPOSITION_REASONS } from './FlagDispositionDialog';

const LOG_PREFIX = '[OutOfStateCoverageCard]' as const;

export const FLAG_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-red-50 text-red-700 border-red-200' },
  in_review: { label: 'In review', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Resolved', cls: 'bg-green-50 text-green-700 border-green-200' },
  dismissed: { label: 'Dismissed', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function FlagStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = FLAG_STATUS_STYLES[status] ?? {
    label: status.replace(/_/g, ' '),
    cls: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        s.cls,
        className,
      )}
      data-slot="verify-assist-flag-status"
    >
      <Flag className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function dispositionLabel(reason: string | null | undefined): string {
  if (!reason) return DASH;
  for (const list of Object.values(DISPOSITION_REASONS)) {
    const hit = list.find((r) => r.value === reason);
    if (hit) return hit.label;
  }
  return reason.replace(/_/g, ' ');
}

const RESPONSE_LABELS: Record<string, string> = {
  ended_submit_proof: 'Coverage has ended — proof of disenrollment submitted',
  confirm_enrolled: 'Still enrolled — asked to continue with caseworker review',
};

export function isFlagClosed(flag: { status: string } | null | undefined): boolean {
  return flag?.status === 'resolved' || flag?.status === 'dismissed';
}

export interface OutOfStateCoverageCardProps {
  /** The `oos-medicaid` recommendation; null once the flag is closed (the server stops emitting it). */
  recommendation: CaseAssistRecommendation | null;
  flag: VerifyAssistFlag | null;
  determination: CoverageDetermination | null;
  /** Applicant's hosted-flow response: ended_submit_proof | confirm_enrolled | null */
  resolution: string | null;
  /** Which suggested actions the parent can perform (rendered as buttons). */
  canPerform?: (recommendation: CaseAssistRecommendation, action: string) => boolean;
  /** Perform a suggested action (Issue RFI…, Hold determination…). */
  onAction?: (recommendation: CaseAssistRecommendation, action: string) => boolean;
  /** Signed-in caseworker email — sent as assignee when marking in review. */
  actorEmail?: string | null;
  /** Called after a successful flag update so the parent can refetch the case. */
  onUpdated?: () => Promise<unknown> | void;
}

export function OutOfStateCoverageCard({
  recommendation: rec,
  flag,
  determination,
  resolution,
  canPerform,
  onAction,
  actorEmail,
  onUpdated,
}: OutOfStateCoverageCardProps) {
  const [disposition, setDisposition] = useState<FlagDisposition | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const closed = isFlagClosed(flag);
  const flagStatus = flag?.status ?? 'open';

  const [updateFlag, { loading }] = useMutation(UPDATE_VERIFY_ASSIST_FLAG_MUTATION, {
    onError: (err) => {
      console.error(LOG_PREFIX, 'update error', { name: err.name });
      toast.error('Could not update the Verify Assist flag. Please try again.');
    },
  });

  async function submit(input: { status: string; dispositionReason?: string; note?: string; assignee?: string }) {
    if (!flag) return false;
    const result = await updateFlag({ variables: { input: { flagId: flag.id, ...input } } });
    const payload = result.data?.updateVerifyAssistFlag;
    if (!payload) return false;
    if (payload.errors.length > 0) {
      console.error(LOG_PREFIX, 'payload error', payload.errors[0].code);
      toast.error(payload.errors[0].message || 'Could not update the Verify Assist flag.');
      return false;
    }
    await onUpdated?.();
    return true;
  }

  async function handleMarkInReview() {
    const ok = await submit({ status: 'in_review', assignee: actorEmail ?? undefined });
    if (ok) toast.success('Flag marked in review', { description: 'Assigned to you. Audit entry written.' });
  }

  async function handleDisposition(payload: { dispositionReason: string; note: string | null }) {
    if (!disposition) return;
    const ok = await submit({
      status: disposition,
      dispositionReason: payload.dispositionReason,
      note: payload.note ?? undefined,
    });
    if (ok) {
      setDisposition(null);
      toast.success(disposition === 'resolved' ? 'Flag resolved' : 'Flag dismissed', {
        description: 'The case flag was cleared; determination is no longer blocked by this finding.',
      });
    }
  }

  const stateName = determination?.payer_state_name ?? determination?.payer_state ?? 'another state';
  const coverage = determination?.coverage ?? null;
  const payer = coverage?.payer_name ?? `${stateName} Medicaid`;
  const notes = [...(flag?.notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const noteCount = notes.length;

  const notesBlock = (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        aria-expanded={notesOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
        data-slot="flag-notes-toggle"
      >
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" aria-hidden="true" />
          {noteCount} note{noteCount === 1 ? '' : 's'}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', notesOpen && 'rotate-180')} aria-hidden="true" />
      </button>
      {notesOpen && (
        <div className="px-3 pb-3" data-slot="flag-notes">
          {noteCount === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          ) : (
            <ol className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="text-xs">
                  <p className="text-foreground leading-snug whitespace-pre-wrap">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {n.author} · {formatRelativeTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );

  // ── Closed: one muted summary line (still expandable to the notes) ────────
  if (closed && flag) {
    const verb = flag.status === 'dismissed' ? 'dismissed' : 'resolved';
    return (
      <article
        className="rounded-lg border border-border bg-muted/20 overflow-hidden"
        aria-label="Out-of-state coverage finding"
        data-slot="out-of-state-coverage-card"
        data-state="closed"
        data-flag-status={flag.status}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <FlagStatusBadge status={flag.status} className="mt-px" />
          <p className="text-xs text-muted-foreground leading-snug min-w-0">
            <span className="font-semibold text-foreground">Out-of-state coverage finding {verb}</span>
            {' · '}
            {payer}
            {' · '}
            {dispositionLabel(flag.dispositionReason)}
            {' · '}
            {fmtDate(flag.updatedAt)}
          </p>
        </div>
        {notesBlock}
        {disposition && (
          <FlagDispositionDialog
            key={disposition}
            open
            disposition={disposition}
            onOpenChange={(next) => {
              if (!next) setDisposition(null);
            }}
            submitting={loading}
            onSubmit={(p) => void handleDisposition(p)}
          />
        )}
      </article>
    );
  }

  // ── Open / in review: the single, complete finding ───────────────────────
  const title = rec?.title ?? `Active out-of-state Medicaid coverage detected (${stateName})`;
  const body =
    rec?.body ??
    `CLEAR's coverage discovery found an ACTIVE ${payer} enrollment. Federal rules bar concurrent Medicaid enrollment in two states, so State-X coverage cannot be approved until the ${stateName} case is closed.`;
  const actions = rec?.suggestedActions ?? [];
  const rail = 'var(--civic-error-solid, #dc2626)';
  const bg = 'var(--civic-error-bg, rgb(254 242 242))';
  const text = 'var(--civic-error-text, #991b1b)';

  return (
    <article
      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
      style={{ borderLeft: `4px solid ${rail}` }}
      aria-label="Out-of-state coverage finding"
      data-slot="out-of-state-coverage-card"
      data-state="open"
      data-severity="critical"
      data-flag-status={flagStatus}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: bg, color: text }}
          aria-hidden="true"
        >
          <AlertOctagon className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1 py-px rounded"
              style={{ backgroundColor: bg, color: text }}
            >
              Critical
            </span>
            <span className="text-[10px] text-muted-foreground">P1 · Verify Assist · CLEAR</span>
            <FlagStatusBadge status={flagStatus} className="ml-auto" />
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug mt-0.5">{title}</h3>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-3">
        <p className="text-xs text-foreground leading-relaxed">{body}</p>

        {/* Evidence — one compact block */}
        <dl
          className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs"
          aria-label="Coverage evidence"
          data-slot="oos-evidence"
        >
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Payer</dt>
            <dd className="text-foreground">{payer}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan status</dt>
            <dd className="text-foreground">{coverage?.plan_status ?? DASH}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Member ID</dt>
            <dd className="text-foreground font-mono">{coverage?.insurance_member_id ?? DASH}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Coverage start</dt>
            <dd className="text-foreground">{coverage?.coverage_start_date ? fmtDate(coverage.coverage_start_date) : DASH}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Applicant's response</dt>
            <dd className="text-foreground">
              {resolution ? RESPONSE_LABELS[resolution] ?? resolution.replace(/_/g, ' ') : 'No response recorded in the hosted flow'}
            </dd>
          </div>
          {flag?.assignee && (
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Flag assignee</dt>
              <dd className="text-foreground truncate">{flag.assignee}</dd>
            </div>
          )}
        </dl>

        {/* Actions — suggested actions + flag controls in one row */}
        <div className="space-y-1.5" data-slot="oos-actions">
          {actions.length > 0 && (
            <ul className="space-y-1">
              {actions.map((action) => {
                const performable = !!rec && (canPerform?.(rec, action) ?? false);
                if (performable) {
                  return (
                    <li key={action}>
                      <button
                        type="button"
                        onClick={() => rec && onAction?.(rec, action)}
                        className="w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-95"
                        style={{ backgroundColor: bg, color: text, borderColor: rail }}
                      >
                        {action} →
                      </button>
                    </li>
                  );
                }
                const checked = !!done[action];
                return (
                  <li key={action}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => setDone((d) => ({ ...d, [action]: !checked }))}
                      className={cn(
                        'w-full flex items-start gap-2 text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors',
                        checked ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}
                    >
                      {checked ? (
                        <SquareCheck className="w-3.5 h-3.5 mt-px flex-shrink-0 text-green-700" aria-hidden="true" />
                      ) : (
                        <Square className="w-3.5 h-3.5 mt-px flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span>{action}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {flag && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {flag.status === 'open' && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleMarkInReview()}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  Mark flag in review
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => setDisposition('resolved')}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                Resolve flag
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setDisposition('dismissed')}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Dismiss flag
              </button>
            </div>
          )}
        </div>

        {/* Why */}
        {rec && (
          <div className="rounded-md bg-muted/40 border border-border px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why</p>
            <p className="text-xs text-foreground leading-relaxed">{rec.rationale.summary}</p>
            {rec.rationale.citedFieldPaths.length > 0 && (
              <ul className="flex flex-wrap gap-1 mt-1.5" aria-label="Cited fields">
                {rec.rationale.citedFieldPaths.map((path) => (
                  <li
                    key={path}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground"
                  >
                    {path}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {flag && notesBlock}

      {disposition && (
        <FlagDispositionDialog
          key={disposition}
          open
          disposition={disposition}
          onOpenChange={(next) => {
            if (!next) setDisposition(null);
          }}
          submitting={loading}
          onSubmit={(p) => void handleDisposition(p)}
        />
      )}
    </article>
  );
}
