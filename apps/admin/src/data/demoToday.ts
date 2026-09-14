/**
 * Demo "today" anchor for State-X mock data.
 *
 * Frozen at 2026-03-15 (storyboard convention). Every mock data file in this
 * app reads "today" from here so timelines, activity logs, and notice
 * timestamps stay self-consistent regardless of when the demo is given.
 *
 * Why frozen rather than `new Date()`: a CMS audience clicking through
 * Dashboard → Workspace → Reporting will notice if "Sent today" timestamps
 * drift relative to the case ages and renewal countdowns wired into the
 * storyboard data set. Freezing the anchor keeps the narrative coherent.
 *
 * Rule: any timeline / activity-log / status-update timestamp should be on or
 * before DEMO_TODAY. Scheduled / Draft items may be after the anchor.
 */

export const DEMO_TODAY = new Date(Date.UTC(2026, 2, 15, 12, 0, 0));
export const DEMO_TODAY_DISPLAY = '03/15/2026';

/** Return a Date `n` days before DEMO_TODAY (negative `n` returns a future date). */
export function daysAgo(n: number): Date {
  const d = new Date(DEMO_TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** Return a Date `n` days after DEMO_TODAY. */
export function daysFromNow(n: number): Date {
  return daysAgo(-n);
}

/** Format a Date as MM/DD/YYYY (Civic / storyboard convention). */
export function formatMDY(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}/${date.getUTCFullYear()}`;
}
