import { describe, it, expect, vi } from 'vitest';
import {
  resolveIncomeStatus,
  extractApplicantContact,
  executeIncomeVerificationFlow,
  buildRows,
} from './IncomeSources';
import { SSDI_SOURCE_LABEL, SSI_SOURCE_LABEL } from '../../lib/ee-utils';
import type { IncomeVerification, EECase, EEHousehold, EEDetermination } from '../../types/ee';

const TEST_CASE_ID = 'case-1';

const VERIFIED_IV: IncomeVerification = {
  status: 'VERIFIED',
  employer: null,
  employmentType: null,
  incomeAnnual: null,
  incomeMonthly: null,
  hoursPerWeek: null,
  payFrequency: null,
  lastPaystubDate: null,
  verifiedAt: '2026-05-01T00:00:00Z',
};

const PENDING_IV: IncomeVerification = { ...VERIFIED_IV, status: 'PENDING', verifiedAt: null };

function makeCase(overrides: Partial<EECase> = {}): EECase {
  return {
    id: TEST_CASE_ID,
    customerId: 'cust-1',
    householdId: 'hh-1',
    caseNumber: null,
    caseType: 'INITIAL',
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    notes: null,
    flagReason: null,
    intakeData: null,
    ruleEvaluations: null,
    rfiDetails: null,
    documentId: null,
    linkedCaseId: null,
    linkedCase: null,
    caseAssistNarrative: null,
    incomeVerification: null,
    assetVerification: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    household: { id: 'hh-1', customerId: 'cust-1', members: [] },
    determinations: [],
    ...overrides,
  };
}

describe('resolveIncomeStatus', () => {
  it('returns verified when sandbox is true, regardless of API status', () => {
    expect(resolveIncomeStatus(null, true, 'PENDING_VERIFICATION')).toBe('verified');
    expect(resolveIncomeStatus(PENDING_IV, true, 'PENDING_VERIFICATION')).toBe('verified');
  });

  it('returns not_started when incomeVerification is null and sandbox is false', () => {
    expect(resolveIncomeStatus(null, false, 'PENDING_VERIFICATION')).toBe('not_started');
  });

  it('returns pending for PENDING status', () => {
    expect(resolveIncomeStatus(PENDING_IV, false, 'PENDING_VERIFICATION')).toBe('pending');
  });

  it('returns connected for CONNECTED status', () => {
    expect(resolveIncomeStatus({ ...VERIFIED_IV, status: 'CONNECTED' }, false, 'IN_REVIEW')).toBe('connected');
  });

  it('returns verified for VERIFIED status', () => {
    expect(resolveIncomeStatus(VERIFIED_IV, false, 'IN_REVIEW')).toBe('verified');
  });

  it('returns failed for FAILED status', () => {
    expect(resolveIncomeStatus({ ...VERIFIED_IV, status: 'FAILED' }, false, 'IN_REVIEW')).toBe('failed');
  });

  // ENG-1870: completed (APPROVED) cases display income as Verified even when no
  // Argyle verification record exists — demo cases auto-approve without one.
  it('returns verified for an APPROVED case with no income verification record', () => {
    expect(resolveIncomeStatus(null, false, 'APPROVED')).toBe('verified');
  });

  it('returns verified for an APPROVED case, overriding the live API status', () => {
    expect(resolveIncomeStatus(PENDING_IV, false, 'APPROVED')).toBe('verified');
  });

  // DENIED is "completed" but does NOT get the Verified treatment — matches the
  // prototype, where only approved cases display income as Verified.
  it('does not override income status for a DENIED case (null stays not_started)', () => {
    expect(resolveIncomeStatus(null, false, 'DENIED')).toBe('not_started');
  });

  it('honors the real income status for a DENIED case', () => {
    expect(resolveIncomeStatus({ ...VERIFIED_IV, status: 'FAILED' }, false, 'DENIED')).toBe('failed');
  });

  // CANCELED is also terminal but, like DENIED, keeps its real status.
  it('does not override income status for a CANCELED case (null stays not_started)', () => {
    expect(resolveIncomeStatus(null, false, 'CANCELED')).toBe('not_started');
  });

  it('honors the real income status for a CANCELED case', () => {
    expect(resolveIncomeStatus({ ...VERIFIED_IV, status: 'FAILED' }, false, 'CANCELED')).toBe('failed');
  });
});

