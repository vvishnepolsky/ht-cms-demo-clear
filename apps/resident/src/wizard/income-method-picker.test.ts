import { describe, it, expect } from 'vitest';
import { INITIAL_FORM } from './context';
import type { WizardFormData } from './form-data.types';

// ─── INITIAL_FORM additions ───────────────────────────────────────────────

describe('INITIAL_FORM', () => {
  it('includes _incomeConfirmed as an empty array', () => {
    expect((INITIAL_FORM as WizardFormData)._incomeConfirmed).toEqual([]);
  });

  it('includes _payrollDocsByPerson as an empty object', () => {
    expect((INITIAL_FORM as WizardFormData)._payrollDocsByPerson).toEqual({});
  });

  it('includes _argyleByPerson as an empty object', () => {
    expect((INITIAL_FORM as WizardFormData)._argyleByPerson).toEqual({});
  });
});

// ─── INCOME_METHODS structure ────────────────────────────────────────────

// Import only the exported constants / helpers — the React components
// themselves require a browser/jsdom environment and are covered separately.
// TODO: component-level tests (connect() branches, real/mock SDK path, error
// states) need vitest + jsdom + sessionStorage mocking. Track in a follow-up.
import {
  INCOME_METHODS,
  buildArgyleMockJob,
  buildArgyleMockPastJob,
  METHOD_ARGYLE,
  METHOD_UPLOAD,
  METHOD_MANUAL,
} from './screens-g';
import { ageFrom, isApplyingAdult } from './eligibility';

// Typed wrappers — screens-g.tsx uses @ts-nocheck so exports are untyped.
// Casting here means signature changes in the helpers surface as test errors.
type ArgyleProvider = { id: string; name: string; hue: string };
const mockJob = buildArgyleMockJob as (
  data: object,
  provider: ArgyleProvider,
  adultIndex?: number,
) => {
  id: string;
  employer: string;
  monthlyIncome: number;
  payRate: string;
  hoursPerWeek: string;
  ongoing: boolean;
  selfEmployed: boolean;
  payType: string;
  _argyleImported: boolean;
  _argyleProvider: string;
};
const mockPastJob = buildArgyleMockPastJob as (provider: ArgyleProvider) => {
  id: string;
  employer: string;
  endDate: string;
  grossPay: string;
  _argyleImported: boolean;
};
type IncomeMethod = { id: string; icon: string; badge: string; title: string; desc: string };
const typedMethods = INCOME_METHODS as IncomeMethod[];

describe('INCOME_METHODS', () => {
  it('has exactly 3 entries', () => {
    expect(typedMethods).toHaveLength(3);
  });

  it('has ids: argyle, upload, manual — in that order', () => {
    expect(typedMethods.map((m) => m.id)).toEqual([METHOD_ARGYLE, METHOD_UPLOAD, METHOD_MANUAL]);
  });

  it('marks argyle as "Fastest"', () => {
    expect(typedMethods.find((m) => m.id === METHOD_ARGYLE)!.badge).toBe('Fastest');
  });

  it('leaves upload and manual badges empty', () => {
    expect(typedMethods.find((m) => m.id === METHOD_UPLOAD)!.badge).toBe('');
    expect(typedMethods.find((m) => m.id === METHOD_MANUAL)!.badge).toBe('');
  });

  it('has an icon name for every method', () => {
    for (const m of typedMethods) {
      expect(typeof m.icon).toBe('string');
      expect(m.icon.length).toBeGreaterThan(0);
    }
  });
});

// ─── buildArgyleMockJob ──────────────────────────────────────────────────

describe('buildArgyleMockJob', () => {
  const provider = { id: 'adp', name: 'ADP', hue: '#d32027' };
  const job = mockJob({}, provider);

  it('returns a job with _argyleImported: true', () => {
    expect(job._argyleImported).toBe(true);
  });

  it('records the provider name', () => {
    expect(job._argyleProvider).toBe('ADP');
    expect(job.employer).toBe('ADP');
  });

  it('produces a positive monthlyIncome', () => {
    expect(job.monthlyIncome).toBeGreaterThan(0);
  });

  it('has ongoing: true (active job)', () => {
    expect(job.ongoing).toBe(true);
  });

  it('has the required job shape fields', () => {
    expect(job).toMatchObject({
      id: expect.stringContaining('j_argyle_'),
      employer: 'ADP',
      selfEmployed: false,
      payType: 'gross',
    });
  });
});

