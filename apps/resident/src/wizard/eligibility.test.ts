import { describe, it, expect } from 'vitest';
import { computeEligibility } from './eligibility';
import { PRIMARY_APPLICANT_ID, INITIAL_DETERMINATION_PENDING_NON_MAGI, INCOME_TYPE_SSDI } from './wizard-constants';

// Base household — all MAGI (Jasmine 34, Marcus 36, Aaliyah 8).
// Ages relative to 2026-05-26 (current session date).
const baseHousehold = () => ({
  primaryApplicant: { firstName: 'Jasmine', lastName: 'Washington', dob: '1991-08-04' },
  demographics: { disability: false, pregnant: false },
  householdMembers: [
    { id: 'm1', firstName: 'Marcus', lastName: 'Washington', dob: '1989-11-15', applying: true, hasDisability: false },
    { id: 'm2', firstName: 'Aaliyah', lastName: 'Washington', dob: '2017-09-22', applying: true, hasDisability: false },
  ],
  jobs: { '0': [{ monthlyIncome: 2000 }], m1: [{ monthlyIncome: 1040 }] },
  otherIncome: [] as { id: string; type: string; recipient: string; amount: string; frequency: string }[],
  nonMagiResources: {},
});

describe('computeEligibility — MAGI-only households', () => {
  it('returns qualifies for a MAGI household under 133% FPL with no nonMagi flag', () => {
    const data = baseHousehold();
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(false);
    expect(result.initialDetermination).not.toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    expect(result.outcomes.some((o) => o.qualifies)).toBe(true);
  });
});

describe('computeEligibility — Non-MAGI (ABD) triggers', () => {
  it('returns pending_non_magi and nonMagi=true when primary applicant is age 65+', () => {
    const data = baseHousehold();
    data.primaryApplicant.dob = '1950-01-01'; // 76 years old
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.initialDetermination).toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    const primaryOutcome = result.outcomes.find((o) => o.memberId === PRIMARY_APPLICANT_ID);
    expect(primaryOutcome?.qualifies).toBe(false);
  });

  it('returns pending_non_magi when demographics.disability is true (primary applicant)', () => {
    const data = baseHousehold();
    data.demographics.disability = true;
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.initialDetermination).toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    const primaryOutcome = result.outcomes.find((o) => o.memberId === PRIMARY_APPLICANT_ID);
    expect(primaryOutcome?.qualifies).toBe(false);
  });

  it('returns pending_non_magi when a household member has hasDisability=true', () => {
    const data = baseHousehold();
    data.householdMembers[0].hasDisability = true; // Marcus
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.initialDetermination).toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    const m1Outcome = result.outcomes.find((o) => o.memberId === 'm1');
    expect(m1Outcome?.qualifies).toBe(false);
  });

  it('returns pending_non_magi when primary applicant receives SSDI income (no disability flag set)', () => {
    const data = baseHousehold();
    data.otherIncome = [
      { id: 'o1', type: INCOME_TYPE_SSDI, recipient: PRIMARY_APPLICANT_ID, amount: '1200', frequency: 'monthly' },
    ];
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.initialDetermination).toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    const primaryOutcome = result.outcomes.find((o) => o.memberId === PRIMARY_APPLICANT_ID);
    expect(primaryOutcome?.qualifies).toBe(false);
  });

  it('still qualifies MAGI members on same application when only primary is ABD (mixed household)', () => {
    const data = baseHousehold();
    data.primaryApplicant.dob = '1950-01-01'; // primary is 65+
    // m2 (Aaliyah, 8) is a MAGI child — should still qualify on children's pathway
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.initialDetermination).toBe(INITIAL_DETERMINATION_PENDING_NON_MAGI);
    const m2Outcome = result.outcomes.find((o) => o.memberId === 'm2');
    expect(m2Outcome?.qualifies).toBe(true); // MAGI child still qualifies
  });
});

