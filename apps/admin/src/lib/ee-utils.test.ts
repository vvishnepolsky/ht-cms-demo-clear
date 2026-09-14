import { describe, it, expect } from 'vitest';
import {
  abdLimitForHousehold,
  currency,
  deriveActionNeeded,
  formatAbdNote,
  readCitizenEnteredCountableResources,
  readMonthlyHouseholdIncome,
  readSsaVerifiedSsdiIncome,
} from './ee-utils';
import type { EECase, EEDetermination } from '../types/ee';
import { ACTION_REVIEW_INCOME, ACTION_REVIEW_DETERMINE, ACTION_REVIEW_DISABILITY } from '../types/ee';
import { DASH } from './utils';

// Minimal determination stub — only `category` matters for isNonMagiCase.
function det(category: 'MAGI' | 'NON_MAGI'): EEDetermination {
  return { category } as unknown as EEDetermination;
}

describe('abdLimitForHousehold', () => {
  it('returns 2000 for a single-person household', () => {
    expect(abdLimitForHousehold(1)).toBe(2_000);
  });

  it('returns 3000 for a two-person household', () => {
    expect(abdLimitForHousehold(2)).toBe(3_000);
  });

  it('returns 3000 for households larger than two', () => {
    expect(abdLimitForHousehold(5)).toBe(3_000);
  });
});

describe('formatAbdNote', () => {
  it('returns an over-limit message when countable total exceeds the limit', () => {
    expect(formatAbdNote(2_500, 2_000)).toBe(
      'Countable resources $2,500 exceed ABD limit of $2,000 — flagged for caseworker review.',
    );
  });

  it('returns a within-limit message when countable total is at the limit', () => {
    expect(formatAbdNote(2_000, 2_000)).toBe('Countable resources $2,000 — within ABD limit of $2,000.');
  });

  it('returns a within-limit message when countable total is under the limit', () => {
    expect(formatAbdNote(1_500, 2_000)).toBe('Countable resources $1,500 — within ABD limit of $2,000.');
  });

  it('formats large numbers with commas', () => {
    const note = formatAbdNote(1_234_567, 3_000);
    expect(note).toContain('$1,234,567');
  });
});

describe('readMonthlyHouseholdIncome', () => {
  it('returns the value when present and non-negative', () => {
    expect(readMonthlyHouseholdIncome({ intakeData: { monthlyHouseholdIncome: 950 } } as unknown as EECase)).toBe(950);
  });

  it('returns 0 when the field is absent', () => {
    expect(readMonthlyHouseholdIncome({ intakeData: {} } as unknown as EECase)).toBe(0);
  });

  it('returns 0 when intakeData is null', () => {
    expect(readMonthlyHouseholdIncome({ intakeData: null } as unknown as EECase)).toBe(0);
  });

  it('returns 0 for a non-numeric value', () => {
    expect(readMonthlyHouseholdIncome({ intakeData: { monthlyHouseholdIncome: '950' } } as unknown as EECase)).toBe(0);
  });

  it('returns 0 for a negative value', () => {
    expect(readMonthlyHouseholdIncome({ intakeData: { monthlyHouseholdIncome: -1 } } as unknown as EECase)).toBe(0);
  });
});

