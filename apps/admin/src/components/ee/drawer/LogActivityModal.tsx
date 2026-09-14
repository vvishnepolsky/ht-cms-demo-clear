/**
 * LogActivityModal — structured form to log a manual activity entry against a
 * case. Per the storyboard, submission is a demo stub: a successful submit
 * raises a `window.alert`, then closes the modal. Real persistence is the
 * domain of ENG-1667 (Activity Log GraphQL wiring).
 *
 * Form contract:
 *   - Activity Type (required) — one of ACTIVITY_TYPES below.
 *   - Outcome (required when the selected type defines outcomes) —
 *     reset whenever Activity Type changes (a previously-selected outcome
 *     from a different type would be meaningless).
 *   - Details (required) — 10..500 char trimmed length.
 *   - Timestamp (optional, free-form text) — defaults to the demo "now".
 *
 * State validation is plain derived booleans, not a `useEffect`. The Save
 * button is disabled until the form is valid.
 *
 * Built on the shared `dialog` primitive (Base UI under the hood), which
 * already handles focus management, ESC, and backdrop-click — we don't
 * reach for the drawer's own focus-trap hook here.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { DEMO_TODAY_DISPLAY } from '../../../data/demoToday';

/**
 * The fixed set of activity types a caseworker can log. Storyboard parity:
 * src/components/CaseDetailsDrawer.jsx :: ACTIVITY_TYPES. Defined as a const
 * tuple so `ActivityType` is the narrow union of valid values rather than
 * a generic string.
 */
const ACTIVITY_TYPES = [
  'Phone Call (Outbound)',
  'Phone Call (Inbound)',
  'Email Sent (Manual)',
  'Document Received',
  'In-Person Visit',
  'Internal Note',
  'Supervisor Consultation',
  'Provider Contact',
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Outcomes per activity type. Types whose array is empty don't show the
 * Outcome dropdown at all (Internal Note, Supervisor Consultation, etc.).
 * Storyboard parity: OUTCOMES_BY_TYPE.
 */
const OUTCOMES_BY_TYPE: Record<ActivityType, readonly string[]> = {
  'Phone Call (Outbound)': ['Connected', 'No Answer', 'Left Voicemail', 'Busy/Disconnected', 'Wrong Number'],
  'Phone Call (Inbound)': ['Connected', 'No Answer', 'Left Voicemail', 'Busy/Disconnected', 'Wrong Number'],
  'Document Received': ['Complete', 'Partial', 'Illegible', 'Wrong Document'],
  'In-Person Visit': ['Completed', 'Applicant No-Show', 'Rescheduled'],
  'Internal Note': [],
  'Supervisor Consultation': [],
  'Email Sent (Manual)': [],
  'Provider Contact': [],
};

const DETAILS_MIN = 10;
const DETAILS_MAX = 500;

/**
 * Default placeholder shown in the Timestamp field if the caseworker doesn't
 * supply one. Uses the frozen demo "today" anchor so the demo narrative stays
 * coherent across sessions.
 */
const DEFAULT_TIMESTAMP = `${DEMO_TODAY_DISPLAY} 2:30 PM`;

interface LogActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name + worker ID shown in the attribution footnote. */
  assignedTo: string;
}

export function LogActivityModal({ open, onOpenChange, assignedTo }: LogActivityModalProps) {
  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [outcome, setOutcome] = useState('');
  const [details, setDetails] = useState('');
  const [timestamp, setTimestamp] = useState('');

  const currentOutcomes = activityType ? OUTCOMES_BY_TYPE[activityType] : [];
  const needsOutcome = currentOutcomes.length > 0;
  const trimmedDetailsLength = details.trim().length;
  const detailsValid = trimmedDetailsLength >= DETAILS_MIN && trimmedDetailsLength <= DETAILS_MAX;
  const canSubmit = !!activityType && (!needsOutcome || !!outcome) && detailsValid;

  const resetForm = () => {
    setActivityType('');
    setOutcome('');
    setDetails('');
    setTimestamp('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Storyboard demo behavior: confirm via alert(), no real persistence.
    // Real audit-log writes are ENG-1667's territory.
    window.alert('Activity logged successfully.');
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg rounded-md border shadow-xl"
        style={{
          backgroundColor: 'var(--civic-bg-card)',
          borderColor: 'var(--civic-border-subtle)',
        }}
      >
        <DialogHeader className="px-6 py-4 border-b" style={{ borderColor: 'var(--civic-border-subtle)' }}>
          <DialogTitle className="font-semibold text-sm" style={{ color: 'var(--civic-text-primary)' }}>
            Log Activity
          </DialogTitle>
          <DialogDescription className="sr-only">
            Manually log a caseworker activity (phone call, document received, in-person visit, internal note, etc.)
            against this case.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          <FormField label="Activity Type" required>
            <select
              value={activityType}
              onChange={(event) => {
                setActivityType(event.target.value as ActivityType | '');
                setOutcome('');
              }}
              required
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-primary)',
              }}
            >
              <option value="">Select activity type…</option>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          {needsOutcome && (
            <FormField label="Outcome" required>
              <select
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--civic-bg-card)',
                  borderColor: 'var(--civic-border-subtle)',
                  color: 'var(--civic-text-primary)',
                }}
              >
                <option value="">Select outcome…</option>
                {currentOutcomes.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="Details" required hint={`${trimmedDetailsLength}/${DETAILS_MAX}, min ${DETAILS_MIN}`}>
            <textarea
              rows={4}
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))}
              placeholder="Describe the action, who you spoke with, outcome, next step…"
              required
              minLength={DETAILS_MIN}
              maxLength={DETAILS_MAX}
              className="w-full text-sm border rounded-md px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-primary)',
              }}
            />
          </FormField>

          <FormField label="Timestamp" hint="editable">
            <input
              type="text"
              value={timestamp}
              onChange={(event) => setTimestamp(event.target.value)}
              placeholder={DEFAULT_TIMESTAMP}
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-primary)',
              }}
            />
          </FormField>

          <p className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
            Entry will be attributed to the logged-in caseworker ({assignedTo}).
          </p>
        </div>

        <DialogFooter
          className="px-6 py-4 border-t flex justify-end gap-3"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
        >
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

/**
 * Small label/hint/control wrapper. Inlined here rather than in
 * `components/ui/` until a second tab needs the same primitive — see
 * orchestrator brief ("If a tab needs a small repeated primitive, extract
 * it as a tab-local component first").
 */
function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium" style={{ color: 'var(--civic-text-secondary)' }}>
        <span className="block mb-1.5">
          {label}
          {required && (
            <span style={{ color: 'var(--civic-destructive-text)' }} aria-hidden="true">
              {' '}
              *
            </span>
          )}
          {hint && (
            <span className="font-normal ml-1" style={{ color: 'var(--civic-text-placeholder)' }}>
              ({hint})
            </span>
          )}
        </span>
        {children}
      </label>
    </div>
  );
}
