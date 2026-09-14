import { describe, it, expect } from 'vitest';
import { caseDisplayNumber, toCalendarDate } from './utils';
import type { EECase } from '../types/ee';

type CaseInput = Pick<EECase, 'id' | 'caseNumber' | 'intakeData'>;

function makeCase(input: Partial<CaseInput> = {}): CaseInput {
  return {
    id: 'clr7qd2hfjs',
    caseNumber: null,
    intakeData: null,
    ...input,
  };
}

describe('caseDisplayNumber (ENG-1912)', () => {
  it('prefers the server-assigned caseNumber over the citizen-persisted displayMeta.caseNumber', () => {
    const c = makeCase({
      caseNumber: 'SX-2026-000004',
      intakeData: { displayMeta: { caseNumber: 'SX-2026-0601-93837' } },
    });
    expect(caseDisplayNumber(c)).toBe('SX-2026-000004');
  });

  it('falls back to displayMeta.caseNumber when the caseNumber column is null', () => {
    const c = makeCase({ intakeData: { displayMeta: { caseNumber: 'SX-2026-0601-93837' } } });
    expect(caseDisplayNumber(c)).toBe('SX-2026-0601-93837');
  });

  it('uses the backend caseNumber column when displayMeta is absent', () => {
    expect(caseDisplayNumber(makeCase({ caseNumber: 'IA-2026-048821' }))).toBe('IA-2026-048821');
  });

  it('falls back to the last 8 of the case id (uppercased) when nothing else is set', () => {
    expect(caseDisplayNumber(makeCase({ id: 'clr7qd2hfjs' }))).toBe('7QD2HFJS');
  });

  it('ignores a non-string displayMeta.caseNumber', () => {
    const c = makeCase({ caseNumber: 'IA-2026-048821', intakeData: { displayMeta: { caseNumber: 42 } } });
    expect(caseDisplayNumber(c)).toBe('IA-2026-048821');
  });
});

// ENG-1978: coverage/determination dates are calendar dates stored as midnight-UTC
// DateTime values; toCalendarDate strips the time so fmtDate doesn't render the
// prior day in US timezones. These assertions are timezone-independent.
describe('toCalendarDate (ENG-1978)', () => {
  it('extracts the calendar date from a midnight-UTC ISO datetime (no day drift)', () => {
    expect(toCalendarDate('2026-06-01T00:00:00.000Z')).toBe('2026-06-01');
    expect(toCalendarDate('2027-05-31T00:00:00.000Z')).toBe('2027-05-31');
  });

  it('passes a pure date string through unchanged', () => {
    expect(toCalendarDate('2026-06-01')).toBe('2026-06-01');
  });

  it('returns null for null/undefined/empty', () => {
    expect(toCalendarDate(null)).toBeNull();
    expect(toCalendarDate(undefined)).toBeNull();
    expect(toCalendarDate('')).toBeNull();
  });

  it('passes a non-date string through unchanged (safe fallback)', () => {
    expect(toCalendarDate('not-a-date')).toBe('not-a-date');
  });
});
