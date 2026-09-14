import { fromJson } from "../db.js";
import { saveCaseAssistNarrative, toCase, type CaseRow } from "../ee/cases.js";
import { primaryFlagForVerification, toVerification, verificationForCase } from "../verifications.js";
import { generateNarrative, narrativeMode, type NarrativeSource } from "./narrative.js";
import { deriveRecommendations, type CaseAssistRecommendation } from "./rules.js";

export interface CaseAssistResult {
  recommendations: CaseAssistRecommendation[];
  narrative: string | null;
  narrativeSource: NarrativeSource;
  generatedAt: string;
}

export function recommendationsFor(row: CaseRow): CaseAssistRecommendation[] {
  const eeCase = toCase(row);
  const vRow = verificationForCase(row.id);
  const verification = vRow ? toVerification(vRow) : null;
  const flagRow = vRow ? primaryFlagForVerification(vRow.id) : undefined;
  return deriveRecommendations(
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
    flagRow ? { status: flagRow.status } : null,
  );
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function summaryFor(row: CaseRow) {
  const intake = fromJson<Record<string, unknown>>(row.intake_data) ?? {};
  const name = typeof intake.applicantName === "string" ? intake.applicantName.trim().split(/\s+/)[0] : "";
  const hh = typeof intake.householdSize === "number" ? intake.householdSize : null;
  const program = typeof intake.requestedProgram === "string" && intake.requestedProgram ? intake.requestedProgram : "State Medicaid";
  return { applicantFirstName: name, householdSize: hh, requestedProgram: program, status: row.status };
}

// One in-flight generation per case so a burst of `caseAssist` reads (list +
// detail) shares a single Claude call instead of racing.
const inflight = new Map<string, Promise<CaseAssistResult>>();

/**
 * Recommendations are recomputed on every read (cheap, deterministic). The
 * narrative is cached on the case and regenerated only when the set of
 * recommendation ids changes.
 */
export async function ensureCaseAssist(row: CaseRow): Promise<CaseAssistResult> {
  const recs = recommendationsFor(row);
  const ids = recs.map((r) => r.id);
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
      const { narrative, source } = await generateNarrative(summaryFor(row), recs);
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
