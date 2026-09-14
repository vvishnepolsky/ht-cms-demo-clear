/**
 * ReviewDecideModal — caseworker confirms the eligibility decision and (for
 * denials) provides the reason that goes into the Notice of Action.
 *
 * Replaces the inline approve-confirm / deny-reason prompts that previously
 * lived inside the bottom action bar. The storyboard's CaseActionBar exposes
 * a single primary CTA ("Review & Decide →"); this modal is what opens. It
 * unifies approve + deny + (future) pend behind one decision step, matching
 * the storyboard's DecidePanel pattern but without requiring the full
 * phase-based workspace content.
 */

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';
import { PhiCautionNote } from './PhiCautionNote';

type Decision = 'approve' | 'deny';

const DENY_REASON_MAX = 2000;

export interface ReviewDecideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseLabel: string;
  applicantName: string;
  approving: boolean;
  denying: boolean;
  onApprove: () => void;
  onDeny: (reason: string) => void;
}

export function ReviewDecideModal({
  open,
  onOpenChange,
  caseLabel,
  applicantName,
  approving,
  denying,
  onApprove,
  onDeny,
}: ReviewDecideModalProps) {
  const [decision, setDecision] = useState<Decision>('approve');
  const [denyReason, setDenyReason] = useState('');
  const submitting = approving || denying;

  function handleSubmit() {
    if (decision === 'approve') {
      onApprove();
      return;
    }
    const trimmed = denyReason.trim();
    if (!trimmed) return;
    onDeny(trimmed);
  }

  const canSubmit = !submitting && (decision === 'approve' || denyReason.trim().length > 0);

  const submitLabel =
    decision === 'approve' ? (approving ? 'Approving…' : 'Confirm Approval') : denying ? 'Denying…' : 'Confirm Denial';

  // Reset internal state when the dialog closes via any path (Cancel,
  // backdrop click, Escape) so reopening the modal starts fresh — matches
  // AddNoteModal's sibling pattern.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setDecision('approve');
      setDenyReason('');
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review &amp; Decide</DialogTitle>
          <DialogDescription>
            {caseLabel} · {applicantName}. A Notice of Action is generated and the audit log is written on submit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Decision</legend>
            <label className="flex items-start gap-3 rounded-md border border-input p-3 cursor-pointer hover:bg-muted/40">
              <input
                type="radio"
                name="decision"
                value="approve"
                checked={decision === 'approve'}
                onChange={() => setDecision('approve')}
                disabled={submitting}
                className="mt-0.5"
              />
              <span>
                <span className="text-sm font-medium block">Approve</span>
                <span className="text-xs text-muted-foreground">
                  All eligibility criteria met. Coverage begins on the effective date.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-input p-3 cursor-pointer hover:bg-muted/40">
              <input
                type="radio"
                name="decision"
                value="deny"
                checked={decision === 'deny'}
                onChange={() => setDecision('deny')}
                disabled={submitting}
                className="mt-0.5"
              />
              <span>
                <span className="text-sm font-medium block">Deny</span>
                <span className="text-xs text-muted-foreground">
                  Applicant does not meet eligibility criteria. A reason is required for the NOA.
                </span>
              </span>
            </label>
          </fieldset>

          {decision === 'deny' && (
            <div>
              <label htmlFor="deny-reason" className="text-sm font-medium block mb-1">
                Reason for denial
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <textarea
                id="deny-reason"
                value={denyReason}
                maxLength={DENY_REASON_MAX}
                onChange={(e) => setDenyReason(e.target.value)}
                disabled={denying}
                rows={4}
                placeholder="Enter the specific eligibility criteria that were not met (e.g., income exceeds 138% FPL for household size)."
                aria-describedby="deny-reason-phi"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                autoFocus
              />
              <PhiCautionNote id="deny-reason-phi" />
              <p className="text-xs text-muted-foreground mt-1">
                {denyReason.length}/{DENY_REASON_MAX}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            variant={decision === 'deny' ? 'destructive' : 'default'}
            onClick={handleSubmit}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
