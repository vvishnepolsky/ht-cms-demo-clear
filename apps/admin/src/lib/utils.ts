import { clsx, type ClassValue } from 'clsx';
import type { EligibilityCategory, EECase } from '../types/ee';

/**
 * Merges class names. In v2 this is just clsx -- no tailwind-merge needed
 * since we don't use utility classes that can conflict.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Em-dash used as the null/invalid-value display sentinel across the admin UI. */
export const DASH = '—';

/**
 * Format an ISO date string for display (e.g. "May 18, 2026"). Accepts the
 * date-only form `YYYY-MM-DD` (anchored to noon to dodge timezone edge
 * cases) and any other ISO datetime that `Date` can parse. Returns DASH
 * for missing or unparseable inputs.
 *
 * Extracted from CaseHeader / MemberCards / EligibilityResult /
 * CompletedCaseDetail per coding-standards.md § C.1 (≥3-site threshold,
 * met by 4 sites). Two of the original copies used '--' (two hyphens) and
 * two used '—' (em dash); the em-dash is the codebase's convention.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Normalize a value to a calendar-date string (YYYY-MM-DD) for display (ENG-1978).
 *
 * Coverage/determination dates are CALENDAR dates persisted as midnight-UTC
 * `DateTime` values (e.g. "2026-06-01T00:00:00.000Z"). Passing that straight to
 * `fmtDate` hits `new Date(iso)` = UTC midnight, which renders as the PREVIOUS
 * day in any negative-offset (US) timezone — the off-by-one bug. Slicing the
 * leading date part keeps the intended UTC calendar day; `fmtDate` then parses
 * it at local noon, so it never drifts. Pure date strings and null/undefined
 * pass through unchanged. Use this for stored calendar dates, NOT for genuine
 * timestamps where the local time-of-day matters.
 */
export function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : value;
}

/**
 * Resolve the case number to display to a caseworker (ENG-1912).
 *
 * Precedence:
 *   1. `intakeData.displayMeta.caseNumber` — the canonical SX-… identifier the
 *      citizen saw at submission, persisted by cms-demo/resident. This is the
 *      only source for self-service cases, where the backend `caseNumber`
 *      column is null.
 *   2. `eeCase.caseNumber` — the backend column (set for seeded/hand-authored
 *      cases, e.g. `IA-2026-048821`).
 *   3. Last 8 of the case id, uppercased — last-resort fallback so the header
 *      is never blank. This is the `7QD2HFJS`-looking value the portal used to
 *      show for citizen-submitted cases.
 *
 * Extracted per coding-standards.md § C.1 (≥3-site threshold: CaseHeader,
 * ApplicantSidebar, CompletedCaseDetail, derive-case-detail).
 */
export function caseDisplayNumber(eeCase: Pick<EECase, 'id' | 'caseNumber' | 'intakeData'>): string {
  // The demo server assigns `caseNumber` (SX-2026-NNNNNN) at creation and it is
  // what the resident's confirmation, the case list and the case nav bar show —
  // so it is canonical. The resident-generated displayMeta.caseNumber is only a
  // fallback for rows created before the column was populated.
  if (eeCase.caseNumber) return eeCase.caseNumber;
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const displayMeta = (intake.displayMeta ?? {}) as Record<string, unknown>;
  const fromIntake = typeof displayMeta.caseNumber === 'string' ? displayMeta.caseNumber : null;
  return fromIntake ?? eeCase.id.slice(-8).toUpperCase();
}

/**
 * Format an EligibilityCategory for display. Only 'MAGI' and 'NON_MAGI' are
 * defined; the NON_MAGI display string is "Non-MAGI" (with the hyphen).
 * Extracted per C.1 (3-site threshold).
 */
export function formatCategory(category: EligibilityCategory): string {
  return category === 'MAGI' ? 'MAGI' : 'Non-MAGI';
}

/**
 * Generate two-letter initials from a first and last name. Falls back to
 * 'SM' (System) when both are missing — consistent with the Admin Shell
 * user-pill across all workspace pages.
 *
 * Extracted per C.1 (≥3-site threshold — defined identically in 10+ page
 * and component files; this PR introduces the fourth in-diff definition).
 */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.[0] ?? '';
  const l = lastName?.[0] ?? '';
  return (f + l).toUpperCase() || 'SM';
}
