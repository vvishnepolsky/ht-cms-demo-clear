import { describe, it, expect } from 'vitest';
import * as dashboardData from './dashboard-data';
import {
  getGreeting,
  greetingName,
  deriveCoverageDates,
  resolveCaseNumber,
  fmtDateLong,
  fmtSize,
  INBOX_MESSAGES,
  CASE_NUMBER_PENDING,
  daysUntilRecert,
  isInRecertificationWindow,
  buildRecertMessage,
  RECERT_WINDOW_DAYS,
  CASE_STATUS,
  getApplicationStatusMessage,
} from './dashboard-data';

/**
 * ENG-1883 — Verifiable Outcomes for the dashboard data-wiring change.
 * The dashboard surface itself has no render-test harness in this app
 * (no @testing-library/react); per the app's established pattern these are
 * pure-function unit tests over the extracted derivation/data module.
 */

describe('AC1 — greeting + account name reflect the authenticated resident', () => {
  it('greetingName uses the resident first name when present', () => {
    expect(greetingName({ firstName: 'Dana', lastName: 'Lee' })).toBe('Dana');
  });

  it('greetingName falls back to a neutral word when unauthenticated', () => {
    expect(greetingName(null)).toBe('there');
    expect(greetingName({})).toBe('there');
    expect(greetingName({ firstName: '' })).toBe('there');
  });

  it('getGreeting returns the right time-of-day phrase', () => {
    expect(getGreeting(8)).toBe('Good morning');
    expect(getGreeting(13)).toBe('Good afternoon');
    expect(getGreeting(20)).toBe('Good evening');
    // boundaries
    expect(getGreeting(5)).toBe('Good morning');
    expect(getGreeting(12)).toBe('Good afternoon');
    expect(getGreeting(17)).toBe('Good evening');
  });

  it('pre-dawn hours (0–4) fall into "Good afternoon" — pre-existing prototype logic', () => {
    // Documented as its own case so the quirk is intentional and greppable, not an accident.
    expect(getGreeting(0)).toBe('Good afternoon');
    expect(getGreeting(2)).toBe('Good afternoon');
    expect(getGreeting(4)).toBe('Good afternoon');
  });
});

describe('AC2 — case number + coverage/recert dates reflect real case data', () => {
  it('resolveCaseNumber returns the real case number when present', () => {
    expect(resolveCaseNumber({ caseNumber: 'ABC-123' })).toBe('ABC-123');
  });

  it('resolveCaseNumber returns a neutral placeholder (never a fake id) when absent', () => {
    expect(resolveCaseNumber(null)).toBe(CASE_NUMBER_PENDING);
    expect(resolveCaseNumber({ caseNumber: null })).toBe(CASE_NUMBER_PENDING);
    // regression: must never resurrect the old hardcoded persona case id
    expect(resolveCaseNumber(null)).not.toBe('ST-MED-2026-0512-48217');
  });

  it('deriveCoverageDates pulls coverage-start from determination effectiveDate and recert from expirationDate', () => {
    const eeCaseStatus = {
      caseNumber: 'ABC-123',
      determinations: [{ status: 'ELIGIBLE', effectiveDate: '2026-06-01', expirationDate: '2027-05-31' }],
    };
    expect(deriveCoverageDates(eeCaseStatus)).toEqual({
      coverageStart: '2026-06-01',
      recertDue: '2027-05-31',
    });
  });

  it('deriveCoverageDates uses the first determination with a populated date', () => {
    const eeCaseStatus = {
      determinations: [
        { status: 'PENDING', effectiveDate: null, expirationDate: null },
        { status: 'ELIGIBLE', effectiveDate: '2026-06-01', expirationDate: '2027-05-31' },
      ],
    };
    expect(deriveCoverageDates(eeCaseStatus)).toEqual({
      coverageStart: '2026-06-01',
      recertDue: '2027-05-31',
    });
  });

  it('deriveCoverageDates returns nulls when there are no determinations', () => {
    expect(deriveCoverageDates(null)).toEqual({ coverageStart: null, recertDue: null });
    expect(deriveCoverageDates({ determinations: [] })).toEqual({ coverageStart: null, recertDue: null });
  });

  it('deriveCoverageDates reads both dates from one determination — never mixes benefit periods', () => {
    // Asymmetric input: an earlier determination carries only an expirationDate.
    // Both returned dates must come from the determination that has effectiveDate,
    // not be stitched together across two different determinations.
    const eeCaseStatus = {
      determinations: [
        { status: 'PENDING', effectiveDate: null, expirationDate: '2025-01-01' },
        { status: 'ELIGIBLE', effectiveDate: '2026-06-01', expirationDate: '2027-05-31' },
      ],
    };
    expect(deriveCoverageDates(eeCaseStatus)).toEqual({
      coverageStart: '2026-06-01',
      recertDue: '2027-05-31', // NOT the stray '2025-01-01' from the first determination
    });
  });

  it('fmtDateLong formats an ISO date and returns null for empty/invalid input', () => {
    expect(fmtDateLong('2026-06-01')).toMatch(/Jun.*1.*2026/);
    expect(fmtDateLong(null)).toBeNull();
    expect(fmtDateLong('not-a-date')).toBeNull();
  });
});

