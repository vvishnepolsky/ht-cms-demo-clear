/**
 * AddNoteModal — captures an internal caseworker note for the active case.
 *
 * The storyboard surfaces this as a small text-area dialog triggered from
 * the bottom CaseActionBar's "Add Note" button. The note is meant for the
 * case's internal audit trail (caseworker → caseworker hand-off context),
 * separate from the applicant-facing RFI flow. Backend persistence is not
 * wired yet — submission confirms via toast so the demo reads end-to-end.
 */

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';

const NOTE_MAX = 2000;

export interface AddNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseLabel: string;
  applicantName: string;
  onSubmit: (note: string) => void;
}

export function AddNoteModal({ open, onOpenChange, caseLabel, applicantName, onSubmit }: AddNoteModalProps) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setNote('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>
            {caseLabel} · {applicantName}. Internal note added to the case audit trail. Not visible to the applicant.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label htmlFor="case-note" className="sr-only">
            Note
          </label>
          <textarea
            id="case-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="e.g. Spoke with applicant 03/22 — clarified income source; will follow up after AVS return."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            {note.length}/{NOTE_MAX}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
