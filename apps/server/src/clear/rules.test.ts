import { describe, expect, it } from "vitest";
import { DEMO_EMPLOYER_INSURANCE, DEMO_HEALTH_INSURANCE } from "./demo-identity.js";
import { determine, isDuplicateEnrollment } from "./rules.js";

describe("determine() — coverage discovery rules", () => {
  it("flags ACTIVE out-of-state Medicaid as a duplicate enrollment", () => {
    const d = determine(DEMO_HEALTH_INSURANCE, "SX");
    expect(d.result).toBe("issue_found");
    expect(d.duplicate_enrollment).toBe(true);
    expect(d.payer_state).toBe("SC");
    expect(d.payer_state_name).toBe("South Carolina");
    expect(d.coverage?.payer_name).toBe("South Carolina Medicaid");
    expect(d.coverage_type).toBe("medicaid");
  });

  it("does NOT flag an employer plan — result clear, coverage carried, type mirrored", () => {
    const d = determine(DEMO_EMPLOYER_INSURANCE, "SX");
    expect(d.result).toBe("clear");
    expect(d.duplicate_enrollment).toBe(false);
    expect(d.payer_state).toBeNull();
    expect(d.payer_state_name).toBeNull();
    expect(d.coverage).toEqual(DEMO_EMPLOYER_INSURANCE);
    expect(d.coverage?.payer_name).toBe("Aetna");
    expect(d.coverage?.monthly_premium).toBe(300);
    expect(d.coverage?.policy_holder_relationship).toBe("spouse");
    expect(d.coverage_type).toBe("employer");
    expect(isDuplicateEnrollment(DEMO_EMPLOYER_INSURANCE, "SX")).toBe(false);
  });

  it("is clear for in-state Medicaid and for no coverage", () => {
    expect(determine(DEMO_HEALTH_INSURANCE, "SC").duplicate_enrollment).toBe(false);
    const none = determine(null, "SX");
    expect(none.result).toBe("clear");
    expect(none.coverage).toBeNull();
    expect(none.coverage_type).toBeNull();
  });

  it("ignores an inactive out-of-state Medicaid record", () => {
    expect(determine({ ...DEMO_HEALTH_INSURANCE, plan_status: "TERMINATED" }, "SX").duplicate_enrollment).toBe(false);
  });
});
