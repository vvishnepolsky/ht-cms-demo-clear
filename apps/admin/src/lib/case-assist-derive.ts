/**
 * Intelligent Case Assist — context-aware banner copy derivation (ENG-1670).
 *
 * Produces tone, eyebrow, action, and context for CaseActionBanner from
 * real case context (intake data, rule evaluations, RFI details,
 * determinations). The context paragraph may be overridden by
 * `eeCase.caseAssistNarrative` at the call site (ENG-1828).
 */

import type { EECase, EEDetermination, IdentityVerification } from '../types/ee';
import { hasOpenOutOfStateFlag } from '../types/ee';
import { findOverride } from './case-assist-overrides';
import { DDS_DETERMINATION_REF } from './case-assist-constants';
import { isNonMagiCase } from './ee-utils';
// Re-exported here so the existing import path (`./case-assist-derive`)
// keeps working for tests and call sites. Canonical definition lives in
// `./case-assist-constants`.
export {
  EYEBROW_ACTION_NEEDED,
  EYEBROW_CASE_APPROVED,
  EYEBROW_CASE_DENIED,
  EYEBROW_READY_FOR_APPROVAL,
  EYEBROW_CASE_IN_PROGRESS,
} from './case-assist-constants';
import {
  EYEBROW_ACTION_NEEDED,
  EYEBROW_CASE_APPROVED,
  EYEBROW_CASE_DENIED,
  EYEBROW_READY_FOR_APPROVAL,
  EYEBROW_CASE_IN_PROGRESS,
} from './case-assist-constants';

export type CaseAssistTone = 'green' | 'amber' | 'red' | 'grey' | 'blue';

/**
 * Session DDS workflow state for Non-MAGI ABD cases (storyboard
 * dds_pending → dds_referred → dds_confirmed → abd_assigned). Owned by
 * WorkspacePage component state (the platform has no PENDING_DDS status
 * yet — ENG-1748) and threaded into the banner derivation so the Case
 * Assist copy advances with the caseworker's DDS actions.
 */
export type DdsFlowState = 'pending' | 'referred' | 'confirmed' | 'validated';

export interface CaseAssistDeriveOptions {
  ddsFlowState?: DdsFlowState;
  /**
   * CLEAR / Verify Assist verification linked to the case. When it found
   * active out-of-state Medicaid coverage and the flag is still open / in
   * review, the banner goes red "ACTION NEEDED" regardless of status-derived
   * copy — the finding blocks determination.
   */
  identityVerification?: Pick<IdentityVerification, 'determination' | 'flag'> | null;
  /** Case Assist narrative (server-generated) used as the red banner's context paragraph. */
  narrative?: string | null;
}

/** Action line for the out-of-state coverage banner — shared with tests and the Case Assist panel. */
export const OOS_BANNER_ACTION = 'Resolve out-of-state Medicaid coverage before determination' as const;

export interface CaseAssistBannerCopy {
  tone: CaseAssistTone;
  eyebrow: string;
  action: string;
  context: string;
}

interface IntakeShape {
  applicantName?: string;
  householdSize?: number;
  monthlyHouseholdIncome?: number;
  federalPovertyLevelPercent?: number;
  federalPovertyLevelThreshold?: number;
  county?: string;
  requestedProgram?: string;
  displayMeta?: {
    daysRemaining?: number;
    flags?: string[];
  };
}

interface RuleEvalShape {
  ruleId?: string;
  ruleName?: string;
  status?: 'PASSED' | 'FAILED' | 'INFO';
  description?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function readIntake(intake: unknown): IntakeShape {
  const r = asRecord(intake);
  if (!r) return {};
  const display = asRecord(r.displayMeta) ?? {};
  const flags = Array.isArray(display.flags)
    ? (display.flags.filter((f) => typeof f === 'string') as string[])
    : undefined;
  return {
    applicantName: asString(r.applicantName),
    householdSize: asNumber(r.householdSize),
    monthlyHouseholdIncome: asNumber(r.monthlyHouseholdIncome),
    federalPovertyLevelPercent: asNumber(r.federalPovertyLevelPercent),
    federalPovertyLevelThreshold: asNumber(r.federalPovertyLevelThreshold),
    county: asString(r.county),
    requestedProgram: asString(r.requestedProgram),
    displayMeta: {
      daysRemaining: asNumber(display.daysRemaining),
      flags,
    },
  };
}

function readRuleEvals(raw: unknown): RuleEvalShape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row): RuleEvalShape | null => {
      const r = asRecord(row);
      if (!r) return null;
      const status = r.status === 'PASSED' || r.status === 'FAILED' || r.status === 'INFO' ? r.status : undefined;
      return {
        ruleId: asString(r.ruleId),
        ruleName: asString(r.ruleName),
        status,
        description: asString(r.description),
      };
    })
    .filter((r): r is RuleEvalShape => r !== null);
}

