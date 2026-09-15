#!/usr/bin/env node
/**
 * Scenario-B smoke: DEMO_COVERAGE_SCENARIO=employer_plan. Starts its OWN server
 * instance (default port 4794, scratch DB) so it never disturbs a running demo,
 * drives an applicant verification and a case, and asserts that an employer
 * plan is discovered but never treated as a duplicate-enrollment finding.
 *
 *   npm run smoke:employer -w @demo/server
 *   SMOKE_EMPLOYER_PORT=4795 npm run smoke:employer -w @demo/server
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const REPO = resolve(PKG, "..", "..");
const PORT = Number(process.env.SMOKE_EMPLOYER_PORT ?? 4794);
const BASE = `http://localhost:${PORT}`;
const DB = resolve(PKG, "data", "smoke-employer.db");
const CUSTOMER_ID = "00000000-0000-4000-a000-000000000003";

let step = 0;
const log = (msg) => console.log(`${String(++step).padStart(2, "0")}. ${msg}`);
let server = null;
let shuttingDown = false;
function fail(msg, extra) {
  console.error(`\nFAILED: ${msg}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2).slice(0, 4000));
  server?.kill();
  process.exit(1);
}
const assert = (cond, msg, extra) => {
  if (!cond) fail(msg, extra);
};

class Client {
  constructor(app) {
    this.app = app;
    this.cookies = new Map();
    this.bearer = null;
  }
  headers() {
    const h = { "content-type": "application/json" };
    if (this.app) h["x-app"] = this.app;
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (this.bearer) h.authorization = `Bearer ${this.bearer}`;
    return h;
  }
  async request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, { method, headers: this.headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json };
  }
  get(p) { return this.request("GET", p); }
  post(p, b) { return this.request("POST", p, b); }
  async gql(query, variables) {
    const r = await this.post("/graphql", { query, variables });
    assert(r.status === 200 && !r.json.errors, `GraphQL errors for ${query.slice(0, 60)}`, r.json);
    return r.json.data;
  }
}

// ── start the scenario-B server ───────────────────────────────────────────────
rmSync(DB, { force: true });
mkdirSync(dirname(DB), { recursive: true });
server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: PKG,
  env: {
    ...process.env,
    PORT: String(PORT),
    MOCK_CLEAR: "true",
    SERVE_STATIC: "false",
    DATABASE_PATH: DB,
    PUBLIC_URL: BASE,
    DEMO_COVERAGE_SCENARIO: "employer_plan",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
server.on("exit", (code) => {
  if (!shuttingDown && code !== null && code !== 0 && step > 0) fail(`server exited with ${code}`, serverLog.slice(-2000));
});
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${BASE}/api/health`);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const health = await new Client(null).get("/api/health");
assert(health.status === 200 && health.json.demoCoverageScenario === "employer_plan", "health reports employer_plan", health.json);
log(`scenario-B server up on ${BASE} (demoCoverageScenario=${health.json.demoCoverageScenario})`);

try {
  // ── resident + verification ────────────────────────────────────────────────
  const resident = new Client("cms-demo-resident");
  const email = `employer+${Date.now()}@example.com`;
  const reg = await resident.post("/api/auth/register", { email, password: "Password1234!", firstName: "Jordan", lastName: "Rivera", customerId: CUSTOMER_ID });
  assert(reg.status === 201, "register", reg.json);
  const login = await resident.post("/api/auth/login", { email, password: "Password1234!" });
  assert(login.status === 200, "login", login.json);
  const personId = login.json.session.personId;
  const token = login.json.session.sessionId;

  const va = new Client(null);
  va.bearer = token;
  const created = await va.post("/api/verifications", { role: "applicant" });
  assert(created.status === 201, "create verification", created.json);
  const flowToken = new URL(created.json.verification.hostedUrl).searchParams.get("token");
  const anon = new Client(null);
  const done = await anon.post(`/api/flow/sessions/${flowToken}/clear-complete`, {});
  assert(done.status === 200 && done.json.ok, "clear-complete", done.json);
  const session = (await anon.get(`/api/flow/sessions/${flowToken}`)).json.session;
  assert(session.status === "success", "flow completed", session);
  const det = session.determination;
  assert(det.result === "clear" && det.duplicate_enrollment === false && det.payer_state === null, "employer plan is NOT a duplicate enrollment", det);
  assert(det.coverage?.payer_name === "Aetna" && det.coverage.monthly_premium === 300 && det.coverage.coverage_type === "employer", "flow session carries the employer coverage", det.coverage);
  assert(det.coverage.insurance_member_id === "W123456789" && det.coverage.group_id === "G123456789" && det.coverage.policy_holder_first_name === "Jane" && det.coverage.policy_holder_relationship === "spouse" && det.coverage.coverage_start_date === "2026-01-01", "all nine employer values present", det.coverage);
  const mine = await va.get(`/api/verifications/${created.json.verification.id}`);
  assert(mine.status === 200 && mine.json.verification.determination.coverage?.payer_name === "Aetna", "resident view includes the (non-Medicaid) coverage", mine.json.verification.determination);
  assert(!("health_insurance" in (mine.json.verification.traits ?? {})), "raw traits.health_insurance still stripped for residents", mine.json.verification.traits);
  const flags = await anon.get(`/api/admin/flags`);
  assert(flags.status === 401 || flags.status === 403, "flags list is staff-only", flags.status);
  log("applicant verification: result=clear, duplicate_enrollment=false, coverage Aetna $300/mo (employer, spouse Jane Doe)");

  // ── staff: no flag was created ─────────────────────────────────────────────
  const staff = new Client("cms-demo-admin");
  const sl = await staff.post("/api/auth/login", { email: "caseworker@state-x.gov", password: "password1234" });
  assert(sl.status === 200, "staff login", sl.json);
  const vflags = await staff.get(`/api/verifications/${created.json.verification.id}/flags`);
  assert(vflags.status === 200 && (vflags.json.flags ?? []).length === 0, "no Verify Assist flag for an employer plan", vflags.json);
  log("no Verify Assist flag opened");

  // ── case ───────────────────────────────────────────────────────────────────
  const residentOps = readFileSync(resolve(REPO, "apps/resident/src/lib/operations.ts"), "utf8");
  const pick = (src, name) => {
    const m = src.match(new RegExp(`(?:query|mutation) ${name}[\\s\\S]*?\\n\`;`));
    assert(m, `operation ${name} found in client documents`);
    return m[0].replace(/\n`;$/, "");
  };
  const hh = await resident.gql(pick(residentOps, "CreateHousehold"), {
    input: { customerId: CUSTOMER_ID, members: [{ personId, role: "HEAD", startDate: new Date().toISOString() }] },
  });
  const householdId = hh.createHousehold.household.id;
  const applicationDate = new Date().toISOString().slice(0, 10);
  const intake = {
    displayMeta: { ssn: "123-45-6789" },
    applicant: {
      dateOfBirth: "1991-01-10",
      householdSize: 1,
      annualIncome: 18000,
      citizenshipStatus: "us_citizen",
      isPregnant: false,
      isDisabled: false,
      receivingSSI: false,
      receivingSSDI: false,
      employmentStatus: "employed",
      hasMedicare: false,
      stateOfResidence: "SX",
    },
    applicationDate,
    applicantName: "Jordan Rivera",
    householdSize: 1,
    householdMembers: [
      {
        personId,
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: "1991-01-10",
        relationship: "Self",
        address: { street: "742 Evergreen Terrace", city: "Springfield", state: "SX", zip: "55501" },
        phone: "555-123-4567",
        email,
        tribalMember: false,
        tribeName: "",
        income: { employmentIncome: 1500, selfEmploymentIncome: 0, otherIncome: 0, totalMonthly: 1500 },
        hasInsurance: true,
        // What the wizard submits when the insurance step was prefilled from CLEAR's coverage discovery.
        insurance: {
          type: "employer",
          insurer: "Aetna",
          policyNumber: "W123456789",
          groupNumber: "G123456789",
          premiumMonthly: 300,
          policyHolderIsOther: true,
          policyHolderName: "Jane Doe",
          policyHolderRelationship: "spouse",
          coverageStartDate: "2026-01-01",
          source: "clear",
        },
        nonMagiResources: null,
        citizenshipStatus: "us_citizen",
        isPregnant: false,
        isDisabled: false,
        receivingSSI: false,
        hasMedicare: false,
      },
    ],
    monthlyHouseholdIncome: 1500,
  };
  const cr = await resident.gql(pick(residentOps, "CreateMedicaidEeCase"), { input: { householdId, applicantPersonId: personId, intakeData: intake, identityVerificationId: created.json.verification.id } });
  assert(cr.createMedicaidEeCase.errors.length === 0, "case created", cr);
  const caseId = cr.createMedicaidEeCase.case.id;

  const ca = await staff.gql(
    `query CaseAssist($id: ID!) { medicaidEeCase(id: $id) { flagReason intakeData ruleEvaluations determinations { person { ssnLast4 } } identityVerification { determination { result duplicate_enrollment coverage_type coverage { payer_name coverage_type monthly_premium policy_holder_relationship } } flag { id } } caseAssist { narrative recommendations { id severity title suggestedActions rationale { citedFieldPaths } } } } }`,
    { id: caseId },
  );
  const c = ca.medicaidEeCase;
  assert(c.flagReason === null && !(c.intakeData?.displayMeta?.flags ?? []).includes("OOS-MCD"), "no OOS-MCD chip / flagReason", { flagReason: c.flagReason, flags: c.intakeData?.displayMeta?.flags });
  assert(c.determinations?.[0]?.person?.ssnLast4 === "6789", "SSN last-4 carried from CLEAR", c.determinations?.[0]?.person);
  log(`case ${cr.createMedicaidEeCase.case.caseNumber} created without OOS-MCD (flagReason null, ssnLast4 from CLEAR)`);
  const recs = ca.medicaidEeCase.caseAssist.recommendations;
  const ids = recs.map((r) => r.id);
  assert(ids.includes("other-coverage-employer") && !ids.includes("oos-medicaid"), "Case Assist has the TPL note and no OOS finding", ids);
  assert(!recs.some((r) => r.severity === "critical"), "no critical finding", recs.map((r) => [r.id, r.severity]));
  const tpl = recs.find((r) => r.id === "other-coverage-employer");
  assert(/Employer coverage on file — verify third-party liability \(TPL\)/.test(tpl.title) && tpl.suggestedActions[0] === "Record Aetna as third-party liability" && tpl.rationale.citedFieldPaths.includes("identityVerification.determination.coverage.coverage_type"), "TPL recommendation content", tpl);
  assert(ca.medicaidEeCase.identityVerification.flag === null && ca.medicaidEeCase.identityVerification.determination.coverage.payer_name === "Aetna", "staff view: no flag, employer coverage", ca.medicaidEeCase.identityVerification);
  const cov = (ca.medicaidEeCase.ruleEvaluations?.sections ?? []).flatMap((s) => s.rows ?? []).find((r) => r.ruleName === "Coverage discovery");
  assert(cov?.status === "PASS" && /Other coverage found \(employer plan\)/.test(cov.rightValue), "Evaluate trace row: other coverage found, PASS", cov);
  log(`Case Assist recs=${JSON.stringify(ids)}; trace row "${cov.rightValue}"`);

  console.log(`\nSMOKE (employer_plan) OK — ${step} steps passed against ${BASE}`);
} finally {
  shuttingDown = true;
  server.kill();
}
