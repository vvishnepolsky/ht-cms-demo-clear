import { describe, expect, it } from "vitest";
import { parsePassthrough } from "../config.js";
import { applyPassthrough, DEMO_DOCUMENT, DEMO_HEALTH_INSURANCE, enrichSession } from "./demo-identity.js";
import type { ClearSession } from "./types.js";

// What a real sandbox round-trip looks like after normalizeClearTraits.
const sandboxSession: ClearSession = {
  id: "verify_test",
  status: "success",
  checks: [{ name: "Selfie passes liveness check", value: true, status: "completed" }],
  traits: {
    document: {
      document_type: "drivers_license",
      first_name: "John",
      middle_name: "Q",
      last_name: "Doe",
      dob: "1985-06-15",
      sex: "M",
      address_1: "1 Sandbox Way",
      address_2: null,
      city: "Testville",
      subdivision: "CA",
      postal_code: "94000",
      country: "US",
      document_number: "D1234567",
      issuing_subdivision: "CA",
      issuing_country: "US",
      issued_date: null,
      expiration_date: "2030-01-01",
    },
    phone: { number: "4082222222" },
    health_insurance: null,
  },
};

describe("parsePassthrough", () => {
  it("expands aliases and dedupes", () => {
    expect(parsePassthrough("first_name, last_name,dob")).toEqual(["first_name", "last_name", "dob"]);
    expect(parsePassthrough("name,date_of_birth,dob")).toEqual(["first_name", "middle_name", "last_name", "dob"]);
    expect(parsePassthrough(undefined)).toEqual([]);
    expect(parsePassthrough("bogus,first_name")).toEqual(["first_name"]);
  });
});

describe("enrichSession with DEMO_ENRICHMENT_PASSTHROUGH", () => {
  it("keeps CLEAR's name and DOB, overlays everything else", () => {
    const out = enrichSession(sandboxSession, "applicant", ["first_name", "last_name", "dob"]);
    const doc = out.traits!.document!;
    expect(doc.first_name).toBe("John");
    expect(doc.last_name).toBe("Doe");
    expect(doc.dob).toBe("1985-06-15");
    // demo values for everything not passed through that the demo defines;
    // fields the demo leaves empty (middle name) keep CLEAR's value
    expect(doc.middle_name).toBe("Q");
    expect(doc.address_1).toBe(DEMO_DOCUMENT.address_1);
    expect(doc.subdivision).toBe("SX");
    // coverage storyline intact, policy holder follows the real name
    const hi = out.traits!.health_insurance!;
    expect(hi.payer_id).toBe(DEMO_HEALTH_INSURANCE.payer_id);
    expect(hi.plan_status).toBe("ACTIVE");
    expect(hi.policy_holder_first_name).toBe("John");
    expect(hi.policy_holder_last_name).toBe("Doe");
    // the real phone is kept, as before
    expect(out.traits!.phone).toEqual({ number: "4082222222" });
  });

  it("falls back to the demo value when CLEAR returned an empty field", () => {
    const doc = applyPassthrough(DEMO_DOCUMENT, { first_name: "", last_name: "Doe", dob: undefined }, [
      "first_name",
      "last_name",
      "dob",
    ]);
    expect(doc.first_name).toBe("Jordan");
    expect(doc.last_name).toBe("Doe");
    expect(doc.dob).toBe("1991-01-10");
  });

  it("keeps CLEAR's value for fields the demo identity leaves empty (sex, middle name)", () => {
    const out = enrichSession(sandboxSession, "applicant", []);
    const doc = out.traits!.document!;
    expect(doc.first_name).toBe("Jordan"); // demo wins where defined
    expect(doc.sex).toBe("M"); // demo sex is null → CLEAR's gender flows through
    expect(doc.middle_name).toBe("Q");
  });

  it("is the full overlay when no passthrough is configured (mock path)", () => {
    const out = enrichSession({ ...sandboxSession, traits: null }, "applicant", []);
    expect(out.traits!.document).toEqual(DEMO_DOCUMENT);
    expect(out.traits!.health_insurance!.policy_holder_first_name).toBe("Jordan");
  });

  it("applies to the household identity too", () => {
    const out = enrichSession(sandboxSession, "household", ["first_name", "last_name", "dob"]);
    expect(out.traits!.document!.first_name).toBe("John");
    expect(out.traits!.document!.dob).toBe("1985-06-15");
    expect(out.traits!.health_insurance).toBeNull();
  });
});
