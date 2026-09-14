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
