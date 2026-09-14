import { config } from "../config.js";

/**
 * Demo MAGI / Non-MAGI evaluator. A deterministic stand-in for the
 * rules-engine + medicaid-ee-service `handleBreEvaluation` pipeline.
 *
 * Output shape is the ENG-1669 "sectioned trace" the admin workspace renders
 * (`SectionedRuleTrace`, `parseRuleEvaluations`, `buildVerificationSteps`):
 *
 *   { outcome, evaluatedAt, engineVersion,
 *     sections: [{ name, ordering, summary?, rows: [{ ruleId, ruleName, displayCode,
 *       status: PASS|FAIL|PENDING, leftLabel, rightValue, note?, slot?, threshold? }] }] }
 *
 * plus one determination seed per household member (status PENDING until a
 * caseworker approves/denies the case).
 */

// 2026 HHS poverty guidelines (48 contiguous states + DC). Matches the resident
// wizard's lookupFPL() so the FPL % the applicant saw is the one we compute.
const FPL_2026: Record<number, number> = { 1: 15_650, 2: 21_150, 3: 27_320, 4: 33_490, 5: 39_660, 6: 45_830 };
const FPL_2026_PER_ADDITIONAL = 6_170;

export function fplAnnual(householdSize: number): number {
  const size = Math.max(1, Math.floor(householdSize || 1));
  if (size <= 6) return FPL_2026[size];
  return FPL_2026[6] + (size - 6) * FPL_2026_PER_ADDITIONAL;
}

// MAGI coverage-group ceilings (% FPL). Adult/Parent = 133% + 5% disregard.
export const COVERAGE_GROUPS = {
  DEEMED_NEWBORN: { label: "Deemed Newborn", pct: null as number | null },
  INFANT: { label: "Infant (0–1)", pct: 205 },
  CHILD: { label: "Children's MAGI", pct: 167 },
  PREGNANT: { label: "Pregnant", pct: 215 },
  PARENT: { label: "Parent/Caretaker", pct: 138 },
  ADULT: { label: "Adult Group MAGI", pct: 138 },
} as const;
export const NON_MAGI_GROUP_LABEL = "Non-MAGI (ABD)";
export const ENGINE_VERSION = "4.2-demo";

export type TraceStatus = "PASS" | "FAIL" | "PENDING";

export interface TraceRow {
  ruleId: string;
  ruleName: string;
  displayCode: string;
  status: TraceStatus;
  leftLabel: string;
  rightValue: string;
  note?: string;
  slot?: string;
  threshold?: string;
}

export interface TraceSection {
  name: string;
  ordering: number;
  summary?: string;
  note?: string;
  rows: TraceRow[];
}

export type EvaluationOutcome = "ELIGIBLE" | "INELIGIBLE" | "NEEDS_REVIEW";

export interface SectionedTrace {
  outcome: EvaluationOutcome;
  evaluatedAt: string;
  engineVersion: string;
  sections: TraceSection[];
  /** Flat summary counts for quick consumers. */
  summary: { passed: number; failed: number; pending: number };
}

export interface DeterminationSeed {
  personId: string | null;
  isPrimary: boolean;
  category: "MAGI" | "NON_MAGI";
  coverageGroup: string | null;
  notes: string;
  /** Per-member income gate result (informational; determinations start PENDING). */
  incomePasses: boolean;
}

export interface IdentityContext {
  status: string;
  checksTotal: number;
  checksPassed: number;
  duplicateEnrollment: boolean;
  payerStateName: string | null;
  payerName: string | null;
}

export interface EvaluationInput {
  intakeData: Record<string, unknown> | null;
  applicantPersonId: string;
  /** Household members (HEAD first) for personId fallback when intake rows carry none. */
  householdMemberPersonIds: string[];
  identity: IdentityContext | null;
}

export interface EvaluationResult {
  trace: SectionedTrace;
  determinations: DeterminationSeed[];
}

