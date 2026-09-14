/**
 * RequestClarificationModal — caseworker UI for sending a Request for
 * Information (RFI) to the applicant. Layout mirrors the storyboard:
 *
 *   - Header: paper-plane icon + "Request Clarification" + close
 *   - Description: "Send a Request for Information (RFI) to the applicant.
 *     Fields are pre-populated from case context."
 *   - Recipient (read-only, accent-tinted)
 *   - Subject (read-only, accent-tinted)
 *   - Message (read-only monospace textarea, pre-populated)
 *   - Requested Documents (multi-select checkboxes)
 *   - Delivery Method (Email / Mail / SMS / Portal Message checkboxes)
 *   - Response Deadline (read-only, accent-tinted, with info caption)
 *   - Footer: Cancel + Send Clarification Request (primary CTA w/ icon)
 *
 * The submit payload is the same shape as the previous IssueRfiModal so the
 * existing `issueMedicaidEeCaseRfi` mutation wiring on WorkspacePage stays
 * unchanged: itemsRequested + deadline + noteToApplicant. Delivery method
 * selections are folded into the note text so the audit trail captures the
 * channel the caseworker chose.
 */

import { useState } from 'react';
import { Info, Send } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';

const ACCENT_TEXT = 'var(--civic-accent-text)';
const ACCENT_BG = 'var(--civic-accent-bg)';
const ACCENT_SOLID = 'var(--civic-accent-solid)';

const DELIVERY_METHODS = ['Email', 'Mail', 'SMS', 'ELIAS Portal Message'] as const;

// Single placeholder option mirrors the storyboard's informational-RFI
// variant (Non-MAGI ABD DDS-pending case). Per-case document lists can be
// passed in via the `documents` prop when the RFI actually needs uploads.
const DEFAULT_DOCUMENTS: ReadonlyArray<string> = ['No additional documents needed'];

export interface RequestClarificationSubmitPayload {
  itemsRequested: string[];
  /** ISO 8601 datetime — end-of-day local time of the chosen calendar date. */
  deadline: string;
  noteToApplicant: string | null;
}

export interface RequestClarificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseLabel: string;
  applicantName: string;
  /** Optional case-context overrides for the pre-populated fields. */
  subject?: string;
  message?: string;
  /** Documents to request. Default is a single "No additional documents needed" option for info-only RFIs. */
  documents?: ReadonlyArray<string>;
  /** Render the deadline as "N/A - Information only" rather than a real date. Defaults to info-only. */
  deadlineMode?: 'info-only' | 'date';
  submitting: boolean;
  onSubmit: (payload: RequestClarificationSubmitPayload) => void;
}

function defaultDeadlineIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/** Custom-styled checkbox matching the storyboard: 20px square with an
 *  indigo fill + white checkmark when checked, white with a gray border
 *  when not. Wraps a visually-hidden native input so keyboard / a11y
 *  behavior stays standard. */
