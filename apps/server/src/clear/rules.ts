import { config } from "../config.js";
import type { Determination, HealthInsuranceTraits } from "./types.js";

// Coverage-discrepancy rules. App-side payer -> state lookup (health_insurance
// carries no state field). Multiple Medicaid payers coexist so the storyline
// can be re-keyed by data alone.
export const PAYER_STATE: Record<string, string> = { SCMCD: "SC", ILMCD: "IL" };
export const MEDICAID_PAYERS = new Set(["SCMCD", "ILMCD"]);
export const STATE_FULL: Record<string, string> = { SC: "South Carolina", IL: "Illinois" };

// Out-of-state Medicaid: payer is Medicaid, its state resolves, that state is
// NOT the tenant's jurisdiction, and the plan is ACTIVE.
export function isDuplicateEnrollment(
  hi: HealthInsuranceTraits | null | undefined,
  tenantState: string = config.tenantState,
): boolean {
  if (!hi?.payer_id) return false;
  const payerState = PAYER_STATE[hi.payer_id];
  return (
    MEDICAID_PAYERS.has(hi.payer_id) &&
    payerState !== undefined &&
    payerState !== tenantState &&
    hi.plan_status === "ACTIVE"
  );
}

export function determine(
  hi: HealthInsuranceTraits | null | undefined,
  tenantState: string = config.tenantState,
): Determination {
  const duplicate = isDuplicateEnrollment(hi, tenantState);
  const code = hi?.payer_id ? (PAYER_STATE[hi.payer_id] ?? null) : null;
  return {
    result: duplicate ? "issue_found" : "clear",
    duplicate_enrollment: duplicate,
    payer_state: duplicate ? code : null,
    payer_state_name: duplicate && code ? (STATE_FULL[code] ?? code) : null,
    coverage: hi ?? null,
  };
}
