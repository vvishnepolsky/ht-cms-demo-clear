import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  it('returns an em-dash for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date')).toBe('—');
    expect(formatRelativeTime('')).toBe('—');
  });

  it('formats a recent past timestamp in hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
  });

  it('formats a day-old timestamp as "yesterday" (numeric: auto)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe('yesterday');
  });

  it('formats a multi-day-old timestamp in days', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveDaysAgo)).toBe('5 days ago');
  });
});
