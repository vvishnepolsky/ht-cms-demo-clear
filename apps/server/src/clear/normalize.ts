import type { DocumentTraits, HealthInsuranceTraits, SessionTraits } from "./types.js";

/**
 * Normalizes the REAL CLEAR verification-session traits into the app's
 * internal SessionTraits shape. The live API differs from our flat internal
 * shape in several ways (verified against a live sandbox session):
 *   - dates are objects: { day, month, year }
 *   - the document carries `gender` (we use `sex`) and a NESTED address
 *   - phone/email are plain strings at the traits root
 *   - image fields (document_front/back, face_scan_preview) are siblings of
 *     `document` and are handled separately by extractImages()
 * Absent/null fields stay null — no synthetic fill-in happens here.
 */

interface ClearDateParts {
  day?: number | null;
  month?: number | null;
  year?: number | null;
}

function isoDate(d: ClearDateParts | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (!d.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v !== "REDACTED" ? v.trim() : null;
}

function normalizeDocument(doc: Record<string, any> | null | undefined): DocumentTraits | null {
  if (!doc) return null;
  const address = (doc.address ?? {}) as Record<string, any>;
  const country = str(doc.issuing_country);
  return {
    document_type: str(doc.document_type) ?? "unknown",
    first_name: str(doc.first_name) ?? "",
    middle_name: str(doc.middle_name),
    last_name: str(doc.last_name) ?? "",
    dob: isoDate(doc.date_of_birth ?? doc.dob) ?? "",
    sex: str(doc.gender ?? doc.sex),
    address_1: str(address.line1) ?? "",
    address_2: str(address.line2),
    city: str(address.city) ?? "",
    subdivision: str(address.state ?? address.subdivision) ?? "",
    postal_code: str(address.postal_code) ?? "",
    country: country === "USA" ? "US" : (country ?? "US"),
    document_number: str(doc.document_number) ?? "",
    issuing_subdivision: str(doc.issuing_subdivision) ?? "",
    issuing_country: country === "USA" ? "US" : (country ?? "US"),
    issued_date: isoDate(doc.date_of_issue ?? doc.issued_date),
    expiration_date: isoDate(doc.date_of_expiry ?? doc.expiration_date) ?? "",
  };
}

function normalizeHealthInsurance(hi: Record<string, any> | null | undefined): HealthInsuranceTraits | null {
  if (!hi) return null;
  return {
    payer_id: str(hi.payer_id),
    payer_name: str(hi.payer_name),
    plan_status: str(hi.plan_status),
    group_name: str(hi.group_name),
    group_id: str(hi.group_id),
    insurance_member_id: str(hi.insurance_member_id),
    policy_holder_first_name: str(hi.policy_holder_first_name),
    policy_holder_last_name: str(hi.policy_holder_last_name),
    coverage_start_date: isoDate(hi.coverage_start_date ?? hi.effective_date ?? null),
  };
}

/**
 * CLEAR returns E.164 ("+14199024865"); the apps store/display the 10-digit
 * US national number. Dropping the +1 here keeps every consumer (the wizard's
 * 10-digit input mask, admin display) from truncating the wrong end.
 */
function usNationalPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return national || null;
  return `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
}

export function normalizeClearTraits(raw: Record<string, any> | null | undefined): SessionTraits | null {
  if (!raw) return null;
  const rawPhone = raw.phone;
  const phone = usNationalPhone(typeof rawPhone === "string" ? rawPhone : (rawPhone?.number ?? null));
  const rawEmail = raw.email;
  const email = typeof rawEmail === "string" ? rawEmail : (rawEmail?.address ?? null);
  return {
    document: normalizeDocument(raw.document),
    phone: phone ? { number: phone } : null,
    email: email ? { address: email } : null,
    ssn9: str(raw.ssn9),
    health_insurance: normalizeHealthInsurance(raw.health_insurance),
  };
}
