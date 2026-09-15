/**
 * TypeScript types for E&E (Eligibility & Enrollment) domain.
 *
 * Derived from medicaid-ee-service and household-service GraphQL schemas.
 * Nullability matches GraphQL schema exactly.
 */

/**
 * Display fallback when an applicant's name is not yet known (e.g. before
 * PersonalInfo has been submitted). Shared across the admin app so all
 * surfaces display the same string. Extracted per coding-standards.md § C.1
 * (≥3 sites threshold met by WorkspacePage, CaseHeader, DashboardPage).
 */
export const UNKNOWN_APPLICANT = 'Unknown' as const;

/** Medicaid application processing SLA in calendar days (per program policy). */
export const EE_SLA_DAYS = 90;

// Caseworker action strings — shared between DashboardPage and its test suite (C.1).
export const ACTION_REVIEW_INCOME = 'Review income verification' as const;
export const ACTION_REVIEW_DETERMINE = 'Review & determine' as const;
export const ACTION_REVIEW_DISABILITY = 'Review disability documentation' as const;

// Enums

export type EECaseStatus = 'PENDING_VERIFICATION' | 'IN_REVIEW' | 'APPROVED' | 'DENIED' | 'CANCELED';

export type EECaseType = 'INITIAL' | 'RENEWAL' | 'REDETERMINATION' | 'APPEAL';

export type DeterminationStatus = 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE' | 'DEFERRED';

export type EligibilityCategory = 'MAGI' | 'NON_MAGI';

/**
 * `workflowStatus` is a display-only label stored on intakeData.displayMeta
 * (not part of the EE service's canonical status enum). Caseworker-facing
 * surfaces (Dashboard tiles, CaseNavBar, ApplicantSidebar, EEStatusBadge,
 * CompletedCaseDetail) all derive copy + tone from these literals — extract
 * to constants so the strings stay synchronized when labels change.
 */
export const WORKFLOW_STATUS_ACTION_NEEDED = 'Action Needed' as const;
export const WORKFLOW_STATUS_WAITING_APPLICANT = 'Waiting on Applicant' as const;
export const WORKFLOW_STATUS_AUTO_APPROVED = 'Auto-Approved' as const;
export const WORKFLOW_STATUS_AUTO_ENROLLED = 'Auto-Enrolled' as const;

export type WorkflowStatus =
  | typeof WORKFLOW_STATUS_ACTION_NEEDED
  | typeof WORKFLOW_STATUS_WAITING_APPLICANT
  | typeof WORKFLOW_STATUS_AUTO_APPROVED
  | typeof WORKFLOW_STATUS_AUTO_ENROLLED;

/**
 * Resolve the caseworker-facing approval label for a case.
 *
 * `case.status` is the source of truth for terminal lifecycle state;
 * `displayMeta.workflowStatus` is denormalized presentation metadata that is
 * not rewritten when a case is approved/denied. A completed case (APPROVED /
 * DENIED) must therefore never render an active label like "Action Needed" —
 * the contradiction reported in ENG-1810. Terminal status wins; the stored
 * `workflowStatus` only refines the *non-terminal* display.
 *
 * The Auto-Approved / Auto-Enrolled labels are themselves terminal+positive,
 * so they are preserved on APPROVED cases to keep the auto-processing
 * distinction; any other value on a terminal case collapses to Approved/Denied.
 */
export function deriveApprovalLabel(workflowStatus: string | null, caseStatus: EECaseStatus): string {
  if (caseStatus === 'DENIED') return 'Denied';
  if (caseStatus === 'APPROVED') {
    return workflowStatus === WORKFLOW_STATUS_AUTO_APPROVED || workflowStatus === WORKFLOW_STATUS_AUTO_ENROLLED
      ? workflowStatus
      : 'Approved';
  }
  return workflowStatus ?? WORKFLOW_STATUS_ACTION_NEEDED;
}

export type EEErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNIQUE_CONSTRAINT'
  | 'INVALID_STATUS_TRANSITION'
  | 'CONCURRENT_MODIFICATION'
  | 'RFI_ALREADY_PENDING'
  | 'EVALUATION_FAILED'
  | 'DOCUMENT_COPY_FAILED'
  | 'DOCUMENT_SCAN_PENDING';

// Argyle income verification types
//
// ⚠️ UNIT DIVERGENCE — DO NOT mix these in shared formatters:
//   IncomeVerification.incomeAnnual / incomeMonthly  → cents   (Argyle payroll webhook)
//   AssetAccount.balance / AssetVerification.totalAssets → dollars (Argyle banking webhook)
// Backend GraphQL types both report `Int` so the wire format gives no hint. Until
// the backend unifies units (or these are wrapped in branded Cents/Dollars types),
// any formatter that touches both must convert explicitly per-field. Field-level
// JSDoc below states the unit for each.

export type IncomeVerificationStatus = 'PENDING' | 'CONNECTED' | 'VERIFIED' | 'FAILED';

export type AssetVerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