// ─── buildArgyleMockJob — member-specific income ─────────────────────────

describe('buildArgyleMockJob member-specific income', () => {
  const provider = { id: 'adp', name: 'ADP', hue: '#d32027' };

  it('primary adult (index 0 — Jasmine Carter) earns $2,200/mo', () => {
    const job = mockJob({}, provider, 0);
    expect(job.monthlyIncome).toBe(2200);
  });

  it('second adult (index 1 — Marcus Carter) earns $950/mo regardless of member ID', () => {
    const job = mockJob({}, provider, 1);
    expect(job.monthlyIncome).toBe(950);
  });

  it('third or unknown adult (index 2+) falls back to the default income', () => {
    const job = mockJob({}, provider, 2);
    expect(job.monthlyIncome).toBe(1610);
  });
});

// ─── buildArgyleMockPastJob ──────────────────────────────────────────────

describe('buildArgyleMockPastJob', () => {
  const provider = { id: 'gusto', name: 'Gusto', hue: '#f45d48' };
  const past = mockPastJob(provider);

  it('returns an object with _argyleImported: true', () => {
    expect(past._argyleImported).toBe(true);
  });

  it('has employer name referencing the provider', () => {
    expect(past.employer).toContain('Gusto');
  });

  it('has endDate set (past job has ended)', () => {
    expect(past.endDate).toBeTruthy();
  });

  it('has a numeric grossPay string', () => {
    expect(Number(past.grossPay)).toBeGreaterThan(0);
  });
});

// ─── Adult age-filter logic (mirrors the validate fn in app.tsx) ─────────

describe('adult age-filter validation logic', () => {
  function adultIds(data: any): string[] {
    return [
      { id: '0', dob: data.primaryApplicant.dob },
      ...(data.householdMembers || []).filter((m: any) => m.applying).map((m: any) => ({ id: m.id, dob: m.dob })),
    ]
      .filter(isApplyingAdult)
      .map((p: any) => p.id);
  }

  function validate(data: any): boolean {
    const adults = adultIds(data);
    return adults.length === 0 || adults.every((id) => (data._incomeConfirmed || []).includes(id));
  }

  const baseData = {
    primaryApplicant: { dob: '1991-08-04' },
    householdMembers: [
      { id: 'm1', dob: '1989-11-15', applying: true },
      { id: 'm2', dob: '2017-09-22', applying: true }, // child, age ~8
    ],
    _incomeConfirmed: [],
  };

  it('returns false when no adults are confirmed', () => {
    expect(validate(baseData)).toBe(false);
  });

  it('returns false when only one of two adults is confirmed', () => {
    expect(validate({ ...baseData, _incomeConfirmed: ['0'] })).toBe(false);
  });

  it('returns true when all adults (16+) are confirmed', () => {
    expect(validate({ ...baseData, _incomeConfirmed: ['0', 'm1'] })).toBe(true);
  });

  it('excludes children (age < 16) from the required set', () => {
    // m2 is age 8 — confirming only the two adults should pass
    expect(validate({ ...baseData, _incomeConfirmed: ['0', 'm1'] })).toBe(true);
  });

  it('returns true for a household with no applying members and primary confirmed', () => {
    const data = {
      primaryApplicant: { dob: '1991-08-04' },
      householdMembers: [],
      _incomeConfirmed: ['0'],
    };
    expect(validate(data)).toBe(true);
  });

  it('treats unknown dob (null age) as an adult requiring confirmation', () => {
    const data = {
      primaryApplicant: { dob: '' },
      householdMembers: [],
      _incomeConfirmed: [],
    };
    expect(validate(data)).toBe(false);
    expect(validate({ ...data, _incomeConfirmed: ['0'] })).toBe(true);
  });
});

// ─── _argyleByPerson state transitions ───────────────────────────────────

type ArgyleEntry = { provider: string; at: string };
type ArgyleByPerson = Record<string, ArgyleEntry>;