describe('extractApplicantContact', () => {
  it('returns null/null when there are no determinations', () => {
    const result = extractApplicantContact(makeCase());
    expect(result).toEqual({ phone: null, email: null });
  });

  it('returns phone and email from the HEAD member determination person', () => {
    const household: EEHousehold = {
      id: 'hh-1',
      customerId: 'cust-1',
      members: [
        { id: 'm1', role: 'HEAD', relationshipToHead: null, startDate: '2026-01-01', person: { personId: 'p1' } },
      ],
    };
    const determinations: EEDetermination[] = [
      {
        id: 'd1',
        customerId: 'cust-1',
        caseId: TEST_CASE_ID,
        personId: null,
        coverageGroup: null,
        status: 'PENDING',
        category: 'MAGI',
        effectiveDate: null,
        expirationDate: null,
        denialReason: null,
        notes: null,
        determinedAt: null,
        determinedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        person: {
          personId: 'p1',
          policyId: 'pol-1',
          firstName: 'George',
          lastName: 'Washington',
          middleName: null,
          suffix: null,
          dateOfBirth: null,
          preferredLanguage: null,
          ssnLast4: null,
          addresses: [],
          phones: [{ value: '(515) 555-0660' }],
          emails: [{ value: 'g.washington@email.com' }],
        },
      },
    ];
    const result = extractApplicantContact(makeCase({ household, determinations }));
    expect(result).toEqual({ phone: '(515) 555-0660', email: 'g.washington@email.com' });
  });

  it('falls back to first non-HEAD member when no HEAD role is present', () => {
    const household: EEHousehold = {
      id: 'hh-1',
      customerId: 'cust-1',
      members: [
        { id: 'm1', role: 'SPOUSE', relationshipToHead: 'SPOUSE', startDate: '2026-01-01', person: { personId: 'p2' } },
      ],
    };
    const determinations: EEDetermination[] = [
      {
        id: 'd1',
        customerId: 'cust-1',
        caseId: TEST_CASE_ID,
        personId: null,
        coverageGroup: null,
        status: 'PENDING',
        category: 'MAGI',
        effectiveDate: null,
        expirationDate: null,
        denialReason: null,
        notes: null,
        determinedAt: null,
        determinedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        person: {
          personId: 'p2',
          policyId: 'pol-2',
          firstName: 'Martha',
          lastName: 'Washington',
          middleName: null,
          suffix: null,
          dateOfBirth: null,
          preferredLanguage: null,
          ssnLast4: null,
          addresses: [],
          phones: [{ value: '(515) 555-0661' }],
          emails: [],
        },
      },
    ];
    const result = extractApplicantContact(makeCase({ household, determinations }));
    expect(result).toEqual({ phone: '(515) 555-0661', email: null });
  });

  it('returns null/null when HEAD member has person: null', () => {
    const household: EEHousehold = {
      id: 'hh-1',
      customerId: 'cust-1',
      members: [{ id: 'm1', role: 'HEAD', relationshipToHead: null, startDate: '2026-01-01', person: null }],
    };
    const determinations: EEDetermination[] = [
      {
        id: 'd1',
        customerId: 'cust-1',
        caseId: TEST_CASE_ID,
        personId: null,
        coverageGroup: null,
        status: 'PENDING',
        category: 'MAGI',
        effectiveDate: null,
        expirationDate: null,
        denialReason: null,
        notes: null,
        determinedAt: null,
        determinedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        person: {
          personId: 'p1',
          policyId: 'pol-1',
          firstName: 'George',
          lastName: 'Washington',
          middleName: null,
          suffix: null,
          dateOfBirth: null,
          preferredLanguage: null,
          ssnLast4: null,
          addresses: [],
          phones: [{ value: '(515) 555-0662' }],
          emails: [],
        },
      },
    ];
    const result = extractApplicantContact(makeCase({ household, determinations }));
    expect(result).toEqual({ phone: null, email: null });
  });

  it('returns null/null when HEAD personId is not found in any determination', () => {
    const household: EEHousehold = {
      id: 'hh-1',
      customerId: 'cust-1',
      members: [
        {
          id: 'm1',
          role: 'HEAD',
          relationshipToHead: null,
          startDate: '2026-01-01',
          person: { personId: 'p-missing' },
        },
      ],
    };
    const determinations: EEDetermination[] = [
      {
        id: 'd1',
        customerId: 'cust-1',
        caseId: TEST_CASE_ID,
        personId: null,
        coverageGroup: null,
        status: 'PENDING',
        category: 'MAGI',
        effectiveDate: null,
        expirationDate: null,
        denialReason: null,
        notes: null,
        determinedAt: null,
        determinedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        person: {
          personId: 'p-other',
          policyId: 'pol-2',
          firstName: 'Martha',
          lastName: 'Washington',
          middleName: null,
          suffix: null,
          dateOfBirth: null,
          preferredLanguage: null,
          ssnLast4: null,
          addresses: [],
          phones: [{ value: '(515) 555-0663' }],
          emails: [],
        },
      },
    ];
    const result = extractApplicantContact(makeCase({ household, determinations }));
    expect(result).toEqual({ phone: null, email: null });
  });

  it('returns null/null when person has no phones or emails', () => {
    const household: EEHousehold = {
      id: 'hh-1',
      customerId: 'cust-1',
      members: [
        { id: 'm1', role: 'HEAD', relationshipToHead: null, startDate: '2026-01-01', person: { personId: 'p1' } },
      ],
    };
    const determinations: EEDetermination[] = [
      {
        id: 'd1',
        customerId: 'cust-1',
        caseId: TEST_CASE_ID,
        personId: null,
        coverageGroup: null,
        status: 'PENDING',
        category: 'MAGI',
        effectiveDate: null,
        expirationDate: null,
        denialReason: null,
        notes: null,
        determinedAt: null,
        determinedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        person: {
          personId: 'p1',
          policyId: 'pol-1',
          firstName: 'George',
          lastName: 'Washington',
          middleName: null,
          suffix: null,
          dateOfBirth: null,
          preferredLanguage: null,
          ssnLast4: null,
          addresses: [],
          phones: [],
          emails: [],
        },
      },
    ];
    const result = extractApplicantContact(makeCase({ household, determinations }));
    expect(result).toEqual({ phone: null, email: null });
  });
});

