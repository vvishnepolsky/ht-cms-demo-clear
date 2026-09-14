// @ts-nocheck
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef,
  useLayoutEffect,
  Fragment,
  createContext,
} from 'react';
import { PRIMARY_APPLICANT_ID, INCOME_TYPE_SSDI, INITIAL_DETERMINATION_PENDING_NON_MAGI } from './wizard-constants';

/* =========================================================================
   MAGI eligibility calculation
   Implements the 5% FPL income disregard per 42 CFR §435.603(d)(4)
   ========================================================================= */

// 2026 Federal Poverty Level (annual, 48 contiguous states + DC).
const FPL_2026 = {
  1: 15650,
  2: 21150,
  3: 27320,
  4: 33490,
  5: 39660,
  6: 45830,
  perAdditional: 6170,
};

function lookupFPL(size) {
  if (size <= 6) return FPL_2026[size];
  return FPL_2026[6] + (size - 6) * FPL_2026.perAdditional;
}

// State-X Medicaid pathway thresholds (% of FPL) — internal labels stay
// technical, but display names below are resident-friendly.
//
// ENG-1906: these MUST agree with the rules-engine seed
// (services/rules-engine/prisma/seed-data/cms-medicaid-rules.ts) and the admin
// MAGI_COVERAGE_THRESHOLD_PCT map, or the resident preview disagrees with the
// caseworker/engine determination. Adult & Parent sit at 133% + 5% FPL disregard
// (effective 138%) — `disregard: true`. Children (167%), Pregnant (215%), and
// Infant (205%) have SEPARATE, HIGHER standards and qualify on income alone
// (`disregard: false`) per the CMS Demonstration Storyboards. eligibility.test.ts
// pins wizard ↔ engine parity.
const PATHWAYS = {
  INFANT: { name: 'Infant Medicaid', pct: 205, group: 'infant', disregard: false },
  CHILDRENS_MAGI: { name: "Children's Medicaid", pct: 167, group: 'child', disregard: false },
  PREGNANT: { name: 'Pregnant women and infants', pct: 215, group: 'pregnant', disregard: false },
  PARENT_CARETAKER: { name: 'Parent or caretaker Medicaid', pct: 133, group: 'parent', disregard: true },
  ADULT_GROUP: { name: 'Adult Medicaid', pct: 133, group: 'adult', disregard: true },
};

// Convert a payment amount + frequency string to a monthly equivalent.
function toMonthly(amount, frequency) {
  const a = Number(amount || 0);
  if (!a) return 0;
  switch (frequency) {
    case 'weekly':
      return (a * 52) / 12;
    case 'biweekly':
      return (a * 26) / 12;
    case 'semimonthly':
      return a * 2;
    case 'monthly':
      return a;
    case 'quarterly':
      return a / 3;
    case 'annually':
      return a / 12;
    case 'one_time':
      return a / 12;
    default:
      return a;
  }
}

// Determine age in years from an ISO date string (YYYY-MM-DD).
function ageFrom(dob, asOf = new Date()) {
  if (!dob) return null;
  // ENG-1989: parse date-only strings at local noon — a bare YYYY-MM-DD parses
  // as UTC midnight, which reads as the previous day in timezones behind UTC
  // and makes ages off by one on/near the birthday.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date(dob);
  if (isNaN(d)) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age--;
  return age;
}

// Returns true for applying adults who require income verification (age 16+
// or unknown age). Used by StepIncomeMethodPicker, StepJobInfoV2, and the
// step-10 validate function to keep the threshold in one place.
function isApplyingAdult(person) {
  const age = ageFrom(person.dob);
  return age === null || age >= 16;
}

