/**
 * IssueRfiModal — caseworker UI for issuing a Request for Additional Information.
 *
 * Captures the items being requested (pre-defined checkboxes + custom entries),
 * a response deadline (defaults to +14 days from today), and an optional
 * applicant-facing note. On submit, calls back with the structured payload —
 * the parent owns the mutation and toast/refresh handling.
 */

import { useState } from 'react';
import { AlertCircle, Plus, X } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';
import { PhiCautionNote } from './PhiCautionNote';

const PRESET_ITEMS: ReadonlyArray<string> = [
  'Recent pay stubs (last 30 days)',
  'Employer verification letter',
  'Self-employment profit & loss statement',
  'Proof of identity (driver license, state ID, passport)',
  'Proof of State residency',
  'Proof of citizenship or immigration status',
  'Tax return (most recent year)',
  'Other (specify in note below)',
];

const NOTE_MAX_LENGTH = 5000;

function defaultDeadlineIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export interface IssueRfiSubmitPayload {
  itemsRequested: string[];
  /** Deadline as an ISO 8601 datetime string (end-of-day in local time). */
  deadline: string;
  noteToApplicant: string | null;
}

export interface IssueRfiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseLabel: string;
  applicantName: string;
  submitting: boolean;
  onSubmit: (payload: IssueRfiSubmitPayload) => void;
  /**
   * Items pre-added (and checked) when the modal mounts — used by the Case
   * Assist panel to open the RFI pre-filled with the document its
   * recommendation asks for. Items matching a preset are pre-checked; others
   * become custom items.
   */
  initialItems?: ReadonlyArray<string>;
  /** Optional pre-filled applicant-facing note. */
  initialNote?: string;
}

export function IssueRfiModal({
  open,
  onOpenChange,
  caseLabel,
  applicantName,
  submitting,
  onSubmit,
  initialItems = [],
  initialNote = '',
}: IssueRfiModalProps) {
  // Reset is handled by the parent's key-based remount (WorkspacePage uses
  // a `key` tied to `rfiOpen`), so this component just initialises state
  // fresh on every mount — no reset-on-open effect needed.
  const [presetChecked, setPresetChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialItems.filter((i) => PRESET_ITEMS.includes(i)).map((i) => [i, true])),
  );
  const [customItems, setCustomItems] = useState<string[]>(() =>
    initialItems.filter((i) => !PRESET_ITEMS.includes(i)),
  );
  const [customDraft, setCustomDraft] = useState('');
  const [deadline, setDeadline] = useState<string>(defaultDeadlineIso());
  const [note, setNote] = useState(initialNote);

  const selectedItems = [
    ...PRESET_ITEMS.filter((item) => presetChecked[item]),
    ...customItems.map((s) => s.trim()).filter(Boolean),
  ];

  const deadlineDate = deadline ? new Date(`${deadline}T23:59:59`) : null;
  const deadlineIsFuture = !!deadlineDate && deadlineDate.getTime() > Date.now();
  const canSubmit = selectedItems.length > 0 && deadlineIsFuture && !submitting;

  function togglePreset(item: string) {
    setPresetChecked((prev) => ({ ...prev, [item]: !prev[item] }));
  }

  function addCustomItem() {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    if (trimmed.length > 200) return;
    if (customItems.includes(trimmed)) {
      setCustomDraft('');
      return;
    }
    setCustomItems((prev) => [...prev, trimmed]);
    setCustomDraft('');
  }

  function removeCustomItem(item: string) {
    setCustomItems((prev) => prev.filter((s) => s !== item));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      itemsRequested: selectedItems,
      deadline: deadlineDate!.toISOString(),
      noteToApplicant: note.trim() === '' ? null : note.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request additional information</DialogTitle>
          <DialogDescription>
            {caseLabel} · {applicantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
          {/* Items requested */}
          <div>
            <p className="text-sm font-medium mb-2">What is being requested?</p>
            <div className="space-y-2">
              {PRESET_ITEMS.map((item) => (
                <label key={item} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!presetChecked[item]}
                    onChange={() => togglePreset(item)}
                    disabled={submitting}
                    className="mt-0.5"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            {customItems.length > 0 && (
              <ul className="mt-3 space-y-1">
                {customItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-center justify-between gap-2 rounded border border-input bg-muted/30 px-2 py-1 text-sm"
                  >
                    <span className="truncate">{item}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeCustomItem(item)}
                      disabled={submitting}
                      aria-label={`Remove ${item}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="rfi-custom-item" className="sr-only">
                Add a custom item
              </label>
              <input
                id="rfi-custom-item"
                type="text"
                placeholder="Add a custom item..."
                value={customDraft}
                maxLength={200}
                disabled={submitting}
                aria-describedby="rfi-custom-item-phi"
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomItem();
                  }
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addCustomItem}
                disabled={submitting || customDraft.trim() === ''}
                aria-label="Add custom item"
              >
                <Plus aria-hidden="true" className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <PhiCautionNote id="rfi-custom-item-phi" />
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="rfi-deadline" className="text-sm font-medium block mb-2">
              Response deadline
            </label>
            <input
              id="rfi-deadline"
              type="date"
              value={deadline}
              disabled={submitting}
              min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              onChange={(e) => setDeadline(e.target.value)}
              aria-invalid={!deadlineIsFuture || undefined}
              aria-describedby={!deadlineIsFuture ? 'rfi-deadline-error' : undefined}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {!deadlineIsFuture && (
              <p id="rfi-deadline-error" className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
                Deadline must be in the future.
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label htmlFor="rfi-note" className="text-sm font-medium block mb-2">
              Note to applicant <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="rfi-note"
              rows={4}
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              disabled={submitting}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Provide any clarifying context for the applicant..."
              aria-describedby="rfi-note-phi"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <PhiCautionNote id="rfi-note-phi" />
            <p className="mt-1 text-xs text-muted-foreground">
              {note.length}/{NOTE_MAX_LENGTH}
            </p>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Issuing RFI...' : 'Issue RFI'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
