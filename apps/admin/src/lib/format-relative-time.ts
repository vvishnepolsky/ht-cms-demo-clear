/**
 * Humanize an ISO timestamp as a relative time ("2 hours ago", "yesterday",
 * "3 days ago").
 *
 * Extracted so the enrollment banner (and any future caller) can render a
 * case's real completion time instead of a frozen seed string (ENG-1809).
 */

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const RELATIVE_TIME_DIVISIONS: { limit: number; seconds: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, seconds: 1, unit: 'second' },
  { limit: 3600, seconds: 60, unit: 'minute' },
  { limit: 86400, seconds: 3600, unit: 'hour' },
  { limit: 604800, seconds: 86400, unit: 'day' },
  { limit: 2629800, seconds: 604800, unit: 'week' },
  { limit: 31557600, seconds: 2629800, unit: 'month' },
  { limit: Infinity, seconds: 31557600, unit: 'year' },
];

/** Returns an em-dash for an unparseable timestamp. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  const division =
    RELATIVE_TIME_DIVISIONS.find((d) => absSec < d.limit) ??
    RELATIVE_TIME_DIVISIONS[RELATIVE_TIME_DIVISIONS.length - 1];
  return RELATIVE_TIME_FORMAT.format(Math.round(diffSec / division.seconds), division.unit);
}
