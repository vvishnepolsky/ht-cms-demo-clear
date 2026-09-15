import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Package root (apps/server), independent of the process cwd.
export const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Minimal .env loader (no dotenv dep): KEY=VALUE lines, # comments, optional
// surrounding quotes. Real env vars win over file values.
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(PKG_ROOT, ".env"));

// Single-URL deploy: every app is same-origin under one host. Render provides
// RENDER_EXTERNAL_URL at runtime; PUBLIC_URL overrides. Empty in local dev.
const publicUrl = (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 4000);

const clearApiKey = process.env.CLEAR_API_KEY ?? "";
const clearProjectId = process.env.CLEAR_PROJECT_ID ?? "";
const clearConfigured = Boolean(clearApiKey && clearProjectId);
let mockClear = process.env.MOCK_CLEAR !== "false";
if (!mockClear && !clearConfigured) {
  console.warn(
    "[config] MOCK_CLEAR=false but CLEAR_API_KEY / CLEAR_PROJECT_ID are missing — running in mock mode instead.",
  );
  mockClear = true;
}


/**
 * DEMO_ENRICHMENT_PASSTHROUGH — comma-separated `traits.document` fields that
 * keep CLEAR's REAL value when the demo overlay applies to a sandbox run
 * (everything else, incl. the South Carolina coverage, stays demo data).
 * Aliases: `name` → first_name,middle_name,last_name · `dob`/`date_of_birth`
 * → dob · `address` → address_1,address_2,city,subdivision,postal_code ·
 * `all` → every document field. Empty (default) = full overlay, as before.
 */
export const DOCUMENT_FIELDS = [
  "document_type", "first_name", "middle_name", "last_name", "dob", "sex", "address_1", "address_2", "city",
  "subdivision", "postal_code", "country", "document_number", "issuing_subdivision", "issuing_country",
  "issued_date", "expiration_date",
] as const;
export type DocumentField = (typeof DOCUMENT_FIELDS)[number];
const PASSTHROUGH_ALIASES: Record<string, DocumentField[]> = {
  name: ["first_name", "middle_name", "last_name"],
  dob: ["dob"],
  date_of_birth: ["dob"],
  birthdate: ["dob"],
  address: ["address_1", "address_2", "city", "subdivision", "postal_code"],
  all: [...DOCUMENT_FIELDS],
};
export function parsePassthrough(raw: string | undefined): DocumentField[] {
  const out = new Set<DocumentField>();
  for (const token of (raw ?? "").split(",")) {
    const key = token.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!key) continue;
    const expanded = PASSTHROUGH_ALIASES[key] ?? ((DOCUMENT_FIELDS as readonly string[]).includes(key) ? [key as DocumentField] : null);
    if (!expanded) {
      console.warn(`[config] DEMO_ENRICHMENT_PASSTHROUGH: unknown field "${token.trim()}" ignored.`);
      continue;
    }
    for (const f of expanded) out.add(f);
  }
  return [...out];
}


/**
 * Demo identities (mock mode, or sandbox + DEMO_ENRICHMENT). Name and date of
 * birth are configurable from the environment so the storyline can star anyone:
 *   DEMO_APPLICANT_FIRST_NAME / DEMO_APPLICANT_MIDDLE_NAME / DEMO_APPLICANT_LAST_NAME / DEMO_APPLICANT_DOB
 *   DEMO_HOUSEHOLD_FIRST_NAME / DEMO_HOUSEHOLD_MIDDLE_NAME / DEMO_HOUSEHOLD_LAST_NAME / DEMO_HOUSEHOLD_DOB
 * DOB must be ISO yyyy-mm-dd; an invalid value falls back to the default with a warning.
 */