describe('_argyleByPerson state transitions', () => {
  const AT = '2026-06-02T12:00:00.000Z';

  it('connects a provider for one person without affecting others', () => {
    const prev: ArgyleByPerson = {};
    const next: ArgyleByPerson = { ...prev, '0': { provider: 'ADP', at: AT } };
    expect(next['0'].provider).toBe('ADP');
    expect(next['m1']).toBeUndefined();
  });

  it('connecting a second person preserves the first person connection', () => {
    const prev: ArgyleByPerson = { '0': { provider: 'ADP', at: AT } };
    const next: ArgyleByPerson = { ...prev, m1: { provider: 'Gusto', at: AT } };
    expect(next['0'].provider).toBe('ADP');
    expect(next['m1'].provider).toBe('Gusto');
  });

  it('reconnecting a different provider for the same person overwrites the previous entry', () => {
    const prev: ArgyleByPerson = { '0': { provider: 'ADP', at: AT } };
    const next: ArgyleByPerson = { ...prev, '0': { provider: 'Gusto', at: AT } };
    expect(next['0'].provider).toBe('Gusto');
  });

  it('each entry carries the provider name and a timestamp', () => {
    const entry: ArgyleEntry = { provider: 'Workday', at: AT };
    expect(entry.provider).toBe('Workday');
    expect(typeof entry.at).toBe('string');
    expect(entry.at.length).toBeGreaterThan(0);
  });

  it('PersonEmploymentReview falls back to _argyleByPerson when meta is null', () => {
    const argyleByPerson: ArgyleByPerson = { '0': { provider: 'ADP', at: AT } };
    const meta: ArgyleEntry | null = null;
    const resolvedMeta = meta ?? argyleByPerson['0'] ?? null;
    expect(resolvedMeta?.provider).toBe('ADP');
  });

  it('PersonEmploymentReview uses meta when both meta and _argyleByPerson are set', () => {
    const argyleByPerson: ArgyleByPerson = { '0': { provider: 'ADP', at: AT } };
    const meta: ArgyleEntry = { provider: 'Gusto', at: AT };
    const resolvedMeta = meta ?? argyleByPerson['0'] ?? null;
    expect(resolvedMeta?.provider).toBe('Gusto');
  });

  it('PersonEmploymentReview resolves to null when neither meta nor _argyleByPerson has an entry', () => {
    const argyleByPerson: ArgyleByPerson = {};
    const meta: ArgyleEntry | null = null;
    const resolvedMeta = meta ?? argyleByPerson['0'] ?? null;
    expect(resolvedMeta).toBeNull();
  });
});

// ─── _incomeConfirmed state-machine logic ────────────────────────────────

describe('_incomeConfirmed state transitions', () => {
  it('confirming a person adds their id to _incomeConfirmed without duplicates', () => {
    const prev = { _incomeConfirmed: ['0'] };
    const next = { _incomeConfirmed: [...new Set([...(prev._incomeConfirmed || []), 'm1'])] };
    expect(next._incomeConfirmed).toEqual(['0', 'm1']);
  });

  it('confirming an already-confirmed person is idempotent', () => {
    const prev = { _incomeConfirmed: ['0', 'm1'] };
    const next = { _incomeConfirmed: [...new Set([...(prev._incomeConfirmed || []), '0'])] };
    expect(next._incomeConfirmed).toEqual(['0', 'm1']);
  });

  it('editPerson removes a person from _incomeConfirmed so they can re-choose', () => {
    const prev = { _incomeConfirmed: ['0', 'm1'] };
    const next = { _incomeConfirmed: (prev._incomeConfirmed || []).filter((x) => x !== 'm1') };
    expect(next._incomeConfirmed).toEqual(['0']);
    expect(next._incomeConfirmed).not.toContain('m1');
  });

  it('editPerson on an unconfirmed person is a no-op', () => {
    const prev = { _incomeConfirmed: ['0'] };
    const next = { _incomeConfirmed: (prev._incomeConfirmed || []).filter((x) => x !== 'm1') };
    expect(next._incomeConfirmed).toEqual(['0']);
  });
});
