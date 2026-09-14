import { fromJson } from "../db.js";
import { saveCaseAssistNarrative, toCase, type CaseRow } from "../ee/cases.js";
import { primaryFlagForVerification, toVerification, verificationForCase } from "../verifications.js";
import { generateNarrative, narrativeMode, type NarrativeCaseSummary, type NarrativeSource } from "./narrative.js";
import { deriveRecommendations, type CaseAssistRecommendation } from "./rules.js";

export interface CaseAssistResult {
  recommendations: CaseAssistRecommendation[];
  narrative: string | null;
  narrativeSource: NarrativeSource;
  generatedAt: string;
}

interface CaseAssistInputs {
  eeCase: ReturnType<typeof toCase>;
  verification: ReturnType<typeof toVerification> | null;
  flagRow: ReturnType<typeof primaryFlagForVerification>;
  recs: CaseAssistRecommendation[];
}

function caseAssistInputs(row: CaseRow): CaseAssistInputs {
  const eeCase = toCase(row);
  const vRow = verificationForCase(row.id);
  const verification = vRow ? toVerification(vRow) : null;
  const flagRow = vRow ? primaryFlagForVerification(vRow.id) : undefined;
  const recs = deriveRecommendations(
    {
      status: eeCase.status,
      flagReason: eeCase.flagReason,
      intakeData: eeCase.intakeData,
      rfiDetails: eeCase.rfiDetails,
      incomeVerification: eeCase.incomeVerification,
    },
    verification
      ? {
          status: verification.status,
          checks: verification.checks,
          resolution: verification.resolution,
          determination: verification.determination,
        }
      : null,
    flagRow ? { status: flagRow.status, dispositionReason: flagRow.disposition_reason ?? null } : null,
  );
  return { eeCase, verification, flagRow, recs };
}

export function recommendationsFor(row: CaseRow): CaseAssistRecommendation[] {
  return caseAssistInputs(row).recs;
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function summaryFor(row: CaseRow, inputs: CaseAssistInputs): NarrativeCaseSummary {
  const intake = fromJson<Record<string, unknown>>(row.intake_data) ?? {};
  const name = typeof intake.applicantName === "string" ? intake.applicantName.trim().split(/\s+/)[0] : "";
  const hh = typeof intake.householdSize === "number" ? intake.householdSize : null;
  const program = typeof intake.requestedProgram === "string" && intake.requestedProgram ? intake.requestedProgram : "State Medicaid";
  const { verification, flagRow } = inputs;
  const det = verification?.determination ?? null;
  const outOfState =
    det?.duplicate_enrollment || flagRow
      ? {
          stateName: det?.payer_state_name ?? det?.payer_state ?? "another state",
          payer: det?.coverage?.payer_name ?? `${det?.payer_state_name ?? "out-of-state"} Medicaid`,
          flagStatus: flagRow?.status ?? "open",
          updatedAt: flagRow?.updated_at ?? null,
          dispositionReason: flagRow?.disposition_reason ?? null,
        }
      : null;
  return {
    applicantFirstName: name,
    householdSize: hh,
    requestedProgram: program,
    status: row.status,
    identityVerified: verification ? verification.status === "success" : null,
    outOfState,
    rfiPending: !!row.flag_reason?.startsWith("rfi:"),
  };
}

// One in-flight generation per case so a burst of `caseAssist` reads (list +
// detail) shares a single Claude call instead of racing.
const inflight = new Map<string, Promise<CaseAssistResult>>();

/**
 * Recommendations are recomputed on every read (cheap, deterministic). The
 * narrative is cached on the case and regenerated only when its inputs change:
 * the case status, the Verify Assist flag status, whether an RFI is pending,
 * and the set of recommendation ids + severities — so working the flag or
 * moving the case regenerates the paragraph instead of serving stale guidance.
 */
function narrativeCacheKey(row: CaseRow, inputs: CaseAssistInputs): string[] {
  return [
    `status:${row.status}`,
    `flag:${inputs.flagRow?.status ?? "none"}`,
    `rfi:${row.flag_reason?.startsWith("rfi:") ? "pending" : "none"}`,
    ...inputs.recs.map((r) => `${r.id}@${r.severity}`),
  ];
}

export async function ensureCaseAssist(row: CaseRow): Promise<CaseAssistResult> {
  const inputs = caseAssistInputs(row);
  const recs = inputs.recs;
  const ids = narrativeCacheKey(row, inputs);
  const cachedIds = fromJson<string[]>(row.case_assist_rec_ids) ?? null;
  const cachedSource = (row.case_assist_narrative_source as NarrativeSource | null) ?? null;
  // Cache hit — also when a template narrative is cached and no key is configured,
  // or a Claude narrative is cached. A cached template while a key IS configured
  // gets upgraded to Claude on the next read.
  if (row.case_assist_narrative && cachedIds && sameIds(cachedIds, ids) && cachedSource && cachedSource === narrativeMode()) {
    return {
      recommendations: recs,
      narrative: row.case_assist_narrative,
      narrativeSource: cachedSource,
      generatedAt: row.updated_at,
    };
  }
  const existing = inflight.get(row.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { narrative, source } = await generateNarrative(summaryFor(row, inputs), recs);
      saveCaseAssistNarrative(row.id, narrative, source, ids);
      return { recommendations: recs, narrative, narrativeSource: source, generatedAt: new Date().toISOString() };
    } finally {
      inflight.delete(row.id);
    }
  })();
  inflight.set(row.id, p);
  return p;
}

/** Fire-and-forget variant used at case creation. */
export function kickOffCaseAssist(row: CaseRow): void {
  ensureCaseAssist(row).catch((err) => console.warn("[case-assist] background narrative failed:", err));
}
