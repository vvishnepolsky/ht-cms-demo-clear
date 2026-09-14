#!/usr/bin/env node
/**
 * End-to-end smoke test for the State-X demo server. Drives the whole
 * storyline over HTTP against a running server (default http://localhost:4000;
 * override with SMOKE_BASE_URL) using the exact client operation documents.
 *
 *   npm run smoke -w @demo/server
 *
 * Exits non-zero on the first failed assertion.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const CUSTOMER_ID = "00000000-0000-4000-a000-000000000003";

let step = 0;
const log = (msg) => console.log(`${String(++step).padStart(2, "0")}. ${msg}`);
function assert(cond, msg, extra) {
  if (!cond) {
    console.error(`\nFAILED: ${msg}`);
    if (extra !== undefined) console.error(JSON.stringify(extra, null, 2).slice(0, 4000));
    process.exit(1);
  }
}

// ── tiny HTTP client with a cookie jar per app ─────────────────────────────────
class Client {
  constructor(app) {
    this.app = app;
    this.cookies = new Map();
    this.bearer = null;
  }
  headers(extra = {}) {
    const h = { "content-type": "application/json", ...extra };
    if (this.app) h["x-app"] = this.app;
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (this.bearer) h.authorization = `Bearer ${this.bearer}`;
    return h;
  }
  async request(method, path, body, extraHeaders) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: this.headers(extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json, headers: res.headers };
  }
  get(path, h) {
    return this.request("GET", path, undefined, h);
  }
  post(path, body, h) {
    return this.request("POST", path, body ?? {}, h);
  }
  async gql(query, variables, operationName) {
    const r = await this.post("/graphql", { query, variables, operationName });
    return r;
  }
}

// ── pull the exact operation documents out of the client source files ─────────
function loadOperations(file) {
  const src = readFileSync(resolve(REPO, file), "utf8");
  const ops = {};
  const re = /gql`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(src))) {
    const doc = m[1];
    const name = /(?:query|mutation)\s+(\w+)/.exec(doc)?.[1];
    if (name) ops[name] = doc;
  }
  return ops;
}
const OPERATION_FILES = [
  "apps/resident/src/lib/operations.ts",
  "apps/resident/src/lib/document-operations.ts",
  "apps/admin/src/lib/ee-operations.ts",
  "apps/admin/src/lib/audit-operations.ts",
];
const residentOps = { ...loadOperations(OPERATION_FILES[0]), ...loadOperations(OPERATION_FILES[1]) };
const adminOps = { ...loadOperations(OPERATION_FILES[2]), ...loadOperations(OPERATION_FILES[3]) };

function noGqlErrors(r, label) {
  assert(r.status === 200, `${label}: HTTP ${r.status}`, r.json);
  assert(!r.json.errors, `${label}: GraphQL errors`, r.json.errors);
  return r.json.data;
}

// ── storyline ───────────────────────────────────────────────────────────────────
const runId = Date.now().toString(36);
const resident = new Client("cms-demo-resident");
const staff = new Client("cms-demo-admin");
const anon = new Client(null);

const health = await anon.get("/api/health");
assert(health.status === 200 && health.json.ok === true, "health", health.json);
log(`health ok (mode=${health.json.mode}, narrative=${health.json.caseAssistNarrative})`);

// anonymous GraphQL → UNAUTHENTICATED
{
  const r = await anon.gql(residentOps.ListMyMedicaidEeCases, { applicantPersonId: "x" });
  assert(r.json?.errors?.[0]?.extensions?.code === "UNAUTHENTICATED", "anonymous GraphQL must be UNAUTHENTICATED", r.json);
  log("anonymous GraphQL rejected with UNAUTHENTICATED");
}

// Every operation document in the four client files must validate against the
// schema (no "Cannot query field" / unknown type or argument errors).
{
  const SCHEMA_ERROR = /Cannot query field|Unknown type|Unknown argument|Unknown fragment|is not defined by type|Field "[^"]+" is not defined|Unknown directive/;
  let count = 0;
  for (const file of OPERATION_FILES) {
    for (const [name, doc] of Object.entries(loadOperations(file))) {
      const r = await anon.gql(doc, {}, name);
      const schemaErrors = (r.json?.errors ?? []).filter((e) => SCHEMA_ERROR.test(e.message));
      assert(schemaErrors.length === 0, `${file} → ${name} does not validate against the schema`, schemaErrors);
      count += 1;
    }
  }
  log(`all ${count} client operation documents validate against the schema`);
}

// register + login (resident)
const email = `jordan.rivera+${runId}@example.com`;
{
  const r = await resident.post("/api/auth/register", {
    email,
    password: "password1234",
    firstName: "Jordan",
    lastName: "Rivera",
    customerId: CUSTOMER_ID,
  });
  assert(r.status === 201 && r.json.success === true && r.json.personId, "register", r.json);
  log(`registered resident ${email} → personId ${r.json.personId}`);
}
let residentUserId;
let residentToken;
{
  const r = await resident.post("/api/auth/login", { email, password: "password1234" });
  assert(r.status === 200 && r.json.success && r.json.session?.sessionId, "login", r.json);
  assert(r.json.payload.roles[0] === "resident" && r.json.payload.customerId === CUSTOMER_ID, "login payload", r.json);
  assert(resident.cookies.has("cms-demo-resident_session"), "resident cookie set", [...resident.cookies.keys()]);
  residentUserId = r.json.session.personId;
  residentToken = r.json.session.sessionId;
  log(`resident logged in (cookie + bearer ${residentToken.slice(0, 6)}…)`);
}
{
  const r = await resident.post("/api/enrollment", { personId: residentUserId, program: "MEDICAID" });
  assert(r.status === 200 && r.json.engagement?.status === "ACTIVE", "enrollment", r.json);
  const me = await resident.get("/api/auth/me");
  assert(me.json?.user?.id === residentUserId, "me", me.json);
  const refresh = await resident.post("/api/auth/refresh", {});
  assert(refresh.json?.success && typeof refresh.json.expiresIn === "number" && refresh.json.session.aal === "AAL1", "refresh", refresh.json);
  log("enrollment, /me and refresh ok");
}
// wrong app: resident token to the admin app is rejected
{
  const wrong = new Client("cms-demo-admin");
  wrong.bearer = residentToken;
  const r = await wrong.get("/api/auth/me");
  assert(r.status === 403 && r.json.error === "wrong_app", "wrong_app enforcement", r.json);
  log("x-app role enforcement → 403 wrong_app");
}

// person + household
{
  const r = await resident.gql(
    residentOps.UpdatePerson,
    {
      input: {
        personId: residentUserId,
        dateOfBirth: "1991-01-10",
        ssn: "123-45-6789",
        addresses: [
          { use: "HOME", type: "PHYSICAL", line: ["742 Evergreen Terrace"], city: "Springfield", state: "SX", postalCode: "55501", country: "US", isPrimary: true },
        ],
        phones: [{ use: "MOBILE", value: "555-123-4567", isPrimary: true }],
        emails: [{ value: email }],
      },
    },
    "UpdatePerson",
  );
  const d = noGqlErrors(r, "UpdatePerson");
  assert(d.updatePerson.person?.personId === residentUserId && d.updatePerson.errors.length === 0, "updatePerson", d);
  log("UpdatePerson ok");
}
let samPersonId;
{
  const r = await resident.gql(
    residentOps.CreatePerson,
    { input: { firstName: "Sam", lastName: "Rivera", dateOfBirth: "1993-03-14" } },
    "CreatePerson",
  );
  const d = noGqlErrors(r, "CreatePerson");
  samPersonId = d.createPerson.person?.personId;
  assert(samPersonId, "createPerson", d);
  log(`CreatePerson (household member) → ${samPersonId}`);
}
let householdId;
{
  const startDate = new Date().toISOString();
  const r = await resident.gql(
    residentOps.CreateHousehold,
    { input: { customerId: CUSTOMER_ID, members: [{ personId: residentUserId, role: "HEAD", startDate }] } },
    "CreateHousehold",
  );
  const d = noGqlErrors(r, "CreateHousehold");
  householdId = d.createHousehold.household?.id;
  assert(householdId && d.createHousehold.household.customerId === CUSTOMER_ID, "createHousehold", d);
  const r2 = await resident.gql(
    residentOps.AddHouseholdMember,
    { input: { householdId, customerId: CUSTOMER_ID, personId: samPersonId, role: "SPOUSE", relationshipToHead: "Spouse", startDate } },
    "AddHouseholdMember",
  );
  const d2 = noGqlErrors(r2, "AddHouseholdMember");
  assert(d2.addHouseholdMember.household?.id === householdId, "addHouseholdMember", d2);
  const r3 = await resident.gql(residentOps.GetHousehold, { id: householdId, customerId: CUSTOMER_ID }, "GetHousehold");
  const d3 = noGqlErrors(r3, "GetHousehold");
  assert(d3.household.members.length === 2 && d3.household.members[0].role === "HEAD", "household members", d3);
  log(`CreateHousehold + AddHouseholdMember + GetHousehold ok (${householdId})`);
  // remove + re-add so the roster is back to two members for the rest of the storyline
  const r4 = await resident.gql(residentOps.RemoveHouseholdMember, { input: { householdId, personId: samPersonId, customerId: CUSTOMER_ID } }, "RemoveHouseholdMember");
  const d4 = noGqlErrors(r4, "RemoveHouseholdMember");
  assert(d4.removeHouseholdMember.household?.id === householdId && d4.removeHouseholdMember.errors.length === 0, "removeHouseholdMember", d4);
  const after = noGqlErrors(await resident.gql(residentOps.GetHousehold, { id: householdId, customerId: CUSTOMER_ID }, "GetHousehold"), "GetHousehold after remove");
  assert(after.household.members.length === 1, "member removed", after);
  noGqlErrors(
    await resident.gql(residentOps.AddHouseholdMember, { input: { householdId, customerId: CUSTOMER_ID, personId: samPersonId, role: "SPOUSE", relationshipToHead: "Spouse", startDate } }, "AddHouseholdMember"),
    "AddHouseholdMember (re-add)",
  );
  const draft = noGqlErrors(
    await resident.gql(residentOps.RequestDraftUploadUrl, { input: { draftId: "11111111-1111-4111-8111-111111111111", sectionKey: "income", documentCategory: "income-proof", mimeType: "application/pdf", program: "MEDICAID_EE" } }, "RequestDraftUploadUrl"),
    "RequestDraftUploadUrl",
  );
  assert(draft.requestDraftUploadUrl.uploadUrl && draft.requestDraftUploadUrl.s3Key, "draft upload url", draft);
  log("RemoveHouseholdMember (+ re-add) and RequestDraftUploadUrl ok");
}

// resident GraphQL auth shapes (kept for operation parity with the resident app;
// exercised only while the resident operations file still declares them)
if (residentOps.LoginResident && residentOps.CreateResidentAccount) {
  const gqlAuth = new Client("cms-demo-resident");
  const em = `gql.auth+${runId}@example.com`;
  const created = noGqlErrors(
    await gqlAuth.gql(residentOps.CreateResidentAccount, { input: { email: em, password: "password1234", firstName: "Gql", lastName: "Resident" } }, "CreateResidentAccount"),
    "CreateResidentAccount",
  );
  assert(created.createResidentAccount.resident?.personId && created.createResidentAccount.errors.length === 0, "createResidentAccount", created);
  assert(gqlAuth.cookies.has("cms-demo-resident_session"), "GraphQL auth sets cookie", [...gqlAuth.cookies.keys()]);
  const me = noGqlErrors(await gqlAuth.gql(residentOps.ResidentMe, {}, "ResidentMe"), "ResidentMe");
  assert(me.residentMe?.email === em, "residentMe", me);
  const me2 = noGqlErrors(await gqlAuth.gql(residentOps.Me, {}, "Me"), "Me");
  assert(me2.me?.email === em, "me", me2);
  const refreshed = noGqlErrors(await gqlAuth.gql(residentOps.RefreshResidentToken, {}, "RefreshResidentToken"), "RefreshResidentToken");
  assert(typeof refreshed.refreshResidentToken.expiresIn === "number", "refreshResidentToken", refreshed);
  const out = noGqlErrors(await gqlAuth.gql(residentOps.LogoutResident, {}, "LogoutResident"), "LogoutResident");
  assert(out.logoutResident.success === true, "logoutResident", out);
  const login = noGqlErrors(await gqlAuth.gql(residentOps.LoginResident, { input: { email: em, password: "password1234" } }, "LoginResident"), "LoginResident");
  assert(login.loginResident.resident?.email === em && login.loginResident.expiresIn > 0, "loginResident", login);
  const bad = noGqlErrors(await gqlAuth.gql(residentOps.LoginResident, { input: { email: em, password: "nope-nope" } }, "LoginResident"), "LoginResident bad");
  assert(bad.loginResident.resident === null && bad.loginResident.errors[0]?.code === "INVALID_CREDENTIALS", "loginResident bad creds", bad);
  log("resident GraphQL auth mutations (createResidentAccount/login/refresh/logout/residentMe) ok");
} else {
  const gqlAuth = new Client("cms-demo-resident");
  const em = `gql.auth+${runId}@example.com`;
  const created = noGqlErrors(
    await gqlAuth.gql(
      `mutation CreateResidentAccount($input: CreateResidentAccountInput!) { createResidentAccount(input: $input) { resident { id email personId } expiresIn errors { code message } } }`,
      { input: { email: em, password: "password1234", firstName: "Gql", lastName: "Resident" } },
    ),
    "createResidentAccount",
  );
  assert(created.createResidentAccount.resident?.personId && gqlAuth.cookies.has("cms-demo-resident_session"), "createResidentAccount", created);
  const me = noGqlErrors(await gqlAuth.gql(`{ residentMe { id email } me { id email } }`), "residentMe/me");
  assert(me.residentMe?.email === em && me.me?.email === em, "residentMe/me", me);
  const login = noGqlErrors(
    await gqlAuth.gql(`mutation Login($input: LoginResidentInput!) { loginResident(input: $input) { resident { email } expiresIn errors { code message } } }`, { input: { email: em, password: "wrong-password" } }),
    "loginResident bad",
  );
  assert(login.loginResident.errors[0]?.code === "INVALID_CREDENTIALS", "loginResident bad creds", login);
  const out = noGqlErrors(await gqlAuth.gql(`mutation { logoutResident { success errors { code message } } }`), "logoutResident");
  assert(out.logoutResident.success === true, "logoutResident", out);
  log("resident GraphQL auth mutations (createResidentAccount/loginResident/residentMe/logoutResident) ok");
}

// Verify Assist: applicant verification through the hosted flow (bearer auth, no x-app)
async function runVerification(role, resolution) {
  const va = new Client(null);
  va.bearer = residentToken;
  const created = await va.post("/api/verifications", { role });
  assert(created.status === 201 && /^SX-APP-\d{4}-\d{6}$/.test(created.json.verification.externalRef), "create verification", created.json);
  const { id, hostedUrl } = created.json.verification;
  const token = new URL(hostedUrl).searchParams.get("token");
  assert(token, "hostedUrl token", created.json);
  const s1 = await anon.get(`/api/flow/sessions/${token}`);
  assert(s1.status === 200 && s1.json.session.status === "awaiting_user" && s1.json.session.mode === "mock", "flow session", s1.json);
  assert(s1.json.session.returnTo.endsWith(`/#/personal?verified=${id}`), "returnTo path", s1.json.session.returnTo);
  const done = await anon.post(`/api/flow/sessions/${token}/clear-complete`, {});
  assert(done.status === 200 && done.json.ok, "clear-complete", done.json);
  const s2 = await anon.get(`/api/flow/sessions/${token}`);
  assert(s2.json.session.status === "success", "flow completed", s2.json);
  assert(s2.json.session.traits && !("health_insurance" in s2.json.session.traits), "resident view strips health_insurance", s2.json.session.traits);
  if (resolution) {
    const res = await anon.post(`/api/flow/sessions/${token}/resolution`, { resolution });
    assert(res.status === 200 && res.json.returnTo, "resolution", res.json);
  }
  const mine = await va.get(`/api/verifications/${id}`);
  assert(mine.status === 200 && mine.json.verification.status === "success", "owner read", mine.json);
  return { id, externalRef: created.json.verification.externalRef, verification: mine.json.verification };
}

const applicantVerification = await runVerification("applicant", "confirm_enrolled");
assert(applicantVerification.verification.determination?.duplicate_enrollment === true, "applicant duplicate_enrollment", applicantVerification.verification);
assert(applicantVerification.verification.subjectName === "Jordan Rivera", "demo identity Jordan Rivera", applicantVerification.verification);
assert(applicantVerification.verification.determination.payer_state === "SC", "payer state SC", applicantVerification.verification.determination);
assert(applicantVerification.verification.traits?.ssnLast4 === "6789" && !applicantVerification.verification.traits.ssn9, "ssn last4 only", applicantVerification.verification.traits);
log(`applicant verification ${applicantVerification.id}: success, duplicate_enrollment=true (South Carolina), resolution=confirm_enrolled`);

const householdVerification = await runVerification("household");
assert(householdVerification.verification.determination?.duplicate_enrollment === false, "household clean", householdVerification.verification);
assert(householdVerification.verification.subjectName === "Sam Rivera", "demo identity Sam Rivera", householdVerification.verification);
log(`household verification ${householdVerification.id}: success, clean`);

// createMedicaidEeCase with realistic intakeData (shape from build-intake-data.ts)
function buildIntake(applicantPersonId, memberPersonId) {
  const applicationDate = new Date().toISOString().slice(0, 10);
  return {
    displayMeta: { caseNumber: `SX-2026-0914-${runId.slice(-5).toUpperCase()}`, ssn: "123-45-6789" },
    applicant: {
      dateOfBirth: "1991-01-10",
      householdSize: 2,
      annualIncome: 26400,
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
    householdSize: 2,
    householdMembers: [
      {
        personId: applicantPersonId,
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: "1991-01-10",
        relationship: "Self",
        address: { street: "742 Evergreen Terrace", city: "Springfield", state: "SX", zip: "55501" },
        phone: "555-123-4567",
        email,
        tribalMember: false,
        tribeName: "",
        income: { employmentIncome: 2200, selfEmploymentIncome: 0, otherIncome: 0, totalMonthly: 2200 },
        hasInsurance: false,
        nonMagiResources: null,
        citizenshipStatus: "us_citizen",
        isPregnant: false,
        isDisabled: false,
        receivingSSI: false,
        hasMedicare: false,
      },
      {
        personId: memberPersonId,
        firstName: "Sam",
        lastName: "Rivera",
        dateOfBirth: "1993-03-14",
        relationship: "Spouse",
        tribalMember: false,
        tribeName: "",
        income: { employmentIncome: 0, selfEmploymentIncome: 0, otherIncome: 0, totalMonthly: 0 },
        hasInsurance: false,
        nonMagiResources: null,
        citizenshipStatus: "us_citizen",
        isPregnant: false,
        isDisabled: false,
        receivingSSI: false,
        hasMedicare: false,
      },
    ],
    monthlyHouseholdIncome: 2200,
    federalPovertyLevelPercent: 124.8,
    federalPovertyLevelThreshold: 2432,
    state: "SX",
    county: "Springfield",
    requestedProgram: "State Medicaid",
  };
}

let caseId;
{
  const r = await resident.gql(
    residentOps.CreateMedicaidEeCase,
    {
      input: {
        householdId,
        applicantPersonId: residentUserId,
        caseType: "INITIAL",
        intakeData: buildIntake(residentUserId, samPersonId),
        identityVerificationId: applicantVerification.id,
      },
    },
    "CreateMedicaidEeCase",
  );
  const d = noGqlErrors(r, "CreateMedicaidEeCase");
  assert(d.createMedicaidEeCase.errors.length === 0, "createMedicaidEeCase errors", d);
  const c = d.createMedicaidEeCase.case;
  caseId = c.id;
  assert(/^SX-\d{4}-\d{6}$/.test(c.caseNumber) && c.status === "PENDING_VERIFICATION" && c.customerId === CUSTOMER_ID, "created case shape", c);
  log(`CreateMedicaidEeCase → ${c.caseNumber} (${caseId}) status ${c.status}`);
}

// resident reads
{
  const r = await resident.gql(residentOps.GetMedicaidEeCase, { id: caseId }, "GetMedicaidEeCase");
  const d = noGqlErrors(r, "GetMedicaidEeCase");
  assert(d.medicaidEeCase.id === caseId && d.medicaidEeCase.determinations.length === 2, "resident GetMedicaidEeCase", d);
  assert(d.medicaidEeCase.determinations.every((x) => x.status === "PENDING"), "determinations PENDING", d);
  const r2 = await resident.gql(residentOps.ListMyMedicaidEeCases, { applicantPersonId: residentUserId }, "ListMyMedicaidEeCases");
  const d2 = noGqlErrors(r2, "ListMyMedicaidEeCases");
  assert(d2.medicaidEeCases.data[0]?.id === caseId, "ListMyMedicaidEeCases", d2);
  // scoping: someone else's personId still yields only own cases
  const r3 = await resident.gql(residentOps.ListMyMedicaidEeCases, { applicantPersonId: "someone-else" }, "ListMyMedicaidEeCases");
  const d3 = noGqlErrors(r3, "ListMyMedicaidEeCases scoped");
  assert(d3.medicaidEeCases.data.every((x) => x.id === caseId), "resident scoping forces own personId", d3);
  const notice = await resident.gql(residentOps.GetEligibilityNotice, { caseId }, "GetEligibilityNotice");
  const dn = noGqlErrors(notice, "GetEligibilityNotice (pending)");
  assert(dn.eligibilityNotice.errors[0]?.code === "NOT_FOUND", "notice not yet available", dn);
  const tok = await resident.gql(residentOps.GetPayrollLinkToken, { input: { caseId } }, "GetPayrollLinkToken");
  const dt = noGqlErrors(tok, "GetPayrollLinkToken");
  assert(typeof dt.getPayrollLinkToken.linkToken === "string", "payroll link token", dt);
  const ext = await resident.gql(residentOps.ExtractDocumentFields, { input: { fileDataUrl: "data:image/png;base64,AAAA", category: "INCOME_PAYSTUB" } }, "ExtractDocumentFields");
  const de = noGqlErrors(ext, "ExtractDocumentFields");
  assert(Array.isArray(de.extractDocumentFields.errors) && de.extractDocumentFields.errors.length === 0, "extract fields", de);
  const cd = await resident.gql(
    residentOps.CreateDocument,
    { input: { fileName: "paystub.pdf", mimeType: "application/pdf", fileType: "PDF", documentPurpose: "INCOME_PROOF", sensitivityLevel: "CONFIDENTIAL", retentionPolicy: "HIPAA_6_YEAR", sizeBytes: 1234, program: "MEDICAID_EE" } },
    "CreateDocument",
  );
  const dd = noGqlErrors(cd, "CreateDocument");
  assert(dd.createDocument.documentId && dd.createDocument.uploadUrl, "createDocument", dd);
  const put = await fetch(dd.createDocument.uploadUrl, { method: "PUT", body: "hello", headers: { "content-type": "application/pdf" } });
  assert(put.status === 200, "upload sink PUT", put.status);
  const cf = await resident.gql(residentOps.ConfirmDocumentUpload, { input: { documentId: dd.createDocument.documentId, sizeBytes: 5, checksumSha256: "abc" } }, "ConfirmDocumentUpload");
  const dc = noGqlErrors(cf, "ConfirmDocumentUpload");
  assert(dc.confirmDocumentUpload.documentId === dd.createDocument.documentId, "confirm upload", dc);
  log("resident GetMedicaidEeCase, ListMyMedicaidEeCases (scoped), notice, payroll token, document mutations ok");
}

// staff login
{
  const r = await staff.post("/api/auth/login", { email: "caseworker@state-x.gov", password: "password1234" });
  assert(r.status === 200 && r.json.payload.roles[0] === "caseworker" && r.json.payload.permissions.includes("cases:write"), "staff login", r.json);
  assert(staff.cookies.has("cms-demo-admin_session"), "admin cookie", [...staff.cookies.keys()]);
  const wrong = new Client("cms-demo-resident");
  const w = await wrong.post("/api/auth/login", { email: "admin@state-x.gov", password: "password1234" });
  assert(w.status === 403 && w.json.error === "wrong_app", "staff into resident app → wrong_app", w.json);
  log("staff login ok (Maria Lopez, caseworker); staff → resident app rejected");
}

// resident may not read the case as admin; staff list shows OOS-MCD
{
  const r = await staff.gql(adminOps.ListEECases, { pagination: { page: 1, limit: 50 } }, "ListEECases");
  const d = noGqlErrors(r, "ListEECases");
  const item = d.medicaidEeCases.data.find((x) => x.id === caseId);
  assert(item, "case in staff list", d.medicaidEeCases.data.map((x) => x.id));
  assert(item.flagReason === "verify_assist:out_of_state_medicaid", "flagReason set", item);
  assert(item.intakeData?.displayMeta?.flags?.includes("OOS-MCD"), "OOS-MCD in displayMeta.flags", item.intakeData?.displayMeta);
  assert(item.household.members.length === 2 && item.determinations.length === 2, "list household/determinations", item);
  assert(typeof d.medicaidEeCases.pagination.totalCount === "number", "pagination", d.medicaidEeCases.pagination);
  log(`ListEECases: case present with flagReason=${item.flagReason}, flags=${JSON.stringify(item.intakeData.displayMeta.flags)}`);
}
{
  const r = await staff.gql(adminOps.GetEECase, { id: caseId }, "GetEECase");
  const d = noGqlErrors(r, "GetEECase");
  const c = d.medicaidEeCase;
  assert(c.ruleEvaluations && Array.isArray(c.ruleEvaluations.sections) && c.ruleEvaluations.sections.length >= 5, "ruleEvaluations sectioned trace", c.ruleEvaluations);
  assert(c.determinations[0].person?.personId === residentUserId && c.determinations[0].person.ssnLast4 === "6789", "determination.person federated", c.determinations[0]);
  assert(c.determinations[0].person.addresses[0]?.street === "742 Evergreen Terrace", "person address", c.determinations[0].person);
  assert(c.household.members.length === 2, "household members", c.household);
  assert(typeof c.caseAssistNarrative === "string" && c.caseAssistNarrative.length > 20, "caseAssistNarrative populated", c.caseAssistNarrative);
  log(`GetEECase ok: ${c.ruleEvaluations.sections.length} trace sections, outcome=${c.ruleEvaluations.outcome}`);
  console.log(`    narrative: ${c.caseAssistNarrative}`);
}

// Demo-specific fields: identityVerification + caseAssist (staff sees coverage + flag)
const CASE_ASSIST_QUERY = `query CaseAssist($id: ID!) {
  medicaidEeCase(id: $id) {
    id
    identityVerification {
      id provider status mode subjectName createdAt completedAt
      checks { name status } checksSummary
      traits { document { first_name last_name date_of_birth city state document_type issuing_state document_number_last4 } phone ssnLast4 }
      determination { result duplicate_enrollment payer_state payer_state_name coverage { payer_id payer_name plan_status insurance_member_id coverage_start_date } }
      resolution
      flag { id type status assignee dispositionReason details notes { id author body createdAt } createdAt updatedAt }
    }
    caseAssist {
      recommendations { id type priority severity source title body rationale { summary citedFieldPaths } suggestedActions }
      narrative narrativeSource generatedAt
    }
  }
}`;
let flagId;
{
  const r = await staff.gql(CASE_ASSIST_QUERY, { id: caseId }, "CaseAssist");
  const d = noGqlErrors(r, "CaseAssist (staff)");
  const iv = d.medicaidEeCase.identityVerification;
  assert(iv?.id === applicantVerification.id && iv.status === "success" && iv.provider === "CLEAR", "identityVerification linked", iv);
  assert(iv.determination.coverage?.payer_id === "SCMCD" && iv.determination.coverage.payer_name === "South Carolina Medicaid", "staff sees coverage", iv.determination);
  assert(iv.flag?.type === "out_of_state_medicaid" && iv.flag.status === "open", "staff sees flag", iv.flag);
  assert(iv.flag.notes.length === 1, "applicant resolution note on flag", iv.flag.notes);
  assert(iv.traits.document.document_number_last4?.length === 4 && iv.traits.ssnLast4 === "6789", "traits redacted", iv.traits);
  flagId = iv.flag.id;
  const ca = d.medicaidEeCase.caseAssist;
  const ids = ca.recommendations.map((x) => x.id);
  assert(ids[0] === "oos-medicaid", "oos-medicaid first", ids);
  // The applicant's hosted-flow response is folded INTO the single oos-medicaid
  // finding — no separate applicant-resolution recommendation any more.
  assert(ids.includes("identity-verified") && ids.includes("income-unverified") && !ids.includes("applicant-resolution"), "expected recommendations", ids);
  assert(ids.filter((x) => x === "oos-medicaid").length === 1, "oos finding stated once", ids);
  assert(ca.narrativeSource === "template" && typeof ca.narrative === "string", "template narrative", ca);
  assert(/One open Verify Assist finding — active South Carolina Medicaid/.test(ca.narrative) && !/Issue RFI/.test(ca.narrative), "narrative is a status summary, not a restated recommendation", ca.narrative);
  const oos = ca.recommendations[0];
  assert(oos.title === "Active out-of-state Medicaid coverage detected (South Carolina)" && oos.suggestedActions.length === 3, "oos rec content", oos);
  assert(/confirmed the South Carolina coverage is still active/.test(oos.body) && oos.rationale.citedFieldPaths.includes("identityVerification.resolution"), "applicant response merged into the oos finding", oos);
  const idv = ca.recommendations.find((x) => x.id === "identity-verified");
  assert(/\d+\/\d+ identity checks passed/.test(idv.body), "identity-verified counts curated checks", idv.body);
  assert(Array.isArray(iv.checks) && iv.checks.length <= 9 && !iv.checks.some((c) => /phone|device|nfc/i.test(c.name)), "checks curated", iv.checks);
  assert(typeof iv.checksSummary === "string" && /identity checks passed/.test(iv.checksSummary), "checksSummary", iv.checksSummary);
  log(`caseAssist (staff): recs=${JSON.stringify(ids)} narrativeSource=${ca.narrativeSource}`);
  console.log(`    narrative: ${ca.narrative}`);
}
{
  const r = await resident.gql(CASE_ASSIST_QUERY, { id: caseId }, "CaseAssist");
  const d = noGqlErrors(r, "CaseAssist (resident)");
  const iv = d.medicaidEeCase.identityVerification;
  assert(iv.flag === null && iv.determination.coverage === null && iv.determination.duplicate_enrollment === true, "resident view omits flag + coverage", iv);
  log("resident identityVerification omits flag and determination.coverage");
}
{
  const other = new Client("cms-demo-resident");
  const em = `other+${runId}@example.com`;
  await other.post("/api/auth/register", { email: em, password: "password1234", firstName: "Other", lastName: "Person" });
  await other.post("/api/auth/login", { email: em, password: "password1234" });
  const r = await other.gql(residentOps.GetMedicaidEeCase, { id: caseId }, "GetMedicaidEeCase");
  assert(r.json.errors?.[0]?.extensions?.code === "FORBIDDEN", "other resident FORBIDDEN", r.json);
  log("another resident reading the case → FORBIDDEN");
}

// updateVerifyAssistFlag → in_review
{
  const r = await staff.gql(
    `mutation UpdateFlag($input: UpdateVerifyAssistFlagInput!) { updateVerifyAssistFlag(input: $input) { flag { id status assignee notes { author body } } errors { code message field } } }`,
    { input: { flagId, status: "in_review", assignee: "caseworker@state-x.gov", note: "Contacting SC DHHS to confirm termination." } },
  );
  const d = noGqlErrors(r, "updateVerifyAssistFlag");
  assert(d.updateVerifyAssistFlag.errors.length === 0 && d.updateVerifyAssistFlag.flag.status === "in_review", "flag in_review", d);
  const bad = await staff.gql(
    `mutation UpdateFlag($input: UpdateVerifyAssistFlagInput!) { updateVerifyAssistFlag(input: $input) { flag { id } errors { code message field } } }`,
    { input: { flagId, status: "open" } },
  );
  const db = noGqlErrors(bad, "updateVerifyAssistFlag invalid");
  assert(db.updateVerifyAssistFlag.errors[0]?.code === "INVALID_STATUS_TRANSITION", "flag invalid transition in errors[]", db);
  const rest = await staff.get("/api/admin/flags?status=in_review");
  assert(rest.status === 200 && rest.json.flags.some((f) => f.id === flagId && f.caseId === caseId), "REST admin flags", rest.json);
  log("updateVerifyAssistFlag → in_review (+ INVALID_STATUS_TRANSITION domain error, REST flags list)");
}

// lifecycle: approve too early → INVALID_STATUS_TRANSITION; queue → RFI → resolve → approve
{
  const early = await staff.gql(adminOps.ApproveEECase, { input: { id: caseId } }, "ApproveEECase");
  const de = noGqlErrors(early, "ApproveEECase early");
  assert(de.approveMedicaidEeCase.case === null && de.approveMedicaidEeCase.errors[0].code === "INVALID_STATUS_TRANSITION", "approve before review rejected", de);
  const q = await staff.gql(adminOps.QueueForReviewEECase, { input: { id: caseId } }, "QueueForReviewEECase");
  const dq = noGqlErrors(q, "QueueForReviewEECase");
  assert(dq.queueForReviewMedicaidEeCase.case?.status === "IN_REVIEW", "queued", dq);
  const deadline = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const rfi = await staff.gql(adminOps.IssueRfiEECase, { input: { id: caseId, itemsRequested: ["Proof of SC Medicaid disenrollment"], deadline, noteToApplicant: "Please upload the termination letter from South Carolina DHHS." } }, "IssueRfiEECase");
  const dr = noGqlErrors(rfi, "IssueRfiEECase");
  assert(dr.issueMedicaidEeCaseRfi.case?.flagReason === "rfi:pending", "rfi pending", dr);
  const dup = await staff.gql(adminOps.IssueRfiEECase, { input: { id: caseId, itemsRequested: ["x"], deadline } }, "IssueRfiEECase");
  const dd = noGqlErrors(dup, "IssueRfiEECase dup");
  assert(dd.issueMedicaidEeCaseRfi.errors[0]?.code === "RFI_ALREADY_PENDING", "RFI_ALREADY_PENDING", dd);
  const rc = await resident.gql(residentOps.GetMedicaidEeCase, { id: caseId }, "GetMedicaidEeCase");
  const drc = noGqlErrors(rc, "resident sees rfiDetails");
  assert(drc.medicaidEeCase.rfiDetails?.itemsRequested[0] === "Proof of SC Medicaid disenrollment", "resident rfiDetails", drc);
  const ca = await staff.gql(CASE_ASSIST_QUERY, { id: caseId }, "CaseAssist");
  const dca = noGqlErrors(ca, "CaseAssist rfi");
  assert(dca.medicaidEeCase.caseAssist.recommendations.some((x) => x.id === "rfi-pending"), "rfi-pending recommendation", dca.medicaidEeCase.caseAssist.recommendations.map((x) => x.id));
  const res = await staff.gql(adminOps.ResolveRfiEECase, { input: { id: caseId } }, "ResolveRfiEECase");
  const dres = noGqlErrors(res, "ResolveRfiEECase");
  assert(dres.resolveMedicaidEeCaseRfi.case?.flagReason === null && dres.resolveMedicaidEeCaseRfi.case.status === "IN_REVIEW", "rfi resolved", dres);
  log("queueForReview → issueRfi (RFI_ALREADY_PENDING on repeat) → resolveRfi ok");
}

// resolve the Verify Assist flag → the case's OOS-MCD chip / flagReason clear, the finding leaves Case Assist
{
  const r = await staff.gql(
    `mutation UpdateFlag($input: UpdateVerifyAssistFlagInput!) { updateVerifyAssistFlag(input: $input) { flag { id status dispositionReason } errors { code message field } } }`,
    { input: { flagId, status: "resolved", dispositionReason: "disenrollment_confirmed", note: "SCDHHS confirmed termination effective 08/31/2026." } },
  );
  const d = noGqlErrors(r, "updateVerifyAssistFlag resolved");
  assert(d.updateVerifyAssistFlag.errors.length === 0 && d.updateVerifyAssistFlag.flag.status === "resolved", "flag resolved", d);
  const c = noGqlErrors(await staff.gql(adminOps.GetEECase, { id: caseId }, "GetEECase"), "GetEECase after resolve").medicaidEeCase;
  assert(!(c.intakeData.displayMeta.flags ?? []).includes("OOS-MCD") && c.flagReason === null, "OOS-MCD chip + flagReason cleared on the case", { flags: c.intakeData.displayMeta.flags, flagReason: c.flagReason });
  const ca = noGqlErrors(await staff.gql(CASE_ASSIST_QUERY, { id: caseId }, "CaseAssist"), "CaseAssist after resolve").medicaidEeCase;
  const ids = ca.caseAssist.recommendations.map((x) => x.id);
  assert(!ids.includes("oos-medicaid") && !ids.includes("applicant-resolution"), "no out-of-state recommendation once resolved", ids);
  assert(/finding was resolved on .* \(disenrollment confirmed by the other state\)/.test(ca.caseAssist.narrative), "narrative regenerated with the resolution", ca.caseAssist.narrative);
  assert(ca.identityVerification.flag.status === "resolved", "flag still on record", ca.identityVerification.flag);
  const rest = await staff.get(`/api/admin/verifications/${applicantVerification.id}`);
  assert(rest.status === 200 && Array.isArray(rest.json.verification.checks) && rest.json.curatedChecks?.shown?.length <= 9, "staff REST keeps raw checks + curatedChecks", Object.keys(rest.json));
  log(`flag resolved → OOS-MCD cleared, no oos recommendation; narrative: ${ca.caseAssist.narrative}`);
}
{
  // Argyle mocks (staff)
  for (const [op, key] of [["CreateArgyleUser", "createArgyleUser"], ["RequestIncomeVerification", "requestIncomeVerification"], ["RequestAssetVerification", "requestAssetVerification"]]) {
    const r = await staff.gql(adminOps[op], { input: { caseId } }, op);
    const d = noGqlErrors(r, op);
    assert(d[key].success === true, op, d);
  }
  const url = await staff.gql(adminOps.GetBankingConnectUrl, { input: { caseId } }, "GetBankingConnectUrl");
  const du = noGqlErrors(url, "GetBankingConnectUrl");
  assert(du.getArgyleBankingConnectUrl.connectUrl?.startsWith("https://"), "connect url", du);
  const c = noGqlErrors(await staff.gql(adminOps.GetEECase, { id: caseId }, "GetEECase"), "GetEECase after argyle").medicaidEeCase;
  assert(c.incomeVerification?.status === "VERIFIED" && c.incomeVerification.employer?.name && c.assetVerification?.status === "VERIFIED", "argyle verified", { income: c.incomeVerification, assets: c.assetVerification });
  log(`Argyle mocks → income ${c.incomeVerification.status} ($${c.incomeVerification.incomeMonthly / 100}/mo), assets ${c.assetVerification.status} ($${c.assetVerification.totalAssets})`);
}
{
  const r = await staff.gql(adminOps.ApproveEECase, { input: { id: caseId } }, "ApproveEECase");
  const d = noGqlErrors(r, "ApproveEECase");
  assert(d.approveMedicaidEeCase.case?.status === "APPROVED" && d.approveMedicaidEeCase.errors.length === 0, "approved", d);
  const c = noGqlErrors(await staff.gql(adminOps.GetEECase, { id: caseId }, "GetEECase"), "GetEECase approved").medicaidEeCase;
  assert(c.determinations.every((x) => x.status === "ELIGIBLE" && x.effectiveDate && x.expirationDate), "determinations ELIGIBLE with dates", c.determinations);
  const next = new Date();
  const expectedEffective = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1)).toISOString();
  assert(c.determinations[0].effectiveDate === expectedEffective, "effectiveDate = first of next month", { got: c.determinations[0].effectiveDate, expectedEffective });
  const notice = noGqlErrors(await staff.gql(adminOps.GetEligibilityNotice, { caseId }, "GetEligibilityNotice"), "GetEligibilityNotice").eligibilityNotice;
  assert(notice.noticeUrl && notice.errors.length === 0, "notice url", notice);
  const pdf = await fetch(notice.noticeUrl, { headers: staff.headers() });
  assert(pdf.status === 200 && pdf.headers.get("content-type")?.includes("pdf"), "notice PDF served", pdf.status);
  log(`approve → APPROVED; determinations ELIGIBLE effective ${c.determinations[0].effectiveDate.slice(0, 10)}; notice PDF ok`);
}
{
  const filter = { startDate: new Date(Date.now() - 30 * 86_400_000).toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString(), resourceId: caseId };
  const r = await staff.gql(adminOps.GetCaseAuditLog, { filter, pagination: { page: 1, limit: 50 } }, "GetCaseAuditLog");
  const d = noGqlErrors(r, "GetCaseAuditLog");
  const actions = d.medicaidAuditLog.entries.map((e) => e.action);
  for (const a of ["CASE_CREATED", "BRE_EVALUATED", "IDENTITY_VERIFICATION_LINKED", "VERIFY_ASSIST_FLAG_UPDATED", "STATUS_TRANSITION", "ISSUE_RFI", "RESOLVE_RFI"]) {
    assert(actions.includes(a), `audit action ${a}`, actions);
  }
  assert(d.medicaidAuditLog.entries.every((e) => e.resourceType === "MedicaidEeCase" && e.outcome === "success"), "audit shape", d.medicaidAuditLog.entries[0]);
  assert(d.medicaidAuditLog.totalCount === d.medicaidAuditLog.entries.length, "audit totals", d.medicaidAuditLog);
  const transitions = d.medicaidAuditLog.entries.filter((e) => e.action === "STATUS_TRANSITION").map((e) => `${e.metadata.fromStatus}→${e.metadata.toStatus}`);
  log(`GetCaseAuditLog: ${d.medicaidAuditLog.totalCount} entries; transitions ${transitions.reverse().join(", ")}`);
  const asResident = await resident.gql(adminOps.GetCaseAuditLog, { filter }, "GetCaseAuditLog");
  assert(asResident.json.errors?.[0]?.extensions?.code === "FORBIDDEN", "audit log staff-only", asResident.json);
}
{
  const r = await staff.gql(adminOps.ListHouseholds, { customerId: CUSTOMER_ID, pagination: { page: 1, limit: 5 } }, "ListHouseholds");
  const d = noGqlErrors(r, "ListHouseholds");
  assert(d.householdList.data.some((h) => h.id === householdId), "ListHouseholds", d);
  const cr = await staff.gql(adminOps.CreateEECase, { input: { householdId, caseType: "RENEWAL", notes: "Caseworker-initiated renewal" } }, "CreateEECase");
  const dc = noGqlErrors(cr, "CreateEECase (admin)");
  assert(dc.createMedicaidEeCase.case?.status === "PENDING_VERIFICATION", "admin CreateEECase", dc);
  const deny = await staff.gql(adminOps.DenyEECase, { input: { id: dc.createMedicaidEeCase.case.id, reason: "Duplicate renewal request" } }, "DenyEECase");
  const dd = noGqlErrors(deny, "DenyEECase");
  assert(dd.denyMedicaidEeCase.errors[0]?.code === "INVALID_STATUS_TRANSITION", "deny from PENDING_VERIFICATION rejected", dd);
  await staff.gql(adminOps.QueueForReviewEECase, { input: { id: dc.createMedicaidEeCase.case.id } }, "QueueForReviewEECase");
  const deny2 = noGqlErrors(await staff.gql(adminOps.DenyEECase, { input: { id: dc.createMedicaidEeCase.case.id, reason: "Duplicate renewal request" } }, "DenyEECase"), "DenyEECase 2");
  assert(deny2.denyMedicaidEeCase.case?.status === "DENIED" && deny2.denyMedicaidEeCase.case.statusReason === "Duplicate renewal request", "denied", deny2);
  log("ListHouseholds, admin CreateEECase (applicantPersonId defaulted to HEAD), DenyEECase with reason ok");
}

// Clean path: a second resident with a household-only verification → no flag
{
  const clean = new Client("cms-demo-resident");
  const em = `sam.rivera+${runId}@example.com`;
  const reg = await clean.post("/api/auth/register", { email: em, password: "password1234", firstName: "Sam", lastName: "Rivera" });
  const login = await clean.post("/api/auth/login", { email: em, password: "password1234" });
  const pid = login.json.session.personId;
  assert(reg.status === 201 && pid, "clean register/login", login.json);
  const va = new Client(null);
  va.bearer = login.json.session.sessionId;
  const created = await va.post("/api/verifications", { role: "household" });
  const token = new URL(created.json.verification.hostedUrl).searchParams.get("token");
  await anon.post(`/api/flow/sessions/${token}/clear-complete`, {});
  const hh = noGqlErrors(await clean.gql(residentOps.CreateHousehold, { input: { customerId: CUSTOMER_ID, members: [{ personId: pid, role: "HEAD", startDate: new Date().toISOString() }] } }, "CreateHousehold"), "clean household").createHousehold.household.id;
  const intake = buildIntake(pid, null);
  intake.householdMembers = [intake.householdMembers[0]];
  intake.householdSize = 1;
  intake.applicant.householdSize = 1;
  intake.applicantName = "Sam Rivera";
  const cr = noGqlErrors(
    await clean.gql(residentOps.CreateMedicaidEeCase, { input: { householdId: hh, applicantPersonId: pid, intakeData: intake, identityVerificationId: created.json.verification.id } }, "CreateMedicaidEeCase"),
    "clean CreateMedicaidEeCase",
  ).createMedicaidEeCase;
  assert(cr.errors.length === 0 && cr.case.status === "PENDING_VERIFICATION", "clean case", cr);
  const c = noGqlErrors(await staff.gql(adminOps.GetEECase, { id: cr.case.id }, "GetEECase"), "clean GetEECase").medicaidEeCase;
  assert(c.flagReason === null && !(c.intakeData.displayMeta.flags ?? []).includes("OOS-MCD"), "clean path has no flag", { flagReason: c.flagReason, displayMeta: c.intakeData.displayMeta });
  const ca = noGqlErrors(await staff.gql(CASE_ASSIST_QUERY, { id: cr.case.id }, "CaseAssist"), "clean caseAssist").medicaidEeCase;
  const ids = ca.caseAssist.recommendations.map((x) => x.id);
  assert(!ids.includes("oos-medicaid") && ids.includes("identity-verified"), "clean recommendations", ids);
  assert(ca.identityVerification?.determination.duplicate_enrollment === false, "clean determination", ca.identityVerification);
  log(`clean path (household role): no flag; recs=${JSON.stringify(ids)}`);
}

// logout clears cookie
{
  const r = await resident.post("/api/auth/logout", {});
  assert(r.status === 200 && r.json.success === true && !resident.cookies.has("cms-demo-resident_session"), "logout", { json: r.json, cookies: [...resident.cookies.keys()] });
  const me = await resident.get("/api/auth/me");
  assert(me.status === 401 && me.json.error === "unauthenticated", "session gone after logout", me.json);
  log("logout clears the cookie and invalidates the session");
}

console.log(`\nSMOKE OK — ${step} steps passed against ${BASE}`);
