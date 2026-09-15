// Shapes mirror the real CLEAR Verified API objects (docs.clearme.com).
// traits.document / traits.health_insurance are kept schema-identical so the
// demo enrichment layer can swap values without changing the data contract.
// Ported from legacy/ga-gateway-demo/lib/types.ts.

export interface DocumentTraits {
  document_type: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  dob: string; // ISO yyyy-mm-dd
  sex: string | null;
  address_1: string;
  address_2: string | null;
  city: string;
  subdivision: string; // state code
  postal_code: string;
  country: string;
  document_number: string;
  issuing_subdivision: string;
  issuing_country: string;
  issued_date: string | null;
  expiration_date: string;
}

export interface HealthInsuranceTraits {
  payer_id: string | null;
  payer_name: string | null;
  plan_status: string | null;
  group_name: string | null;
  group_id: string | null;
  insurance_member_id: string | null;
  policy_holder_first_name: string | null;
  policy_holder_last_name: string | null;
  /** ISO yyyy-mm-dd; CLEAR's coverage payload carries it when the payer reports one. */
  coverage_start_date?: string | null;
  // ── Demo extensions ── not part of CLEAR's payload (null on real runs). They
  // let the employer-plan storyline prefill the wizard's insurance step.
  /** Wizard "type of coverage" value: employer | marketplace | medicare | tricare | private | medicaid | other. */
  coverage_type?: string | null;
  /** Policy holder's relationship to the applicant when someone else holds the policy (e.g. "spouse"). */
  policy_holder_relationship?: string | null;
  /** Monthly premium in whole dollars. */
  monthly_premium?: number | null;
}

export interface VerificationCheck {
  /** Human-readable in the real API ("Selfie passes liveness check"). */
  name: string;
  /** Real API: "completed" | "failed"…; pass/fail is carried by `value`. */
  status: string;
  /** Check outcome in the real API; absent in legacy mock data. */
  value?: boolean | null;
}

export type SessionStatus = "awaiting_user" | "in_progress" | "success" | "failed" | "expired";

// A verification row's status (same vocabulary as a CLEAR session).
export type VerificationStatus = SessionStatus;

// Output of the coverage rules, computed server-side and returned to both
// frontends. The frontends render it — they never run rules themselves.
export interface Determination {
  result: "issue_found" | "clear";
  duplicate_enrollment: boolean;
  payer_state: string | null; // e.g. "SC"
  payer_state_name: string | null; // e.g. "South Carolina"
  coverage: HealthInsuranceTraits | null;
  /** Mirror of coverage.coverage_type (employer | medicaid | …) for consumers that only read the determination. */
  coverage_type?: string | null;
}

export interface SessionTraits {
  document: DocumentTraits | null;
  email?: { address: string | null } | null;
  phone?: { number: string | null } | null;
  health_insurance?: HealthInsuranceTraits | null;
  ssn9?: string | null;
}

// The subset of a CLEAR verification-session object the pipeline consumes.
export interface ClearSession {
  id: string;
  status: SessionStatus;
  checks: VerificationCheck[];
  traits: SessionTraits | null;
  images?: VerificationImages | null;
}

/**
 * Captured verification imagery. Mock mode: real webcam captures as image
 * data URLs. Sandbox mode: CLEAR's Standard Integration API redacts image
 * bytes (document_front/back arrive as "REDACTED"; face_scan_preview is an
 * opaque reference) — non-redacted values pass through verbatim if the CLEAR
 * project has image entitlement.
 */
export interface VerificationImages {
  selfie: string | null;
  document_front: string | null;
  document_back: string | null;
  /** CLEAR's face-scan reference id when image bytes are withheld. */
  face_scan_preview_ref: string | null;
  source: "mock-capture" | "clear";
}

// Who is being verified — drives which demo identity the enrichment applies.
export type VerificationRole = "applicant" | "household";