export interface IncomeVerificationEmployer {
  name: string;
  logoUrl: string | null;
}

export interface IncomeVerification {
  status: IncomeVerificationStatus;
  employer: IncomeVerificationEmployer | null;
  employmentType: string | null;
  /** Annual gross income in cents (e.g. 5500000 = $55,000/yr). */
  incomeAnnual: number | null;
  /** Monthly gross income in cents (e.g. 458300 = $4,583/mo). */
  incomeMonthly: number | null;
  hoursPerWeek: number | null;
  payFrequency: string | null;
  lastPaystubDate: string | null;
  verifiedAt: string | null;
}

export interface AssetAccount {
  institutionName: string;
  accountType: string;
  /** Account balance in dollars (Argyle banking webhook returns dollar amounts). */
  balance: number;
}

export interface AssetVerification {
  status: AssetVerificationStatus;
  /** Total countable assets in dollars (Argyle banking webhook returns dollar amounts). */
  totalAssets: number | null;
  accounts: AssetAccount[];
  verifiedAt: string | null;
}

// PersonRecord — from identity-service via medicaid-ee-service determination.person.
export interface PersonAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface PersonRecord {
  personId: string;
  policyId: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  suffix: string | null;
  dateOfBirth: string | null;
  preferredLanguage: string | null;
  ssnLast4: string | null;
  addresses: PersonAddress[];
  emails: Array<{ value: string }>;
  phones: Array<{ value: string }>;
}

export type HouseholdMemberRole = 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER_ADULT' | 'OTHER_DEPENDENT';

export interface EEHouseholdMember {
  id: string;
  role: HouseholdMemberRole;
  relationshipToHead: string | null;
  startDate: string;
  person: { personId: string } | null;
}

export interface EEHousehold {
  id: string;
  customerId: string;
  members: EEHouseholdMember[];
}

// E&E Domain Types

export interface EEDetermination {
  id: string;
  customerId: string;
  caseId: string;
  personId: string | null;
  coverageGroup: string | null;
  person: PersonRecord | null;
  status: DeterminationStatus;
  category: EligibilityCategory;
  effectiveDate: string | null;
  expirationDate: string | null;
  denialReason: string | null;
  notes: string | null;
  determinedAt: string | null;
  determinedBy: string | null;
  // determinedBy is also queried for the activity log timeline.
  createdAt: string;
  updatedAt: string;
}

export interface EERfiDetails {
  itemsRequested: string[];
  /** ISO 8601 datetime string. */
  deadline: string;
  noteToApplicant: string | null;
  /** ISO 8601 datetime string. */
  issuedAt: string;
  /** Opaque caseworker actor id (admin id). */
  issuedBy: string;
}

// ── Verify Assist (CLEAR) identity verification + Case Assist ───────────────
//
// Shapes mirror docs/api-contract.md "Additions to the supergraph shapes".
// Field names are snake_case where the server passes CLEAR traits through
// verbatim (document / coverage traits) — keep them as-is so the GraphQL
// selection in ee-operations.ts and these types cannot drift.

/** CLEAR session status. */
export type IdentityVerificationStatus = 'awaiting_user' | 'in_progress' | 'success' | 'failed' | 'expired';

/** Verify Assist flag lifecycle (ht-clear admin flags). */
export type VerifyAssistFlagStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

/** Flag statuses that still need caseworker attention. */
export const VERIFY_ASSIST_FLAG_ACTIVE_STATUSES: ReadonlyArray<string> = ['open', 'in_review'];

/** Client-derived flag chip: identity verified by CLEAR. */
export const EE_FLAG_ID_CLEAR = 'ID-CLEAR' as const;
/** Server-set flag chip (intakeData.displayMeta.flags): out-of-state Medicaid coverage found. */
export const EE_FLAG_OOS_MCD = 'OOS-MCD' as const;

export interface VerificationCheck {
  /** e.g. selfie_liveness | document_authenticity | selfie_document_match */
  name: string;
  status: string;
}

export interface DocumentTraits {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  document_type: string | null;
  issuing_state: string | null;
  document_number_last4: string | null;
  expiration_date: string | null;
  gender: string | null;
}

export interface IdentityTraits {
  document: DocumentTraits | null;
  phone: string | null;
  ssnLast4: string | null;
}

export interface HealthInsuranceTraits {
  payer_id: string | null;
  payer_name: string | null;
  plan_status: string | null;
  insurance_member_id: string | null;
  policy_holder_first_name: string | null;
  policy_holder_last_name: string | null;
  coverage_start_date: string | null;
}

export interface CoverageDetermination {
  /** issue_found | clear */
  result: string;
  duplicate_enrollment: boolean;
  payer_state: string | null;
  payer_state_name: string | null;
  /** Staff-only; null for residents. */
  coverage: HealthInsuranceTraits | null;
}

export interface FlagNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface VerifyAssistFlag {
  id: string;
  type: string;
  status: VerifyAssistFlagStatus | string;
  assignee: string | null;
  dispositionReason: string | null;
  details: unknown;
  notes: FlagNote[];
  createdAt: string;
  updatedAt: string;
}