export interface DemoPerson {
  firstName: string;
  middleName: string | null;
  lastName: string;
  dob: string;
  /** "M" | "F" | "X" | null — DEMO_*_SEX; null leaves the wizard's sex field unselected. */
  sex: string | null;
}
function envSex(key: string, fallback: string | null): string | null {
  const v = process.env[key]?.trim().toUpperCase();
  if (v === undefined || v === "") return fallback;
  if (v === "M" || v === "F" || v === "X") return v;
  console.warn(`[config] ${key}="${process.env[key]}" must be M, F or X; leaving unset.`);
  return fallback;
}
function envStr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v ? v : fallback;
}
function envDob(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  if (!v) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    console.warn(`[config] ${key}="${v}" is not an ISO date (yyyy-mm-dd); using ${fallback}.`);
    return fallback;
  }
  return v;
}
function demoPerson(prefix: string, d: DemoPerson): DemoPerson {
  const middle = process.env[`${prefix}_MIDDLE_NAME`]?.trim();
  return {
    firstName: envStr(`${prefix}_FIRST_NAME`, d.firstName),
    middleName: middle === undefined ? d.middleName : middle || null,
    lastName: envStr(`${prefix}_LAST_NAME`, d.lastName),
    dob: envDob(`${prefix}_DOB`, d.dob),
    sex: envSex(`${prefix}_SEX`, d.sex),
  };
}
export const DEMO_APPLICANT: DemoPerson = demoPerson("DEMO_APPLICANT", {
  firstName: "Jordan",
  middleName: null,
  lastName: "Rivera",
  dob: "1991-01-10",
  sex: null,
});
export const DEMO_HOUSEHOLD_MEMBER: DemoPerson = demoPerson("DEMO_HOUSEHOLD", {
  firstName: "Sam",
  middleName: null,
  lastName: "Rivera",
  dob: "1993-03-14",
  sex: null,
});

/** Single demo tenant (State-X). Every GraphQL entity carries this customerId. */
export const CUSTOMER_ID = "00000000-0000-4000-a000-000000000003";

export const config = {
  port,
  isProduction: process.env.NODE_ENV === "production",
  /** Absolute base URL of this server (hostedUrl, uploadUrl, notice links). */
  publicUrl: publicUrl || `http://localhost:${port}`,
  mockClear,
  clearConfigured,
  // Opt-in: overlay the deterministic demo identities (Jordan Rivera + SC
  // Medicaid storyline) even on real sandbox runs. Default off — real runs
  // return CLEAR's actual data. Mock mode always uses demo identities.
  demoEnrichment: process.env.DEMO_ENRICHMENT === "true",
  // Document fields that pass through from CLEAR when the overlay applies to a
  // real (sandbox) run — see parsePassthrough. Mock runs have no real data.
  demoEnrichmentPassthrough: parsePassthrough(process.env.DEMO_ENRICHMENT_PASSTHROUGH),
  demoApplicant: DEMO_APPLICANT,
  demoHouseholdMember: DEMO_HOUSEHOLD_MEMBER,
  clearApiKey,
  clearProjectId,
  // Resident portal sits at the deploy root; the hosted flow lives under /verify.
  residentAppUrl: (process.env.RESIDENT_APP_URL ?? (publicUrl || "http://localhost:5181")).replace(/\/$/, ""),
  verifyAppUrl: (process.env.VERIFY_APP_URL ?? (publicUrl ? `${publicUrl}/verify` : "http://localhost:5187")).replace(
    /\/$/,
    "",
  ),
  // Path (relative to residentAppUrl) the hosted flow returns to; the server
  // appends `verified=<verificationId>` as a query param.
  verifyAssistReturnPath: process.env.VERIFY_ASSIST_RETURN_PATH ?? "/#/personal",
  databasePath: resolve(PKG_ROOT, process.env.DATABASE_PATH ?? "./data/demo.db"),

  // Tenant jurisdiction — drives the out-of-state Medicaid rule. State-X (SX);
  // the applicant's South Carolina Medicaid is out-of-state.
  tenantState: process.env.VERIFY_ASSIST_TENANT_STATE ?? "SX",

  // Hosted-flow token lifetime (hours).
  flowTokenTtlHours: Number(process.env.VERIFY_ASSIST_FLOW_TOKEN_TTL_HOURS ?? 24),

  // Case Assist narrative: Claude when a key is present, template otherwise.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  caseAssistModel: process.env.CASE_ASSIST_MODEL ?? "claude-opus-5",

  // Serve the built SPAs from this server (single-service deploy). On in prod.
  serveStatic: process.env.SERVE_STATIC === "true" || process.env.NODE_ENV === "production",
} as const;
