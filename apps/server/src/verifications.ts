import { curateChecks } from "./clear/check-curation.js";
import { db, fromJson } from "./db.js";
import type {
  Determination,
  SessionTraits,
  VerificationCheck,
  VerificationRole,
  VerificationStatus,
} from "./clear/types.js";

export interface VerificationRow {
  id: string;
  user_id: string;
  external_ref: string | null;
  role: VerificationRole;
  subject_name: string | null;
  status: VerificationStatus;
  hosted_url: string;
  mock_token: string | null;
  clear_session_id: string | null;
  checks: string;
  traits: string | null;
  determination: string | null;
  resolution: string | null;
  clear_hosted_url: string | null;
  images: string | null;
  case_id: string | null;
  /** documents.id of the proof of disenrollment uploaded in the hosted flow. */
  proof_document_id?: string | null;
  created_at: string;
  completed_at: string | null;
}

// Redacted traits shape returned by every endpoint: full ssn9 never leaves the
// server (verify-assist-planning.md SSN posture).
export type RedactedTraits = Omit<SessionTraits, "ssn9"> & { ssnLast4: string | null };

export function redactTraits(traits: SessionTraits | null): RedactedTraits | null {
  if (!traits) return null;
  const { ssn9, ...rest } = traits;
  return { ...rest, ssnLast4: ssn9 ? ssn9.slice(-4) : null };
}

export interface Verification {
  id: string;
  externalRef: string | null;
  userId: string;
  caseId: string | null;
  role: VerificationRole;
  subjectName: string | null;
  status: VerificationStatus;
  hostedUrl: string;
  createdAt: string;
  completedAt: string | null;
  checks: VerificationCheck[];
  traits: RedactedTraits | null;
  determination: Determination | null;
  /** Applicant's choice from the hosted flow: 'ended_submit_proof' | 'confirm_enrolled'. */
  resolution: string | null;
  /** Document id of the proof of disenrollment, when one was uploaded. */
  proofDocumentId: string | null;
}

/**
 * Resident-facing view: identity traits plus the computed determination —
 * mirroring the legacy component contract, where the verification service
 * returns its determination (with the coverage it found inside it) and the
 * host application renders the applicant-facing alert as-is. Raw
 * `traits.health_insurance` and flags stay staff-only.
 */
export type ResidentVerification = Omit<Verification, "traits"> & {
  traits: Omit<RedactedTraits, "health_insurance"> | null;
};

export function toResidentVerification(row: VerificationRow): ResidentVerification {
  const { traits, ...rest } = toVerification(row);
  // Applicants (and the hosted flow's Results step) see only the curated
  // identity checks — never the phone-line / device / NFC noise.
  const checks = curateChecks(rest.checks).shown;
  if (!traits) return { ...rest, checks, traits: null };
  const { health_insurance: _healthInsurance, ...identityTraits } = traits;
  return { ...rest, checks, traits: identityTraits };
}

export function toVerification(row: VerificationRow): Verification {
  return {
    id: row.id,
    externalRef: row.external_ref,
    userId: row.user_id,
    caseId: row.case_id,
    role: row.role,
    subjectName: row.subject_name,
    status: row.status,
    hostedUrl: row.hosted_url,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    checks: fromJson<VerificationCheck[]>(row.checks) ?? [],
    traits: redactTraits(fromJson<SessionTraits>(row.traits)),
    determination: fromJson<Determination>(row.determination),
    resolution: row.resolution,
    proofDocumentId: row.proof_document_id ?? null,
  };
}

export function getVerificationRow(id: string): VerificationRow | undefined {
  return db.prepare(`SELECT * FROM verifications WHERE id = ?`).get(id) as VerificationRow | undefined;
}

/** Most recent verification linked to an E&E case (null until createMedicaidEeCase links one). */
export function verificationForCase(caseId: string): VerificationRow | undefined {
  return db
    .prepare(`SELECT * FROM verifications WHERE case_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(caseId) as VerificationRow | undefined;
}

/** Fallback link target: the user's newest completed applicant verification not yet tied to a case. */
export function latestUnlinkedApplicantVerification(userId: string): VerificationRow | undefined {
  return db
    .prepare(
      `SELECT * FROM verifications WHERE user_id = ? AND role = 'applicant' AND status = 'success' AND case_id IS NULL
       ORDER BY completed_at DESC, created_at DESC LIMIT 1`,
    )
    .get(userId) as VerificationRow | undefined;
}

export interface RunRow {
  id: string;
  verification_id: string;
  seq: number;
  type: "initial" | "monitoring";
  status: string;
  determination: string | null;
  coverage: string | null;
  created_at: string;
}

export function toRun(row: RunRow) {
  return {
    id: row.id,
    verificationId: row.verification_id,
    seq: row.seq,
    type: row.type,
    status: row.status,
    determination: fromJson<Determination>(row.determination),
    coverage: fromJson(row.coverage),
    createdAt: row.created_at,
  };
}

export interface FlagNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export type FlagStatus = "open" | "in_review" | "resolved" | "dismissed";

export interface FlagRow {
  id: string;
  verification_id: string;
  external_ref: string | null;
  type: string;
  status: FlagStatus;
  assignee: string | null;
  disposition_reason: string | null;
  details: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Flag {
  id: string;
  verificationId: string;
  externalRef: string | null;
  type: string;
  status: FlagStatus;
  assignee: string | null;
  dispositionReason: string | null;
  details: Record<string, unknown>;
  notes: FlagNote[];
  createdAt: string;
  updatedAt: string;
}

export function toFlag(row: FlagRow): Flag {
  return {
    id: row.id,
    verificationId: row.verification_id,
    externalRef: row.external_ref,
    type: row.type,
    status: row.status,
    assignee: row.assignee,
    dispositionReason: row.disposition_reason,
    details: fromJson<Record<string, unknown>>(row.details) ?? {},
    notes: fromJson<FlagNote[]>(row.notes) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getFlagRow(id: string): FlagRow | undefined {
  return db.prepare(`SELECT * FROM flags WHERE id = ?`).get(id) as FlagRow | undefined;
}

export function flagsForVerification(verificationId: string): FlagRow[] {
  return db.prepare(`SELECT * FROM flags WHERE verification_id = ? ORDER BY created_at`).all(verificationId) as FlagRow[];
}

/** The flag staff work for a verification: the open/in_review one, else the newest. */
export function primaryFlagForVerification(verificationId: string): FlagRow | undefined {
  return db
    .prepare(
      `SELECT * FROM flags WHERE verification_id = ?
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_review' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
    )
    .get(verificationId) as FlagRow | undefined;
}

export function hasOpenFlag(verificationId: string): boolean {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM flags WHERE verification_id = ? AND status IN ('open','in_review') LIMIT 1`)
      .get(verificationId),
  );
}

export function runsForVerification(verificationId: string): RunRow[] {
  return db.prepare(`SELECT * FROM runs WHERE verification_id = ? ORDER BY seq`).all(verificationId) as RunRow[];
}
