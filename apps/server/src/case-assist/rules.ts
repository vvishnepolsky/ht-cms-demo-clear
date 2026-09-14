/**
 * Case Assist rules — deterministic, pure function of (case, linked
 * verification, flag). See docs/api-contract.md § Case Assist rules.
 */

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
    coverage: { payer_name?: string | null; plan_status?: string | null; insurance_member_id?: string | null } | null;
  } | null;
}

export interface CaseAssistFlagView {
  status: string;
}

export function checkPassed(c: { status: string; value?: boolean | null }): boolean {
  if (typeof c.value === "boolean") return c.value;
  return c.status === "success" || c.status === "completed" || c.status === "passed";
}

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

  if (det?.duplicate_enrollment || (verification && flagOpen)) {
    const payer = det?.coverage?.payer_name ?? `${stateName} Medicaid`;
    recs.push({
      id: "oos-medicaid",
      type: "draft_task",
      priority: 1,
      severity: "critical",
      source: "verify_assist",
      title: `Active out-of-state Medicaid coverage detected (${stateName})`,
      body: `CLEAR's coverage discovery found an ACTIVE ${payer} enrollment for ${name}${det?.coverage?.insurance_member_id ? ` (member ID ending ${det.coverage.insurance_member_id.slice(-4)})` : ""}. Federal rules bar concurrent Medicaid enrollment in two states, so State-X coverage cannot be approved until the ${stateName} case is closed.${flag && !flagOpen ? ` The Verify Assist flag has been ${flag.status}.` : ""}`,
      rationale: {
        summary: `Payer state ${det?.payer_state ?? "?"} ≠ tenant state SX and plan_status is ACTIVE.`,
        citedFieldPaths: [
          "identityVerification.determination.duplicate_enrollment",
          "identityVerification.determination.payer_state",
          "identityVerification.determination.coverage.payer_name",
          "identityVerification.determination.coverage.plan_status",
          "intakeData.applicant.stateOfResidence",
        ],
      },
      suggestedActions: [
        `Issue RFI for proof of ${det?.payer_state ?? "SC"} Medicaid disenrollment`,
        `Contact ${stateName} DHHS to confirm termination date`,
        "Hold determination until resolved",
      ],
    });
  }

  if (verification && verification.status === "success" && verification.checks.length > 0 && verification.checks.every(checkPassed)) {
    recs.push({
      id: "identity-verified",
      type: "guidance",
      priority: 3,
      severity: "info",
      source: "verify_assist",
      title: "Identity verified by CLEAR — no manual ID review needed",
      body: `${name} completed CLEAR identity verification: ${verification.checks.length}/${verification.checks.length} checks passed (selfie liveness, document authenticity, selfie–document match). The identity step of the auto-processing pipeline is satisfied.`,
      rationale: {
        summary: "Verification status is success and every CLEAR check passed.",
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

  if (verification?.resolution === "confirm_enrolled") {
    recs.push({
      id: "applicant-resolution",
      type: "guidance",
      priority: 2,
      severity: "warning",
      source: "verify_assist",
      title: `Applicant confirmed they are still enrolled in ${det?.payer_state ?? "SC"} Medicaid`,
      body: `In the Verify Assist flow ${name} confirmed the ${stateName} coverage is still active and asked to continue with caseworker review. Coordinate the transfer: State-X coverage can start only after the ${stateName} case terminates.`,
      rationale: {
        summary: "resolution === 'confirm_enrolled' recorded at the end of the hosted flow.",
        citedFieldPaths: ["identityVerification.resolution"],
      },
      suggestedActions: [
        `Advise ${name} to request closure of the ${stateName} case`,
        "Set the State-X effective date after the out-of-state termination",
      ],
    });
  } else if (verification?.resolution === "ended_submit_proof") {
    recs.push({
      id: "applicant-resolution-proof",
      type: "draft_task",
      priority: 2,
      severity: "info",
      source: "verify_assist",
      title: `Applicant says ${det?.payer_state ?? "SC"} coverage ended and submitted proof — verify disenrollment date`,
      body: `${name} stated the ${stateName} coverage has ended and uploaded proof of disenrollment. Verify the termination date before approving.`,
      rationale: {
        summary: "resolution === 'ended_submit_proof' recorded at the end of the hosted flow.",
        citedFieldPaths: ["identityVerification.resolution"],
      },
      suggestedActions: ["Review the uploaded disenrollment letter", "Confirm the termination date with the other state"],
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
