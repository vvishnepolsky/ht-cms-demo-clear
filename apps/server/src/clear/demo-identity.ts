import type {
  ClearSession,
  DocumentTraits,
  HealthInsuranceTraits,
  VerificationCheck,
  VerificationRole,
} from "./types.js";
import { config, DEMO_APPLICANT, DEMO_HOUSEHOLD_MEMBER, type CoverageScenario, type DocumentField } from "../config.js";

// Deterministic demo identities. Sandbox returns "John Doe", so after a
// successful real round-trip we overlay these values — same schema, demo data.
// Applied in mock mode (no CLEAR behind it) or when DEMO_ENRICHMENT=true.
// The overlay touches identity + coverage traits only.

// Identity 1 — primary applicant. State-X resident with ACTIVE South Carolina
// Medicaid (out-of-state relative to the SX tenant) → drives the
// duplicate-enrollment finding deterministically.
export const DEMO_DOCUMENT: DocumentTraits = {
  document_type: "drivers_license",
  // Name + DOB come from DEMO_APPLICANT_* env vars (defaults: Jordan Rivera, 1991-01-10).
  first_name: DEMO_APPLICANT.firstName,
  middle_name: DEMO_APPLICANT.middleName,
  last_name: DEMO_APPLICANT.lastName,
  dob: DEMO_APPLICANT.dob,
  sex: DEMO_APPLICANT.sex,
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
  // Name + DOB come from DEMO_HOUSEHOLD_* env vars (defaults: Sam Rivera, 1993-03-14).
  first_name: DEMO_HOUSEHOLD_MEMBER.firstName,
  middle_name: DEMO_HOUSEHOLD_MEMBER.middleName,
  last_name: DEMO_HOUSEHOLD_MEMBER.lastName,
  dob: DEMO_HOUSEHOLD_MEMBER.dob,
  sex: DEMO_HOUSEHOLD_MEMBER.sex,
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

// Scenario "oos_medicaid" (default): the applicant's own out-of-state Medicaid.
export const DEMO_HEALTH_INSURANCE: HealthInsuranceTraits = {
  payer_id: "SCMCD",
  payer_name: "South Carolina Medicaid",
  plan_status: "ACTIVE",
  group_name: null,
  group_id: null,
  insurance_member_id: "123485135",
  policy_holder_first_name: DEMO_APPLICANT.firstName,
  policy_holder_last_name: DEMO_APPLICANT.lastName,
  coverage_start_date: "2025-11-01",
  coverage_type: "medicaid",
  policy_holder_relationship: null,
  monthly_premium: null,
};

// Scenario "employer_plan": an active employer plan held by the applicant's
// spouse. Not Medicaid and not out of state, so the coverage rules stay clear
// and no flag opens; the wizard prefills its insurance step from these values.
export const DEMO_EMPLOYER_INSURANCE: HealthInsuranceTraits = {
  payer_id: "AETNA",
  payer_name: "Aetna",
  plan_status: "ACTIVE",
  group_name: null,
  group_id: "G123456789",
  insurance_member_id: "W123456789",
  policy_holder_first_name: "Jane",
  policy_holder_last_name: "Doe",
  coverage_start_date: "2026-01-01",
  coverage_type: "employer",
  policy_holder_relationship: "spouse",
  monthly_premium: 300,
};

/** The applicant's coverage for a scenario. Medicaid follows the document's name (it is the applicant's own enrollment); the employer plan keeps its spouse policy holder. */
export function demoCoverage(scenario: CoverageScenario, document: DocumentTraits): HealthInsuranceTraits {
  if (scenario === "employer_plan") return { ...DEMO_EMPLOYER_INSURANCE };
  return { ...DEMO_HEALTH_INSURANCE, policy_holder_first_name: document.first_name, policy_holder_last_name: document.last_name };
}

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

/**
 * Demo document with selected fields taken from CLEAR's real document instead
 * (DEMO_ENRICHMENT_PASSTHROUGH). A real value only wins when CLEAR actually
 * returned something non-empty for that field; otherwise the demo value stays.
 */
export function applyPassthrough(
  demoDoc: DocumentTraits,
  realDoc: Partial<DocumentTraits> | null | undefined,
  fields: readonly DocumentField[],
): DocumentTraits {
  const merged: DocumentTraits = { ...demoDoc };
  if (!realDoc) return merged;
  // Fields the demo identity leaves empty (sex, middle name, …) keep whatever
  // CLEAR actually returned — the overlay only replaces what it defines.
  for (const [k, v] of Object.entries(realDoc) as Array<[DocumentField, unknown]>) {
    if ((merged as unknown as Record<string, unknown>)[k] == null && v != null && String(v).trim() !== "") {
      (merged as unknown as Record<string, unknown>)[k] = v;
    }
  }
  for (const f of fields) {
    const v = realDoc[f];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      (merged as unknown as Record<string, unknown>)[f] = v;
    }
  }
  return merged;
}

// The applicant/household demo override wins so the discrepancy storyline is
// deterministic — except for the DEMO_ENRICHMENT_PASSTHROUGH fields, which keep
// CLEAR's real values. Which identity applies is fixed by the verification's role.
export function enrichSession(
  session: ClearSession,
  role: VerificationRole = "applicant",
  passthrough: readonly DocumentField[] = config.demoEnrichmentPassthrough,
  scenario: CoverageScenario = config.demoCoverageScenario,
): ClearSession {
  if (session.status !== "success") return session;
  const realDoc = (session.traits as { document?: Partial<DocumentTraits> | null } | null)?.document ?? null;
  if (role === "household") {
    return {
      ...session,
      checks: session.checks?.length ? session.checks : DEMO_CHECKS,
      traits: {
        ...(session.traits ?? {}),
        document: applyPassthrough(HOUSEHOLD_DOCUMENT, realDoc, passthrough),
        ssn9: HOUSEHOLD_SSN9,
        health_insurance: null,
      },
    };
  }
  const realPhone = sessionPhone(session);
  const document = applyPassthrough(DEMO_DOCUMENT, realDoc, passthrough);
  return {
    ...session,
    checks: session.checks?.length ? session.checks : DEMO_CHECKS,
    traits: {
      ...(session.traits ?? {}),
      document,
      // Real value from CLEAR wins (it is the applicant's actual number);
      // the demo constant only fills the mock path.
      phone: { number: realPhone || DEMO_PHONE },
      ssn9: APPLICANT_SSN9,
      // Which coverage discovery "finds" is the configured scenario (DEMO_COVERAGE_SCENARIO).
      health_insurance: demoCoverage(scenario, document),
    },
  };
}