describe('buildRows — income source labeling (ENG-1874)', () => {
  it('labels the applicant unearned row as SSDI when receivingSSDI is true', () => {
    const eeCase = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true },
        householdMembers: [{ firstName: 'Robert', lastName: 'Mitchell', income: { otherIncome: 950 } }],
      },
    });
    const rows = buildRows(eeCase);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe(SSDI_SOURCE_LABEL);
    expect(rows[0].sub).toBe('Robert Mitchell');
    expect(rows[0].type).toBe('Unearned');
    expect(rows[0].amount).toBe(950);
  });

  it('labels the applicant unearned row as SSI when receivingSSI is true (and not SSDI)', () => {
    const eeCase = makeCase({
      intakeData: {
        applicant: { receivingSSI: true },
        householdMembers: [{ firstName: 'Maria', lastName: 'Santos', income: { otherIncome: 943 } }],
      },
    });
    const rows = buildRows(eeCase);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe(SSI_SOURCE_LABEL);
    expect(rows[0].sub).toBe('Maria Santos');
    expect(rows[0].type).toBe('Unearned');
    expect(rows[0].amount).toBe(943);
  });

  it('keeps the generic "Other income" label when receivingSSDI is not set', () => {
    const eeCase = makeCase({
      intakeData: {
        applicant: {},
        householdMembers: [{ firstName: 'Robert', lastName: 'Mitchell', income: { otherIncome: 950 } }],
      },
    });
    const rows = buildRows(eeCase);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('Other income');
    expect(rows[0].sub).toBe('Robert Mitchell');
  });

  it('does not relabel earned income rows', () => {
    const eeCase = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true },
        householdMembers: [
          { firstName: 'Robert', lastName: 'Mitchell', income: { employmentIncome: 1200, otherIncome: 950 } },
        ],
      },
    });
    const rows = buildRows(eeCase);
    expect(rows.find((r) => r.type === 'Earned')?.source).toBe('Wages — Employer');
    expect(rows.find((r) => r.type === 'Unearned')?.source).toBe(SSDI_SOURCE_LABEL);
  });
});

