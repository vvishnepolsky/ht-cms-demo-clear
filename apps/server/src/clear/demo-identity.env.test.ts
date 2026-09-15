import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads process.env at import time, so each case re-imports the
// module graph with the variables set.
async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const identity = await import("./demo-identity.js");
  const cfg = await import("../config.js");
  return { identity, cfg };
}

const KEYS = [
  "DEMO_APPLICANT_FIRST_NAME", "DEMO_APPLICANT_MIDDLE_NAME", "DEMO_APPLICANT_LAST_NAME", "DEMO_APPLICANT_DOB", "DEMO_APPLICANT_SEX",
  "DEMO_HOUSEHOLD_FIRST_NAME", "DEMO_HOUSEHOLD_LAST_NAME", "DEMO_HOUSEHOLD_DOB",
];

describe("DEMO_APPLICANT_* / DEMO_HOUSEHOLD_* environment", () => {
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
    vi.resetModules();
  });

  it("defaults to Jordan Rivera / Sam Rivera", async () => {
    const { identity } = await loadWith({});
    expect(identity.DEMO_DOCUMENT.first_name).toBe("Jordan");
    expect(identity.DEMO_DOCUMENT.last_name).toBe("Rivera");
    expect(identity.DEMO_DOCUMENT.dob).toBe("1991-01-10");
    expect(identity.HOUSEHOLD_DOCUMENT.first_name).toBe("Sam");
    expect(identity.DEMO_HEALTH_INSURANCE.policy_holder_first_name).toBe("Jordan");
  });

  it("renames the applicant and household member from the environment", async () => {
    const { identity } = await loadWith({
      DEMO_APPLICANT_FIRST_NAME: "Vadim",
      DEMO_APPLICANT_MIDDLE_NAME: "V",
      DEMO_APPLICANT_LAST_NAME: "Vishnepolsky",
      DEMO_APPLICANT_DOB: "1988-04-02",
      DEMO_APPLICANT_SEX: "m",
      DEMO_HOUSEHOLD_FIRST_NAME: "Anna",
      DEMO_HOUSEHOLD_LAST_NAME: "Vishnepolsky",
      DEMO_HOUSEHOLD_DOB: "1990-09-30",
    });
    expect(identity.DEMO_DOCUMENT).toMatchObject({
      first_name: "Vadim",
      middle_name: "V",
      last_name: "Vishnepolsky",
      dob: "1988-04-02",
      sex: "M",
      address_1: "742 Evergreen Terrace", // address stays demo
    });
    expect(identity.DEMO_HEALTH_INSURANCE.policy_holder_first_name).toBe("Vadim");
    expect(identity.DEMO_HEALTH_INSURANCE.policy_holder_last_name).toBe("Vishnepolsky");
    expect(identity.HOUSEHOLD_DOCUMENT).toMatchObject({ first_name: "Anna", dob: "1990-09-30" });
    // the overlay uses the configured identity end to end
    const out = identity.enrichSession(
      { id: "v", status: "success", checks: [], traits: null },
      "applicant",
      [],
    );
    expect(out.traits!.document!.first_name).toBe("Vadim");
    expect(out.traits!.health_insurance!.policy_holder_last_name).toBe("Vishnepolsky");
  });

  it("rejects a malformed DOB and keeps the default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { identity } = await loadWith({ DEMO_APPLICANT_DOB: "04/02/1988" });
    expect(identity.DEMO_DOCUMENT.dob).toBe("1991-01-10");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
