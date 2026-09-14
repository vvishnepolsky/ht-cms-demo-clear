/* =========================================================================
   Resident dashboard — pure data + derivation helpers.
   Extracted from dashboard.tsx (ENG-1883) so the logic is unit-testable without
   importing the component graph (which instantiates the Apollo client on import).
   No React / Apollo imports belong in this file.
   ========================================================================= */

// ── Member identity ─────────────────────────────────────────────────────
// Case number, coverage-start and recert-due come from the resident's real
// case + determination (see deriveCoverageDates / resolveCaseNumber).
// `mco` (managed-care plan) has no backend concept yet — kept as a clearly-labeled
// placeholder, tracked in ENG-1968.
export const MCO_PLACEHOLDER = 'your managed-care plan';
export const CASE_NUMBER_PENDING = 'Pending';

// Case status string constants — centralised so the three call sites in
// dashboard-data.ts, dashboard.tsx, and tests all share the same values
// and enum drift is caught at the export boundary.
export const CASE_STATUS = {
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  IN_REVIEW: 'IN_REVIEW',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
} as const;

export interface DeterminationDates {
  status?: string;
  effectiveDate?: string | null;
  expirationDate?: string | null;
}

export interface CaseStatusLike {
  caseNumber?: string | null;
  determinations?: DeterminationDates[] | null;
}

export interface ResidentLike {
  firstName?: string | null;
  lastName?: string | null;
}

export function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDateLong(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Coverage-start / recert dates are effectively date-only (UTC midnight). Format
  // in UTC so a value like '2026-06-01' doesn't render as 'May 31' in a tz behind UTC.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// ENG-1883: derive coverage-start (enrolledOn) + recert-due from the case's
// determinations. A case can carry multiple (per-member) determinations; use the
// first with a populated date. Returns ISO strings (or null) — format at the call site.
export function deriveCoverageDates(eeCaseStatus: CaseStatusLike | null | undefined): {
  coverageStart: string | null;
  recertDue: string | null;
} {
  const dets = eeCaseStatus?.determinations ?? [];
  // Read both dates from a single determination so coverageStart and recertDue can
  // never be pulled from two different benefit periods. The evaluation handler sets
  // expirationDate only when effectiveDate is set (coverageEndDate(effectiveDate)),
  // so selecting the coverage determination by effectiveDate never drops a recert date.
  const coverage = dets.find((d) => d?.effectiveDate) ?? null;
  return {
    coverageStart: coverage?.effectiveDate ?? null,
    recertDue: coverage?.expirationDate ?? null,
  };
}

// ENG-1883: real case number when present, neutral placeholder otherwise — never
// the old hardcoded ST-MED-… persona case id.
export function resolveCaseNumber(eeCaseStatus: CaseStatusLike | null | undefined): string {
  return eeCaseStatus?.caseNumber ?? CASE_NUMBER_PENDING;
}

// ENG-1883: greeting name comes from the authenticated resident; falls back to a
// neutral word when unauthenticated.
export function greetingName(resident: ResidentLike | null | undefined): string {
  return resident?.firstName || 'there';
}

export function getGreeting(
  // eslint-disable-next-line ht/no-wallclock-in-demo -- time-of-day greeting reads the real clock intentionally; not a demo date
  hour: number = new Date().getHours(),
): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ENG-1991: recertification window helpers.
// Both accept an optional `nowMs` param (milliseconds since epoch) so tests
// can pin "today" without patching Date — no wall-clock reads in production callers.

/** Number of calendar days before the recert due date that the recertification
 *  indicator and quick action should appear. */
export const RECERT_WINDOW_DAYS = 90;

/** Calendar days until the recert due date (UTC). Returns null if the date is
 *  absent or unparseable; returns 0 if the date is today or already past. */
export function daysUntilRecert(recertDue: string | null | undefined, nowMs?: number): number | null {
  if (!recertDue) return null;
  const due = new Date(recertDue);
  if (Number.isNaN(due.getTime())) return null;
  // Compare UTC calendar dates (strip time component) to avoid tz off-by-one.
  // eslint-disable-next-line ht/no-wallclock-in-demo -- window calculation must reflect the real calendar date, not a frozen demo anchor
  const todayUtc = new Date(nowMs ?? Date.now());
  const dueUtcMidnight = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const todayUtcMidnight = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());
  const days = Math.round((dueUtcMidnight - todayUtcMidnight) / 86_400_000);
  return Math.max(0, days);
}

/** True if the recert due date is within the next `windowDays` days (default 90),
 *  inclusive of today and the due date itself. False when recertDue is absent,
 *  invalid, or more than `windowDays` days away. */
export function isInRecertificationWindow(
  recertDue: string | null | undefined,
  windowDays = RECERT_WINDOW_DAYS,
  nowMs?: number,
): boolean {
  const days = daysUntilRecert(recertDue, nowMs);
  return days !== null && days <= windowDays;
}