// ─────────────────────────────────────────────────────────────────────────
// Main eligibility computation
// ─────────────────────────────────────────────────────────────────────────
function computeEligibility(form) {
  // 1. Sum monthly employment income across all members
  const allJobs = Object.values(form.jobs || {}).flat();
  const totalMonthlyEmployment = allJobs.reduce((s, j) => s + Number(j.monthlyIncome || 0), 0);

  // 2. Sum other income normalized to monthly
  const totalMonthlyOther = (form.otherIncome || []).reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);

  // 3. Annualize
  const annualIncome = Math.round((totalMonthlyEmployment + totalMonthlyOther) * 12);

  // 4. Determine household size for MAGI
  let householdSize = 1 + (form.householdMembers?.length || 0);
  if (form.demographics?.pregnant && form.demographics.expectedBabies > 1) {
    householdSize += form.demographics.expectedBabies - 1;
  }
  (form.householdMembers || []).forEach((m) => {
    if (m.pregnant && m.expectedBabies > 1) {
      householdSize += m.expectedBabies - 1;
    }
  });

  // 5. 100% FPL for size and FPL percent
  const fpl100 = lookupFPL(householdSize);
  const fplPercent = (annualIncome / fpl100) * 100;

  // Build the candidate list — primary applicant is PRIMARY_APPLICANT_ID.
  const primaryAge = ageFrom(form.primaryApplicant?.dob);
  const memberReceivesSSDI = (memberId) =>
    (form.otherIncome || []).some(
      (e) => (e?.type ?? e?.kind ?? '').toLowerCase() === INCOME_TYPE_SSDI && e?.recipient === memberId,
    );
  const candidates = [
    {
      id: PRIMARY_APPLICANT_ID,
      name:
        [form.primaryApplicant?.firstName, form.primaryApplicant?.lastName].filter(Boolean).join(' ') ||
        'Primary applicant',
      age: primaryAge,
      pregnant: !!form.demographics?.pregnant,
      isDisabled: !!form.demographics?.disability,
      receivesSSDI: memberReceivesSSDI(PRIMARY_APPLICANT_ID),
      applying: true,
      relationship: 'self',
    },
    ...(form.householdMembers || [])
      .filter((m) => m.applying)
      .map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ') || 'Household member',
        age: ageFrom(m.dob),
        pregnant: !!m.pregnant,
        isDisabled: !!m.hasDisability,
        receivesSSDI: memberReceivesSSDI(m.id),
        applying: true,
        relationship: m.relationship,
      })),
  ];

  // Are there any children under 19 in the household? (Affects parent pathway.)
  const hasChildInHousehold = (form.householdMembers || []).some((m) => {
    const a = ageFrom(m.dob);
    return a !== null && a < 19;
  });

  // Determine, in order, which pathway each applying member should be tried on.
  function pathwaysFor(c) {
    // SSDI recipients and self-reported disabled members route to Non-MAGI (ABD pathway)
    // regardless of age (ENG-1698, ENG-1684). MAGI income tests don't apply —
    // eligibility is income + resource + disability determined by the caseworker
    // per 42 CFR §435.601.
    if (c.receivesSSDI || c.isDisabled) {
      return [{ name: 'Caseworker review needed', pct: 0, group: 'non_magi' }];
    }
    const list = [];
    if (c.pregnant) list.push(PATHWAYS.PREGNANT);
    // Infants (<1) get the higher infant standard; children 1–18 the children's
    // standard — mutually exclusive, matching the engine's age-split rules
    // (CMS-MAGI-002 age<1, CMS-MAGI-003 age 1–18).
    if (c.age !== null && c.age < 1) list.push(PATHWAYS.INFANT);
    else if (c.age !== null && c.age >= 1 && c.age < 19) list.push(PATHWAYS.CHILDRENS_MAGI);
    if (c.age !== null && c.age >= 19 && c.age < 65) {
      // Parent/caretaker is more generous than Adult Group only when
      // there is a child in the household.
      if (hasChildInHousehold && (c.relationship === 'self' || c.relationship === 'spouse')) {
        list.push(PATHWAYS.PARENT_CARETAKER);
      }
      list.push(PATHWAYS.ADULT_GROUP);
    }
    if (c.age !== null && c.age >= 65) {
      // Non-MAGI route — out of scope for this online flow.
      list.push({ name: 'Caseworker review needed', pct: 0, group: 'non_magi' });
    }
    return list.length ? list : [PATHWAYS.ADULT_GROUP];
  }

  // Apply each candidate against their pathways.
  // For each: try strictly under threshold first, then with 5% disregard.
  let disregardApplied = false;
  const disregardAmount = fpl100 * 0.05;
  const countableIncome = Math.max(0, annualIncome - disregardAmount);
  const countableFplPercent = (countableIncome / fpl100) * 100;

  const outcomes = candidates.map((c) => {
    const tries = pathwaysFor(c);
    let chosen = null;
    let qualifies = false;
    let withDisregard = false;

    for (const p of tries) {
      if (p.pct === 0) {
        // non-MAGI marker
        chosen = p;
        qualifies = false;
        break;
      }
      if (fplPercent < p.pct) {
        chosen = p;
        qualifies = true;
        break;
      }
      // The 5% FPL disregard applies ONLY to groups configured for it (adult,
      // parent) — children/pregnant/infant have separate higher standards and
      // qualify on income alone (ENG-1906). Applying the disregard to every group
      // would push their effective ceilings 5pp above the engine's and re-create
      // the wizard↔engine divergence.
      if (p.disregard && countableFplPercent < p.pct) {
        chosen = p;
        qualifies = true;
        withDisregard = true;
        disregardApplied = true;
        break;
      }
    }
    if (!chosen) chosen = tries[tries.length - 1];
    return {
      memberId: c.id,
      memberName: c.name,
      age: c.age,
      pathway: chosen.name,
      pathwayPct: chosen.pct,
      qualifies,
      withDisregard,
    };
  });

  const allQualify = outcomes.every((o) => o.qualifies);
  const someQualify = outcomes.some((o) => o.qualifies);

  // Non-MAGI (ABD) detection — any outcome with pct=0 and qualifies=false is an ABD referral.
  const hasNonMagiOutcome = outcomes.some((o) => o.pathwayPct === 0 && !o.qualifies);

  // Resource limit: $2,000 individual, $3,000 couple/household (42 CFR §435.601).
  const abdCount = outcomes.filter((o) => o.pathwayPct === 0 && !o.qualifies).length;
  const resourceLimit = abdCount >= 2 ? 3000 : 2000;

  // Sum countable assets from ENG-1744 nonMagiResources disclosures (per-person).
  // Only sums resource types where the corresponding has* flag is explicitly true.
  const COUNTABLE_ASSET_MAP = [
    ['hasChecking', 'checkingAmount'],
    ['hasSavings', 'savingsAmount'],
    ['hasCash', 'cashAmount'],
    ['hasCdBonds', 'cdBondsAmount'],
    ['hasRetirement', 'retirementAmount'],
    ['hasOtherRealEstate', 'otherRealEstateValue'],
    ['hasExtraVehicles', 'extraVehiclesValue'],
    ['hasLifeInsurance', 'lifeInsuranceValue'],
    ['hasBurialPlot', 'burialPlotValue'],
    ['hasTrusts', 'trustsValue'],
    ['hasTransfers60mo', 'transfers60moValue'],
  ];
  const totalCountableAssets = Object.values(form.nonMagiResources || {}).reduce(
    (total, personRes) =>
      total +
      COUNTABLE_ASSET_MAP.reduce(
        (s, [hasKey, amtKey]) => (personRes?.[hasKey] === true ? s + Number(personRes?.[amtKey] || 0) : s),
        0,
      ),
    0,
  );
  const resourceTestPasses = true; // Always true for demo — caseworker verifies

  let initialDetermination;
  if (hasNonMagiOutcome) {
    // One or more members are pending ABD pathway — determination is always pending
    // regardless of whether other MAGI members on the same application qualify.
    initialDetermination = INITIAL_DETERMINATION_PENDING_NON_MAGI;
  } else if (allQualify && !disregardApplied) {
    initialDetermination = 'qualifies';
  } else if (allQualify && disregardApplied) {
    initialDetermination = 'exceeds_within_5pct';
  } else if (someQualify) {
    initialDetermination = 'partial';
  } else {
    initialDetermination = 'exceeds';
  }

  return {
    annualIncome,
    monthlyIncome: Math.round(totalMonthlyEmployment + totalMonthlyOther),
    householdSize,
    fpl100,
    fplPercent: Math.round(fplPercent * 10) / 10,
    applicableThreshold: outcomes[0]?.pathwayPct ?? 133,
    initialDetermination,
    disregardApplied,
    disregardAmount: Math.round(disregardAmount),
    countableIncome,
    countableFplPercent: Math.round(countableFplPercent * 10) / 10,
    outcomes,
    mco: 'State Total Care', // For prototype; can switch within 90 days
    // Non-MAGI (ABD) fields — only meaningful when nonMagi is true
    nonMagi: hasNonMagiOutcome,
    totalCountableAssets: Math.round(totalCountableAssets),
    resourceLimit,
    resourceTestPasses,
  };
}

// Helpers exported for use in screens.
Object.assign(window, {
  computeEligibility,
  lookupFPL,
  toMonthly,
  ageFrom,
  isApplyingAdult,
  FPL_2026,
  PATHWAYS,
});

export { computeEligibility, FPL_2026, PATHWAYS, lookupFPL, ageFrom, toMonthly, isApplyingAdult };
