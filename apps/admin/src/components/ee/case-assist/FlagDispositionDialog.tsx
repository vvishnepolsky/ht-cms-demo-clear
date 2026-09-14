/**
 * FlagDispositionDialog — small confirmation dialog used when a caseworker
 * resolves or dismisses a Verify Assist flag. Requires a disposition reason
 * and accepts an optional note; the parent owns the mutation.
 */

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui';
import { PhiCautionNote } from '../PhiCautionNote';

export type FlagDisposition = 'resolved' | 'dismissed';

export const DISPOSITION_REASONS: Record<FlagDisposition, ReadonlyArray<{ value: string; label: string }>> = {
  resolved: [
    { value: 'disenrollment_confirmed', label: 'Disenrollment confirmed by the other state' },
    { value: 'proof_received', label: 'Applicant submitted proof coverage ended' },
    { value: 'coverage_terminated_by_applicant', label: 'Applicant terminated the other coverage' },
    { value: 'other', label: 'Other (explain in note)' },
  ],
  dismissed: [
    { value: 'false_positive', label: 'False positive — not the same person' },
    { value: 'coverage_inactive', label: 'Coverage record is stale / inactive' },
    { value: 'not_medicaid', label: 'Payer is not a Medicaid program' },
    { value: 'other', label: 'Other (explain in note)' },
  ],
};

export interface FlagDispositionDialogProps {
  open: boolean;
  disposition: FlagDisposition;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onSubmit: (payload: { dispositionReason: string; note: string | null }) => void;
}

export function FlagDispositionDialog({ open, disposition, onOpenChange, submitting, onSubmit }: FlagDispositionDialogProps) {
  const reasons = DISPOSITION_REASONS[disposition];
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const needsNote = reason === 'other';
  const canSubmit = !!reason && (!needsNote || note.trim().length > 0) && !submitting;
  const verb = disposition === 'resolved' ? 'Resolve' : 'Dismiss';

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason('');
      setNote('');
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} Verify Assist flag</DialogTitle>
          <DialogDescription>
            {disposition === 'resolved'
              ? 'Record how the out-of-state coverage finding was resolved. The case can then proceed to determination.'
              : 'Record why this finding does not apply. Dismissing keeps the audit trail but removes the block on determination.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <fieldset>
            <legend className="text-sm font-medium mb-2">Disposition reason</legend>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <label key={r.value} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="flag-disposition-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    disabled={submitting}
                    className="mt-0.5"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="flag-disposition-note" className="text-sm font-medium block mb-1.5">
              Note{' '}
              <span className="text-muted-foreground font-normal">{needsNote ? '(required)' : '(optional)'}</span>
            </label>
            <textarea
              id="flag-disposition-note"
              rows={3}
              value={note}
              maxLength={2000}
              disabled={submitting}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. SCDHHS confirmed termination effective 08/31/2026."
              aria-describedby="flag-disposition-note-phi"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <PhiCautionNote id="flag-disposition-note-phi" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={disposition === 'dismissed' ? 'destructive' : 'default'}
            disabled={!canSubmit}
            onClick={() => onSubmit({ dispositionReason: reason, note: note.trim() || null })}
          >
            {submitting ? `${verb.replace(/e$/, '')}ing…` : `${verb} flag`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
