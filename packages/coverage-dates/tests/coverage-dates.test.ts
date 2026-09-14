import { describe, it, expect } from 'vitest';
import {
  toUtcDate,
  toIsoDate,
  firstOfMonth,
  endOfMonth,
  addMonths,
  coverageEffectiveDate,
  coverageEndDate,
  retroactiveWindow,
  DEFAULT_CERTIFICATION_MONTHS,
  RETROACTIVE_COVERAGE_MONTHS,
} from '../src/index.js';

const iso = (input: Date | null) => (input ? toIsoDate(input) : null);

describe('toUtcDate', () => {
  it('parses YYYY-MM-DD as a calendar date without timezone drift', () => {
    expect(iso(toUtcDate('2026-04-10'))).toBe('2026-04-10');
  });

  it('reads only the date portion of a full ISO datetime', () => {
    expect(iso(toUtcDate('2026-04-10T23:59:00.000Z'))).toBe('2026-04-10');
  });

  it('normalizes a Date to UTC y/m/d', () => {
    expect(iso(toUtcDate(new Date(Date.UTC(2025, 10, 5))))).toBe('2025-11-05');
  });

  it('returns null for null, undefined, and garbage', () => {
    expect(toUtcDate(null)).toBeNull();
    expect(toUtcDate(undefined)).toBeNull();
    expect(toUtcDate('not-a-date')).toBeNull();
    expect(toUtcDate(new Date('nope'))).toBeNull();
  });
});

describe('firstOfMonth / endOfMonth', () => {
  it('finds the first day of the month', () => {
    expect(iso(firstOfMonth('2025-11-05'))).toBe('2025-11-01');
  });

  it('finds the last day of a 30-day month', () => {
    expect(iso(endOfMonth('2026-04-10'))).toBe('2026-04-30');
  });

  it('finds the last day of December', () => {
    expect(iso(endOfMonth('2026-12-01'))).toBe('2026-12-31');
  });

  it('handles leap-year February', () => {
    expect(iso(endOfMonth('2028-02-15'))).toBe('2028-02-29');
  });

  it('handles non-leap-year February', () => {
    expect(iso(endOfMonth('2026-02-15'))).toBe('2026-02-28');
  });

  it('returns null for invalid input', () => {
    expect(firstOfMonth(null)).toBeNull();
    expect(endOfMonth('garbage')).toBeNull();
  });
});

describe('addMonths', () => {
  it('adds months within the same year', () => {
    expect(iso(addMonths('2026-01-15', 3))).toBe('2026-04-15');
  });

  it('rolls over the year boundary', () => {
    expect(iso(addMonths('2026-11-01', 12))).toBe('2027-11-01');
  });

  it('subtracts months across the year boundary', () => {
    expect(iso(addMonths('2026-01-10', -3))).toBe('2025-10-10');
  });

  it('clamps the day rather than overflowing (Jan 31 + 1mo → Feb 28)', () => {
    expect(iso(addMonths('2026-01-31', 1))).toBe('2026-02-28');
  });

  it('clamps into a leap February (Jan 31 + 1mo → Feb 29)', () => {
    expect(iso(addMonths('2028-01-31', 1))).toBe('2028-02-29');
  });
});

describe('coverageEffectiveDate — first day of application month', () => {
  it('uses the first of the application month', () => {
    expect(iso(coverageEffectiveDate('2025-11-05'))).toBe('2025-11-01');
  });

  it('keeps the first when the application is filed on the 1st', () => {
    expect(iso(coverageEffectiveDate('2026-05-01'))).toBe('2026-05-01');
  });

  it('returns null for a missing application date', () => {
    expect(coverageEffectiveDate(null)).toBeNull();
  });
});

describe('coverageEndDate — end of month, standard 12-month cert', () => {
  it('ends 12 whole months later at end of month (Nov 1 → Oct 31 next year)', () => {
    expect(iso(coverageEndDate('2025-11-01'))).toBe('2026-10-31');
  });

  it('respects a custom certification length', () => {
    expect(iso(coverageEndDate('2026-05-01', 6))).toBe('2026-10-31');
  });

  it('uses the default certification length constant', () => {
    expect(DEFAULT_CERTIFICATION_MONTHS).toBe(12);
    expect(iso(coverageEndDate('2026-01-01', DEFAULT_CERTIFICATION_MONTHS))).toBe('2026-12-31');
  });

  it('returns null for an invalid effective date', () => {
    expect(coverageEndDate(undefined)).toBeNull();
  });
});

describe('retroactiveWindow — 3 whole months before the application month', () => {
  it('spans the three calendar months before the application month', () => {
    const w = retroactiveWindow('2026-04-10');
    expect(iso(w?.start ?? null)).toBe('2026-01-01');
    expect(iso(w?.end ?? null)).toBe('2026-03-31');
  });

  it('crosses the year boundary correctly', () => {
    const w = retroactiveWindow('2026-02-20');
    expect(iso(w?.start ?? null)).toBe('2025-11-01');
    expect(iso(w?.end ?? null)).toBe('2026-01-31');
  });

  it('honors a custom lookback length', () => {
    const w = retroactiveWindow('2026-04-10', 1);
    expect(iso(w?.start ?? null)).toBe('2026-03-01');
    expect(iso(w?.end ?? null)).toBe('2026-03-31');
  });

  it('exposes the federal 3-month constant', () => {
    expect(RETROACTIVE_COVERAGE_MONTHS).toBe(3);
  });

  it('returns null for a missing application date', () => {
    expect(retroactiveWindow(null)).toBeNull();
  });
});
