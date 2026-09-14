import { describe, it, expect } from 'vitest';
import { deriveCaseDetail, NO_COUNTABLE_RESOURCES_NOTE, FEDERAL_HUB_MATCH_SUB } from './derive-case-detail';
import type { EECase } from '../types/ee';

function makeCase(intakeData: Record<string, unknown> = {}, overrides: Partial<EECase> = {}): EECase {
  return {
    id: 'case-1',
    customerId: 'cust',
    householdId: 'hh-1',
    household: {
      id: 'hh-1',
      customerId: 'cust',
      members: [{ id: 'hm-1', role: 'HEAD', relationshipToHead: null, startDate: '2026-01-01', person: null }],
    },
    caseNumber: 'TEST-001',
    caseType: 'INITIAL',
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    notes: null,
    flagReason: null,
    intakeData,
    ruleEvaluations: null,
    rfiDetails: null,
    documentId: null,
    linkedCaseId: null,
    linkedCase: null,
    caseAssistNarrative: null,
    determinations: [],
    incomeVerification: null,
    assetVerification: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const BASE_MEMBER = {
  firstName: 'Jane',
  lastName: 'Doe',
  relationship: 'self',
  dateOfBirth: '1980-01-15',
  income: { employmentIncome: 0, otherIncome: 0, totalMonthly: 0 },
  nonMagiResources: null,
};

describe('deriveCaseDetail — income rows', () => {
  it('labels otherIncome as SSDI when applicant receivingSSDI is true', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: true, receivingSSI: false },
      householdMembers: [{ ...BASE_MEMBER, income: { employmentIncome: 0, otherIncome: 1_180, totalMonthly: 1_180 } }],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    const ssdiRow = result.income.rows.find((r) => r.source.includes('SSDI'));
    expect(ssdiRow).toBeDefined();
    expect(ssdiRow?.type).toBe('Unearned');
    expect(ssdiRow?.amount).toBe('$1,180');
    // drawer uses FEDERAL_HUB_MATCH_SUB; IncomeSources uses member name — intentional divergence
    expect(ssdiRow?.sub).toBe(FEDERAL_HUB_MATCH_SUB);
  });

  it('labels otherIncome as generic Other Income when no SSDI/SSI flag is set', () => {
    const c = makeCase({
      applicant: { isDisabled: false, receivingSSDI: false, receivingSSI: false },
      householdMembers: [{ ...BASE_MEMBER, income: { employmentIncome: 0, otherIncome: 500, totalMonthly: 500 } }],
      householdSize: 1,
    });
    const result = deriveCaseDetail(c);
    expect(result.income.rows[0]).toMatchObject({ type: 'Other Income', amount: '$500' });
  });

  it('labels otherIncome as SSI when applicant receivingSSI is true (and not SSDI)', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: false, receivingSSI: true },
      householdMembers: [{ ...BASE_MEMBER, income: { employmentIncome: 0, otherIncome: 943, totalMonthly: 943 } }],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    const ssiRow = result.income.rows.find((r) => r.source.includes('SSI'));
    expect(ssiRow).toBeDefined();
    expect(ssiRow?.type).toBe('Unearned');
    expect(ssiRow?.amount).toBe('$943');
    // drawer uses FEDERAL_HUB_MATCH_SUB; IncomeSources uses member name — intentional divergence
    expect(ssiRow?.sub).toBe(FEDERAL_HUB_MATCH_SUB);
  });
});

describe('deriveCaseDetail — case number (ENG-1912)', () => {
  it('prefers the citizen-persisted displayMeta.caseNumber for the application id', () => {
    const c = makeCase(
      { displayMeta: { caseNumber: 'SX-2026-0601-93837' } },
      // Resident self-service cases land with a null caseNumber column; the
      // canonical identifier lives in intakeData.displayMeta.caseNumber.
      { caseNumber: null, id: 'clr7qd2hfjs0001' },
    );
    expect(deriveCaseDetail(c).signature.applicationId).toBe('SX-2026-0601-93837');
  });

  it('falls back to the caseNumber column, then the case-id tail, when displayMeta is absent', () => {
    expect(deriveCaseDetail(makeCase({}, { caseNumber: 'SX-2026-0601-00001' })).signature.applicationId).toBe(
      'SX-2026-0601-00001',
    );
    // No displayMeta and no caseNumber column → last 8 of the case id, uppercased
    // (the same identifier the CaseHeader / sidebar show, via caseDisplayNumber).
    expect(deriveCaseDetail(makeCase({}, { caseNumber: null, id: 'clr7qd2hfjs' })).signature.applicationId).toBe(
      '7QD2HFJS',
    );
  });
});

describe('deriveCaseDetail — SSN (ENG-1913)', () => {
  it('shows the citizen-entered SSN from displayMeta over the federated person record', () => {
    const c = makeCase({ displayMeta: { ssn: '123-45-6789' } });
    expect(deriveCaseDetail(c).identity.ssn).toBe('123-45-6789');
  });

  it('falls back to the person record ssnLast4 when no citizen SSN is on the intake', () => {
    const c = makeCase(
      {},
      {
        determinations: [
          {
            id: 'd1',
            customerId: 'cust',
            caseId: 'case-1',
            status: 'PENDING',
            category: 'MAGI',
            personId: 'p1',
            coverageGroup: null,
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
              policyId: 'policy-1',
              firstName: 'Jane',
              lastName: 'Doe',
              middleName: null,
              suffix: null,
              dateOfBirth: '1980-01-15',
              preferredLanguage: null,
              ssnLast4: '6789',
              addresses: [],
              emails: [],
              phones: [],
            },
          },
        ],
        household: {
          id: 'hh-1',
          customerId: 'cust',
          members: [
            { id: 'hm-1', role: 'HEAD', relationshipToHead: null, startDate: '2026-01-01', person: { personId: 'p1' } },
          ],
        },
      },
    );
    expect(deriveCaseDetail(c).identity.ssn).toBe('6789');
  });

  it('shows a dash when neither a citizen SSN nor a person record is available', () => {
    expect(deriveCaseDetail(makeCase({})).identity.ssn).toBe('—');
  });
});