function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        />
        <span
          aria-hidden="true"
          className="w-5 h-5 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: checked ? ACCENT_SOLID : '#ffffff',
            border: checked ? 'none' : '2px solid #d1d5db',
          }}
        >
          {checked && (
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M10 3L4.5 8.5L2 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function deadlineDisplay(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function RequestClarificationModal({
  open,
  onOpenChange,
  caseLabel,
  applicantName,
  subject,
  message,
  documents,
  deadlineMode = 'info-only',
  submitting,
  onSubmit,
}: RequestClarificationModalProps) {
  const resolvedSubject = subject ?? 'Information Request';
  const resolvedDocuments = documents ?? DEFAULT_DOCUMENTS;
  const resolvedMessage =
    message ??
    `Dear ${applicantName},\n\nThis is an update on your application (${caseLabel}). We need additional information to continue your eligibility determination. Please review the requested documents and submit them via your preferred delivery method.\n\nThank you,\nState Medicaid Eligibility Team`;

  const initialDeliveryChecked: Record<string, boolean> = { Email: true, 'ELIAS Portal Message': true };
  const [docsChecked, setDocsChecked] = useState<Record<string, boolean>>({});
  const [deliveryChecked, setDeliveryChecked] = useState<Record<string, boolean>>(initialDeliveryChecked);
  const [deadlineIso] = useState<string>(defaultDeadlineIso());

  // Dialog (Radix) hides content on close rather than unmounting, so local
  // state persists across opens unless we reset it explicitly. Mirrors the
  // AddNoteModal / ReviewDecideModal sibling pattern (C.2). Resetting here
  // covers Cancel button, backdrop click, and Escape — all of which route
  // through onOpenChange(false).
  function handleOpenChange(next: boolean) {
    if (!next) {
      setDocsChecked({});
      setDeliveryChecked(initialDeliveryChecked);
    }
    onOpenChange(next);
  }

  const itemsRequested = resolvedDocuments.filter((d) => docsChecked[d] && d !== 'No additional documents needed');
  const deliverySelected = DELIVERY_METHODS.filter((m) => deliveryChecked[m]);
  const canSubmit = !submitting && deliverySelected.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const deadlineDate = new Date(`${deadlineIso}T23:59:59`);
    const noteParts = [resolvedMessage, '', `Delivery: ${deliverySelected.join(', ')}`];
    onSubmit({
      itemsRequested,
      deadline: deadlineDate.toISOString(),
      noteToApplicant: noteParts.join('\n'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Switched from a hand-rolled <div role="dialog"> to the platform
          Dialog primitive (review-fix S4). Dialog provides focus trap,
          initial-focus management, Escape-to-close, scroll lock, portal
          rendering, and proper aria-modal semantics — none of which the
          previous implementation had. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" style={{ color: ACCENT_TEXT }} aria-hidden="true" />
            Request Clarification
          </DialogTitle>
          <DialogDescription>
            Send a Request for Information (RFI) to the applicant. Fields are pre-populated from case context.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="space-y-4 py-2">
          {/* Recipient */}
          <div>
            <label htmlFor="rcm-recipient" className="block text-sm font-semibold text-foreground mb-2">
              Recipient
            </label>
            <input
              id="rcm-recipient"
              type="text"
              value={applicantName}
              readOnly
              className="w-full px-3 py-2 text-sm border rounded-lg"
              style={{
                backgroundColor: ACCENT_BG,
                borderColor: 'color-mix(in oklab, var(--civic-accent-solid) 25%, transparent)',
                color: 'var(--civic-text-primary)',
              }}
            />
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="rcm-subject" className="block text-sm font-semibold text-foreground mb-2">
              Subject
            </label>
            <input
              id="rcm-subject"
              type="text"
              value={resolvedSubject}
              readOnly
              className="w-full px-3 py-2 text-sm border rounded-lg"
              style={{
                backgroundColor: ACCENT_BG,
                borderColor: 'color-mix(in oklab, var(--civic-accent-solid) 25%, transparent)',
                color: 'var(--civic-text-primary)',
              }}
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="rcm-message" className="block text-sm font-semibold text-foreground mb-2">
              Message
            </label>
            <textarea
              id="rcm-message"
              value={resolvedMessage}
              readOnly
              rows={14}
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg resize-none font-mono leading-relaxed bg-card"
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </div>

          {/* Requested Documents — section heading, not bound to a single input.
              Each CheckboxRow already wraps its own checkbox with a <label>, so
              using <label> here would steal that first checkbox's accessible
              name. <p role="presentation"> is the correct grouping element. */}
          <div role="group" aria-labelledby="rcm-documents-heading">
            <p id="rcm-documents-heading" className="block text-sm font-semibold text-foreground mb-2">
              Requested Documents
            </p>
            <div className="space-y-2">
              {resolvedDocuments.map((doc) => (
                <CheckboxRow
                  key={doc}
                  label={doc}
                  checked={!!docsChecked[doc]}
                  onChange={(next) => setDocsChecked((prev) => ({ ...prev, [doc]: next }))}
                />
              ))}
            </div>
          </div>

          {/* Delivery Method — same group-heading pattern as Requested Documents. */}
          <div role="group" aria-labelledby="rcm-delivery-heading">
            <p id="rcm-delivery-heading" className="block text-sm font-semibold text-foreground mb-2">
              Delivery Method
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {DELIVERY_METHODS.map((method) => (
                <CheckboxRow
                  key={method}
                  label={method}
                  checked={!!deliveryChecked[method]}
                  onChange={(next) => setDeliveryChecked((prev) => ({ ...prev, [method]: next }))}
                />
              ))}
            </div>
          </div>

          {/* Response Deadline */}
          <div>
            <label htmlFor="rcm-deadline" className="block text-sm font-semibold text-foreground mb-2">
              Response Deadline
            </label>
            <input
              id="rcm-deadline"
              type="text"
              value={deadlineMode === 'info-only' ? 'N/A - Information only' : deadlineDisplay(deadlineIso)}
              readOnly
              className="w-full px-3 py-2 text-sm border rounded-lg"
              style={{
                backgroundColor: ACCENT_BG,
                borderColor: 'color-mix(in oklab, var(--civic-accent-solid) 25%, transparent)',
                color: 'var(--civic-text-primary)',
              }}
            />
            <div className="flex items-start gap-1.5 mt-1.5" style={{ color: ACCENT_TEXT }}>
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <p className="text-xs">
                {deadlineMode === 'info-only'
                  ? 'No response deadline — this RFI is informational.'
                  : 'Standard RFI deadline (14 days from today).'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            <Send className="w-4 h-4" aria-hidden="true" />
            {submitting ? 'Sending…' : 'Send Clarification Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
