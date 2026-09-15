import { randomUUID } from "node:crypto";
import type { User } from "../auth.js";
import { isStaff } from "../auth.js";
import { CUSTOMER_ID } from "../config.js";
import { db, fromJson, nextCounter, now, toJson } from "../db.js";
import {
  getVerificationRow,
  hasOpenFlag,
  latestUnlinkedApplicantVerification,
  primaryFlagForVerification,
  verificationForCase,
  type VerificationRow,
} from "../verifications.js";
import type { Determination as CoverageDetermination, SessionTraits, VerificationCheck } from "../clear/types.js";
import { medicaidAudit, SYSTEM_ACTOR } from "./audit.js";
import { getHousehold, householdMembers } from "./households.js";
import {
  coverageDiscoveryRow,
  coverageFindingOpen,
  evaluateCase,
  type IdentityContext,
  type SectionedTrace,
  type TraceRow,
  type TraceSection,
} from "./rules.js";
import { checkPassed, curateChecks } from "../clear/check-curation.js";
import { attachVerificationDocumentsToCase } from "./documents.js";
import { setPersonSsnLast4IfEmpty } from "./persons.js";

/** medicaid-ee-service replica: cases, determinations, lifecycle. */

export type CaseStatus = "PENDING_VERIFICATION" | "IN_REVIEW" | "APPROVED" | "DENIED" | "CANCELED";
export type CaseType = "INITIAL" | "RENEWAL" | "REDETERMINATION" | "APPEAL";
export type DeterminationStatus = "PENDING" | "ELIGIBLE" | "INELIGIBLE" | "DEFERRED";

export const OOS_FLAG = "OOS-MCD";
export const OOS_FLAG_REASON = "verify_assist:out_of_state_medicaid";
export const RFI_PENDING_FLAG = "rfi:pending";
export const RFI_FLAG_PREFIX = "rfi:";
const RESOURCE_TYPE = "MedicaidEeCase";

const STATUS_TRANSITIONS: Record<CaseStatus, ReadonlySet<CaseStatus>> = {
  PENDING_VERIFICATION: new Set<CaseStatus>(["IN_REVIEW", "CANCELED"]),
  IN_REVIEW: new Set<CaseStatus>(["APPROVED", "DENIED", "CANCELED"]),
  APPROVED: new Set(),
  DENIED: new Set(),
  CANCELED: new Set(),
};
export function isTerminalStatus(s: CaseStatus): boolean {
  return STATUS_TRANSITIONS[s].size === 0;
}

export type CaseErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "UNIQUE_CONSTRAINT"
  | "INVALID_STATUS_TRANSITION"
  | "CONCURRENT_MODIFICATION"
  | "RFI_ALREADY_PENDING"
  | "EVALUATION_FAILED"
  | "DOCUMENT_COPY_FAILED"
  | "DOCUMENT_SCAN_PENDING";

