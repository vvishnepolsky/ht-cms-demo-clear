/**
 * Intelligent Case Assist — per-case banner copy overrides (ENG-1670).
 *
 * Static, hand-tuned banner copy for showcase cases that need demo polish
 * beyond what the generic `deriveCaseAssistBanner` produces. When a case
 * number appears here, the override wins over the derived default.
 *
 * Why not just edit the seed data? The override layer lets us tune
 * demo-presenter copy without touching the rules engine output or the
 * persisted intake. It also keeps the seed honest (rule evals stay
 * mechanically derived from the case data) while still giving the demo
 * tight, story-specific banner copy.
 *
 * STUB FOR THE DEMO. The longer-term plan is to generate banner copy via
 * an LLM that reads the case context + rucle trace. The override layer
 * disappears when that lands.
 */

import type { CaseAssistBannerCopy } from './case-assist-derive';
// Import EYEBROW labels from the leaf constants module (not from
// case-assist-derive) — derive imports findOverride from this file, so
// pulling constants from derive would create a circular import that
// TDZ-crashes at module load.
import { EYEBROW_ACTION_NEEDED, EYEBROW_CASE_APPROVED, EYEBROW_READY_FOR_APPROVAL } from './case-assist-constants';

const OVERRIDES: Record<string, CaseAssistBannerCopy> = {
  // James Okafor (PENDING_VERIFICATION, income discrepancy) — replaces the
  // generic "income discrepancy" derivation with specific numbers from
  // the rule eval.
  'SX-2026-048821': {
    tone: 'amber',
    eyebrow: EYEBROW_ACTION_NEEDED,
    action: 'Verify income for James — payroll data exceeds self-reported by $450/mo.',
    context:
      'Reported employment income $2,400/mo vs payroll $2,850/mo — over the 10% tolerance. Household still 84.8% FPL (under 138% threshold for HH of 3), so this is a reconciliation step, not a denial path. Resolve before approval.',
  },

  // Patricia Chen (IN_REVIEW, clean MAGI pass) — replace the generic
  // "ready for approval" copy with specific FPL math.
  'SX-2026-041537': {
    tone: 'green',
    eyebrow: EYEBROW_READY_FOR_APPROVAL,
    action: "Patricia's case is clean — approve to issue determination.",
    context:
      'Single parent, HH of 2. Stated income $1,800/mo (71.3% FPL) well under the $2,523/mo threshold. All federal hub sources passed; no flags. Auto-MAGI under FMAP / Parent-Caretaker.',
  },

  // Robert Martinez (APPROVED) — branded approval banner with coverage detail.
  'SX-2025-039244': {
    tone: 'green',
    eyebrow: EYEBROW_CASE_APPROVED,
    action: "Robert's case is approved — coverage is active.",
    context:
      'Approved under MAGI / Parent-Caretaker. Determination notice delivered to portal + USPS. MMIS enrollment queued; managed-care assignment auto-issued. No further caseworker action required.',
  },

  // Gloria Washington (IN_REVIEW, MAGI/DEFERRED split household) — flag the
  // SSI deferral and the linked Non-MAGI case explicitly.
  'SX-2026-052134': {
    tone: 'amber',
    eyebrow: EYEBROW_ACTION_NEEDED,
    action: 'SSI flagged — Gloria split-pathway to Non-MAGI ABD.',
    context:
      'Marcus and Zoe remain MAGI-eligible under CHIP / Parent-Caretaker thresholds. A linked Non-MAGI ABD case (SX-2026-052135) has been opened for Gloria. Review both, then approve the MAGI side independently.',
  },

  // Dorothy Thompson (IN_REVIEW, NON_MAGI ABD) — DDS referral path with
  // financial-pass headline. Numbers match the seed (case5IntakeData in
  // services/medicaid-ee-service/scripts/seed-statex-ee-cases.ts).
  'SX-2026-052135': {
    tone: 'amber',
    eyebrow: EYEBROW_ACTION_NEEDED,
    action: 'Prepare DDS disability referral packet for Dorothy.',
    context:
      'Routed to Non-MAGI ABD — disability indicated at application. Financial criteria pass: income $943/mo (≈95% FPL) under the $994/mo SSI FBR, countable assets $1,750 under the $2,000 limit. SSA disability case status returned PENDING — DDS referral required to confirm.',
  },
};

/**
 * Return the per-case override for a case number, or `null` if none exists.
 * Null is the signal to fall through to the derived default.
 */
export function findOverride(caseNumber: string | null | undefined): CaseAssistBannerCopy | null {
  if (!caseNumber) return null;
  return OVERRIDES[caseNumber] ?? null;
}
