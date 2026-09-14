import type { VerificationCheck } from "./types.js";

/**
 * CLEAR check curation — the ONE place that decides which of CLEAR's checks a
 * caseworker or applicant actually sees. The real sandbox returns ~26 rows:
 * category headers ("Biometric Verification", "Phone Line Intelligence"),
 * phone/device signals, NFC passport reads (false on a driver's license) and a
 * handful of skipped rows, mixed in with the identity checks that matter.
 *
 * Used by the GraphQL `IdentityVerification.checks` / `checksSummary`, the
 * hosted-flow session view, the resident `/api/verifications/:id` view, the
 * Case Assist `identity-verified` rule and the staff REST `curatedChecks`.
 */

export interface CuratedChecks {
  /** Identity-relevant checks in {@link SHOWN_ORDER}, deduped, skipped rows dropped, plus any real (non-NFC) failure. */
  shown: VerificationCheck[];
  /** Hidden checks that completed with value true (category headers, phone/device, document processing). */
  hiddenPassed: number;
  /** Checks that were skipped (incl. skipped identity checks), or NFC/passport checks that came back false. */
  notApplicable: number;
}

/** Fixed display order of the identity-relevant checks. */
export const SHOWN_ORDER: readonly string[] = [
  "Selfie passes liveness check",
  "Selfie matches portrait on Gov ID",
  "Gov ID is likely authentic",
  "Gov ID front is not suspicious",
  "Gov ID back is not suspicious",
  "Gov ID is not expired",
  "Gov ID captured image is acceptable",
  "Gov ID matches DMV records",
  "User's information matches a trusted source",
];

/** Straight/curly apostrophes compare equal; case and whitespace are ignored. */
export function normalizeCheckName(name: string): string {
  return name
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SHOWN_INDEX = new Map(SHOWN_ORDER.map((n, i) => [normalizeCheckName(n), i] as const));

export function checkPassed(c: VerificationCheck): boolean {
  if (typeof c.value === "boolean") return c.value;
  return c.status === "success" || c.status === "completed" || c.status === "passed";
}

export function checkFailed(c: VerificationCheck): boolean {
  return c.value === false || c.status === "failed";
}

export function checkSkipped(c: VerificationCheck): boolean {
  if (c.status === "skipped") return true;
  return (c.value === null || c.value === undefined) && !checkPassed(c) && !checkFailed(c);
}

function isNfcOrPassport(name: string): boolean {
  return /\bnfc\b|passport/i.test(name);
}

/**
 * Rows are grouped by normalized name (the sandbox repeats a check with a
 * curly apostrophe, or once skipped and once completed); each name is
 * represented by its first non-skipped row, else its first row, and is
 * classified exactly once so the counts stay honest.
 */
export function curateChecks(checks: readonly VerificationCheck[] | null | undefined): CuratedChecks {
  const groups = new Map<string, VerificationCheck>();
  for (const c of checks ?? []) {
    const norm = normalizeCheckName(c.name);
    const existing = groups.get(norm);
    if (!existing) groups.set(norm, c);
    else if (checkSkipped(existing) && !checkSkipped(c)) groups.set(norm, c);
  }

  const slots: (VerificationCheck | undefined)[] = new Array(SHOWN_ORDER.length).fill(undefined);
  const forcedFailures: VerificationCheck[] = [];
  let hiddenPassed = 0;
  let notApplicable = 0;

  for (const [norm, c] of groups) {
    const slot = SHOWN_INDEX.get(norm);
    if (slot !== undefined) {
      if (checkSkipped(c)) notApplicable += 1; // dropped from the list
      else slots[slot] = c;
      continue;
    }
    if (checkFailed(c)) {
      if (isNfcOrPassport(c.name)) notApplicable += 1; // NFC false on a driver's license is not a failure
      else forcedFailures.push(c); // a real failure is never hidden
      continue;
    }
    if (checkSkipped(c)) notApplicable += 1;
    else hiddenPassed += 1;
  }

  return {
    shown: [...(slots.filter(Boolean) as VerificationCheck[]), ...forcedFailures],
    hiddenPassed,
    notApplicable,
  };
}

/**
 * One-line footer, e.g. "8 identity checks passed · 13 additional CLEAR checks
 * passed · 3 not applicable". Null when there are no checks at all.
 */
export function summarizeChecks(curated: CuratedChecks): string | null {
  const total = curated.shown.length + curated.hiddenPassed + curated.notApplicable;
  if (total === 0) return null;
  const shownPassed = curated.shown.filter(checkPassed).length;
  const parts: string[] = [];
  if (curated.shown.length > 0) {
    const head = shownPassed === curated.shown.length ? `${shownPassed}` : `${shownPassed} of ${curated.shown.length}`;
    parts.push(`${head} identity check${curated.shown.length === 1 ? "" : "s"} passed`);
  }
  if (curated.hiddenPassed > 0) {
    parts.push(`${curated.hiddenPassed} additional CLEAR check${curated.hiddenPassed === 1 ? "" : "s"} passed`);
  }
  if (curated.notApplicable > 0) parts.push(`${curated.notApplicable} not applicable`);
  return parts.join(" · ");
}