// --- helpers --------------------------------------------------------------------

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
export function ageFromDob(dob: string | undefined | null, asOf = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  let age = asOf.getFullYear() - y;
  const md = asOf.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && asOf.getDate() < d)) age -= 1;
  return Math.max(0, age);
}

const CITIZENSHIP_LABEL: Record<string, string> = {
  us_citizen: "U.S. citizen",
  us_national: "U.S. national",
  lawful_permanent_resident: "Lawful permanent resident",
  qualified_noncitizen: "Qualified non-citizen",
  nonqualified_noncitizen: "Non-qualified non-citizen",
  undocumented: "Undocumented",
};
const CITIZENSHIP_ELIGIBLE = new Set(["us_citizen", "us_national", "lawful_permanent_resident", "qualified_noncitizen"]);

interface MemberView {
  personId: string | null;
  firstName: string;
  isPrimary: boolean;
  age: number | null;
  isPregnant: boolean;
  isDisabled: boolean;
  receivingSSI: boolean;
  receivingSSDI: boolean;
  citizenshipStatus: string;
}

function coverageGroupFor(m: MemberView): { label: string; pct: number | null; key: keyof typeof COVERAGE_GROUPS } {
  if (m.age !== null && m.age < 1) return { key: "INFANT", ...COVERAGE_GROUPS.INFANT };
  if (m.age !== null && m.age < 19) return { key: "CHILD", ...COVERAGE_GROUPS.CHILD };
  if (m.isPregnant) return { key: "PREGNANT", ...COVERAGE_GROUPS.PREGNANT };
  return { key: "ADULT", ...COVERAGE_GROUPS.ADULT };
}

// --- evaluator ------------------------------------------------------------------