export class CaseError extends Error {
  constructor(
    public code: CaseErrorCode,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

// --- rows -----------------------------------------------------------------------

export interface CaseRow {
  id: string;
  customer_id: string;
  case_number: string | null;
  case_type: CaseType;
  status: CaseStatus;
  status_reason: string | null;
  notes: string | null;
  flag_reason: string | null;
  intake_data: string | null;
  rule_evaluations: string | null;
  rfi_details: string | null;
  document_id: string | null;
  household_id: string;
  applicant_person_id: string;
  linked_case_id: string | null;
  case_assist_narrative: string | null;
  case_assist_narrative_source: string | null;
  case_assist_rec_ids: string | null;
  income_verification: string | null;
  asset_verification: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfiDetails {
  itemsRequested: string[];
  deadline: string;
  noteToApplicant: string | null;
  issuedAt: string;
  issuedBy: string;
  renewalFormDocumentId?: string | null;
}

export interface IncomeVerification {
  status: "PENDING" | "CONNECTED" | "VERIFIED" | "FAILED";
  employer: { name: string; logoUrl: string | null } | null;
  employmentType: string | null;
  incomeAnnual: number | null;
  incomeMonthly: number | null;
  hoursPerWeek: number | null;
  payFrequency: string | null;
  lastPaystubDate: string | null;
  verifiedAt: string | null;
}

export interface AssetVerification {
  status: "PENDING" | "VERIFIED" | "FAILED";
  totalAssets: number | null;
  accounts: Array<{ institutionName: string; accountType: string; balance: number }>;
  verifiedAt: string | null;
}

export interface EeCase {
  id: string;
  customerId: string;
  caseNumber: string | null;
  caseType: CaseType;
  status: CaseStatus;
  statusReason: string | null;
  notes: string | null;
  flagReason: string | null;
  intakeData: Record<string, unknown> | null;
  ruleEvaluations: unknown;
  rfiDetails: RfiDetails | null;
  documentId: string | null;
  householdId: string;
  applicantPersonId: string;
  linkedCaseId: string | null;
  caseAssistNarrative: string | null;
  incomeVerification: IncomeVerification | null;
  assetVerification: AssetVerification | null;
  createdAt: string;
  updatedAt: string;
}

export function toCase(row: CaseRow): EeCase {
  return {
    id: row.id,
    customerId: row.customer_id,
    caseNumber: row.case_number,
    caseType: row.case_type,
    status: row.status,
    statusReason: row.status_reason,
    notes: row.notes,
    flagReason: row.flag_reason,
    intakeData: fromJson<Record<string, unknown>>(row.intake_data),
    ruleEvaluations: fromJson<unknown>(row.rule_evaluations),
    rfiDetails: fromJson<RfiDetails>(row.rfi_details),
    documentId: row.document_id,
    householdId: row.household_id,
    applicantPersonId: row.applicant_person_id,
    linkedCaseId: row.linked_case_id,
    caseAssistNarrative: row.case_assist_narrative,
    incomeVerification: fromJson<IncomeVerification>(row.income_verification),
    assetVerification: fromJson<AssetVerification>(row.asset_verification),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getCaseRow(id: string): CaseRow | undefined {
  return db.prepare(`SELECT * FROM medicaid_ee_cases WHERE id = ?`).get(id) as CaseRow | undefined;
}

export function requireCaseRow(id: string): CaseRow {
  const row = getCaseRow(id);
  if (!row) throw new CaseError("NOT_FOUND", "Case not found", "id");
  return row;
}

export interface CaseFilter {
  status?: CaseStatus | null;
  caseType?: CaseType | null;
  householdId?: string | null;
  applicantPersonId?: string | null;
}

export function listCases(filter: CaseFilter, page: number, limit: number): { rows: CaseRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  const eq = (col: string, v: string | null | undefined) => {
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  };
  eq("status", filter.status);
  eq("case_type", filter.caseType);
  eq("household_id", filter.householdId);
  eq("applicant_person_id", filter.applicantPersonId);
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) n FROM medicaid_ee_cases ${sqlWhere}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM medicaid_ee_cases ${sqlWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as CaseRow[];
  return { rows, total };
}

// --- determinations ------------------------------------------------------------------

export interface DeterminationRow {
  id: string;
  customer_id: string;
  case_id: string;
  person_id: string | null;
  coverage_group: string | null;
  status: DeterminationStatus;
  category: "MAGI" | "NON_MAGI";
  effective_date: string | null;
  expiration_date: string | null;
  denial_reason: string | null;
  notes: string | null;
  determined_at: string | null;
  determined_by: string | null;
  notice_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export function toDetermination(row: DeterminationRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    caseId: row.case_id,
    personId: row.person_id,
    coverageGroup: row.coverage_group,
    status: row.status,
    category: row.category,
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    denialReason: row.denial_reason,
    notes: row.notes,
    determinedAt: row.determined_at,
    determinedBy: row.determined_by,
    noticeDocumentId: row.notice_document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function determinationsForCase(caseId: string): DeterminationRow[] {
  return db
    .prepare(`SELECT * FROM medicaid_ee_determinations WHERE case_id = ? ORDER BY created_at, rowid`)
    .all(caseId) as DeterminationRow[];
}

/** Coverage starts on the first of the month after the decision; a 12-month certification ends at month end. */
export function coverageDates(from = new Date()): { effectiveDate: string; expirationDate: string } {
  const effective = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const expiration = new Date(Date.UTC(effective.getUTCFullYear(), effective.getUTCMonth() + 12, 0));
  return { effectiveDate: effective.toISOString(), expirationDate: expiration.toISOString() };
}

// --- identity verification helpers ---------------------------------------------------

export function identityContextFor(v: VerificationRow | undefined): IdentityContext | null {
  if (!v) return null;
  // Curated identity checks — the raw sandbox list carries skipped/NFC rows.
  const checks = curateChecks(fromJson<VerificationCheck[]>(v.checks) ?? []).shown;
  const det = fromJson<CoverageDetermination>(v.determination);
  const flag = primaryFlagForVerification(v.id);
  return {
    status: v.status,
    checksTotal: checks.length,
    checksPassed: checks.filter(checkPassed).length,
    duplicateEnrollment: det?.duplicate_enrollment === true,
    payerStateName: det?.payer_state_name ?? null,
    payerName: det?.coverage?.payer_name ?? null,
    flagStatus: flag?.status ?? null,
    flagDispositionReason: flag?.disposition_reason ?? null,
    flagUpdatedAt: flag?.updated_at ?? null,
    resolution: v.resolution,
  };
}

/**
 * Re-point the persisted rule trace's "Coverage discovery" row at the current
 * Verify Assist flag state (PENDING while open → PASS "Resolved"/"Dismissed").
 * The trace is written once at creation; this patches ONLY that row (and the
 * derived outcome/summary) so caseworker decisions on terminal cases are never
 * reset. Returns true when the stored trace changed.
 */
export function refreshCoverageDiscoveryTrace(caseId: string): boolean {
  const row = getCaseRow(caseId);
  if (!row) return false;
  const identity = identityContextFor(verificationForCase(caseId));
  if (!identity) return false;
  const trace = fromJson<SectionedTrace>(row.rule_evaluations);
  if (!trace || !Array.isArray(trace.sections)) return false;

  const nextRow = coverageDiscoveryRow(identity);
  let changed = false;
  let prevStatus: string | null = null;
  const sections: TraceSection[] = trace.sections.map((section: TraceSection) => ({
    ...section,
    rows: section.rows.map((r: TraceRow) => {
      if (r.ruleId !== nextRow.ruleId) return r;
      if (r.status !== nextRow.status || r.rightValue !== nextRow.rightValue || r.note !== nextRow.note) {
        changed = true;
        prevStatus = r.status;
        return { ...nextRow };
      }
      return r;
    }),
  }));
  if (!changed) return false;

  // Keep the summary counts consistent with the row's new status.
  const summary = { ...trace.summary };
  const dec = (k: "passed" | "failed" | "pending") => (summary[k] = Math.max(0, (summary[k] ?? 0) - 1));
  const inc = (k: "passed" | "failed" | "pending") => (summary[k] = (summary[k] ?? 0) + 1);
  if (prevStatus === "PASS") dec("passed");
  else if (prevStatus === "FAIL") dec("failed");
  else if (prevStatus === "PENDING") dec("pending");
  if (nextRow.status === "PASS") inc("passed");
  else if (nextRow.status === "FAIL") inc("failed");
  else inc("pending");

  // The engine outcome stops citing the coverage finding once it is closed; a
  // NEEDS_REVIEW that rested solely on it becomes ELIGIBLE (never touches an
  // INELIGIBLE outcome or the recorded determinations).
  let outcome = trace.outcome;
  const finalSection = sections.find((sec: TraceSection) => sec.name === "Final Determination");
  const outcomeRow = finalSection?.rows.find((r: TraceRow) => r.ruleId === "SX-FIN-001" || r.ruleName === "Eligibility outcome");
  if (outcome === "NEEDS_REVIEW" && !coverageFindingOpen(identity) && summary.failed === 0 && summary.pending === 0) {
    outcome = "ELIGIBLE";
    if (outcomeRow) {
      outcomeRow.status = "PASS";
      outcomeRow.rightValue = "ELIGIBLE";
      outcomeRow.note = "Out-of-state coverage finding resolved; all rules pass.";
    }
  } else if (outcomeRow && typeof outcomeRow.note === "string" && !coverageFindingOpen(identity)) {
    outcomeRow.note = outcomeRow.note.replace(/active out-of-state Medicaid coverage(,\s*|\s*)/i, "").replace(/:\s*\.$/, ".");
  }

  const nextTrace: SectionedTrace = { ...trace, sections, summary, outcome };
  touch(caseId, { rule_evaluations: toJson(nextTrace) });
  return true;
}

// --- create -----------------------------------------------------------------------------

export interface CreateCaseInput {
  householdId: string;
  applicantPersonId?: string | null;
  caseType?: CaseType | null;
  notes?: string | null;
  documentId?: string | null;
  intakeData?: Record<string, unknown> | null;
  identityVerificationId?: string | null;
  draftId?: string | null;
}

export function nextCaseNumber(): string {
  return `SX-${new Date().getUTCFullYear()}-${String(nextCounter("case_number")).padStart(6, "0")}`;
}

export function createCase(input: CreateCaseInput, actor: User): CaseRow {
  const household = getHousehold(input.householdId);
  if (!household) throw new CaseError("NOT_FOUND", "Household not found", "householdId");
  const members = householdMembers(household.id);
  const head = members.find((m) => m.role === "HEAD") ?? members[0];
  const applicantPersonId = input.applicantPersonId ?? head?.personId ?? actor.id;
  if (!isStaff(actor) && applicantPersonId !== actor.id) {
    throw new CaseError("VALIDATION_ERROR", "Residents may only submit cases for themselves", "applicantPersonId");
  }
  if (input.intakeData !== undefined && input.intakeData !== null && typeof input.intakeData !== "object") {
    throw new CaseError("VALIDATION_ERROR", "intakeData must be an object", "intakeData");
  }
  const actorType = isStaff(actor) ? "CASEWORKER" : "APPLICANT";

  // 1. Store intakeData verbatim (we only append to displayMeta below).
  const intake: Record<string, unknown> = input.intakeData ? { ...input.intakeData } : {};

  // 3. Link identity verification (before evaluation so the trace can cite it).
  let verification: VerificationRow | undefined;
  if (input.identityVerificationId) {
    verification = getVerificationRow(input.identityVerificationId);
    if (!verification) throw new CaseError("NOT_FOUND", "Identity verification not found", "identityVerificationId");
    if (!isStaff(actor) && verification.user_id !== actor.id) {
      throw new CaseError("VALIDATION_ERROR", "Identity verification belongs to another user", "identityVerificationId");
    }
  } else {
    verification = latestUnlinkedApplicantVerification(applicantPersonId);
  }

  // 2. Demo MAGI evaluator → sectioned trace + determination seeds.
  const evaluation = evaluateCase({
    intakeData: intake,
    applicantPersonId,
    householdMemberPersonIds: members.map((m) => m.personId),
    identity: identityContextFor(verification),
  });

  // 4. Out-of-state Medicaid flag from the linked verification.
  const det = verification ? fromJson<CoverageDetermination>(verification.determination) : null;
  const oos = Boolean(verification && (det?.duplicate_enrollment === true || hasOpenFlag(verification.id)));
  const displayMeta = { ...((intake.displayMeta as Record<string, unknown> | undefined) ?? {}) };
  if (verification?.external_ref) displayMeta.externalRef = verification.external_ref;
  if (oos) {
    const flags = Array.isArray(displayMeta.flags) ? (displayMeta.flags as unknown[]).filter((f) => typeof f === "string") : [];
    if (!flags.includes(OOS_FLAG)) flags.push(OOS_FLAG);
    displayMeta.flags = flags;
  }
  intake.displayMeta = displayMeta;

  const at = now();
  const row: CaseRow = {
    id: randomUUID(),
    customer_id: CUSTOMER_ID,
    case_number: nextCaseNumber(),
    case_type: input.caseType ?? "INITIAL",
    status: "PENDING_VERIFICATION",
    status_reason: null,
    notes: input.notes ?? null,
    flag_reason: oos ? OOS_FLAG_REASON : null,
    intake_data: toJson(intake),
    rule_evaluations: toJson(evaluation.trace),
    rfi_details: null,
    document_id: input.documentId ?? null,
    household_id: household.id,
    applicant_person_id: applicantPersonId,
    linked_case_id: null,
    case_assist_narrative: null,
    case_assist_narrative_source: null,
    case_assist_rec_ids: null,
    income_verification: null,
    asset_verification: null,
    created_at: at,
    updated_at: at,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO medicaid_ee_cases (id, customer_id, case_number, case_type, status, status_reason, notes, flag_reason,
         intake_data, rule_evaluations, rfi_details, document_id, household_id, applicant_person_id, linked_case_id,
         case_assist_narrative, case_assist_narrative_source, case_assist_rec_ids, income_verification, asset_verification,
         created_at, updated_at)
       VALUES (@id, @customer_id, @case_number, @case_type, @status, @status_reason, @notes, @flag_reason,
         @intake_data, @rule_evaluations, @rfi_details, @document_id, @household_id, @applicant_person_id, @linked_case_id,
         @case_assist_narrative, @case_assist_narrative_source, @case_assist_rec_ids, @income_verification, @asset_verification,
         @created_at, @updated_at)`,
    ).run(row);
    for (const seed of evaluation.determinations) {
      db.prepare(
        `INSERT INTO medicaid_ee_determinations (id, customer_id, case_id, person_id, coverage_group, status, category,
           notes, determined_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, NULL, ?, ?)`,
      ).run(randomUUID(), CUSTOMER_ID, row.id, seed.personId, seed.coverageGroup, seed.category, seed.notes, at, at);
    }
    if (verification) {
      db.prepare(`UPDATE verifications SET case_id = ? WHERE id = ?`).run(row.id, verification.id);
      // Proof of disenrollment (and anything else) uploaded through the
      // hosted flow now belongs to the case.
      attachVerificationDocumentsToCase(verification.id, row.id);
      // A CLEAR-verified applicant never types an SSN — carry the verified
      // last-4 onto the person row (only ever four digits; applicant role only).
      if (verification.role === "applicant") {
        const traits = fromJson<SessionTraits>(verification.traits);
        if (setPersonSsnLast4IfEmpty(applicantPersonId, traits?.ssn9?.slice(-4) ?? null)) {
          medicaidAudit({
            eventType: "RECORD_UPDATE",
            action: "PERSON_UPDATED",
            resourceType: RESOURCE_TYPE,
            resourceId: row.id,
            actorId: SYSTEM_ACTOR,
            metadata: { actorType: "SYSTEM", field: "ssnLast4", source: "CLEAR", personId: applicantPersonId },
          });
        }
      }
    }
  });
  tx();

  // 5. Audit trail.
  medicaidAudit({
    eventType: "RECORD_CREATE",
    action: "CASE_CREATED",
    resourceType: RESOURCE_TYPE,
    resourceId: row.id,
    actorId: actor.id,
    metadata: {
      actorType,
      caseNumber: row.case_number,
      caseType: row.case_type,
      householdId: household.id,
      memberCount: members.length,
      hasIntakeData: Boolean(input.intakeData),
    },
  });
  medicaidAudit({
    eventType: "BRE_EVALUATION",
    action: "BRE_EVALUATED",
    resourceType: RESOURCE_TYPE,
    resourceId: row.id,
    actorId: SYSTEM_ACTOR,
    metadata: {
      actorType: "SYSTEM",
      triggeredBy: actor.id,
      breOutcome: evaluation.trace.outcome,
      coverageType: evaluation.determinations.find((d) => d.isPrimary)?.category ?? "MAGI",
      coverageGroup: evaluation.determinations.find((d) => d.isPrimary)?.coverageGroup ?? undefined,
      memberCount: evaluation.determinations.length,
      engineVersion: evaluation.trace.engineVersion,
      rulesPassed: evaluation.trace.summary.passed,
      rulesFailed: evaluation.trace.summary.failed,
    },
  });
  if (verification) {
    medicaidAudit({
      eventType: "RECORD_UPDATE",
      action: "IDENTITY_VERIFICATION_LINKED",
      resourceType: RESOURCE_TYPE,
      resourceId: row.id,
      actorId: SYSTEM_ACTOR,
      metadata: {
        actorType: "SYSTEM",
        triggeredBy: actor.id,
        verificationId: verification.id,
        provider: "CLEAR",
        verificationStatus: verification.status,
        result: det?.result ?? undefined,
        duplicateEnrollment: det?.duplicate_enrollment === true,
        payerState: det?.payer_state ?? undefined,
        flagReason: oos ? OOS_FLAG_REASON : undefined,
      },
    });
  }
  return row;
}

// --- lifecycle ---------------------------------------------------------------------------

function touch(id: string, patch: Partial<Record<keyof CaseRow, unknown>>): CaseRow {
  const sets = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE medicaid_ee_cases SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch,
    updated_at: now(),
    id,
  });
  return getCaseRow(id)!;
}

function transition(id: string, target: CaseStatus, actor: User, reason?: string): CaseRow {
  const current = requireCaseRow(id);
  if (!STATUS_TRANSITIONS[current.status].has(target)) {
    throw new CaseError("INVALID_STATUS_TRANSITION", `Cannot transition from ${current.status} to ${target}`, "status");
  }
  const updated = touch(id, {
    status: target,
    ...(reason !== undefined ? { status_reason: reason } : {}),
  });
  medicaidAudit({
    eventType: "RECORD_UPDATE",
    action: "STATUS_TRANSITION",
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    actorId: actor.id,
    metadata: { actorType: "CASEWORKER", fromStatus: current.status, toStatus: target, reason },
  });
  return updated;
}

export function queueForReview(id: string, actor: User): CaseRow {
  return transition(id, "IN_REVIEW", actor);
}

export function approveCase(id: string, actor: User): CaseRow {
  const updated = transition(id, "APPROVED", actor);
  const { effectiveDate, expirationDate } = coverageDates();
  const at = now();
  db.prepare(
    `UPDATE medicaid_ee_determinations
     SET status = 'ELIGIBLE', effective_date = ?, expiration_date = ?, denial_reason = NULL, determined_at = ?,
         determined_by = ?, updated_at = ?
     WHERE case_id = ?`,
  ).run(effectiveDate, expirationDate, at, actor.id, at, id);
  return getCaseRow(updated.id)!;
}

export function denyCase(id: string, reason: string, actor: User): CaseRow {
  if (!reason || !reason.trim()) throw new CaseError("VALIDATION_ERROR", "A denial reason is required", "reason");
  const updated = transition(id, "DENIED", actor, reason.trim());
  const at = now();
  db.prepare(
    `UPDATE medicaid_ee_determinations
     SET status = 'INELIGIBLE', effective_date = NULL, expiration_date = NULL, denial_reason = ?, determined_at = ?,
         determined_by = ?, updated_at = ?
     WHERE case_id = ?`,
  ).run(reason.trim(), at, actor.id, at, id);
  return getCaseRow(updated.id)!;
}

export function cancelCase(id: string, reason: string, actor: User): CaseRow {
  return transition(id, "CANCELED", actor, reason);
}

export function issueRfi(
  input: { id: string; itemsRequested: string[]; deadline: string; noteToApplicant?: string | null },
  actor: User,
): CaseRow {
  const current = requireCaseRow(input.id);
  if (isTerminalStatus(current.status)) {
    throw new CaseError("INVALID_STATUS_TRANSITION", "Cannot issue an RFI on a case in a terminal status", "status");
  }
  if (current.flag_reason?.startsWith(RFI_FLAG_PREFIX)) {
    throw new CaseError("RFI_ALREADY_PENDING", "Case already has a pending RFI; resolve it before issuing another", "flagReason");
  }
  const items = (input.itemsRequested ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) throw new CaseError("VALIDATION_ERROR", "itemsRequested must be non-empty", "itemsRequested");
  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime())) throw new CaseError("VALIDATION_ERROR", "deadline must be a valid date", "deadline");
  if (deadline.getTime() <= Date.now()) throw new CaseError("VALIDATION_ERROR", "deadline must be in the future", "deadline");

  const rfi: RfiDetails & { priorFlagReason: string | null } = {
    itemsRequested: items,
    deadline: deadline.toISOString(),
    noteToApplicant: input.noteToApplicant ?? null,
    issuedAt: now(),
    issuedBy: actor.id,
    renewalFormDocumentId: null,
    priorFlagReason: current.flag_reason,
  };
  const updated = touch(input.id, { flag_reason: RFI_PENDING_FLAG, rfi_details: toJson(rfi) });
  medicaidAudit({
    eventType: "RECORD_UPDATE",
    action: "ISSUE_RFI",
    resourceType: RESOURCE_TYPE,
    resourceId: input.id,
    actorId: actor.id,
    metadata: {
      actorType: "CASEWORKER",
      itemsRequested: items.join(" | "),
      itemsRequestedCount: items.length,
      deadline: rfi.deadline,
      noteToApplicant: rfi.noteToApplicant ?? undefined,
    },
  });
  return updated;
}

export function resolveRfi(input: { id: string; resolution?: string | null }, actor: User): CaseRow {
  const current = requireCaseRow(input.id);
  if (!current.flag_reason?.startsWith(RFI_FLAG_PREFIX)) {
    throw new CaseError("VALIDATION_ERROR", "Case has no pending RFI to resolve", "flagReason");
  }
  const prior = fromJson<RfiDetails & { priorFlagReason?: string | null }>(current.rfi_details);
  const updated = touch(input.id, { flag_reason: null, rfi_details: null });
  medicaidAudit({
    eventType: "RECORD_UPDATE",
    action: "RESOLVE_RFI",
    resourceType: RESOURCE_TYPE,
    resourceId: input.id,
    actorId: actor.id,
    metadata: {
      actorType: "CASEWORKER",
      priorFlagReason: current.flag_reason,
      priorItemsRequestedCount: prior?.itemsRequested?.length,
      priorDeadline: prior?.deadline,
      resolution: input.resolution ?? undefined,
    },
  });
  return updated;
}

// --- Argyle mocks -------------------------------------------------------------------------

function monthlyIncomeDollars(row: CaseRow): number {
  const intake = fromJson<Record<string, unknown>>(row.intake_data) ?? {};
  const m = intake.monthlyHouseholdIncome;
  if (typeof m === "number" && m > 0) return m;
  const applicant = (intake.applicant ?? {}) as Record<string, unknown>;
  const a = applicant.annualIncome;
  return typeof a === "number" && a > 0 ? a / 12 : 2_450;
}

export function argyleCreateUser(id: string): CaseRow {
  const row = requireCaseRow(id);
  const existing = fromJson<IncomeVerification>(row.income_verification);
  if (existing) return row;
  const pending: IncomeVerification = {
    status: "PENDING",
    employer: null,
    employmentType: null,
    incomeAnnual: null,
    incomeMonthly: null,
    hoursPerWeek: null,
    payFrequency: null,
    lastPaystubDate: null,
    verifiedAt: null,
  };
  return touch(id, { income_verification: toJson(pending) });
}

export function argylePayrollLinkToken(id: string): { row: CaseRow; token: string } {
  const row = argyleCreateUser(id);
  const existing = fromJson<IncomeVerification>(row.income_verification)!;
  const updated = existing.status === "PENDING" ? touch(id, { income_verification: toJson({ ...existing, status: "CONNECTED" }) }) : row;
  return { row: updated, token: `argyle_link_demo_${randomUUID().replace(/-/g, "").slice(0, 24)}` };
}

export function argyleVerifyIncome(id: string, actor: User): CaseRow {
  const row = requireCaseRow(id);
  const monthly = monthlyIncomeDollars(row);
  const verified: IncomeVerification = {
    status: "VERIFIED",
    employer: { name: "Springfield Municipal Services", logoUrl: null },
    employmentType: "Full-time",
    incomeAnnual: Math.round(monthly * 12 * 100),
    incomeMonthly: Math.round(monthly * 100),
    hoursPerWeek: 40,
    payFrequency: "Biweekly",
    lastPaystubDate: new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10),
    verifiedAt: now(),
  };
  const updated = touch(id, { income_verification: toJson(verified) });
  medicaidAudit({
    eventType: "VERIFICATION",
    action: "RECEIVE_VERIFICATION",
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    actorId: SYSTEM_ACTOR,
    metadata: { actorType: "SYSTEM", triggeredBy: actor.id, service: "ARGYLE", verificationType: "INCOME", result: "VERIFIED" },
  });
  return updated;
}

export function argyleBankingConnectUrl(id: string): { row: CaseRow; url: string } {
  const row = requireCaseRow(id);
  const existing = fromJson<AssetVerification>(row.asset_verification);
  const updated = existing
    ? row
    : touch(id, { asset_verification: toJson({ status: "PENDING", totalAssets: null, accounts: [], verifiedAt: null }) });
  return { row: updated, url: `https://connect.argyle.com/demo/banking?case=${encodeURIComponent(id)}` };
}

export function argyleVerifyAssets(id: string, actor: User): CaseRow {
  requireCaseRow(id);
  const verified: AssetVerification = {
    status: "VERIFIED",
    totalAssets: 1_450,
    accounts: [
      { institutionName: "Springfield Community Credit Union", accountType: "Checking", balance: 1_120 },
      { institutionName: "Springfield Community Credit Union", accountType: "Savings", balance: 330 },
    ],
    verifiedAt: now(),
  };
  const updated = touch(id, { asset_verification: toJson(verified) });
  medicaidAudit({
    eventType: "VERIFICATION",
    action: "RECEIVE_VERIFICATION",
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    actorId: SYSTEM_ACTOR,
    metadata: { actorType: "SYSTEM", triggeredBy: actor.id, service: "AVS", verificationType: "ASSETS", result: "VERIFIED" },
  });
  return updated;
}

// --- Verify Assist flag ↔ case flag sync ------------------------------------------------------

/**
 * Keep the case's `OOS-MCD` chip and `flagReason` in step with the Verify
 * Assist flag. Called by `updateFlag` (REST PATCH and the GraphQL mutation):
 * a flag that is resolved/dismissed clears the chip and the reason; a flag
 * that (re)opens puts them back. No-op when nothing changes. Writes a
 * `CASE_FLAG_UPDATED` audit row so the timeline shows the case update.
 */
export function syncOutOfStateCaseFlag(caseId: string, flagOpen: boolean, flagStatus: string, actor: User): CaseRow | null {
  const row = getCaseRow(caseId);
  if (!row) return null;
  const intake = fromJson<Record<string, unknown>>(row.intake_data) ?? {};
  const displayMeta = { ...((intake.displayMeta as Record<string, unknown> | undefined) ?? {}) };
  const flags = Array.isArray(displayMeta.flags) ? (displayMeta.flags as unknown[]).filter((f): f is string => typeof f === "string") : [];
  const hasChip = flags.includes(OOS_FLAG);
  const hasReason = row.flag_reason === OOS_FLAG_REASON;

  const patch: Partial<Record<keyof CaseRow, unknown>> = {};
  if (flagOpen && !hasChip) {
    displayMeta.flags = [...flags, OOS_FLAG];
    patch.intake_data = toJson({ ...intake, displayMeta });
    if (!row.flag_reason) patch.flag_reason = OOS_FLAG_REASON;
  } else if (!flagOpen && (hasChip || hasReason)) {
    if (hasChip) {
      displayMeta.flags = flags.filter((f) => f !== OOS_FLAG);
      patch.intake_data = toJson({ ...intake, displayMeta });
    }
    if (hasReason) patch.flag_reason = null;
  }
  // The Evaluate step's "Coverage discovery" row follows the flag too — even
  // when the chip/reason were already in the right state.
  const traceChanged = refreshCoverageDiscoveryTrace(caseId);
  if (Object.keys(patch).length === 0) return traceChanged ? getCaseRow(caseId)! : row;

  const updated = touch(caseId, patch);
  medicaidAudit({
    eventType: "RECORD_UPDATE",
    action: "CASE_FLAG_UPDATED",
    resourceType: RESOURCE_TYPE,
    resourceId: caseId,
    actorId: actor.id,
    metadata: {
      actorType: "CASEWORKER",
      flag: OOS_FLAG,
      flagAction: flagOpen ? "added" : "removed",
      verifyAssistFlagStatus: flagStatus,
    },
  });
  return updated;
}

// --- Case Assist cache ------------------------------------------------------------------------

export function saveCaseAssistNarrative(id: string, narrative: string, source: string, recIds: string[]): void {
  db.prepare(
    `UPDATE medicaid_ee_cases SET case_assist_narrative = ?, case_assist_narrative_source = ?, case_assist_rec_ids = ? WHERE id = ?`,
  ).run(narrative, source, toJson(recIds), id);
}

/**
 * Boot-time backfill: cases whose Verify Assist flag was resolved/dismissed
 * before flag→case syncing existed still carry the OOS-MCD chip and
 * flagReason. Re-run the sync for every linked case so the caseworker UI
 * never shows a lingering finding. Idempotent (no-op when nothing changes).
 */
export function backfillOutOfStateCaseFlags(): number {
  const rows = db
    .prepare(
      `SELECT v.case_id AS caseId,
              SUM(CASE WHEN f.status IN ('open','in_review') THEN 1 ELSE 0 END) AS openCount,
              COUNT(f.id) AS flagCount
       FROM verifications v JOIN flags f ON f.verification_id = v.id
       WHERE v.case_id IS NOT NULL AND f.type = 'out_of_state_medicaid'
       GROUP BY v.case_id`,
    )
    .all() as Array<{ caseId: string; openCount: number; flagCount: number }>;
  const system: User = {
    id: "system",
    role: "admin",
    email: "system@state-x.gov",
    firstName: "System",
    lastName: "Backfill",
    createdAt: now(),
  };
  let changed = 0;
  for (const r of rows) {
    if (r.flagCount === 0) continue;
    const before = getCaseRow(r.caseId);
    if (!before) continue;
    const open = r.openCount > 0;
    const after = syncOutOfStateCaseFlag(r.caseId, open, open ? "open" : "resolved", system);
    if (after && (after.flag_reason !== before.flag_reason || after.intake_data !== before.intake_data)) changed++;
  }
  return changed;
}