function fmtMoney(v: number | undefined): string {
  if (v === undefined) return '—';
  return `$${v.toLocaleString('en-US')}`;
}

function firstName(applicantName: string | undefined): string | null {
  if (!applicantName) return null;
  const parts = applicantName.trim().split(/\s+/);
  return parts[0] || null;
}

/**
 * Banner copy for the advanced DDS workflow states (storyboard
 * bannerByState: dds_referred / dds_confirmed / abd_assigned). Returns null
 * for 'pending' / undefined so the initial state keeps the per-case override
 * or status-derived copy. Approval flips eeCase.status to APPROVED before
 * the banner re-renders, so these never mask the terminal-state copy.
 */
function ddsFlowStateCopy(eeCase: EECase, ddsFlowState: DdsFlowState | undefined): CaseAssistBannerCopy | null {
  if (!ddsFlowState || ddsFlowState === 'pending') return null;
  if (eeCase.status === 'APPROVED' || eeCase.status === 'DENIED') return null;

  const intake = readIntake(eeCase.intakeData);
  const applicant = firstName(intake.applicantName) ?? 'the applicant';

  if (ddsFlowState === 'referred') {
    return {
      tone: 'grey',
      eyebrow: EYEBROW_CASE_IN_PROGRESS,
      action: 'DDS referral submitted — awaiting disability determination.',
      context: `Packet forwarded to State Disability Determination Services. Case remains open on financial criteria — ${applicant} is otherwise eligible pending the disability determination.`,
    };
  }
  if (ddsFlowState === 'confirmed') {
    return {
      tone: 'green',
      eyebrow: EYEBROW_READY_FOR_APPROVAL,
      action: 'All criteria met — validate determination and assign ABD category.',
      context: `DDS confirmed disability (${DDS_DETERMINATION_REF}). Financial criteria already pass. Validate to assign the ABD category and proceed to determination.`,
    };
  }
  // 'validated'
  return {
    tone: 'green',
    eyebrow: EYEBROW_READY_FOR_APPROVAL,
    action: 'ABD eligible — ready to submit determination.',
    context: `Caseworker validation accepted the DDS disability determination for ${applicant}. Submit the determination to finalize the Non-MAGI ABD approval and queue the eligibility notice.`,
  };
}

/**
 * Red "action needed" banner for an unresolved out-of-state Medicaid finding
 * from CLEAR / Verify Assist. Null when the case has no such finding, the
 * flag is already resolved/dismissed, or the case is terminal.
 */
function outOfStateCoverageCopy(
  eeCase: EECase,
  iv: CaseAssistDeriveOptions['identityVerification'],
  narrative: string | null | undefined,
): CaseAssistBannerCopy | null {
  if (!hasOpenOutOfStateFlag(iv)) return null;
  if (eeCase.status === 'APPROVED' || eeCase.status === 'DENIED' || eeCase.status === 'CANCELED') return null;

  const intake = readIntake(eeCase.intakeData);
  const applicant = firstName(intake.applicantName) ?? 'The applicant';
  const det = iv?.determination ?? null;
  const stateName = det?.payer_state_name ?? det?.payer_state ?? 'another state';
  const payer = det?.coverage?.payer_name ?? `${stateName} Medicaid`;
  const status = iv?.flag?.status === 'in_review' ? 'in review' : 'open';

  return {
    tone: 'red',
    eyebrow: EYEBROW_ACTION_NEEDED,
    action: OOS_BANNER_ACTION,
    context:
      narrative ??
      `${applicant} has active ${payer} coverage in ${stateName} according to the CLEAR identity verification. Federal rules bar concurrent Medicaid enrollment in two states — confirm disenrollment before approving. Verify Assist flag is ${status}.`,
  };
}