export function evaluateCase(input: EvaluationInput): EvaluationResult {
  const intake = rec(input.intakeData);
  const applicant = rec(intake.applicant);
  const intakeMembers = Array.isArray(intake.householdMembers)
    ? (intake.householdMembers as unknown[]).map(rec)
    : [];

  const householdSize = Math.max(1, num(intake.householdSize, num(applicant.householdSize, intakeMembers.length || 1)));
  const annualIncome = num(applicant.annualIncome, num(intake.monthlyHouseholdIncome) * 12);
  const monthlyIncome = num(intake.monthlyHouseholdIncome, annualIncome / 12);
  const fpl = fplAnnual(householdSize);
  const fplPct = fpl > 0 ? Math.round((annualIncome / fpl) * 1000) / 10 : 0;
  const state = str(applicant.stateOfResidence) || str(intake.state);
  const citizenship = str(applicant.citizenshipStatus) || "us_citizen";

  // Member views: intake rows when present, else the household roster.
  const members: MemberView[] = [];
  if (intakeMembers.length) {
    let nonHeadIdx = 0;
    intakeMembers.forEach((m, i) => {
      const isPrimary = str(m.relationship).toLowerCase() === "self" || (i === 0 && !intakeMembers.some((x) => str(x.relationship).toLowerCase() === "self"));
      let personId = str(m.personId) || null;
      if (!personId) {
        if (isPrimary) personId = input.applicantPersonId;
        else {
          const others = input.householdMemberPersonIds.filter((id) => id !== input.applicantPersonId);
          personId = others[nonHeadIdx] ?? null;
          nonHeadIdx += 1;
        }
      } else if (!isPrimary) {
        nonHeadIdx += 1;
      }
      members.push({
        personId,
        firstName: str(m.firstName) || (isPrimary ? "Applicant" : "Member"),
        isPrimary,
        age: ageFromDob(str(m.dateOfBirth) || (isPrimary ? str(applicant.dateOfBirth) : null)),
        isPregnant: m.isPregnant === true || (isPrimary && applicant.isPregnant === true),
        isDisabled: m.isDisabled === true || (isPrimary && applicant.isDisabled === true),
        receivingSSI: m.receivingSSI === true || (isPrimary && applicant.receivingSSI === true),
        receivingSSDI: isPrimary && applicant.receivingSSDI === true,
        citizenshipStatus: str(m.citizenshipStatus) || citizenship,
      });
    });
  } else {
    const ids = input.householdMemberPersonIds.length ? input.householdMemberPersonIds : [input.applicantPersonId];
    ids.forEach((id) => {
      const isPrimary = id === input.applicantPersonId;
      members.push({
        personId: id,
        firstName: isPrimary ? "Applicant" : "Member",
        isPrimary,
        age: isPrimary ? ageFromDob(str(applicant.dateOfBirth)) : null,
        isPregnant: isPrimary && applicant.isPregnant === true,
        isDisabled: isPrimary && applicant.isDisabled === true,
        receivingSSI: isPrimary && applicant.receivingSSI === true,
        receivingSSDI: isPrimary && applicant.receivingSSDI === true,
        citizenshipStatus: citizenship,
      });
    });
  }
  if (!members.some((m) => m.isPrimary) && members.length) members[0].isPrimary = true;
  const primary = members.find((m) => m.isPrimary) ?? members[0];
  const primaryNonMagi = primary.isDisabled || primary.receivingSSI || primary.receivingSSDI;

  const sections: TraceSection[] = [];
  const hardFailures: string[] = [];
  const reviewReasons: string[] = [];

  // 1. Identity verification (CLEAR / Verify Assist) ------------------------------
  {
    const id = input.identity;
    const rows: TraceRow[] = [];
    if (!id) {
      rows.push({
        ruleId: "SX-IDV-001",
        ruleName: "CLEAR identity verification",
        displayCode: "IDV-001",
        status: "PENDING",
        leftLabel: "Identity verified (CLEAR)",
        rightValue: "No identity verification linked",
        note: "Request ID documents or send the applicant a Verify Assist link.",
      });
      rows.push({
        ruleId: "SX-IDV-002",
        ruleName: "Coverage discovery",
        displayCode: "IDV-002",
        status: "PENDING",
        leftLabel: "Other health coverage found",
        rightValue: "Not checked",
      });
      reviewReasons.push("identity not verified");
    } else {
      const ok = id.status === "success";
      rows.push({
        ruleId: "SX-IDV-001",
        ruleName: "CLEAR identity verification",
        displayCode: "IDV-001",
        status: ok ? "PASS" : id.status === "failed" || id.status === "expired" ? "FAIL" : "PENDING",
        leftLabel: "Identity verified (CLEAR)",
        rightValue: ok
          ? `Verified — ${id.checksPassed}/${id.checksTotal} checks passed`
          : id.status === "failed"
            ? "Verification failed"
            : `Verification ${id.status.replace("_", " ")}`,
      });
      if (id.duplicateEnrollment) {
        rows.push({
          ruleId: "SX-IDV-002",
          ruleName: "Coverage discovery",
          displayCode: "IDV-002",
          status: "PENDING",
          leftLabel: "Other health coverage found",
          rightValue: `Active out-of-state Medicaid — ${id.payerStateName ?? id.payerName ?? "other state"}`,
          note: "OOS-MCD: caseworker review required before determination.",
        });
        reviewReasons.push("active out-of-state Medicaid coverage");
      } else {
        rows.push({
          ruleId: "SX-IDV-002",
          ruleName: "Coverage discovery",
          displayCode: "IDV-002",
          status: ok ? "PASS" : "PENDING",
          leftLabel: "Other health coverage found",
          rightValue: ok ? "None found" : "Not checked",
        });
      }
      if (!ok) reviewReasons.push("identity not verified");
    }
    sections.push({ name: "Identity Verification", ordering: 1, summary: "CLEAR Verify Assist", rows });
  }

  // 2. Residency ------------------------------------------------------------------
  {
    const tenant = config.tenantState;
    const status: TraceStatus = !state ? "PENDING" : state === tenant ? "PASS" : "FAIL";
    if (status === "FAIL") hardFailures.push(`resident of ${state}, not ${tenant}`);
    sections.push({
      name: "Residency",
      ordering: 2,
      rows: [
        {
          ruleId: "SX-RES-001",
          ruleName: "State residency",
          displayCode: "RES-001",
          status,
          leftLabel: "State of residence",
          rightValue: !state
            ? "Not provided"
            : status === "PASS"
              ? `${state} — State-X resident (address on file)`
              : `${state} — outside State-X`,
        },
      ],
    });
  }

  // 3. Citizenship & Immigration ----------------------------------------------------
  {
    const ok = CITIZENSHIP_ELIGIBLE.has(primary.citizenshipStatus);
    if (!ok) hardFailures.push("citizenship / immigration status not eligible");
    sections.push({
      name: "Citizenship & Immigration",
      ordering: 3,
      rows: [
        {
          ruleId: "SX-CIT-001",
          ruleName: "Citizenship status",
          displayCode: "CIT-001",
          status: ok ? "PASS" : "FAIL",
          leftLabel: "Citizenship / immigration status",
          rightValue: `${CITIZENSHIP_LABEL[primary.citizenshipStatus] ?? primary.citizenshipStatus}${ok ? " — verified via SAVE" : ""}`,
        },
      ],
    });
  }

  // 4. Pathway ---------------------------------------------------------------------
  sections.push({
    name: "Pathway",
    ordering: 4,
    rows: [
      {
        ruleId: "SX-PATH-001",
        ruleName: "MAGI pathway",
        displayCode: "PATH-001",
        status: primaryNonMagi ? "FAIL" : "PASS",
        leftLabel: "Eligibility pathway",
        rightValue: primaryNonMagi ? "Not MAGI — ABD indicators present" : "MAGI (income-based)",
      },
      {
        ruleId: "SX-PATH-002",
        ruleName: "Non-MAGI (ABD) pathway",
        displayCode: "PATH-002",
        status: primaryNonMagi ? "PASS" : "FAIL",
        leftLabel: "Aged, blind or disabled indicators",
        rightValue: primaryNonMagi
          ? [primary.isDisabled && "disability", primary.receivingSSI && "SSI", primary.receivingSSDI && "SSDI"]
              .filter(Boolean)
              .join(", ")
              .replace(/^./, (c) => c.toUpperCase()) + " reported"
          : "None reported",
      },
    ],
  });

  // 5. Household & income -------------------------------------------------------------
  const primaryGroup = coverageGroupFor(primary);
  const primaryPct = primaryGroup.pct ?? 138;
  const limitAnnual = (fpl * primaryPct) / 100;
  const limitMonthly = limitAnnual / 12;
  const incomePasses = annualIncome <= limitAnnual;
  {
    const rows: TraceRow[] = [
      {
        ruleId: "SX-HH-001",
        ruleName: "Household size",
        displayCode: "HH-001",
        status: "PASS",
        leftLabel: "MAGI household size",
        rightValue: `${householdSize} ${householdSize === 1 ? "member" : "members"} (tax-filer rules)`,
      },
      {
        ruleId: "SX-INC-001",
        ruleName: "Household MAGI income",
        displayCode: "INC-001",
        status: "PASS",
        leftLabel: "Monthly household income",
        rightValue: `${money(monthlyIncome)}/mo · ${fplPct}% FPL (100% FPL for HH ${householdSize} = ${money(fpl / 12)}/mo)`,
      },
    ];
    if (!primaryNonMagi) {
      if (!incomePasses) hardFailures.push(`income ${fplPct}% FPL exceeds ${primaryPct}% limit`);
      rows.push({
        ruleId: "SX-INC-002",
        ruleName: "Income within MAGI threshold",
        displayCode: "INC-002",
        status: incomePasses ? "PASS" : "FAIL",
        leftLabel: `Income ≤ ${primaryPct}% FPL${primaryPct === 138 ? " (133% + 5% disregard)" : ""}`,
        rightValue: `Household income ${money(monthlyIncome)}/mo (${fplPct}% FPL) ${incomePasses ? "under" : "over"} the ${money(limitMonthly)}/mo threshold for HH of ${householdSize}.`,
        threshold: `≤${primaryPct}% FPL`,
      });
    }
    sections.push({ name: "Household & Income", ordering: 5, rows });
  }

  // 5b. Non-MAGI (ABD) tests ------------------------------------------------------------
  if (primaryNonMagi) {
    const abdIncomePass = annualIncome <= fpl;
    const resources = countableResources(intakeMembers.find((m) => str(m.relationship).toLowerCase() === "self") ?? intakeMembers[0]);
    const resourceLimit = householdSize >= 2 ? 3000 : 2000;
    const abdResourcePass = resources <= resourceLimit;
    if (!abdIncomePass) hardFailures.push("income exceeds ABD standard");
    if (!abdResourcePass) hardFailures.push("countable resources exceed ABD limit");
    sections.push({
      name: "SSI Status",
      ordering: 6,
      rows: [
        {
          ruleId: "SX-SSI-001",
          ruleName: "SSI recipient",
          displayCode: "SSI-001",
          status: primary.receivingSSI ? "PASS" : "FAIL",
          leftLabel: "Receives SSI",
          rightValue: primary.receivingSSI ? "Yes — categorically eligible (deemed disabled)" : "No SSI on file",
        },
      ],
    });
    sections.push({
      name: "ABD Category",
      ordering: 7,
      rows: [
        {
          ruleId: "SX-ABD-CAT",
          ruleName: "Disability determination",
          displayCode: "ABD-001",
          status: primary.receivingSSI ? "PASS" : "PENDING",
          leftLabel: "Disability status",
          rightValue: primary.receivingSSI ? "Deemed via SSI receipt" : "Self-attested — DDS determination required",
          note: primary.receivingSSI ? undefined : "Pending DDS disability determination",
        },
      ],
    });
    sections.push({
      name: "ABD Financial Tests",
      ordering: 8,
      rows: [
        {
          ruleId: "SX-ABD-INC",
          ruleName: "ABD income test",
          displayCode: "ABD-002",
          status: abdIncomePass ? "PASS" : "FAIL",
          leftLabel: "Income ≤ 100% FPL",
          rightValue: `${money(monthlyIncome)}/mo vs ${money(fpl / 12)}/mo standard (HH ${householdSize})`,
          threshold: "≤100% FPL",
        },
        {
          ruleId: "SX-ABD-RES",
          ruleName: "ABD resource test",
          displayCode: "ABD-003",
          status: abdResourcePass ? "PASS" : "FAIL",
          leftLabel: `Countable resources ≤ ${money(resourceLimit)}`,
          rightValue: `${money(resources)} countable (42 CFR §435.601)`,
          threshold: `≤${money(resourceLimit)}`,
        },
      ],
    });
    if (!primary.receivingSSI) reviewReasons.push("DDS disability determination pending");
  }

  // 6. Coverage group hierarchy (MAGI) -------------------------------------------------
  if (!primaryNonMagi) {
    const order: Array<keyof typeof COVERAGE_GROUPS> = ["DEEMED_NEWBORN", "INFANT", "CHILD", "PREGNANT", "PARENT", "ADULT"];
    sections.push({
      name: "Coverage Group",
      ordering: 9,
      summary: "Hierarchy evaluated top-down; the first matching group is assigned.",
      rows: order.map((key, i) => {
        const g = COVERAGE_GROUPS[key];
        const assigned = key === primaryGroup.key && incomePasses;
        return {
          ruleId: `SX-CG-00${i + 1}`,
          ruleName: `${g.label} group`,
          displayCode: `CG-00${i + 1}`,
          status: assigned ? "PASS" : "FAIL",
          leftLabel: "Coverage group",
          rightValue: g.label,
          slot: "hierarchy",
          threshold: g.pct ? `≤${g.pct}% FPL` : "Auto",
        } satisfies TraceRow;
      }),
    });
  }

  // 7. Final determination -------------------------------------------------------------
  let outcome: EvaluationOutcome;
  let finalStatus: TraceStatus;
  let finalValue: string;
  if (hardFailures.length) {
    outcome = "INELIGIBLE";
    finalStatus = "FAIL";
    finalValue = `Ineligible — ${hardFailures[0]}`;
  } else if (reviewReasons.length) {
    outcome = "NEEDS_REVIEW";
    finalStatus = "PENDING";
    finalValue = `Needs review — ${reviewReasons[0]}`;
  } else {
    outcome = "ELIGIBLE";
    finalStatus = "PASS";
    finalValue = primaryNonMagi
      ? "Financially eligible under Non-MAGI (ABD) — pending caseworker determination"
      : `Eligible — ${primaryGroup.label} — pending caseworker determination`;
  }
  sections.push({
    name: "Final Determination",
    ordering: 10,
    rows: [
      {
        ruleId: "SX-FIN-001",
        ruleName: "Eligibility outcome",
        displayCode: "FIN-001",
        status: finalStatus,
        leftLabel: "Engine outcome",
        rightValue: finalValue,
      },
    ],
  });

  const allRows = sections.flatMap((s) => s.rows);
  const trace: SectionedTrace = {
    outcome,
    evaluatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    sections,
    summary: {
      passed: allRows.filter((r) => r.status === "PASS").length,
      failed: allRows.filter((r) => r.status === "FAIL").length,
      pending: allRows.filter((r) => r.status === "PENDING").length,
    },
  };

  const determinations: DeterminationSeed[] = members.map((m) => {
    const nonMagi = m.isDisabled || m.receivingSSI || m.receivingSSDI;
    const group = coverageGroupFor(m);
    const pct = group.pct ?? 138;
    const passes = nonMagi ? annualIncome <= fpl : annualIncome <= (fpl * pct) / 100;
    return {
      personId: m.personId,
      isPrimary: m.isPrimary,
      category: nonMagi ? "NON_MAGI" : "MAGI",
      coverageGroup: nonMagi ? NON_MAGI_GROUP_LABEL : group.label,
      notes: nonMagi
        ? `Coverage group: ${NON_MAGI_GROUP_LABEL}`
        : `Coverage group: ${group.label} (≤${pct}% FPL)`,
      incomePasses: passes,
    };
  });

  return { trace, determinations };
}

// Sum of a member's countable Non-MAGI resources (mirrors the wizard's asset map).
const COUNTABLE_ASSET_MAP: ReadonlyArray<readonly [string, string]> = [
  ["hasChecking", "checkingAmount"],
  ["hasSavings", "savingsAmount"],
  ["hasCash", "cashAmount"],
  ["hasCdBonds", "cdBondsAmount"],
  ["hasRetirement", "retirementAmount"],
  ["hasOtherRealEstate", "otherRealEstateValue"],
  ["hasExtraVehicles", "extraVehiclesValue"],
  ["hasLifeInsurance", "lifeInsuranceValue"],
  ["hasTrusts", "trustsValue"],
  ["hasTransfers60mo", "transfers60moValue"],
];

function countableResources(member: Record<string, unknown> | undefined): number {
  const res = rec(member?.nonMagiResources);
  let total = 0;
  for (const [hasKey, amountKey] of COUNTABLE_ASSET_MAP) {
    if (res[hasKey] !== true) continue;
    const raw = res[amountKey];
    const amount = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(amount)) total += amount;
  }
  return Math.round(total * 100) / 100;
}
