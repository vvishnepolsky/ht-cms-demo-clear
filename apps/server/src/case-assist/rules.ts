/**
 * Case Assist rules — deterministic, pure function of (case, linked
 * verification, flag). See docs/api-contract.md § Case Assist rules.
 */

import { checkPassed, curateChecks } from "../clear/check-curation.js";

export type RecommendationType = "guidance" | "draft_task" | "draft_notice";
export type Severity = "critical" | "warning" | "info";
export type Source = "verify_assist" | "rules" | "intake";

export interface CaseAssistRecommendation {
  id: string;
  type: RecommendationType;
  /** 1 act now, 2 soon, 3 fyi */
  priority: 1 | 2 | 3;
  severity: Severity;
  source: Source;
  title: string;
  body: string;
  rationale: { summary: string; citedFieldPaths: string[] };
  suggestedActions: string[];
}

export interface CaseAssistCaseView {
  status: string;
  flagReason: string | null;
  intakeData: Record<string, unknown> | null;
  rfiDetails: { itemsRequested?: string[]; deadline?: string } | null;
  incomeVerification: { status: string } | null;
}

export interface CaseAssistVerificationView {
  status: string;
  checks: Array<{ name: string; status: string; value?: boolean | null }>;
  resolution: string | null;
  determination: {
    duplicate_enrollment: boolean;
    payer_state: string | null;
    payer_state_name: string | null;
    coverage: {
      payer_name?: string | null;
      plan_status?: string | null;
      insurance_member_id?: string | null;
      coverage_type?: string | null;
      monthly_premium?: number | null;
      policy_holder_first_name?: string | null;
      policy_holder_last_name?: string | null;
      policy_holder_relationship?: string | null;
      coverage_start_date?: string | null;
    } | null;
    coverage_type?: string | null;
  } | null;
}

export interface CaseAssistFlagView {
  status: string;
  /** Set once the flag is resolved/dismissed (e.g. `disenrollment_confirmed`). */
  dispositionReason?: string | null;
}

export { checkPassed };

function firstName(intake: Record<string, unknown> | null): string {
  const raw = intake && typeof intake.applicantName === "string" ? intake.applicantName.trim() : "";
  return raw.split(/\s+/)[0] || "the applicant";
}