/**
 * "Action needed" banner copy for a case with an open RFI or a failed
 * verification eval. Returns null when neither signal is present.
 *
 * Hoisted out of the PENDING_VERIFICATION branch (ENG-2084): an active RFI or
 * a FAILED rule eval means the case is awaiting resolution and is NOT "ready
 * for approval" — regardless of the platform status. A renewal can carry an
 * open RFI while still sitting in IN_REVIEW (Diane Caldwell, SX-2026-061847),
 * and must not fall through to the green ready-for-approval banner.
 */
function rfiOrFailedEvalCopy(
  eeCase: EECase,
  applicant: string,
  failedEval: RuleEvalShape | undefined,
): CaseAssistBannerCopy | null {
  if (eeCase.rfiDetails) {
    const items = eeCase.rfiDetails.itemsRequested ?? [];
    const itemsLabel = items.length > 0 ? items.slice(0, 3).join(', ') : 'requested documentation';
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `Awaiting RFI response from ${applicant}.`,
      context: `Caseworker requested ${itemsLabel}. Response due ${new Date(
        eeCase.rfiDetails.deadline,
      ).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })}; system will auto-flag the case if the deadline passes.`,
    };
  }
  if (failedEval?.description) {
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `Income discrepancy on ${applicant}'s application — verify before proceeding.`,
      context: failedEval.description,
    };
  }
  return null;
}

/**
 * Produce a banner config for a case by combining its status, determinations,
 * intake data, and rule trace. Falls back to a generic config when context
 * fields aren't populated — never throws or returns null.
 */