// ── Inbox message types ──────────────────────────────────────────────────
export interface InboxMessageAction {
  label: string;
  primary: boolean;
}

export interface InboxMessage {
  id: string;
  icon: string;
  iconKind: string;
  title: string;
  preview: string;
  body: string[];
  received: string;
  unread: boolean;
  action: InboxMessageAction | null;
}

// ── Shared constants ─────────────────────────────────────────────────────
// Extracted to avoid duplicating these literals across INBOX_MESSAGES and
// getApplicationStatusMessage.
const APPLICATION_STATUS_MSG_ID = 'msg-1';
const RECEIVED_TODAY = 'Today';

// ── Seed messages — demo seed, real source tracked in ENG-1969 ──────────
// De-personalized (ENG-1883): no resident/household names in copy. The real
// inbox source and household roster aren't wired yet — see ENG-1969.
// ENG-1991: the recertification message is NOT included here — it is built
// dynamically by the Inbox component when the case is APPROVED and within
// the 90-day recertification window (see buildRecertMessage).
// ENG-1993: INBOX_MESSAGES[0] is the APPROVED variant (returned by getApplicationStatusMessage('APPROVED')).
export const INBOX_MESSAGES: InboxMessage[] = [
  {
    id: APPLICATION_STATUS_MSG_ID,
    icon: 'check',
    iconKind: 'success',
    title: 'Application complete — welcome to State-X Medicaid',
    preview: 'Your household has been approved. Your member IDs and welcome packet are on the way.',
    body: [
      'Good news — your application is complete and your household is covered.',
      'Coverage begins through your managed-care plan. You can switch plans within 90 days, no questions asked.',
      'Your welcome packet, including member ID cards for everyone in your household, will arrive by mail within 5 business days.',
    ],
    received: RECEIVED_TODAY,
    unread: false,
    action: { label: 'View approval letter', primary: false },
  },
];

// ENG-1991: build the recertification inbox message from the real recert date.
// Only called when isInRecertificationWindow returns true. Accepts string | null
// so the type is compatible with deriveCoverageDates return value; null input
// returns null (callers guard with isInRecertificationWindow which requires non-null).
export function buildRecertMessage(recertDue: string | null, nowMs?: number) {
  if (!recertDue) return null;
  const days = daysUntilRecert(recertDue, nowMs) ?? 0;
  const dueDateLabel = fmtDateLong(recertDue) ?? recertDue;
  return {
    id: 'msg-recert',
    icon: 'alert',
    iconKind: 'warning',
    title: `Recertification due in ${days} day${days === 1 ? '' : 's'}`,
    preview: `Your coverage renews on ${dueDateLabel}. We'll pre-fill most of your information — just confirm what's changed.`,
    body: [
      `It's time to recertify your State-X Medicaid coverage. Your renewal must be complete by ${dueDateLabel} to avoid a gap in coverage.`,
      "Most of your information from last time will be pre-filled. You'll only need to update what's changed — income, address, household, and current health insurance.",
      "It usually takes 5–10 minutes if your situation hasn't changed.",
    ],
    received: RECEIVED_TODAY,
    unread: true,
    action: { label: 'Start recertification', primary: true },
  };
}

// Returns the inbox application-status message driven by real case status.
// Replaces the static INBOX_MESSAGES[0] so the first inbox item always
// reflects actual case dynamics rather than a hardcoded "approved" message.
export function getApplicationStatusMessage(status: string | null): InboxMessage {
  if (status === CASE_STATUS.APPROVED) {
    return INBOX_MESSAGES[0];
  }
  if (status === CASE_STATUS.DENIED) {
    return {
      id: APPLICATION_STATUS_MSG_ID,
      icon: 'alert',
      iconKind: 'warning',
      title: 'Application not approved',
      preview: 'Your application did not meet eligibility requirements. See your notice for details and appeal rights.',
      body: [
        'Unfortunately, your application did not meet eligibility requirements at this time.',
        'A notice has been sent explaining the reason and your appeal rights.',
        'You may appeal this decision within 30 days.',
      ],
      received: RECEIVED_TODAY,
      unread: true,
      action: null,
    };
  }
  // IN_REVIEW, PENDING_VERIFICATION, loading, or no case yet
  return {
    id: APPLICATION_STATUS_MSG_ID,
    icon: 'check',
    iconKind: 'success',
    title: 'Application received — under review',
    preview: 'We received your application and are reviewing your eligibility.',
    body: [
      'We received your application and are currently reviewing your eligibility.',
      "You'll hear from us within 3–5 business days.",
      "If we need additional information, we'll reach out with a message here.",
    ],
    received: RECEIVED_TODAY,
    unread: false,
    action: null,
  };
}
