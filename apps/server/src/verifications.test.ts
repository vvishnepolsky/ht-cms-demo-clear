import { describe, expect, it } from "vitest";
import type { Determination } from "./clear/types.js";
import { residentDetermination } from "./verifications.js";

const medicaid: Determination = {
  result: "issue_found",
  duplicate_enrollment: true,
  payer_state: "SC",
  payer_state_name: "South Carolina",
  coverage: { payer_id: "SCMCD", payer_name: "South Carolina Medicaid", plan_status: "ACTIVE", group_name: null, group_id: null, insurance_member_id: "123485135", policy_holder_first_name: "Jordan", policy_holder_last_name: "Rivera", coverage_type: "medicaid" },
  coverage_type: "medicaid",
};
const employer: Determination = {
  result: "clear",
  duplicate_enrollment: false,
  payer_state: null,
  payer_state_name: null,
  coverage: { payer_id: "AETNA", payer_name: "Aetna", plan_status: "ACTIVE", group_name: null, group_id: "G123456789", insurance_member_id: "W123456789", policy_holder_first_name: "Jane", policy_holder_last_name: "Doe", coverage_start_date: "2026-01-01", coverage_type: "employer", policy_holder_relationship: "spouse", monthly_premium: 300 },
  coverage_type: "employer",
};

describe("residentDetermination — resident-visible coverage", () => {
  it("strips the coverage record while a duplicate-enrollment finding exists", () => {
    const r = residentDetermination(medicaid, false);
    expect(r?.duplicate_enrollment).toBe(true);
    expect(r?.payer_state_name).toBe("South Carolina");
    expect(r?.coverage).toBeNull();
  });
  it("includes the applicant's own non-Medicaid plan when the result is clear", () => {
    const r = residentDetermination(employer, false);
    expect(r?.coverage?.payer_name).toBe("Aetna");
    expect(r?.coverage?.monthly_premium).toBe(300);
    expect(r?.coverage_type).toBe("employer");
  });
  it("staff always see the full record", () => {
    expect(residentDetermination(medicaid, true)?.coverage?.payer_name).toBe("South Carolina Medicaid");
  });
  it("passes null through", () => {
    expect(residentDetermination(null, false)).toBeNull();
  });
});
