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
 * requested program, case status, identity/coverage-finding status and the
 * recommendation titles. No SSN, DOB, address, member ids or document numbers
 * are ever sent.
 */

export type NarrativeSource = "claude" | "template";

export interface NarrativeOutOfStateSummary {
  /** e.g. "South Carolina" */
  stateName: string;
  /** e.g. "South Carolina Medicaid" */
  payer: string;
  /** open | in_review | resolved | dismissed */
  flagStatus: string;
  /** ISO timestamp of the last flag update (the resolution time once closed). */
  updatedAt: string | null;
  /** Disposition code once closed, e.g. disenrollment_confirmed. */
  dispositionReason: string | null;
}

export interface NarrativeCaseSummary {
  applicantFirstName: string;
  householdSize: number | null;
  requestedProgram: string;
  status: string;
  /** null = no linked verification yet. */
  identityVerified: boolean | null;
  /** The CLEAR out-of-state coverage finding, when the verification raised one. */
  outOfState: NarrativeOutOfStateSummary | null;
  rfiPending: boolean;
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

const DISPOSITION_LABELS: Record<string, string> = {
  disenrollment_confirmed: "disenrollment confirmed by the other state",
  proof_received: "applicant submitted proof coverage ended",
  coverage_terminated_by_applicant: "applicant terminated the other coverage",
  false_positive: "false positive — not the same person",
  coverage_inactive: "coverage record is stale / inactive",
  not_medicaid: "payer is not a Medicaid program",
  other: "other",
};

function dispositionLabel(code: string | null): string | null {
  if (!code) return null;
  return DISPOSITION_LABELS[code] ?? code.replace(/_/g, " ");
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Short status summary — deliberately does NOT restate the recommendation
 * bodies (the cards below the narrative carry those). Two to three sentences:
 * where the case stands, whether identity is verified, and the single most
 * important open item (or that the out-of-state finding was resolved).
 */
export function templateNarrative(summary: NarrativeCaseSummary, recs: CaseAssistRecommendation[]): string {
  const who = summary.applicantFirstName || "The applicant";
  const hh = summary.householdSize ? ` (household of ${summary.householdSize})` : "";
  const status = STATUS_LABEL[summary.status] ?? summary.status.toLowerCase();
  const parts: string[] = [`${who}'s ${summary.requestedProgram} application${hh} is ${status}.`];

  if (summary.identityVerified === true) parts.push("Identity verified by CLEAR.");
  else if (summary.identityVerified === false) parts.push("Identity not yet verified by CLEAR.");
  else if (recs.some((r) => r.id === "identity-unverified")) parts.push("No CLEAR identity verification is linked.");

  const oos = summary.outOfState;
  const oosOpen = oos && (oos.flagStatus === "open" || oos.flagStatus === "in_review");
  if (oos && oosOpen) {
    parts.push(
      `One open Verify Assist finding — active ${oos.payer} — must be resolved before determination${
        summary.rfiPending ? "; an RFI for proof of disenrollment is outstanding" : ""
      }.`,
    );
  } else if (oos) {
    const verb = oos.flagStatus === "dismissed" ? "dismissed" : "resolved";
    const when = shortDate(oos.updatedAt);
    const why = dispositionLabel(oos.dispositionReason);
    parts.push(`The out-of-state coverage finding was ${verb}${when ? ` on ${when}` : ""}${why ? ` (${why})` : ""}.`);
    if (summary.rfiPending) parts.push("An RFI is still outstanding.");
  } else if (summary.rfiPending) {
    parts.push("An RFI is outstanding; the case cannot be decided until the applicant responds.");
  } else if (summary.status === "APPROVED" || summary.status === "DENIED") {
    parts.push("The determination has been recorded.");
  } else {
    const blocking = recs.filter((r) => r.severity !== "info");
    parts.push(
      blocking.length
        ? `${blocking.length} item${blocking.length === 1 ? "" : "s"} need attention before determination.`
        : "No blocking findings — ready for the caseworker's determination.",
    );
  }
  // Other (non-Medicaid) coverage discovered — not a finding, but worth one line.
  const other = recs.find((r) => r.id.startsWith("other-coverage-"));
  if (other) {
    const type = other.id.replace("other-coverage-", "");
    parts.push(`CLEAR also found ${type === "employer" ? "an employer plan" : `${type} coverage`} — record it as third-party liability.`);
  }
  return parts.join(" ");
}

const SYSTEM = `You write the short status paragraph at the top of a Case Assist panel for a state Medicaid caseworker portal.
Write exactly 2 sentences of plain prose: (1) where the case stands and whether identity is verified, (2) the single most important open item, or that the out-of-state coverage finding was resolved (with the date and disposition when given).
Do NOT restate or list the recommendations — the cards below the paragraph carry their bodies and actions. No bullets, no markdown, no headings, no quotes.
Ground every statement ONLY in the CASE SUMMARY and the recommendation TITLES you are given — never invent facts, figures, dates, names or policies.
Do not include SSNs, dates of birth, addresses or member IDs. Respond with the paragraph only.`;

function buildPrompt(summary: NarrativeCaseSummary, recs: CaseAssistRecommendation[]): string {
  const oos = summary.outOfState;
  const lines = [
    "CASE SUMMARY",
    `- Applicant first name: ${summary.applicantFirstName || "unknown"}`,
    `- Household size: ${summary.householdSize ?? "unknown"}`,
    `- Requested program: ${summary.requestedProgram}`,
    `- Case status: ${summary.status}`,
    `- Identity verified by CLEAR: ${summary.identityVerified === null ? "no verification linked" : summary.identityVerified ? "yes" : "no"}`,
    `- Out-of-state coverage finding: ${
      oos
        ? `${oos.payer} (${oos.stateName}); Verify Assist flag ${oos.flagStatus}${
            oos.flagStatus === "resolved" || oos.flagStatus === "dismissed"
              ? ` on ${shortDate(oos.updatedAt) ?? "unknown date"}${oos.dispositionReason ? `, disposition: ${dispositionLabel(oos.dispositionReason)}` : ""}`
              : ""
          }`
        : "none"
    }`,
    `- RFI outstanding: ${summary.rfiPending ? "yes" : "no"}`,
    "",
    "OPEN RECOMMENDATION TITLES (highest priority first) — for context only, do not list them",
  ];
  if (!recs.length) lines.push("- (none)");
  for (const r of recs) lines.push(`- [${r.severity.toUpperCase()}] ${r.title}`);
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
