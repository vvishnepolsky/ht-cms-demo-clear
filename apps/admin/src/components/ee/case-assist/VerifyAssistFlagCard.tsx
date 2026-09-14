/**
 * VerifyAssistFlagCard — current status of the out-of-state Medicaid flag
 * raised by Verify Assist, its notes thread, and the caseworker actions
 * (Mark in review / Resolve / Dismiss). Resolve and dismiss go through
 * FlagDispositionDialog (reason + optional note). The mutation lives here;
 * the parent is told when the flag changed so it can refetch the case.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { Flag, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { VerifyAssistFlag, CoverageDetermination } from '../../../types/ee';
import { UPDATE_VERIFY_ASSIST_FLAG_MUTATION } from '../../../lib/ee-operations';
import { cn, DASH } from '../../../lib/utils';
import { formatRelativeTime } from '../../../lib/format-relative-time';
import { FlagDispositionDialog, type FlagDisposition, DISPOSITION_REASONS } from './FlagDispositionDialog';

const LOG_PREFIX = '[VerifyAssistFlagCard]' as const;

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

function dispositionLabel(reason: string | null): string {
  if (!reason) return DASH;
  for (const list of Object.values(DISPOSITION_REASONS)) {
    const hit = list.find((r) => r.value === reason);
    if (hit) return hit.label;
  }
  return reason.replace(/_/g, ' ');
}

export interface VerifyAssistFlagCardProps {
  flag: VerifyAssistFlag;
  determination: CoverageDetermination | null;
  /** Signed-in caseworker email — sent as assignee when marking in review. */
  actorEmail?: string | null;
  /** Called after a successful update so the parent can refetch the case. */
  onUpdated?: () => Promise<unknown> | void;
}

export function VerifyAssistFlagCard({ flag, determination, actorEmail, onUpdated }: VerifyAssistFlagCardProps) {
  const [disposition, setDisposition] = useState<FlagDisposition | null>(null);
  const isActive = flag.status === 'open' || flag.status === 'in_review';

  const [updateFlag, { loading }] = useMutation(UPDATE_VERIFY_ASSIST_FLAG_MUTATION, {
    onError: (err) => {
      console.error(LOG_PREFIX, 'update error', { name: err.name });
      toast.error('Could not update the Verify Assist flag. Please try again.');
    },
  });

  async function submit(input: { status: string; dispositionReason?: string; note?: string; assignee?: string }) {
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
        description: 'Determination is no longer blocked by the out-of-state finding.',
      });
    }
  }

  const payer =
    determination?.coverage?.payer_name ??
    (determination?.payer_state_name ? `${determination.payer_state_name} Medicaid` : 'Out-of-state Medicaid');

  return (
    <section
      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
      aria-label="Verify Assist flag"
      data-slot="verify-assist-flag-card"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verify Assist flag</p>
          <p className="text-xs font-semibold text-foreground truncate">{payer}</p>
        </div>
        <FlagStatusBadge status={flag.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignee</dt>
          <dd className="text-foreground truncate">{flag.assignee ?? 'Unassigned'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</dt>
          <dd className="text-foreground">{formatRelativeTime(flag.updatedAt)}</dd>
        </div>
        {flag.dispositionReason && (
          <div className="col-span-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Disposition</dt>
            <dd className="text-foreground">{dispositionLabel(flag.dispositionReason)}</dd>
          </div>
        )}
      </dl>

      {/* Actions */}
      {isActive && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
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

      {/* Notes thread */}
      <div className="border-t border-border px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          <MessageSquare className="w-3 h-3" aria-hidden="true" />
          Notes ({flag.notes.length})
        </p>
        {flag.notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        ) : (
          <ol className="space-y-2">
            {[...flag.notes]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((n) => (
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
    </section>
  );
}
