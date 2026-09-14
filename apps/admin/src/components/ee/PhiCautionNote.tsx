/**
 * PhiCautionNote — visible caution rendered adjacent to caseworker free-text
 * inputs whose contents are written verbatim to the audit log and, for some
 * fields, persisted at rest (ENG-1642).
 *
 * The platform keeps these fields raw (no redaction/hashing) as a documented
 * trust assumption — see `services/medicaid-ee-service/CONTEXT.md` § "PHI trust
 * assumption — free-text fields". This caution is the UI-level reminder that
 * backs that assumption.
 */

import { ShieldAlert } from 'lucide-react';

export interface PhiCautionNoteProps {
  /** Optional id so an input can reference this via aria-describedby. */
  id?: string;
  className?: string;
}

export function PhiCautionNote({ id, className }: PhiCautionNoteProps) {
  return (
    <p id={id} className={`mt-1 flex items-start gap-1 text-xs text-muted-foreground ${className ?? ''}`}>
      <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <span>Do not include PHI (e.g. SSN, date of birth, diagnoses). This text is recorded in the audit log.</span>
    </p>
  );
}
