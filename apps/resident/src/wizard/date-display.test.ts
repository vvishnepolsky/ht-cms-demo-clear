import { describe, it, expect, vi } from 'vitest';

// ENG-1989: date-only strings (YYYY-MM-DD) parse as UTC midnight per the
// ECMAScript spec, so formatting them in local time shifts them back a day in
// any timezone behind UTC (entered 1/1/1970 → displayed 12/31/1969). Pin a
// negative-offset timezone BEFORE the modules under test are imported so the
// regression reproduces even when the test runner itself is in UTC.
vi.hoisted(() => {
  process.env.TZ = 'America/New_York';
});

import { fmtDate } from './ui';
import { ageFrom } from './eligibility';

describe('fmtDate — date-only strings display as entered (ENG-1989)', () => {
  it('formats the epoch boundary date without shifting a day', () => {
    expect(fmtDate('1970-01-01')).toBe('Jan 1, 1970');
  });

  it('formats a DOB without shifting a day', () => {
    expect(fmtDate('1950-01-01')).toBe('Jan 1, 1950');
  });

  it('formats the last day of a year without shifting into the prior year', () => {
    expect(fmtDate('2025-12-31')).toBe('Dec 31, 2025');
  });

  it('returns the em dash placeholder for missing values', () => {
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('returns the raw input for unparseable values', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });

  it('still formats full ISO timestamps (instants) in local time', () => {
    // 18:00 UTC = 13:00/14:00 New York — same calendar day in both zones.
    expect(fmtDate('2026-06-01T18:00:00Z')).toBe('Jun 1, 2026');
  });
});

describe('ageFrom — DOB calendar date is not shifted by timezone (ENG-1989)', () => {
  it('does not count the birthday as reached the day before it', () => {
    // Born Jan 1, 1950; as of Dec 31, 2025 the 76th birthday has NOT happened.
    // The UTC-midnight parse makes the DOB look like Dec 31, 1949 locally,
    // which wrongly yields 76 here.
    expect(ageFrom('1950-01-01', new Date(2025, 11, 31))).toBe(75);
  });

  it('counts the birthday as reached on the day itself', () => {
    expect(ageFrom('1950-01-01', new Date(2026, 0, 1))).toBe(76);
  });

  it('matches the existing fixture ages (Jasmine, 1991-08-04 → 34 on 2026-05-26)', () => {
    expect(ageFrom('1991-08-04', new Date(2026, 4, 26))).toBe(34);
  });

  it('returns null for missing DOB', () => {
    expect(ageFrom(undefined)).toBeNull();
  });
});