describe('computeEligibility — Non-MAGI return fields', () => {
  it('returns resourceLimit=2000 for a single ABD individual', () => {
    const data = baseHousehold();
    data.demographics.disability = true;
    const result = computeEligibility(data);
    expect(result.resourceLimit).toBe(2000);
    expect(result.resourceTestPasses).toBe(true); // always true for demo
  });

  it('returns totalCountableAssets=0 when nonMagiResources is empty', () => {
    const data = baseHousehold();
    data.demographics.disability = true;
    (data as any).nonMagiResources = {};
    const result = computeEligibility(data);
    expect(result.totalCountableAssets).toBe(0);
  });

  it('sums countable assets from nonMagiResources across has* keys', () => {
    const data = baseHousehold();
    data.demographics.disability = true; // primary is ABD
    (data as any).nonMagiResources = {
      '0': {
        hasChecking: true,
        checkingAmount: '5000',
        hasSavings: true,
        savingsAmount: '3000',
        hasCash: false,
        cashAmount: '',
        hasCdBonds: false,
        cdBondsAmount: '',
        hasRetirement: false,
        retirementAmount: '',
        hasOtherRealEstate: false,
        otherRealEstateValue: '',
        hasExtraVehicles: false,
        extraVehiclesValue: '',
        hasLifeInsurance: false,
        lifeInsuranceValue: '',
        hasBurialPlot: false,
        burialPlotValue: '',
        hasTrusts: false,
        trustsValue: '',
        hasTransfers60mo: false,
        transfers60moValue: '',
      },
    };
    const result = computeEligibility(data);
    expect(result.totalCountableAssets).toBe(8000);
  });

  it('returns resourceLimit=3000 when two or more ABD individuals are present', () => {
    const data = baseHousehold();
    data.primaryApplicant.dob = '1950-01-01'; // primary 65+
    data.householdMembers[0].dob = '1952-03-15'; // Marcus 65+
    const result = computeEligibility(data);
    expect(result.nonMagi).toBe(true);
    expect(result.resourceLimit).toBe(3000);
  });
});

// ENG-1906: the wizard's MAGI thresholds must agree with the rules-engine seed so
// the resident preview never disagrees with the caseworker/engine determination.
// Engine boundaries: Adult/Parent 138% (133% + 5% disregard), Children 167%,
// Pregnant 215%, Infant 205% — children/pregnant/infant qualify on income alone.
describe('computeEligibility — MAGI thresholds match the rules engine (ENG-1906)', () => {
  const FPL3 = 27320; // 100% FPL, HH of 3, 2026 (lookupFPL(3))
  // Build the base Jasmine HH-of-3 at a target FPL% by setting total monthly income.
  function householdAtPct(pct: number) {
    const d = baseHousehold();
    d.jobs = { '0': [{ monthlyIncome: Math.round(((pct / 100) * FPL3) / 12) }], m1: [] };
    d.otherIncome = [];
    return d;
  }
  const outcomeFor = (r: ReturnType<typeof computeEligibility>, id: string) =>
    r.outcomes.find((o) => o.memberId === id);

  it('canonical Scenario 1 (≈133.5% FPL): all three eligible — child on 167%, adults via the 5% disregard', () => {
    const r = computeEligibility(householdAtPct(133.5));
    expect(outcomeFor(r, PRIMARY_APPLICANT_ID)?.qualifies).toBe(true);
    expect(outcomeFor(r, 'm1')?.qualifies).toBe(true);
    expect(outcomeFor(r, 'm2')?.qualifies).toBe(true);
  });

  it('at 150% FPL: child qualifies (≤167%) while adults do not (>138%) — the consistent outcome the engine also produces (ENG-1906)', () => {
    const r = computeEligibility(householdAtPct(150));
    expect(outcomeFor(r, 'm2')?.qualifies).toBe(true);
    expect(outcomeFor(r, PRIMARY_APPLICANT_ID)?.qualifies).toBe(false);
    expect(outcomeFor(r, 'm1')?.qualifies).toBe(false);
  });

  it('child does NOT receive the 5% disregard: at 170% FPL the child is over the flat 167% standard', () => {
    const r = computeEligibility(householdAtPct(170));
    expect(outcomeFor(r, 'm2')?.qualifies).toBe(false);
    expect(outcomeFor(r, 'm2')?.withDisregard).toBe(false);
  });

  it('adult qualifies via the 5% disregard between 133% and 138% FPL', () => {
    const r = computeEligibility(householdAtPct(136));
    const adult = outcomeFor(r, PRIMARY_APPLICANT_ID);
    expect(adult?.qualifies).toBe(true);
    expect(adult?.withDisregard).toBe(true);
  });

  it('infant (age <1) qualifies up to 205% FPL but not above', () => {
    const under = householdAtPct(200);
    under.householdMembers[1].dob = '2026-01-01'; // m2 → infant
    expect(outcomeFor(computeEligibility(under), 'm2')?.qualifies).toBe(true);
    const over = householdAtPct(210);
    over.householdMembers[1].dob = '2026-01-01';
    expect(outcomeFor(computeEligibility(over), 'm2')?.qualifies).toBe(false);
  });

  it('pregnant applicant qualifies up to 215% FPL but not above (no disregard over-extension)', () => {
    const under = householdAtPct(210);
    under.demographics.pregnant = true;
    expect(outcomeFor(computeEligibility(under), PRIMARY_APPLICANT_ID)?.qualifies).toBe(true);
    const over = householdAtPct(220);
    over.demographics.pregnant = true;
    expect(outcomeFor(computeEligibility(over), PRIMARY_APPLICANT_ID)?.qualifies).toBe(false);
  });
});
