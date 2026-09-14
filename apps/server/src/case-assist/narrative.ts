import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { CaseAssistRecommendation } from "./rules.js";

/**
 * Case Assist narrative: a 2–3 sentence caseworker-facing paragraph grounded
 * ONLY in the recommendations list and a minimal case summary. Template by
 * default; Claude when ANTHROPIC_API_KEY is set. Any API problem falls back to
 * the template — a narrative can never fail a GraphQL request.
 *
 * PHI posture: the prompt carries the applicant's first name, household size,
 * requested program, case status, and the recommendation titles/bodies. No
 * SSN, DOB, address, member ids or document numbers are ever sent.
 */

export type NarrativeSource = "claude" | "template";

export interface NarrativeCaseSummary {
  applicantFirstName: string;
  householdSize: number | null;
  requestedProgram: string;
  status: string;
}

export interface NarrativeResult {
  narrative: string;
  source: NarrativeSource;
}

export function narrativeMode(): NarrativeSource {
  return config.anthropicApiKey ? "claude" : "template";
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_VERIFICATION: "pending verification",
  IN_REVIEW: "in review",
  APPROVED: "approved",
  DENIED: "denied",
  CANCELED: "canceled",
};

export function templateNarrative(summary: NarrativeCaseSummary, recs: CaseAssistRecommendation[]): string {
  const who = summary.applicantFirstName || "The applicant";
  const hh = summary.householdSize ? ` for a household of ${summary.householdSize}` : "";
  const status = STATUS_LABEL[summary.status] ?? summary.status.toLowerCase();
  const lead = `${who}'s ${summary.requestedProgram} application${hh} is ${status}.`;

  const critical = recs.find((r) => r.severity === "critical");
  const warnings = recs.filter((r) => r.severity === "warning");
  const infos = recs.filter((r) => r.severity === "info");

  const parts: string[] = [lead];
  if (critical) {
    parts.push(
      `${critical.title}: ${critical.suggestedActions[0] ? `${critical.suggestedActions[0].replace(/\.$/, "")}, then ${critical.suggestedActions.slice(1, 2).join("").replace(/^./, (c) => c.toLowerCase()) || "hold the determination until resolved"}.` : "review before proceeding."}`,
    );
  } else if (warnings.length) {
    parts.push(`Before deciding: ${warnings.map((w) => w.title.replace(/\.$/, "")).join("; ")}.`);
  } else {
    parts.push("No blocking findings — the case is ready for the caseworker's determination.");
  }
  if (critical && warnings.length) {
    parts.push(`Also note: ${warnings.map((w) => w.title.replace(/\.$/, "")).join("; ")}.`);
  } else if (infos.length) {
    const verified = infos.find((i) => i.id === "identity-verified");
    const rest = infos.filter((i) => i !== verified);
    const bits: string[] = [];
    if (verified) bits.push("identity is already verified by CLEAR");
    if (rest.length) bits.push(rest.map((i) => i.title.replace(/\.$/, "").toLowerCase()).join("; "));
    if (bits.length) parts.push(`${bits.join("; ").replace(/^./, (c) => c.toUpperCase())}.`);
  }
  return parts.join(" ");
}

const SYSTEM = `You write the context paragraph of a Case Assist panel for a state Medicaid caseworker portal.
Write 2-3 plain-prose sentences for the caseworker: state the most important finding first, then the concrete next step.
Ground every statement ONLY in the CASE SUMMARY and RECOMMENDATIONS you are given — never invent facts, figures, dates, names or policies.
Do not include SSNs, dates of birth, addresses or member IDs. Do not use markdown, headings, bullets or quotes. Respond with the paragraph only.`;

function buildPrompt(summary: NarrativeCaseSummary, recs: CaseAssistRecommendation[]): string {
  const lines = [
    "CASE SUMMARY",
    `- Applicant first name: ${summary.applicantFirstName || "unknown"}`,
    `- Household size: ${summary.householdSize ?? "unknown"}`,
    `- Requested program: ${summary.requestedProgram}`,
    `- Case status: ${summary.status}`,
    "",
    "RECOMMENDATIONS (highest priority first)",
  ];
  if (!recs.length) lines.push("- (none — no findings)");
  for (const r of recs) {
    lines.push(`- [${r.severity.toUpperCase()}] ${r.title}: ${r.body}`);
  }
  return lines.join("\n");
}

let client: Anthropic | null = null;

async function claudeNarrative(summary: NarrativeCaseSummary, recs: CaseAssistRecommendation[]): Promise<string | null> {
  if (!config.anthropicApiKey) return null;
  try {
    client ??= new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 1, timeout: 20_000 });
    const res = await client.messages.create({
      model: config.caseAssistModel,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(summary, recs) }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.warn("[case-assist] Claude narrative failed; using template:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateNarrative(
  summary: NarrativeCaseSummary,
  recs: CaseAssistRecommendation[],
): Promise<NarrativeResult> {
  const fromClaude = await claudeNarrative(summary, recs);
  if (fromClaude) return { narrative: fromClaude, source: "claude" };
  return { narrative: templateNarrative(summary, recs), source: "template" };
}