describe('fmtSize — human-readable file size (used by DocRow)', () => {
  it('formats bytes, kilobytes, and megabytes across the three branches', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2 KB');
    expect(fmtSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('handles the branch boundaries', () => {
    expect(fmtSize(1023)).toBe('1023 B');
    expect(fmtSize(1024)).toBe('1 KB');
    expect(fmtSize(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('ENG-1991 — recertification window helpers', () => {
  // Pin "today" to 2026-06-03 UTC for all tests in this suite.
  const TODAY = Date.UTC(2026, 5, 3); // June 3 2026

  describe('daysUntilRecert', () => {
    it('returns null for null / undefined / empty input', () => {
      expect(daysUntilRecert(null, TODAY)).toBeNull();
      expect(daysUntilRecert(undefined, TODAY)).toBeNull();
      expect(daysUntilRecert('', TODAY)).toBeNull();
    });

    it('returns null for an unparseable date string', () => {
      expect(daysUntilRecert('not-a-date', TODAY)).toBeNull();
    });

    it('returns 0 for a past-due date', () => {
      expect(daysUntilRecert('2026-05-01', TODAY)).toBe(0);
    });

    it('returns 0 when due today', () => {
      expect(daysUntilRecert('2026-06-03', TODAY)).toBe(0);
    });

    it('returns the correct number of days for a future date', () => {
      expect(daysUntilRecert('2026-09-01', TODAY)).toBe(90); // exactly 90 days
      expect(daysUntilRecert('2026-09-02', TODAY)).toBe(91);
      expect(daysUntilRecert('2026-06-04', TODAY)).toBe(1);
    });
  });

  describe('isInRecertificationWindow', () => {
    it('returns false for null / missing recertDue', () => {
      expect(isInRecertificationWindow(null, RECERT_WINDOW_DAYS, TODAY)).toBe(false);
      expect(isInRecertificationWindow(undefined, RECERT_WINDOW_DAYS, TODAY)).toBe(false);
    });

    it('returns true when due today (day 0)', () => {
      expect(isInRecertificationWindow('2026-06-03', RECERT_WINDOW_DAYS, TODAY)).toBe(true);
    });

    it('returns true on the last day of the window boundary', () => {
      expect(isInRecertificationWindow('2026-09-01', RECERT_WINDOW_DAYS, TODAY)).toBe(true); // RECERT_WINDOW_DAYS days away
    });

    it('returns false when one day outside the window', () => {
      expect(isInRecertificationWindow('2026-09-02', RECERT_WINDOW_DAYS, TODAY)).toBe(false);
    });

    it('returns true for a past-due date (day 0 clamp)', () => {
      expect(isInRecertificationWindow('2026-01-01', RECERT_WINDOW_DAYS, TODAY)).toBe(true);
    });
  });

  describe('buildRecertMessage', () => {
    it('returns null for null input', () => {
      expect(buildRecertMessage(null, TODAY)).toBeNull();
    });

    it('title reflects actual days remaining', () => {
      const msg = buildRecertMessage('2026-09-01', TODAY); // 90 days
      expect(msg).not.toBeNull();
      expect(msg!.title).toBe('Recertification due in 90 days');
    });

    it('uses singular "day" when exactly 1 day remains', () => {
      const msg = buildRecertMessage('2026-06-04', TODAY);
      expect(msg).not.toBeNull();
      expect(msg!.title).toBe('Recertification due in 1 day');
    });

    it('preview contains the actual recert date, not "every 30 days"', () => {
      const msg = buildRecertMessage('2026-09-01', TODAY);
      expect(msg).not.toBeNull();
      expect(msg!.preview).toContain('Sep 1, 2026');
      expect(msg!.preview).not.toContain('every 30 days');
    });

    it('body[0] references the real due date', () => {
      const msg = buildRecertMessage('2026-09-01', TODAY);
      expect(msg).not.toBeNull();
      expect(msg!.body[0]).toContain('Sep 1, 2026');
    });

    it('is always unread and has the start-recertification action', () => {
      const msg = buildRecertMessage('2026-09-01', TODAY);
      expect(msg).not.toBeNull();
      expect(msg!.unread).toBe(true);
      expect(msg!.action?.label).toBe('Start recertification');
    });
  });
});

describe('AC3 — no hardcoded documents exported from dashboard-data', () => {
  it('SEED_DOCUMENTS is not exported (ENG-1992: documents must come from the real case)', () => {
    expect((dashboardData as Record<string, unknown>).SEED_DOCUMENTS).toBeUndefined();
  });
});

describe('AC4 — no hardcoded persona identity in the seeded inbox', () => {
  const forbidden = ['Jasmine', 'Marcus', 'Aaliyah', 'ST-MED-2026-0512-48217'];
  const serialized = JSON.stringify(INBOX_MESSAGES);

  it.each(forbidden)('inbox seed copy contains no "%s"', (token) => {
    expect(serialized).not.toContain(token);
  });

  it('ENG-1991 regression: seed inbox does not contain a hardcoded recertification message', () => {
    expect(INBOX_MESSAGES.some((m) => m.id === 'msg-2' || /recertif/i.test(m.title))).toBe(false);
  });
});

describe('AC4 — getApplicationStatusMessage reflects real case status (ENG-1993)', () => {
  it('returns an "under review" message when status is null (no case loaded)', () => {
    const msg = getApplicationStatusMessage(null);
    expect(msg.id).toBe('msg-1');
    expect(msg.title).toMatch(/under review/i);
    expect(msg.action).toBeNull();
    expect(msg.unread).toBe(false);
  });

  it('returns an "under review" message for PENDING_VERIFICATION', () => {
    const msg = getApplicationStatusMessage(CASE_STATUS.PENDING_VERIFICATION);
    expect(msg.title).toMatch(/under review/i);
  });

  it('returns an "under review" message for IN_REVIEW', () => {
    const msg = getApplicationStatusMessage(CASE_STATUS.IN_REVIEW);
    expect(msg.title).toMatch(/under review/i);
  });

  it('returns an "application complete" message for APPROVED', () => {
    const msg = getApplicationStatusMessage(CASE_STATUS.APPROVED);
    expect(msg.title).toMatch(/application complete/i);
    expect(msg.iconKind).toBe('success');
    expect(msg.unread).toBe(false);
  });

  it('returns a "not approved" message for DENIED with unread=true', () => {
    const msg = getApplicationStatusMessage(CASE_STATUS.DENIED);
    expect(msg.title).toMatch(/not approved/i);
    expect(msg.iconKind).toBe('warning');
    expect(msg.unread).toBe(true);
    expect(msg.action).toBeNull();
  });

  it('unknown future status values fall through to "under review"', () => {
    // Locks the default branch so a future 'CLOSED' or 'WITHDRAWN' status
    // always resolves gracefully rather than requiring a code change first.
    const msg = getApplicationStatusMessage('FUTURE_STATUS');
    expect(msg.title).toMatch(/under review/i);
    expect(msg.action).toBeNull();
  });

  it('never includes hardcoded May dates in any status variant', () => {
    const statuses = [
      null,
      CASE_STATUS.PENDING_VERIFICATION,
      CASE_STATUS.IN_REVIEW,
      CASE_STATUS.APPROVED,
      CASE_STATUS.DENIED,
    ];
    for (const s of statuses) {
      const serialized = JSON.stringify(getApplicationStatusMessage(s));
      expect(serialized).not.toContain('May 13, 2026');
      expect(serialized).not.toContain('May 12, 2026');
      expect(serialized).not.toContain('June 1, 2026');
    }
  });
});

describe('AC5 — no hardcoded document filenames in any exported data', () => {
  const forbiddenDocNames = ['Pay stub', 'ABC Manufacturing', 'lease agreement']; // nosemgrep: c1-duplicate-string-literal-candidate -- test-fixture assertion strings, not magic literals; these fragments appear elsewhere for unrelated purposes
  const serialized = JSON.stringify(dashboardData);

  it.each(forbiddenDocNames)('exported data contains no "%s"', (token) => {
    expect(serialized).not.toContain(token);
  });
});