describe('executeIncomeVerificationFlow', () => {
  it('calls createUser then requestVerification when no existing verification', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { createArgyleUser: { errors: [] } } });
    const requestVerification = vi.fn().mockResolvedValue(undefined);
    const onDomainError = vi.fn();

    await executeIncomeVerificationFlow(TEST_CASE_ID, false, createUser, requestVerification, onDomainError);

    expect(createUser).toHaveBeenCalledWith({ variables: { input: { caseId: TEST_CASE_ID } } });
    expect(requestVerification).toHaveBeenCalledWith({ variables: { input: { caseId: TEST_CASE_ID } } });
    expect(onDomainError).not.toHaveBeenCalled();
  });

  it('skips createUser and calls requestVerification when verification already exists', async () => {
    const createUser = vi.fn();
    const requestVerification = vi.fn().mockResolvedValue(undefined);
    const onDomainError = vi.fn();

    await executeIncomeVerificationFlow(TEST_CASE_ID, true, createUser, requestVerification, onDomainError);

    expect(createUser).not.toHaveBeenCalled();
    expect(requestVerification).toHaveBeenCalledWith({ variables: { input: { caseId: TEST_CASE_ID } } });
    expect(onDomainError).not.toHaveBeenCalled();
  });

  it('calls onDomainError and aborts when createUser returns domain errors', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { createArgyleUser: { errors: [{ code: 'NOT_FOUND' }] } } });
    const requestVerification = vi.fn();
    const onDomainError = vi.fn();

    await executeIncomeVerificationFlow(TEST_CASE_ID, false, createUser, requestVerification, onDomainError);

    expect(onDomainError).toHaveBeenCalled();
    expect(requestVerification).not.toHaveBeenCalled();
  });

  it('calls onDomainError and aborts when createUser resolves with null data', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: null });
    const requestVerification = vi.fn();
    const onDomainError = vi.fn();

    await executeIncomeVerificationFlow(TEST_CASE_ID, false, createUser, requestVerification, onDomainError);

    expect(onDomainError).toHaveBeenCalled();
    expect(requestVerification).not.toHaveBeenCalled();
  });

  it('propagates rejection when requestVerification throws', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { createArgyleUser: { errors: [] } } });
    const requestVerification = vi.fn().mockRejectedValue(new Error('network'));
    const onDomainError = vi.fn();

    await expect(
      executeIncomeVerificationFlow(TEST_CASE_ID, false, createUser, requestVerification, onDomainError),
    ).rejects.toThrow('network');
    expect(onDomainError).not.toHaveBeenCalled();
  });

  it('propagates rejection when createUser throws', async () => {
    const createUser = vi.fn().mockRejectedValue(new Error('network'));
    const requestVerification = vi.fn();
    const onDomainError = vi.fn();

    await expect(
      executeIncomeVerificationFlow(TEST_CASE_ID, false, createUser, requestVerification, onDomainError),
    ).rejects.toThrow('network');
    expect(requestVerification).not.toHaveBeenCalled();
    expect(onDomainError).not.toHaveBeenCalled();
  });
});

const BASE_INTAKE_MEMBER = {
  firstName: 'Jane',
  lastName: 'Doe',
  relationship: 'self',
  income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 0 },
};