describe('readSsaVerifiedSsdiIncome', () => {
  // ENG-2039/2040/2041 — no fabricated benefit: an applicant with no SSDI
  // determination yet (Robert) reads $0; the old $950 ENG-1947 stub is gone.
  it('returns $0 for a Non-MAGI/ABD case that reported $0 (Robert — no SSDI determination yet)', () => {
    const eeCase = {
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(0);
  });

  it('returns $0 when the Non-MAGI route is set via a NON_MAGI determination and income is $0', () => {
    const eeCase = {
      intakeData: { monthlyHouseholdIncome: 0 },
      determinations: [det('NON_MAGI')],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(0);
  });

  // A Non-MAGI case reporting real income (Dorothy $943 / Miguel $1,180) keeps
  // its own figure.
  it('preserves reported income for a Non-MAGI case that reported > $0', () => {
    const eeCase = {
      intakeData: { monthlyHouseholdIncome: 1_180 },
      determinations: [det('NON_MAGI')],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(1_180);
  });

  it('returns 0 for a MAGI/other-route case that reported $0', () => {
    const eeCase = {
      intakeData: { applicant: {}, monthlyHouseholdIncome: 0 },
      determinations: [det('MAGI')],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(0);
  });

  it('returns the reported income for a MAGI case that reported > $0', () => {
    const eeCase = {
      intakeData: { monthlyHouseholdIncome: 2_600 },
      determinations: [det('MAGI')],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(2_600);
  });

  it('lets an explicit ssaVerifiedSsdiMonthly override win over reported income', () => {
    const eeCase = {
      intakeData: {
        ssaVerifiedSsdiMonthly: 1_200,
        monthlyHouseholdIncome: 0,
        applicant: { receivingSSDI: true },
      },
      determinations: [],
    } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(1_200);
  });

  it('returns 0 when intakeData is null', () => {
    const eeCase = { intakeData: null, determinations: [] } as unknown as EECase;
    expect(readSsaVerifiedSsdiIncome(eeCase)).toBe(0);
  });
});

describe('currency', () => {
  it('formats whole dollars with a leading $ and thousands separators', () => {
    expect(currency(1_420)).toBe('$1,420');
    expect(currency(0)).toBe('$0');
  });
});

describe('readCitizenEnteredCountableResources', () => {
  function caseOf(...members: Array<Record<string, unknown>>): EECase {
    return {
      intakeData: { householdMembers: members.map((nonMagiResources) => ({ nonMagiResources })) },
    } as unknown as EECase;
  }

  it('parses formatted currency strings, summing only flagged categories', () => {
    // hasSavings true → counts; hasCash false → cashAmount ignored even though present.
    const eeCase = caseOf({ hasSavings: true, savingsAmount: '$1,250.50', hasCash: false, cashAmount: '$999' });
    expect(readCitizenEnteredCountableResources(eeCase)).toBe(1_250.5);
  });

  it('excludes exempt categories (e.g. burial plot) from the total', () => {
    const eeCase = caseOf({
      hasSavings: true,
      savingsAmount: '$1,000',
      hasBurialPlot: true,
      burialPlotValue: '$5,000',
    });
    expect(readCitizenEnteredCountableResources(eeCase)).toBe(1_000);
  });

  it('totals additively across members and applies each member exemption independently', () => {
    const eeCase = caseOf(
      { hasChecking: true, checkingAmount: '$2,000', hasBurialPlot: true, burialPlotValue: '$4,000' },
      { hasRetirement: true, retirementAmount: '$3,500' },
    );
    expect(readCitizenEnteredCountableResources(eeCase)).toBe(5_500);
  });

  it('treats a non-string amount as 0 (only string-typed amounts are parsed)', () => {
    const eeCase = caseOf({ hasSavings: true, savingsAmount: 1_500 });
    expect(readCitizenEnteredCountableResources(eeCase)).toBe(0);
  });

  it('returns 0 when there are no household members or intakeData is null', () => {
    expect(readCitizenEnteredCountableResources({ intakeData: null } as unknown as EECase)).toBe(0);
    expect(readCitizenEnteredCountableResources({ intakeData: {} } as unknown as EECase)).toBe(0);
    expect(readCitizenEnteredCountableResources(caseOf())).toBe(0);
  });
});

describe('deriveActionNeeded (ENG-1994)', () => {
  // Robert Mitchell regression (live dev case cmpy1x05p00000zlca4sapcgc):
  // Non-MAGI ABD applicant — isDisabled, no SSI, determination DEFERRED/NON_MAGI.
  // His income is SSA-verified up front; the gating verification is DDS. The
  // old status-only switch said "Review income verification" while the case
  // sat in PENDING_VERIFICATION.
  const robertIntake = { applicant: { isDisabled: true, receivingSSI: false, receivingSSDI: false } };

  it('Non-MAGI disabled applicant pends on DDS in PENDING_VERIFICATION (Robert Mitchell regression)', () => {
    expect(deriveActionNeeded('PENDING_VERIFICATION', robertIntake, [det('NON_MAGI')])).toBe(ACTION_REVIEW_DISABILITY);
  });

  it('Non-MAGI disabled applicant pends on DDS in IN_REVIEW', () => {
    expect(deriveActionNeeded('IN_REVIEW', robertIntake, [det('NON_MAGI')])).toBe(ACTION_REVIEW_DISABILITY);
  });

  it('routes to DDS from determinations alone (NON_MAGI category, no intake flags)', () => {
    expect(deriveActionNeeded('IN_REVIEW', { applicant: {} }, [det('NON_MAGI')])).toBe(ACTION_REVIEW_DISABILITY);
    expect(deriveActionNeeded('PENDING_VERIFICATION', { applicant: {} }, [det('NON_MAGI')])).toBe(
      ACTION_REVIEW_DISABILITY,
    );
  });

  it('SSI recipient is categorically eligible — no DDS action (ENG-1874 rule)', () => {
    const ssiIntake = { applicant: { isDisabled: true, receivingSSI: true } };
    expect(deriveActionNeeded('IN_REVIEW', ssiIntake, [det('MAGI')])).toBe(ACTION_REVIEW_DETERMINE);
    expect(deriveActionNeeded('PENDING_VERIFICATION', ssiIntake, [det('MAGI')])).toBe(ACTION_REVIEW_INCOME);
    // Realistic shape: SSI recipients route to NON_MAGI — the SSI guard must
    // still win over the NON_MAGI determination category (guards against a
    // future re-ordering of the two conditions).
    expect(deriveActionNeeded('IN_REVIEW', ssiIntake, [det('NON_MAGI')])).toBe(ACTION_REVIEW_DETERMINE);
    expect(deriveActionNeeded('PENDING_VERIFICATION', ssiIntake, [det('NON_MAGI')])).toBe(ACTION_REVIEW_INCOME);
  });

  it('MAGI case in PENDING_VERIFICATION needs income verification', () => {
    expect(deriveActionNeeded('PENDING_VERIFICATION', { applicant: {} }, [det('MAGI')])).toBe(ACTION_REVIEW_INCOME);
  });

  it('MAGI case in IN_REVIEW needs caseworker determination', () => {
    expect(deriveActionNeeded('IN_REVIEW', { applicant: {} }, [det('MAGI')])).toBe(ACTION_REVIEW_DETERMINE);
  });

  it('terminal and other statuses return the em dash', () => {
    expect(deriveActionNeeded('APPROVED', robertIntake, [det('NON_MAGI')])).toBe(DASH);
    expect(deriveActionNeeded('DENIED', { applicant: {} }, [])).toBe(DASH);
    expect(deriveActionNeeded('CANCELED', { applicant: {} }, [])).toBe(DASH);
  });

  it('tolerates null intakeData and empty determinations', () => {
    expect(deriveActionNeeded('PENDING_VERIFICATION', null, [])).toBe(ACTION_REVIEW_INCOME);
    expect(deriveActionNeeded('IN_REVIEW', null, [])).toBe(ACTION_REVIEW_DETERMINE);
  });
});