describe('deriveCaseDetail — assets (Non-MAGI)', () => {
  it('returns assets: null for a MAGI case (isDisabled=false, no SSDI/SSI)', () => {
    const c = makeCase({
      applicant: { isDisabled: false, receivingSSDI: false, receivingSSI: false },
      householdMembers: [BASE_MEMBER],
      householdSize: 1,
    });

    expect(deriveCaseDetail(c).assets).toBeNull();
  });

  it('produces NO_COUNTABLE_RESOURCES_NOTE when isNonMagi and no resources are declared', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: false, receivingSSI: false },
      householdMembers: [{ ...BASE_MEMBER, nonMagiResources: null }],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets).not.toBeNull();
    expect(result.assets?.rows).toHaveLength(0);
    expect(result.assets?.note).toBe(NO_COUNTABLE_RESOURCES_NOTE);
  });

  it('flags countable resources over the ABD limit for a single-person household', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: false, receivingSSI: false },
      householdMembers: [
        {
          ...BASE_MEMBER,
          nonMagiResources: {
            hasChecking: true,
            checkingAmount: '2500', // > $2,000 limit for 1-person
          },
        },
      ],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets?.note).toMatch(/exceed ABD limit/);
    expect(result.assets?.note).toMatch(/\$2,000/);
  });

  it('reports within-limit when countable resources are under the ABD limit', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: true, receivingSSI: false },
      householdMembers: [
        {
          ...BASE_MEMBER,
          nonMagiResources: {
            hasChecking: true,
            checkingAmount: '1500', // < $2,000 limit
          },
        },
      ],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets?.note).toMatch(/within ABD limit/);
  });

  it('includes exempt assets in rows but does not count them toward the ABD limit', () => {
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: false, receivingSSI: false },
      householdMembers: [
        {
          ...BASE_MEMBER,
          nonMagiResources: {
            hasBurialPlot: true,
            burialPlotValue: '1500',
          },
        },
      ],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    const burialRow = result.assets?.rows.find((r) => r.asset === 'Burial plot / pre-need');
    expect(burialRow).toBeDefined();
    expect(burialRow?.countable).toBe('Exempt');
    expect(result.assets?.note).toMatch(/within ABD limit/);
  });

  it('applies the $3,000 ABD limit for a 2-person household', () => {
    const SECOND_MEMBER = {
      firstName: 'John',
      lastName: 'Doe',
      relationship: 'spouse',
      dateOfBirth: '1978-06-20',
      income: { employmentIncome: 0, otherIncome: 0, totalMonthly: 0 },
      nonMagiResources: {
        hasChecking: true,
        checkingAmount: '2500', // over $2k but under $3k — within limit for 2-person
      },
    };
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: false, receivingSSI: false },
      householdMembers: [BASE_MEMBER, SECOND_MEMBER],
      householdSize: 2,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets?.note).toMatch(/within ABD limit/);
    expect(result.assets?.note).toMatch(/\$3,000/);
  });

  it('shows assets section when receivingSSDI=true is the sole isNonMagi trigger (isDisabled=false)', () => {
    const c = makeCase({
      applicant: { isDisabled: false, receivingSSDI: true, receivingSSI: false },
      householdMembers: [
        {
          ...BASE_MEMBER,
          nonMagiResources: { hasChecking: true, checkingAmount: '1200' },
        },
      ],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets).not.toBeNull();
    expect(result.assets?.note).toMatch(/within ABD limit/);
  });

  it('shows assets section when receivingSSI=true is the sole isNonMagi trigger (isDisabled=false)', () => {
    const c = makeCase({
      applicant: { isDisabled: false, receivingSSDI: false, receivingSSI: true },
      householdMembers: [
        {
          ...BASE_MEMBER,
          nonMagiResources: { hasChecking: true, checkingAmount: '1200' },
        },
      ],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    expect(result.assets).not.toBeNull();
    expect(result.assets?.note).toMatch(/within ABD limit/);
  });

  it('treats first member as primary via idx===0 fallback when relationship field is absent', () => {
    const memberNoRelationship = {
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1980-01-15',
      income: { employmentIncome: 0, otherIncome: 1_180, totalMonthly: 1_180 },
      nonMagiResources: null,
    };
    const c = makeCase({
      applicant: { isDisabled: true, receivingSSDI: true, receivingSSI: false },
      householdMembers: [memberNoRelationship],
      householdSize: 1,
    });

    const result = deriveCaseDetail(c);
    const ssdiRow = result.income.rows.find((r) => r.source.includes('SSDI'));
    expect(ssdiRow).toBeDefined();
  });

  it('shows assets section when determinations include NON_MAGI category even if all intake flags are false', () => {
    const c = makeCase(
      {
        applicant: { isDisabled: false, receivingSSDI: false, receivingSSI: false },
        householdMembers: [{ ...BASE_MEMBER, nonMagiResources: null }],
        householdSize: 1,
      },
      {
        determinations: [
          {
            id: 'd1',
            customerId: 'cust',
            caseId: 'case-1',
            status: 'PENDING',
            category: 'NON_MAGI',
            personId: null,
            coverageGroup: null,
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
      },
    );

    const result = deriveCaseDetail(c);
    expect(result.assets).not.toBeNull();
    expect(result.assets?.note).toBe(NO_COUNTABLE_RESOURCES_NOTE);
  });
});
