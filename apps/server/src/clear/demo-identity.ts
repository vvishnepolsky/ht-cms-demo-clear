import type {
  ClearSession,
  DocumentTraits,
  HealthInsuranceTraits,
  VerificationCheck,
  VerificationRole,
} from "./types.js";

// Deterministic demo identities. Sandbox returns "John Doe", so after a
// successful real round-trip we overlay these values — same schema, demo data.
// Applied in mock mode (no CLEAR behind it) or when DEMO_ENRICHMENT=true.
// The overlay touches identity + coverage traits only.

// Identity 1 — primary applicant. State-X resident with ACTIVE South Carolina
// Medicaid (out-of-state relative to the SX tenant) → drives the
// duplicate-enrollment finding deterministically.
export const DEMO_DOCUMENT: DocumentTraits = {
  document_type: "drivers_license",
  first_name: "Jordan",
  middle_name: null,
  last_name: "Rivera",
  dob: "1991-01-10",
  sex: null,
  address_1: "742 Evergreen Terrace",
  address_2: null,
  city: "Springfield",
  subdivision: "SX",
  postal_code: "55501",
  country: "US",
  document_number: "SX0594837",
  issuing_subdivision: "SX",
  issuing_country: "US",
  issued_date: "2024-02-18",
  expiration_date: "2032-01-10",
};

export const DEMO_PHONE = "555-123-4567";
// Only the last four digits ever leave the server (see redactTraits).
export const APPLICANT_SSN9 = "123456789";

// Identity 2 — household member. Clean path: same address, no health_insurance.
export const HOUSEHOLD_DOCUMENT: DocumentTraits = {
  document_type: "drivers_license",
  first_name: "Sam",
  middle_name: null,
  last_name: "Rivera",
  dob: "1993-03-14",
  sex: null,
  address_1: "742 Evergreen Terrace",
  address_2: null,
  city: "Springfield",
  subdivision: "SX",
  postal_code: "55501",
  country: "US",
  document_number: "SX0614275",
  issuing_subdivision: "SX",
  issuing_country: "US",
  issued_date: "2023-06-02",
  expiration_date: "2031-03-14",
};

export const HOUSEHOLD_SSN9 = "987654321";

export const DEMO_HEALTH_INSURANCE: HealthInsuranceTraits = {
  payer_id: "SCMCD",
  payer_name: "South Carolina Medicaid",
  plan_status: "ACTIVE",
  group_name: null,
  group_id: null,
  insurance_member_id: "123485135",
  policy_holder_first_name: "Jordan",
  policy_holder_last_name: "Rivera",
  coverage_start_date: "2025-11-01",
};

// Mirrors the real CLEAR API's check objects so mock and sandbox render identically.
export const DEMO_CHECKS: VerificationCheck[] = [
  { name: "Selfie passes liveness check", value: true, status: "completed" },
  { name: "Selfie matches portrait on Gov ID", value: true, status: "completed" },
  { name: "Gov ID is likely authentic", value: true, status: "completed" },
  { name: "Gov ID is not expired", value: true, status: "completed" },
  { name: "Gov ID captured image is acceptable", value: true, status: "completed" },
  { name: "User's information matches a trusted source", value: true, status: "completed" },
];

// Pull the entered phone off a CLEAR session's traits (string or { number }).
function sessionPhone(session: ClearSession): string | null {
  const rawPhone = (session.traits as Record<string, unknown> | null)?.phone;
  return typeof rawPhone === "string" ? rawPhone : ((rawPhone as { number?: string } | undefined)?.number ?? null);
}

// The applicant/household demo override always wins so the discrepancy storyline
// is deterministic. Which identity applies is fixed by the verification's role.
export function enrichSession(session: ClearSession, role: VerificationRole = "applicant"): ClearSession {
  if (session.status !== "success") return session;
  if (role === "household") {
    return {
      ...session,
      checks: session.checks?.length ? session.checks : DEMO_CHECKS,
      traits: {
        ...(session.traits ?? {}),
        document: HOUSEHOLD_DOCUMENT,
        ssn9: HOUSEHOLD_SSN9,
        health_insurance: null,
      },
    };
  }
  const realPhone = sessionPhone(session);
  return {
    ...session,
    checks: session.checks?.length ? session.checks : DEMO_CHECKS,
    traits: {
      ...(session.traits ?? {}),
      document: DEMO_DOCUMENT,
      // Real value from CLEAR wins (it is the applicant's actual number);
      // the demo constant only fills the mock path.
      phone: { number: realPhone || DEMO_PHONE },
      ssn9: APPLICANT_SSN9,
      health_insurance: DEMO_HEALTH_INSURANCE,
    },
  };
}
