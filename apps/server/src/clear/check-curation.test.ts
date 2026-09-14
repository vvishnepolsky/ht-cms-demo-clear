import { describe, expect, it } from "vitest";
import { curateChecks, normalizeCheckName, SHOWN_ORDER, summarizeChecks } from "./check-curation.js";
import type { VerificationCheck } from "./types.js";

const c = (name: string, status: string, value: boolean | null): VerificationCheck => ({ name, status, value });

/** Verbatim shape of a real CLEAR sandbox verification (26 rows, headers mixed in). */
const SANDBOX_26: VerificationCheck[] = [
  c("Biometric Verification", "completed", true),
  c("Selfie matches portrait on Gov ID", "completed", true),
  c("Selfie passes liveness check", "completed", true),
  c("Document Authenticity", "completed", true),
  c("Age on Gov ID is 18 or over", "completed", true),
  c("Gov ID back is not suspicious", "completed", true),
  c("Gov ID captured image is acceptable", "completed", true),
  c("Gov ID front is not suspicious", "completed", true),
  c("Gov ID full name was extracted", "completed", true),
  c("Gov ID is likely authentic", "completed", true),
  c("Gov ID is not expired", "completed", true),
  c("Gov ID type is an eligible document type", "completed", true),
  c("Gov ID was processed", "completed", true),
  c("Source Validation", "completed", true),
  c("Gov ID matches DMV records", "completed", true),
  c("NFC Passport validated", "completed", false),
  c("Phone number matches user's information", "skipped", null),
  c("User is verified in country's database", "skipped", null),
  c("User is verified in country’s database", "skipped", null),
  c("User's information matches a trusted source", "skipped", null),
  c("Phone Number Validation", "completed", true),
  c("Phone number matches user's information", "completed", true),
  c("Device Security Assessment", "completed", true),
  c("Device is trustworthy", "completed", true),
  c("Phone Line Intelligence", "completed", true),
  c("Phone number is a fixed or mobile phone (Document)", "completed", true),
];

/** What the mock replica returns today (legacy six). */
const MOCK_6: VerificationCheck[] = [
  c("Selfie passes liveness check", "completed", true),
  c("Selfie matches portrait on Gov ID", "completed", true),
  c("Gov ID is likely authentic", "completed", true),
  c("Gov ID is not expired", "completed", true),
  c("Gov ID captured image is acceptable", "completed", true),
  c("User's information matches a trusted source", "completed", true),
];

describe("curateChecks — real sandbox sample", () => {
  const curated = curateChecks(SANDBOX_26);

  it("shows only the identity-relevant checks, in the fixed order, skipped ones dropped", () => {
    expect(curated.shown.map((x) => x.name)).toEqual([
      "Selfie passes liveness check",
      "Selfie matches portrait on Gov ID",
      "Gov ID is likely authentic",
      "Gov ID front is not suspicious",
      "Gov ID back is not suspicious",
      "Gov ID is not expired",
      "Gov ID captured image is acceptable",
      "Gov ID matches DMV records",
    ]);
    expect(curated.shown.length).toBeLessThanOrEqual(SHOWN_ORDER.length);
    expect(curated.shown.some((x) => /phone|device|nfc|validation|biometric/i.test(x.name))).toBe(false);
  });

  it("counts hidden passes and not-applicable rows once per normalized name", () => {
    // Hidden & passed: Biometric, Document Authenticity, Age 18+, full name, eligible type,
    // was processed, Source Validation, Phone matches (skipped+completed → completed),
    // Phone Number Validation, Device Security, Device trustworthy, Phone Line, fixed/mobile.
    expect(curated.hiddenPassed).toBe(13);
    // NFC false (driver's license), country database (skipped, listed twice with
    // straight/curly apostrophes), trusted source (skipped identity check).
    expect(curated.notApplicable).toBe(3);
  });

  it("renders the footer summary", () => {
    expect(summarizeChecks(curated)).toBe("8 identity checks passed · 13 additional CLEAR checks passed · 3 not applicable");
  });

  it("treats straight and curly apostrophes as the same check", () => {
    expect(normalizeCheckName("User’s information")).toBe(normalizeCheckName("User's information"));
  });
});

describe("curateChecks — edge cases", () => {
  it("keeps the six mock checks and reports no hidden rows", () => {
    const curated = curateChecks(MOCK_6);
    expect(curated.shown).toHaveLength(6);
    expect(curated.hiddenPassed).toBe(0);
    expect(curated.notApplicable).toBe(0);
    expect(summarizeChecks(curated)).toBe("6 identity checks passed");
  });

  it("never hides a real (non-NFC) failure, even for an otherwise hidden check", () => {
    const curated = curateChecks([...MOCK_6, c("Device is trustworthy", "completed", false)]);
    expect(curated.shown.map((x) => x.name)).toContain("Device is trustworthy");
    expect(summarizeChecks(curated)).toBe("6 of 7 identity checks passed");
  });

  it("hides an NFC passport failure as not applicable", () => {
    const curated = curateChecks([...MOCK_6, c("NFC Passport validated", "completed", false)]);
    expect(curated.shown).toHaveLength(6);
    expect(curated.notApplicable).toBe(1);
  });

  it("supports legacy mock rows without a value (status carries the outcome)", () => {
    const curated = curateChecks([{ name: "Selfie passes liveness check", status: "success" }, { name: "Gov ID is not expired", status: "failed" }]);
    expect(curated.shown.map((x) => x.name)).toEqual(["Selfie passes liveness check", "Gov ID is not expired"]);
    expect(summarizeChecks(curated)).toBe("1 of 2 identity checks passed");
  });

  it("returns null summary for no checks", () => {
    expect(summarizeChecks(curateChecks([]))).toBeNull();
    expect(summarizeChecks(curateChecks(null))).toBeNull();
  });
});
