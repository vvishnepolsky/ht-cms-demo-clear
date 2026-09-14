/**
 * Medicaid coverage-date logic — ENG-1820.
 *
 * One source of truth for how coverage dates are derived on every case notice
 * (seeded demo data, frontend coverage cards + Notice-of-Decision letters, and
 * the generated PDF). Centralizing this prevents the per-surface drift that the
 * CMS May 18 review flagged.
 *
 * CMS requirements (42 CFR §435.914, §435.915):
 *   1. Coverage is effective on the date of application OR the first day of the
 *      month of application (state-dependent). This platform uses FIRST DAY OF
 *      THE APPLICATION MONTH (see {@link coverageEffectiveDate}).
 *   2. Retroactive coverage is available for up to three months prior to the
 *      month of application, if the individual was eligible during that period.
 *   3. Coverage stops at the END OF THE MONTH in which eligibility is lost.
 *
 * All arithmetic is performed in UTC on calendar y/m/d only — no local-timezone
 * components are ever read — so a date computed on a server in UTC and rendered
 * in a browser in America/Chicago never drifts by a day.
 */

/** A standard Medicaid certification period, in months. */
export const DEFAULT_CERTIFICATION_MONTHS = 12;

/** Maximum retroactive coverage lookback per 42 CFR §435.915, in months. */
export const RETROACTIVE_COVERAGE_MONTHS = 3;

/** A date input accepted by every helper: a Date, an ISO string, or null/undefined. */
export type DateInput = Date | string | null | undefined;

/** A retroactive coverage window — the calendar months eligible for back-coverage. */
export interface RetroactiveWindow {
  /** First day of the earliest retroactive month (inclusive). */
  start: Date;
  /** Last day of the month immediately before the application month (inclusive). */
  end: Date;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Normalize any accepted input to a UTC-midnight Date carrying only y/m/d.
 * Returns null for missing or unparseable input rather than an Invalid Date,
 * so callers can branch cleanly. A bare `YYYY-MM-DD` string is read as a
 * calendar date (never shifted by the parser's local offset).
 */
export function toUtcDate(input: DateInput): Date | null {
  if (input === null || input === undefined) return null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }

  const match = ISO_DATE_RE.exec(input);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Fallback for other parseable strings (e.g. full ISO datetimes).
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/** Format a Date as a `YYYY-MM-DD` calendar string in UTC. */
export function toIsoDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First day of the month containing `input`, or null if input is invalid. */
export function firstOfMonth(input: DateInput): Date | null {
  const d = toUtcDate(input);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Last day of the month containing `input`, or null if input is invalid. */
export function endOfMonth(input: DateInput): Date | null {
  const d = toUtcDate(input);
  if (!d) return null;
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/**
 * Add `months` (may be negative) to `input`, clamping the day to the target
 * month's length so Jan 31 + 1 month → Feb 28/29 rather than overflowing into
 * March. Returns null if input is invalid.
 */
export function addMonths(input: DateInput, months: number): Date | null {
  const d = toUtcDate(input);
  if (!d) return null;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDayOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTarget));
  return target;
}

/**
 * CMS requirement 1: coverage effective date = first day of the application
 * month. (This platform's chosen convention; the alternative permitted by
 * §435.914 is the application date itself.)
 */
export function coverageEffectiveDate(applicationDate: DateInput): Date | null {
  return firstOfMonth(applicationDate);
}

/**
 * CMS requirement 3: coverage end date. For a standard certification period
 * coverage runs `certMonths` whole months and stops at the END of the final
 * month — e.g. effective 2025-11-01 + 12 months → 2026-10-31.
 */
export function coverageEndDate(
  effectiveDate: DateInput,
  certMonths: number = DEFAULT_CERTIFICATION_MONTHS,
): Date | null {
  const effective = toUtcDate(effectiveDate);
  if (!effective) return null;
  return endOfMonth(addMonths(effective, certMonths - 1));
}

/**
 * CMS requirement 2: the retroactive coverage window — the `months` whole
 * calendar months immediately before the application month. For an application
 * filed 2026-04-10 with months=3 this is 2026-01-01 .. 2026-03-31.
 *
 * Returns null if the application date is invalid.
 */
export function retroactiveWindow(
  applicationDate: DateInput,
  months: number = RETROACTIVE_COVERAGE_MONTHS,
): RetroactiveWindow | null {
  const appMonthStart = firstOfMonth(applicationDate);
  if (!appMonthStart) return null;
  const start = firstOfMonth(addMonths(appMonthStart, -months));
  const end = endOfMonth(addMonths(appMonthStart, -1));
  if (!start || !end) return null;
  return { start, end };
}