/** Proof of disenrollment uploaded in the Verify Assist hosted flow. */
export interface VerificationProofDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Same-origin URL streaming the bytes (owner or staff). */
  url: string;
}

/** A document attached to the case (demo additions on the supergraph shape). */
export interface CaseDocumentRecord {
  id: string;
  caseId: string;
  s3Key: string;
  /** e.g. proof-of-disenrollment | proof-of-residence */
  documentCategory: string;
  createdAt: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** verify_assist | resident_upload */
  source: string;
  url: string;
}

export interface IdentityVerification {
  id: string;
  /** "CLEAR" */
  provider: string;
  status: IdentityVerificationStatus | string;
  /** "mock" | "sandbox" */
  mode: string;
  subjectName: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Curated identity-relevant checks (server folds the rest into checksSummary). */
  checks: VerificationCheck[];
  /** e.g. "8 identity checks passed · 13 additional CLEAR checks passed · 3 not applicable" */
  checksSummary?: string | null;
  traits: IdentityTraits | null;
  determination: CoverageDetermination | null;
  /** Applicant's self-resolution in the hosted flow: ended_submit_proof | confirm_enrolled | null */
  resolution: string | null;
  /** Set when the applicant chose ended_submit_proof and uploaded a file. */
  proofDocument?: VerificationProofDocument | null;
  /** Staff-only; null for residents. */
  flag: VerifyAssistFlag | null;
}

/** Narrowed identityVerification selection used by the case list. */
export interface IdentityVerificationListSummary {
  status: IdentityVerification['status'];
  subjectName: string | null;
  determination: Pick<CoverageDetermination, 'duplicate_enrollment' | 'payer_state'> | null;
  flag: Pick<VerifyAssistFlag, 'status'> | null;
}

export type CaseAssistSeverity = 'critical' | 'warning' | 'info';

export interface CaseAssistRationale {
  summary: string;
  citedFieldPaths: string[];
}

export interface CaseAssistRecommendation {
  id: string;
  /** guidance | draft_task | draft_notice */
  type: string;
  /** 1 act now, 2 soon, 3 fyi */
  priority: number;
  severity: CaseAssistSeverity | string;
  /** verify_assist | rules | intake */
  source: string;
  title: string;
  body: string;
  rationale: CaseAssistRationale;
  suggestedActions: string[];
}

export interface CaseAssistResult {
  recommendations: CaseAssistRecommendation[];
  narrative: string | null;
  /** "claude" | "template" */
  narrativeSource: string;
  generatedAt: string;
}

/** True when the linked CLEAR verification found active out-of-state Medicaid coverage. */
export function hasOutOfStateCoverage(
  iv: { determination: { duplicate_enrollment: boolean } | null } | null | undefined,
): boolean {
  return iv?.determination?.duplicate_enrollment === true;
}

/**
 * True when the out-of-state finding still needs caseworker action: the
 * verification found duplicate enrollment and the Verify Assist flag is
 * open / in review (or the flag row hasn't been materialised yet).
 */
export function hasOpenOutOfStateFlag(
  iv: { determination: { duplicate_enrollment: boolean } | null; flag: { status: string } | null } | null | undefined,
): boolean {
  if (!hasOutOfStateCoverage(iv)) return false;
  const status = iv?.flag?.status ?? 'open';
  return VERIFY_ASSIST_FLAG_ACTIVE_STATUSES.includes(status);
}

/** True when CLEAR completed the identity verification successfully. */
export function isIdentityVerified(iv: { status: string } | null | undefined): boolean {
  return iv?.status === 'success';
}

export interface EECase {
  id: string;
  customerId: string;
  householdId: string;
  household: EEHousehold;
  caseNumber: string | null;
  caseType: EECaseType;
  status: EECaseStatus;
  statusReason: string | null;
  notes: string | null;
  flagReason: string | null;
  intakeData: Record<string, unknown> | null;
  ruleEvaluations: Record<string, unknown>[] | null;
  rfiDetails: EERfiDetails | null;
  documentId: string | null;
  linkedCaseId: string | null;
  linkedCase: EECase | null;
  caseAssistNarrative: string | null;
  determinations: EEDetermination[];
  incomeVerification: IncomeVerification | null;
  assetVerification: AssetVerification | null;
  /** Documents attached to the case (proof of disenrollment, resident uploads). */
  documents?: CaseDocumentRecord[];
  /**
   * CLEAR / Verify Assist verification linked to the case (null until the
   * server links one). Optional in the TS type so pre-existing fixtures that
   * build EECase literals keep compiling; the GraphQL selection always asks
   * for it.
   */
  identityVerification?: IdentityVerification | null;
  /** Rule-based Case Assist findings + narrative. Non-null on the wire; optional here for fixtures. */
  caseAssist?: CaseAssistResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface EEError {
  code: EEErrorCode;
  field: string | null;
  message: string;
}