export function deriveRecommendations(
  eeCase: CaseAssistCaseView,
  verification: CaseAssistVerificationView | null,
  flag: CaseAssistFlagView | null,
): CaseAssistRecommendation[] {
  const recs: CaseAssistRecommendation[] = [];
  const name = firstName(eeCase.intakeData);
  const det = verification?.determination ?? null;
  const stateName = det?.payer_state_name ?? "another state";
  const flagOpen = flag ? flag.status === "open" || flag.status === "in_review" : false;

  // One finding, stated once. Merges the applicant's hosted-flow response
  // (formerly separate `applicant-resolution*` recommendations) into the body
  // and rationale. Emitted only while the Verify Assist flag is open / in
  // review — once resolved or dismissed the flag card's history is the record.
  const flagClosed = !!flag && !flagOpen; // resolved | dismissed
  if ((det?.duplicate_enrollment || (verification && flagOpen)) && !flagClosed) {
    const payer = det?.coverage?.payer_name ?? `${stateName} Medicaid`;
    const stateCode = det?.payer_state ?? "SC";
    const memberSuffix = det?.coverage?.insurance_member_id ? ` (member ID ending ${det.coverage.insurance_member_id.slice(-4)})` : "";
    const response =
      verification?.resolution === "confirm_enrolled"
        ? `In the Verify Assist flow ${name} confirmed the ${stateName} coverage is still active and asked to continue with caseworker review — State-X coverage can start only after the ${stateName} case terminates.`
        : verification?.resolution === "ended_submit_proof"
          ? `In the Verify Assist flow ${name} said the ${stateName} coverage has ended and uploaded proof of disenrollment — verify the termination date before approving.`
          : `${name} did not record a response in the Verify Assist flow.`;
    recs.push({
      id: "oos-medicaid",
      type: "draft_task",
      priority: 1,
      severity: "critical",
      source: "verify_assist",
      title: `Active out-of-state Medicaid coverage detected (${stateName})`,
      body: `CLEAR's coverage discovery found an ACTIVE ${payer} enrollment for ${name}${memberSuffix}. Federal rules bar concurrent Medicaid enrollment in two states, so State-X coverage cannot be approved until the ${stateName} case is closed. ${response}`,
      rationale: {
        summary: `Payer state ${det?.payer_state ?? "?"} ≠ tenant state SX and plan_status is ACTIVE. Applicant response: ${verification?.resolution ?? "none"}. Verify Assist flag: ${flag?.status ?? "open"}.`,
        citedFieldPaths: [
          "identityVerification.determination.duplicate_enrollment",
          "identityVerification.determination.payer_state",
          "identityVerification.determination.coverage.payer_name",
          "identityVerification.determination.coverage.plan_status",
          "identityVerification.resolution",
          "identityVerification.flag.status",
          "intakeData.applicant.stateOfResidence",
        ],
      },
      suggestedActions: [
        `Issue RFI for proof of ${stateCode} Medicaid disenrollment`,
        `Contact ${stateName} DHHS to confirm termination date`,
        "Hold determination until resolved",
      ],
    });
  }

  // Other (non-Medicaid) coverage discovered — e.g. an ACTIVE employer plan. Not a
  // program-integrity finding: no flag, no block. The caseworker records it as
  // third-party liability so Medicaid pays secondary.
  const coverageType = det?.coverage_type ?? det?.coverage?.coverage_type ?? null;
  if (det && !det.duplicate_enrollment && det.coverage && coverageType && coverageType !== "medicaid") {
    const cov = det.coverage;
    const holder = [cov.policy_holder_first_name, cov.policy_holder_last_name].filter(Boolean).join(" ");
    const holderNote = holder
      ? ` held by ${holder}${cov.policy_holder_relationship ? ` (${cov.policy_holder_relationship})` : ""}`
      : "";
    const typeLabel = coverageType === "employer" ? "employer" : coverageType;
    recs.push({
      id: `other-coverage-${coverageType}`,
      type: "guidance",
      priority: 3,
      severity: "info",
      source: "verify_assist",
      title: `${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)} coverage on file — verify third-party liability (TPL)`,
      body: `CLEAR's coverage discovery found an ACTIVE ${cov.payer_name ?? typeLabel} ${typeLabel} plan for ${name}${holderNote}${
        cov.monthly_premium != null ? `, $${cov.monthly_premium}/mo` : ""
      }${cov.coverage_start_date ? `, since ${cov.coverage_start_date}` : ""}. This is not Medicaid and does not block eligibility, but it must be recorded as third-party liability so Medicaid pays secondary.`,
      rationale: {
        summary: `Coverage discovery found ${cov.payer_name ?? "a payer"} with coverage_type "${coverageType}"; not a Medicaid payer, so no duplicate-enrollment finding.`,
        citedFieldPaths: [
          "identityVerification.determination.coverage.payer_name",
          "identityVerification.determination.coverage.coverage_type",
          "identityVerification.determination.duplicate_enrollment",
        ],
      },
      suggestedActions: [
        `Record ${cov.payer_name ?? "the plan"} as third-party liability`,
        "Confirm premium and coverage dates with the applicant",
      ],
    });
  }

  // Only the curated identity checks count — the raw sandbox list carries
  // skipped rows and an NFC-passport false that would otherwise never "all pass".
  const shownChecks = verification ? curateChecks(verification.checks).shown : [];
  if (verification && verification.status === "success" && shownChecks.length > 0 && shownChecks.every(checkPassed)) {
    recs.push({
      id: "identity-verified",
      type: "guidance",
      priority: 3,
      severity: "info",
      source: "verify_assist",
      title: "Identity verified by CLEAR — no manual ID review needed",
      body: `${name} completed CLEAR identity verification: ${shownChecks.length}/${shownChecks.length} identity checks passed (selfie liveness, document authenticity, selfie–document match). The identity step of the auto-processing pipeline is satisfied.`,
      rationale: {
        summary: "Verification status is success and every identity-relevant CLEAR check passed.",
        citedFieldPaths: ["identityVerification.status", "identityVerification.checks"],
      },
      suggestedActions: ["Skip the manual ID document request", "Proceed to income and residency review"],
    });
  } else if (!verification || verification.status === "failed" || verification.status === "expired") {
    recs.push({
      id: "identity-unverified",
      type: "draft_task",
      priority: 2,
      severity: "warning",
      source: "verify_assist",
      title: "Identity not verified — request ID documents",
      body: verification
        ? `The CLEAR verification for ${name} ended with status "${verification.status}". Identity must be established before a determination can be issued.`
        : `No CLEAR identity verification is linked to this case. Identity must be established before a determination can be issued.`,
      rationale: {
        summary: verification ? "Linked verification is not in a success state." : "No identityVerification linked to the case.",
        citedFieldPaths: ["identityVerification", "identityVerification.status"],
      },
      suggestedActions: ["Issue RFI for a government-issued photo ID", "Send a new Verify Assist link"],
    });
  }

  if (eeCase.flagReason?.startsWith("rfi:")) {
    const rfi = eeCase.rfiDetails;
    const items = rfi?.itemsRequested?.length ? rfi.itemsRequested.join(", ") : "requested documentation";
    recs.push({
      id: "rfi-pending",
      type: "guidance",
      priority: 2,
      severity: "warning",
      source: "rules",
      title: "RFI outstanding",
      body: `An RFI is pending on this case (${items}${rfi?.deadline ? `; due ${rfi.deadline.slice(0, 10)}` : ""}). The case cannot be decided until the applicant responds or the deadline passes.`,
      rationale: {
        summary: "flagReason starts with 'rfi:'.",
        citedFieldPaths: ["flagReason", "rfiDetails.itemsRequested", "rfiDetails.deadline"],
      },
      suggestedActions: ["Wait for the applicant's response", "Resolve the RFI once documents arrive"],
    });
  }

  if (eeCase.incomeVerification?.status !== "VERIFIED") {
    recs.push({
      id: "income-unverified",
      type: "draft_task",
      priority: 3,
      severity: "info",
      source: "rules",
      title: "Income not yet verified electronically",
      body: `Household income is self-attested. Run the payroll (Argyle) verification or request pay stubs before finalizing the determination.`,
      rationale: {
        summary: `incomeVerification.status is ${eeCase.incomeVerification?.status ?? "null"}, not VERIFIED.`,
        citedFieldPaths: ["incomeVerification.status", "intakeData.monthlyHouseholdIncome"],
      },
      suggestedActions: ["Send the Argyle payroll connection request", "Or issue RFI for recent pay stubs"],
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}
