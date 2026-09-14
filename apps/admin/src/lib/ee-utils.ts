import type { EECase, EECaseStatus, EEDetermination } from '../types/ee';
import { ACTION_REVIEW_INCOME, ACTION_REVIEW_DETERMINE, ACTION_REVIEW_DISABILITY } from '../types/ee';
import { DASH } from './utils';

// Canonical SSDI/SSI income-source labels, shared by the drawer (derive-case-detail)
// and the per-member income view (IncomeSources) so the same benefit reads identically
// across surfaces.
export const SSDI_SOURCE_LABEL = 'SSDI (Social Security Disability Insurance)' as const;
export const SSI_SOURCE_LABEL = 'SSI (Supplemental Security Income)' as const;

/**
 * Monthly household income for a case, read from the canonical
 * `intakeData.monthlyHouseholdIncome` field.
 *
 * Returns 0 when the field is absent — we do NOT fabricate a placeholder income.
 * The Non-MAGI panels previously defaulted to $950, an arbitrary storyboard value
 * (ENG-1754) that is not a legal or program threshold; showing it for cases that
 * never reported income was misleading. All income-reading panels share this
 * selector so the figure is identical across Verify and Evaluate (matches the
 * 0-default already used by IncomeSources).
 */
export function readMonthlyHouseholdIncome(eeCase: EECase): number {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const v = intake.monthlyHouseholdIncome;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** USD whole-dollar formatter shared by the EE panels (e.g. "$1,420"). */
export function currency(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export function isNonMagiCase(
  intakeApplicant: Record<string, unknown>,
  // Widened to the category-only shape so list-summary determinations
  // (DashboardPage Pathway column, ENG-1994 action derivation) and full
  // EEDetermination rows share one classifier — the dashboard previously had
  // its own determinations-only derivation that mislabeled intake-flagged
  // Non-MAGI cases as MAGI when the BRE hadn't produced determinations yet.
  determinations: ReadonlyArray<Pick<EEDetermination, 'category'>>,
): boolean {
  return (
    intakeApplicant.isDisabled === true ||
    intakeApplicant.receivingSSDI === true ||
    intakeApplicant.receivingSSI === true ||
    determinations.some((d) => d.category === 'NON_MAGI')
  );
}

/**
 * Caseworker "Action Needed" summary, derived from the case's actual state
 * (ENG-1994). Used as the fallback when intakeData.displayMeta.actionNeeded
 * is absent — live wizard submissions store no displayMeta.actionNeeded, so
 * every list row and workspace ActionBar for a live case reads from here.
 * Stored displayMeta (curated seeded cases) still wins at the call sites.
 *
 * Shared by DashboardPage (case list "Action Needed" column) and
 * WorkspacePage (bottom ActionBar summary) so the two surfaces agree.
 *
 * Decision order:
 * 1. Non-MAGI ABD path without SSI → the gating verification is the DDS
 *    disability confirmation, in BOTH PENDING_VERIFICATION and IN_REVIEW —
 *    financial sources are SSA-verified up front (the Robert Mitchell case:
 *    income already SSA-verified, BRE defers to DDS). SSI recipients are
 *    categorically eligible (ENG-1874), so they skip this branch.
 * 2. PENDING_VERIFICATION → income verification is what's actually pending
 *    for MAGI cases (Argyle / IRS wage match).
 * 3. IN_REVIEW → caseworker determination.
 * 4. Terminal / other → em dash (no action).
 */
export function deriveActionNeeded(
  status: EECaseStatus,
  intakeData: Record<string, unknown> | null,
  determinations: ReadonlyArray<Pick<EEDetermination, 'category'>>,
): string {
  if (status !== 'PENDING_VERIFICATION' && status !== 'IN_REVIEW') return DASH;
  const applicant = (intakeData?.applicant ?? {}) as Record<string, unknown>;
  if (isNonMagiCase(applicant, determinations) && applicant.receivingSSI !== true) {
    return ACTION_REVIEW_DISABILITY;
  }
  return status === 'PENDING_VERIFICATION' ? ACTION_REVIEW_INCOME : ACTION_REVIEW_DETERMINE;
}

// ⚠️ PLACEHOLDER (ENG-1947): there is no live SSA Federal Data Services Hub (FDSH)
// integration here. REPLACE the override path below with the actual SSA integration
// (real FDSH lookup of the applicant's verified Title II / SSDI benefit) when that
// service is available. Tracked as follow-up work.
/**
 * SSA-verified SSDI monthly benefit — the federal-hub value, independent of the
 * applicant's citizen-entered income.
 *
 * No benefit is fabricated (ENG-2039/2040/2041): an applicant whose SSDI
 * determination hasn't come through yet (Robert Mitchell — Non-MAGI route, $0
 * reported) reads $0 on every surface. The previous $950 demo stub
 * (SSA_VERIFIED_SSDI_DEFAULT, ENG-1947) is gone.
 *
 * Resolution order:
 *   1. intakeData.ssaVerifiedSsdiMonthly (explicit per-case override — the hook
 *      for a future real FDSH value), else
 *   2. readMonthlyHouseholdIncome (preserves income-reporting cases — Dorothy
 *      $943, Miguel $1,180, Margaret $967, Gloria $914 — and yields $0 for a
 *      genuine $0 report).
 */
export function readSsaVerifiedSsdiIncome(eeCase: EECase): number {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;

  const override = intake.ssaVerifiedSsdiMonthly;
  if (typeof override === 'number' && override >= 0) return override;

  return readMonthlyHouseholdIncome(eeCase);
}

export const ABD_ASSET_DEFS = [
  { hasKey: 'hasChecking', amountKey: 'checkingAmount', label: 'Checking account', exempt: false },
  { hasKey: 'hasSavings', amountKey: 'savingsAmount', label: 'Savings account', exempt: false },
  { hasKey: 'hasCash', amountKey: 'cashAmount', label: 'Cash on hand', exempt: false },
  { hasKey: 'hasCdBonds', amountKey: 'cdBondsAmount', label: 'CDs / bonds', exempt: false },
  { hasKey: 'hasRetirement', amountKey: 'retirementAmount', label: 'Retirement accounts', exempt: false },
  { hasKey: 'hasOtherRealEstate', amountKey: 'otherRealEstateValue', label: 'Other real estate', exempt: false },
  { hasKey: 'hasExtraVehicles', amountKey: 'extraVehiclesValue', label: 'Additional vehicle(s)', exempt: false },
  { hasKey: 'hasLifeInsurance', amountKey: 'lifeInsuranceValue', label: 'Life insurance (CSV)', exempt: false },
  { hasKey: 'hasBurialPlot', amountKey: 'burialPlotValue', label: 'Burial plot / pre-need', exempt: true },
  { hasKey: 'hasTrusts', amountKey: 'trustsValue', label: 'Trust(s)', exempt: false },
  { hasKey: 'hasTransfers60mo', amountKey: 'transfers60moValue', label: 'Asset transfers (60 mo.)', exempt: false },
] as const;

export function abdLimitForHousehold(householdSize: number): number {
  return householdSize >= 2 ? 3_000 : 2_000;
}

/**
 * Sum of the applicant-entered countable resources for a Non-MAGI case, read
 * from `intakeData.householdMembers[].nonMagiResources` via {@link ABD_ASSET_DEFS}
 * (exempt categories excluded). This mirrors the figure CompletedCaseDetail
 * already derives, so every surface reads the same citizen-entered total.
 *
 * TEMPORARY — ENG-1914 source-of-truth note:
 * Until real AVS (Asset Verification System) federation is wired, the
 * citizen-entered value is the single source of truth for the displayed and
 * evaluated asset figure. Once real AVS verification works, the AVS-returned
 * balance should REPLACE this citizen-entered total as the source of truth
 * (the applicant's attestation becomes the comparison input, not the answer).
 * That swap belongs here and at the call site in NonMagiAssetsPanel.
 *
 * Returns 0 when no resources were entered — we do NOT fabricate a placeholder
 * (the old $1,800 sandbox/default stub was removed in ENG-1914).
 */
export function readCitizenEnteredCountableResources(eeCase: EECase): number {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const members = Array.isArray(intake.householdMembers)
    ? (intake.householdMembers as Array<Record<string, unknown>>)
    : [];
  return members.reduce((total, member) => {
    const res = (member.nonMagiResources ?? {}) as Record<string, unknown>;
    return (
      total +
      ABD_ASSET_DEFS.reduce((sum, def) => {
        if (def.exempt || res[def.hasKey] !== true) return sum;
        const raw = typeof res[def.amountKey] === 'string' ? (res[def.amountKey] as string) : '';
        const amount = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
        return amount > 0 ? sum + amount : sum;
      }, 0)
    );
  }, 0);
}

export function formatAbdNote(countableTotal: number, abdLimit: number): string {
  const countable = `$${countableTotal.toLocaleString()}`;
  const limit = `$${abdLimit.toLocaleString()}`;
  return countableTotal > abdLimit
    ? `Countable resources ${countable} exceed ABD limit of ${limit} — flagged for caseworker review.`
    : `Countable resources ${countable} — within ABD limit of ${limit}.`;
}
