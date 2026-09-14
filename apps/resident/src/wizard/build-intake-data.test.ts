import { describe, it, expect } from 'vitest';
import { buildIntakeData } from './build-intake-data';
import {
  PRIMARY_APPLICANT_ID,
  INCOME_TYPE_SSI,
  INCOME_TYPE_SSDI,
  EMPLOYMENT_STATUS_EMPLOYED,
} from './wizard-constants';

// Mirror of SAMPLE_SEED in context.tsx — keep in sync if that fixture changes.
// Trimmed to fields the builder reads.
const sample = {
  household: { county: 'Polk', applicationFor: 'household', existingCase: false },
  primaryApplicant: {
    firstName: 'Jasmine',
    lastName: 'Washington',
    dob: '1991-08-04',
    state: 'IA',
    pregnant: false,
  },
  demographics: { disability: false, pregnant: false },
  citizenship: { '0': { status: 'us_citizen' } },
  taxFiling: { willFile: '', headOfHouseholdId: '0', filingJointlyWithId: '', taxDependentIds: [] },
  householdMembers: [
    {
      id: 'm1',
      firstName: 'Marcus',
      lastName: 'Washington',
      dob: '1989-11-15',
      relationship: 'spouse',
      applying: true,
      hasDisability: false,
    },
    {
      id: 'm2',
      firstName: 'Aaliyah',
      lastName: 'Washington',
      dob: '2017-09-22',
      relationship: 'child',
      applying: true,
      hasDisability: false,
    },
  ],
  jobs: {
    '0': [{ id: 'j1', payRate: '11.54', payFrequency: 'hourly', hoursPerWeek: '40', monthlyIncome: 2000 }],
    m1: [{ id: 'j2', payRate: '12.00', payFrequency: 'hourly', hoursPerWeek: '20', monthlyIncome: 1040 }],
  },
  otherIncome: [],
  healthInsurance: { '0': { hasInsurance: 'no', skipped: false } },
};