export function deriveCaseAssistBanner(
  eeCase: EECase,
  determinations: EEDetermination[],
  options?: CaseAssistDeriveOptions,
): CaseAssistBannerCopy {
  // -1. An unresolved out-of-state Medicaid finding (CLEAR / Verify Assist)
  //     blocks determination and beats everything else, including overrides.
  const oosCopy = outOfStateCoverageCopy(eeCase, options?.identityVerification, options?.narrative);
  if (oosCopy) return oosCopy;

  // 0. An advanced DDS flow state wins over everything — including per-case
  //    overrides, which are hand-tuned for the case's INITIAL showcase state.
  //    Once the caseworker sends the referral / simulates the DDS response,
  //    the banner must track the live workflow (storyboard bannerByState).
  const ddsCopy = ddsFlowStateCopy(eeCase, options?.ddsFlowState);
  if (ddsCopy) return ddsCopy;

  // 1. Per-case override wins.
  const override = findOverride(eeCase.caseNumber);
  if (override) return override;

  // 2. Status + context-aware derivation.
  const intake = readIntake(eeCase.intakeData);
  const evals = readRuleEvals(eeCase.ruleEvaluations);
  // Shared classifier (C.2): intake disability/SSDI/SSI flags count even
  // before the BRE produces determinations — keeps the banner consistent
  // with WorkspacePage and the dashboard Pathway column for freshly
  // submitted Non-MAGI applications.
  const applicantRecord = asRecord(asRecord(eeCase.intakeData)?.applicant) ?? {};
  const isNonMagi = isNonMagiCase(applicantRecord, determinations);
  const hasDeferred = determinations.some((d) => d.status === 'DEFERRED');
  const hasIneligible = determinations.some((d) => d.status === 'INELIGIBLE');
  const failedEval = evals.find((e) => e.status === 'FAILED');
  const incomePassEval = evals.find((e) => e.status === 'PASSED' && /income.*threshold/i.test(e.ruleName ?? ''));

  const applicant = firstName(intake.applicantName) ?? 'this applicant';

  // APPROVED ───────────────────────────────────────────────────────────────
  if (eeCase.status === 'APPROVED') {
    const program = intake.requestedProgram ?? 'Medicaid';
    return {
      tone: 'green',
      eyebrow: EYEBROW_CASE_APPROVED,
      action: `${intake.applicantName ?? 'Case'} approved — coverage active.`,
      context: `${program} determination complete${
        intake.householdSize ? ` for a household of ${intake.householdSize}` : ''
      }. Notice delivered through preferred channels; no further caseworker action required.`,
    };
  }

  // DENIED ─────────────────────────────────────────────────────────────────
  if (eeCase.status === 'DENIED') {
    return {
      tone: 'grey',
      eyebrow: EYEBROW_CASE_DENIED,
      action: `${intake.applicantName ?? 'Case'} denied — see decision summary.`,
      context: eeCase.statusReason ?? 'Determination details and appeal rights have been delivered to the applicant.',
    };
  }

  // PENDING_VERIFICATION — typically RFI or income discrepancy ─────────────
  if (eeCase.status === 'PENDING_VERIFICATION') {
    const actionNeeded = rfiOrFailedEvalCopy(eeCase, applicant, failedEval);
    if (actionNeeded) return actionNeeded;
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `Verification required on ${applicant}'s application.`,
      context: eeCase.flagReason
        ? `Flag: ${eeCase.flagReason}. Review documentation before proceeding.`
        : 'Review documentation and resolve any outstanding flags before approval.',
    };
  }

  // IN_REVIEW + Non-MAGI determination → DDS workflow ──────────────────────
  if (eeCase.status === 'IN_REVIEW' && isNonMagi) {
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `Prepare DDS disability referral packet for ${applicant}.`,
      context: `Application routed to Non-MAGI ABD pathway. Financial criteria pass${
        intake.monthlyHouseholdIncome
          ? ` (income ${fmtMoney(intake.monthlyHouseholdIncome)}/mo, ${intake.federalPovertyLevelPercent ?? '—'}% FPL)`
          : ''
      }. SSA disability status pending — DDS referral required to confirm.`,
    };
  }

  // IN_REVIEW + at least one DEFERRED determination → mixed household ──────
  if (eeCase.status === 'IN_REVIEW' && hasDeferred) {
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `SSI recipient flagged in ${applicant}'s household — split pathway.`,
      context: `Primary applicant deferred to Non-MAGI ABD; other household members remain MAGI-eligible. Linked Non-MAGI case has been opened — review both before approval.`,
    };
  }

  // IN_REVIEW + at least one INELIGIBLE determination → mixed/partial household.
  // Do NOT show the green "ready for approval" banner when a member was denied —
  // that would contradict the per-member determination the caseworker sees and is
  // the exact CaseAssist-vs-caseworker divergence reported in ENG-1906. The deeper
  // question of whether a partial household should auto-approve or block is ENG-1886.
  if (eeCase.status === 'IN_REVIEW' && hasIneligible) {
    const eligibleCount = determinations.filter((d) => d.status === 'ELIGIBLE').length;
    return {
      tone: 'amber',
      eyebrow: EYEBROW_ACTION_NEEDED,
      action: `Mixed determination in ${applicant}'s household — review before approval.`,
      context: `${eligibleCount} of ${determinations.length} applying members met their MAGI income standard; the remaining member(s) exceeded the applicable threshold. Review each member's determination before deciding the case.`,
    };
  }

  // IN_REVIEW (clean MAGI) — ready for approval ────────────────────────────
  if (eeCase.status === 'IN_REVIEW') {
    // An open RFI or a failed verification eval means the case is awaiting
    // resolution — it is never "ready for approval", even while it sits in
    // IN_REVIEW. Guards the green branch below so a renewal with an open RFI
    // (Diane Caldwell, SX-2026-061847) doesn't get painted green — ENG-2084.
    // Same Case-Assist-vs-caseworker divergence class as ENG-1906.
    const actionNeeded = rfiOrFailedEvalCopy(eeCase, applicant, failedEval);
    if (actionNeeded) return actionNeeded;

    const incomeFrag = incomePassEval?.description ?? null;
    const incomeContext =
      incomeFrag ??
      (intake.monthlyHouseholdIncome && intake.federalPovertyLevelThreshold
        ? `Household income ${fmtMoney(intake.monthlyHouseholdIncome)}/mo (${
            intake.federalPovertyLevelPercent ?? '—'
          }% FPL) under the ${fmtMoney(intake.federalPovertyLevelThreshold)}/mo threshold for HH of ${
            intake.householdSize ?? '—'
          }.`
        : 'All automated checks passed.');
    return {
      tone: 'green',
      eyebrow: EYEBROW_READY_FOR_APPROVAL,
      action: `${applicant === 'this applicant' ? 'Case' : `${applicant}'s case`} is ready for caseworker approval.`,
      context: incomeContext,
    };
  }

  // CANCELED / fallback ────────────────────────────────────────────────────
  return {
    tone: 'grey',
    eyebrow: EYEBROW_CASE_IN_PROGRESS,
    action: 'Awaiting next caseworker action.',
    context: 'No outstanding flags. Review the case workspace for current state.',
  };
}