describe('buildRows — SSDI/SSI/other income labeling', () => {
  it('labels otherIncome as SSDI when primary applicant has receivingSSDI=true', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true, receivingSSI: false },
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 1_180 } },
        ],
      },
    });
    const rows = buildRows(c);
    const ssdiRow = rows.find((r) => r.source.includes('SSDI'));
    expect(ssdiRow).toBeDefined();
    expect(ssdiRow?.type).toBe('Unearned');
    expect(ssdiRow?.amount).toBe(1_180);
  });

  it('labels otherIncome as SSI when primary applicant has receivingSSI=true (and not SSDI)', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: false, receivingSSI: true },
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 943 } },
        ],
      },
    });
    const rows = buildRows(c);
    const ssiRow = rows.find((r) => r.source.includes('SSI'));
    expect(ssiRow).toBeDefined();
    expect(ssiRow?.type).toBe('Unearned');
    expect(ssiRow?.amount).toBe(943);
  });

  it('labels otherIncome as generic "Other income" when neither SSDI nor SSI flag is set', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: false, receivingSSI: false },
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 500 } },
        ],
      },
    });
    const rows = buildRows(c);
    expect(rows[0]).toMatchObject({ source: 'Other income', type: 'Unearned', amount: 500 });
  });

  it('emits an Earned row for employmentIncome > 0', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: false, receivingSSI: false },
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 2_000, selfEmploymentIncome: 0, otherIncome: 0 } },
        ],
      },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Wages — Employer', type: 'Earned', freq: 'Monthly', amount: 2_000 });
  });

  it('emits an Earned row for selfEmploymentIncome > 0', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: false, receivingSSI: false },
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 0, selfEmploymentIncome: 1_500, otherIncome: 0 } },
        ],
      },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Self-employment', type: 'Earned', freq: 'Monthly', amount: 1_500 });
  });

  it('falls back to monthlyHouseholdIncome combined row when no member income is reported', () => {
    const c = makeCase({
      intakeData: {
        applicant: {},
        monthlyHouseholdIncome: 3_200,
        householdMembers: [
          { ...BASE_INTAKE_MEMBER, income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 0 } },
        ],
      },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Household monthly income', type: 'Combined', amount: 3_200 });
  });

  it('falls back to zero combined row when intakeData has no members at all', () => {
    const c = makeCase({ intakeData: { applicant: {}, householdMembers: [] } });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Household monthly income', type: 'Combined', amount: 0 });
  });

  // ENG-2041: no fabricated benefit — a Non-MAGI/ABD $0-report case with no
  // SSDI determination yet (Robert Mitchell) shows the $0 combined row, NOT a
  // synthesized $950 SSA row (the old ENG-1947 stub is gone).
  it('shows the $0 combined row for a Non-MAGI $0-report case (no fabricated SSA row)', () => {
    const c = makeCase({
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0, householdMembers: [] },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Household monthly income', type: 'Combined', amount: 0 });
  });

  // The SSA-verified row still surfaces when an explicit per-case override
  // supplies a real federal-hub value (the future FDSH integration hook).
  it('emits a synthetic SSA-verified SSDI row only when ssaVerifiedSsdiMonthly is set', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true },
        ssaVerifiedSsdiMonthly: 1_200,
        monthlyHouseholdIncome: 0,
        householdMembers: [],
      },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: SSDI_SOURCE_LABEL,
      type: 'Unearned',
      freq: 'Monthly',
      amount: 1_200,
    });
  });

  // Negative guard — a MAGI $0 case keeps the $0 "Household monthly income"
  // combined row.
  it('keeps the $0 combined row for a MAGI $0-report case (no SSA-stub leak)', () => {
    const c = makeCase({
      intakeData: { applicant: {}, monthlyHouseholdIncome: 0, householdMembers: [] },
      determinations: [
        {
          id: 'd1',
          customerId: 'cust-1',
          caseId: TEST_CASE_ID,
          personId: null,
          coverageGroup: null,
          status: 'PENDING',
          category: 'MAGI',
          effectiveDate: null,
          expirationDate: null,
          denialReason: null,
          notes: null,
          determinedAt: null,
          determinedBy: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          person: null,
        },
      ],
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'Household monthly income', type: 'Combined', amount: 0 });
  });

  // Clobber guard at the buildRows layer — a Non-MAGI case reporting income via
  // the combined-total path shows its real figure, not the $950 stub.
  it('shows reported income (not $950) for a Non-MAGI case reporting via monthlyHouseholdIncome', () => {
    const c = makeCase({
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 943, householdMembers: [] },
    });
    const rows = buildRows(c);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(943);
    expect(rows[0].amount).not.toBe(950);
  });

  it('labels secondary member otherIncome as "Other income" even when applicant has receivingSSDI=true', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true, receivingSSI: false },
        householdMembers: [
          {
            ...BASE_INTAKE_MEMBER,
            relationship: 'self',
            income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 0 },
          },
          {
            firstName: 'John',
            lastName: 'Doe',
            relationship: 'spouse',
            income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 800 },
          },
        ],
      },
    });
    const rows = buildRows(c);
    const spouseRow = rows.find((r) => r.sub === 'John Doe');
    expect(spouseRow?.source).toBe('Other income');
  });

  it('treats first member as primary via idx===0 fallback when relationship field is absent', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true, receivingSSI: false },
        householdMembers: [
          {
            firstName: 'Jane',
            lastName: 'Doe',
            income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 1_180 },
          },
        ],
      },
    });
    const rows = buildRows(c);
    expect(rows[0].source).toContain('SSDI');
  });

  it('does not label member[1] as primary when member[0] has no income and member[1] lacks a relationship field', () => {
    const c = makeCase({
      intakeData: {
        applicant: { receivingSSDI: true, receivingSSI: false },
        householdMembers: [
          {
            firstName: 'Jane',
            lastName: 'Doe',
            // no income — member[0] pushes no rows; idx===0 still marks it as primary
            income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 0 },
          },
          {
            firstName: 'John',
            lastName: 'Doe',
            // no relationship field — fallback uses idx===1, so not primary
            income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 800 },
          },
        ],
      },
    });
    const rows = buildRows(c);
    const johnRow = rows.find((r) => r.sub === 'John Doe');
    expect(johnRow?.source).toBe('Other income');
  });
});