describe('buildIntakeData', () => {
  it('produces the required applicant block from the SAMPLE_SEED-shaped household', () => {
    const intake = buildIntakeData({ data: sample, applicantPersonId: 'person-uuid-jasmine' });

    expect(intake.applicant).toEqual(
      expect.objectContaining({
        dateOfBirth: '1991-08-04',
        householdSize: 3,
        annualIncome: 36480, // (2000 + 1040) * 12
        citizenshipStatus: 'us_citizen',
        isPregnant: false,
        isDisabled: false,
        receivingSSI: false,
        receivingSSDI: false,
        employmentStatus: EMPLOYMENT_STATUS_EMPLOYED,
        hasMedicare: false,
        stateOfResidence: 'IA',
      }),
    );
  });

  it('flags receivingSSDI when otherIncome contains an SSDI entry', () => {
    const withSsdi = {
      ...sample,
      otherIncome: [
        { id: 'o1', type: INCOME_TYPE_SSDI, recipient: PRIMARY_APPLICANT_ID, amount: '1180', frequency: 'monthly' },
      ],
    };
    const intake = buildIntakeData({ data: withSsdi, applicantPersonId: 'person-uuid-jasmine' });
    expect(intake.applicant).toEqual(expect.objectContaining({ receivingSSDI: true, receivingSSI: false }));
  });

  it('flags receivingSSI when otherIncome contains an SSI entry (and not SSDI)', () => {
    const withSsi = {
      ...sample,
      otherIncome: [
        { id: 'o1', type: INCOME_TYPE_SSI, recipient: PRIMARY_APPLICANT_ID, amount: '943', frequency: 'monthly' },
      ],
    };
    const intake = buildIntakeData({ data: withSsi, applicantPersonId: 'person-uuid-jasmine' });
    expect(intake.applicant).toEqual(expect.objectContaining({ receivingSSI: true, receivingSSDI: false }));
  });

  // The intake.applicant block represents the primary applicant only, so SSI/SSDI
  // entries owned by a household member must not set the primary's BRE flags.
  it('does not flag receivingSSDI/receivingSSI when only a household member has SS income', () => {
    const memberOnly = {
      ...sample,
      otherIncome: [
        { id: 'o1', type: INCOME_TYPE_SSDI, recipient: 'm1', amount: '1180', frequency: 'monthly' },
        { id: 'o2', type: INCOME_TYPE_SSI, recipient: 'm2', amount: '943', frequency: 'monthly' },
      ],
    };
    const intake = buildIntakeData({ data: memberOnly, applicantPersonId: 'person-uuid-jasmine' });
    expect(intake.applicant).toEqual(expect.objectContaining({ receivingSSDI: false, receivingSSI: false }));
  });

  it('emits caseworker-display extras matching the seed shape', () => {
    const intake = buildIntakeData({
      data: sample,
      applicantPersonId: 'person-uuid-jasmine',
      memberPersonIds: { m1: 'person-uuid-marcus', m2: 'person-uuid-aaliyah' },
    });

    expect(intake.applicantName).toBe('Jasmine Washington');
    expect(intake.householdSize).toBe(3);
    expect(intake.monthlyHouseholdIncome).toBe(3040);
    expect(intake.state).toBe('IA');
    expect(intake.county).toBe('Polk');
    expect(intake.requestedProgram).toBe('State-X Medicaid');

    const members = intake.householdMembers;
    expect(members).toHaveLength(3);
    expect(members[0]).toMatchObject({
      personId: 'person-uuid-jasmine',
      firstName: 'Jasmine',
      relationship: 'Self',
      income: { employmentIncome: 2000, totalMonthly: 2000 },
    });
    expect(members[1]).toMatchObject({
      personId: 'person-uuid-marcus',
      firstName: 'Marcus',
      relationship: 'Spouse',
      income: { employmentIncome: 1040, totalMonthly: 1040 },
    });
    expect(members[2]).toMatchObject({
      personId: 'person-uuid-aaliyah',
      firstName: 'Aaliyah',
      relationship: 'Child',
      income: { employmentIncome: 0, totalMonthly: 0 },
    });
  });

  // ENG-1865 follow-up: each applying member carries its OWN per-person BRE
  // attributes so the EE service evaluates members independently instead of
  // inheriting the primary applicant's citizenship/health flags.
  it('enriches each household member with its own per-member BRE attributes', () => {
    const mixed = {
      ...sample,
      // Primary is pregnant + a US citizen; the child is a non-citizen and not pregnant.
      primaryApplicant: { ...sample.primaryApplicant, pregnant: true },
      demographics: { disability: false, pregnant: true },
      citizenship: {
        '0': { status: 'us_citizen' },
        m2: { status: 'nonqualified_noncitizen' },
      },
      householdMembers: [
        { ...sample.householdMembers[0], hasDisability: true }, // Marcus: own disability
        { ...sample.householdMembers[1] }, // Aaliyah
      ],
      // SSI belongs to Marcus (m1) only — must not flag Aaliyah or the primary.
      otherIncome: [{ id: 'o1', type: INCOME_TYPE_SSI, recipient: 'm1', amount: '943', frequency: 'monthly' }],
      // Medicare belongs to Marcus (m1) only — must not flag Aaliyah or the primary.
      healthInsurance: {
        '0': { hasInsurance: 'no', skipped: false },
        m1: { hasInsurance: 'yes', insuranceType: 'Medicare Advantage', skipped: false },
      },
    };

    const intake = buildIntakeData({
      data: mixed,
      applicantPersonId: 'person-uuid-jasmine',
      memberPersonIds: { m1: 'person-uuid-marcus', m2: 'person-uuid-aaliyah' },
    });
    const members = intake.householdMembers;

    // Primary (index 0) reflects its OWN flags — Marcus's disability/SSI/Medicare
    // must NOT bleed onto the primary's display entry.
    expect(members[0]).toMatchObject({
      citizenshipStatus: 'us_citizen',
      isPregnant: true,
      isDisabled: false,
      receivingSSI: false,
      hasMedicare: false,
    });
    // Marcus carries his OWN disability + SSI + Medicare; pregnancy is false for non-primary.
    expect(members[1]).toMatchObject({
      citizenshipStatus: 'us_citizen',
      isPregnant: false,
      isDisabled: true,
      receivingSSI: true,
      hasMedicare: true,
    });
    // Aaliyah is a non-citizen and carries none of the primary's flags.
    expect(members[2]).toMatchObject({
      citizenshipStatus: 'nonqualified_noncitizen',
      isPregnant: false,
      isDisabled: false,
      receivingSSI: false,
      hasMedicare: false,
    });

    // ENG-1865 review: the `applicant` block feeds the PRIMARY's BRE determination,
    // so a disabled / Medicare-enrolled DEPENDENT (Marcus) must not flag the primary
    // — otherwise the primary could misroute to Non-MAGI/ABD.
    expect(intake.applicant).toMatchObject({ isDisabled: false, hasMedicare: false });
  });

  it('omits dateOfBirth from applicant block when dob is an empty string', () => {
    const noDob = {
      ...sample,
      primaryApplicant: { ...sample.primaryApplicant, dob: '' },
    };
    const intake = buildIntakeData({ data: noDob, applicantPersonId: 'person-uuid-jasmine' });
    // An empty dob must not be forwarded — the backend isoDateField regex rejects ''
    expect(intake.applicant.dateOfBirth).toBeUndefined();
  });

  it('forwards nonMagiResources per member when present', () => {
    const resources = { hasChecking: true, checkingAmount: '1500' };
    const withResources = {
      ...sample,
      nonMagiResources: { '0': resources, m1: null },
    };
    const intake = buildIntakeData({ data: withResources, applicantPersonId: 'person-uuid-jasmine' });

    const members = intake.householdMembers;
    expect(members[0].nonMagiResources).toEqual(resources);
    expect(members[1].nonMagiResources).toBeNull();
    expect(members[2].nonMagiResources).toBeNull();
  });

  // ENG-1912: the citizen-facing case number must be persisted into intakeData so the
  // caseworker portal can show the SAME identifier the citizen saw. The backend
  // medicaid-ee-service does not populate the `caseNumber` column for self-service
  // submissions, so displayMeta.caseNumber is the canonical, both-app-readable channel.
  describe('displayMeta.caseNumber (ENG-1912)', () => {
    it('emits an SX-YYYY-MMDD-NNNNN case number on displayMeta', () => {
      const intake = buildIntakeData({ data: sample, applicantPersonId: 'person-uuid-jasmine' });
      const dm = intake.displayMeta;
      expect(dm.caseNumber).toMatch(/^SX-\d{4}-\d{4}-\d{5}$/);
    });

    it('is stable across rebuilds for the same applicantPersonId + applicationDate', () => {
      const a = buildIntakeData({ data: sample, applicantPersonId: 'person-uuid-jasmine' });
      const b = buildIntakeData({ data: sample, applicantPersonId: 'person-uuid-jasmine' });
      expect(a.displayMeta.caseNumber).toBe(b.displayMeta.caseNumber);
    });

    // generateCaseNumber seeds on `applicantPersonId ?? primary.email ?? 'guest'`.
    // When no person id has been minted yet (e.g. submission before identity
    // resolution), the email keeps the number stable + well-formed.
    it('still emits a well-formed case number when seeding on the email fallback', () => {
      const withEmail = {
        ...sample,
        primaryApplicant: { ...sample.primaryApplicant, email: 'jasmine@example.com' },
      };
      const intake = buildIntakeData({ data: withEmail, applicantPersonId: null });
      const dm = intake.displayMeta;
      expect(dm.caseNumber).toMatch(/^SX-\d{4}-\d{4}-\d{5}$/);
    });
  });

  // ENG-1913: the SSN the citizen typed must reach the caseworker case view. The admin
  // reads intake.displayMeta.ssn (full, so SensitiveValue/maskSSN can derive the last 4).
  describe('displayMeta.ssn (ENG-1913)', () => {
    it('emits the formatted full SSN the citizen entered', () => {
      const withSsn = {
        ...sample,
        primaryApplicant: { ...sample.primaryApplicant, ssn: '123456789', noSSN: false },
      };
      const intake = buildIntakeData({ data: withSsn, applicantPersonId: 'person-uuid-jasmine' });
      expect(intake.displayMeta.ssn).toBe('123-45-6789');
    });

    it('omits displayMeta.ssn when the applicant declared no SSN', () => {
      const noSsn = {
        ...sample,
        primaryApplicant: { ...sample.primaryApplicant, ssn: '', noSSN: true },
      };
      const intake = buildIntakeData({ data: noSsn, applicantPersonId: 'person-uuid-jasmine' });
      expect(intake.displayMeta.ssn).toBeUndefined();
    });
  });

  it('falls back to unemployed + zero income for an empty form', () => {
    const empty = {
      primaryApplicant: { firstName: '', lastName: '', dob: '2000-01-01', state: 'IA' },
      householdMembers: [],
      jobs: { '0': [] },
      otherIncome: [],
      citizenship: { '0': { status: 'us_citizen' } },
      healthInsurance: {},
      demographics: {},
    };
    const intake = buildIntakeData({ data: empty });
    expect(intake.applicant).toEqual(
      expect.objectContaining({
        householdSize: 1,
        annualIncome: 0,
        employmentStatus: 'unemployed',
        citizenshipStatus: 'us_citizen',
      }),
    );
    expect(intake.monthlyHouseholdIncome).toBe(0);
    // No applicantPersonId and no email → generateCaseNumber seeds on 'guest'
    // but must still produce a well-formed SX-YYYY-MMDD-NNNNN identifier.
    expect(intake.displayMeta.caseNumber).toMatch(/^SX-\d{4}-\d{4}-\d{5}$/);
  });
});
