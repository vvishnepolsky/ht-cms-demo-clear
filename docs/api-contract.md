# State-X E&E + Verify Assist + Case Assist demo — API contract

Single source of truth for how the four apps talk to `apps/server`. Keep it
updated when endpoints or shapes change; the resident, verify, and admin apps
and the server must all agree with it.

## Topology

One Express server (`apps/server`, `:4000` in dev) owns SQLite and serves:

| Surface | Path | Used by |
|---|---|---|
| Health | `GET /api/health` | Render health check |
| Identity REST (identity-service shaped) | `/api/auth/*` | resident + admin login/register/refresh/logout |
| GraphQL (Apollo Router shaped) | `POST /graphql` (alias `POST /api/graphql`) | resident + admin data operations |
| Verify Assist REST (ht-clear shaped) | `/api/verifications*`, `/api/flow/*`, `/api/admin/flags*` | resident handoff, hosted flow app, admin Case Assist panel |
| Static SPAs (prod only, `SERVE_STATIC=true`) | `/` resident · `/verify` hosted flow · `/admin` caseworker | browsers |

Dev: each SPA runs on its own Vite port and proxies `/api` and `/graphql` to
`http://localhost:4000`. Prod: same origin, no CORS.

Also served: `PUT /api/uploads/:documentId` (the `createDocument` data sink —
bytes are discarded, the row is marked received) and
`GET /api/cases/:id/notice.pdf` (owner or staff; the URL `eligibilityNotice`
returns once a case is APPROVED or DENIED).

Ports (dev): server 4000 · resident 5181 · admin 5180 · verify 5187.

## Auth model (basic identity)

- Sessions are opaque tokens stored in `sessions`. The server accepts a session
  either as an **httpOnly cookie** or as `Authorization: Bearer <token>`.
- Cookie name is per app: `cms-demo-resident_session` and `cms-demo-admin_session`
  (`SameSite=Lax`, `Secure` when `NODE_ENV=production`, `Path=/`). The two
  cookies coexist so a demo driver can be logged into both apps in one browser.
- Clients send `x-app: cms-demo-resident | cms-demo-admin` on every request
  (REST and GraphQL). The server uses it to pick which cookie to read/write
  and to enforce role: `cms-demo-admin` requires role `caseworker|admin`;
  `cms-demo-resident` requires role `resident`. Wrong role → 403 `wrong_app`.
  When the header is absent (the ported `identity-client.ts` sends none) the
  server infers the app from the Referer/Origin — `/admin` or `:5180` → admin,
  `/verify` or `:5187` → none, anything else → resident — and, failing that,
  reads whichever app cookie carries a valid session (login then picks the
  cookie jar by the account's role).
- Roles: `resident` (self-registered), `caseworker`, `admin` (seeded).
- Seeded staff (idempotent at boot and via `npm run seed`):
  - `admin@state-x.gov` / `password1234` (admin, "David Chen")
  - `caseworker@state-x.gov` / `password1234` (caseworker, "Maria Lopez")
- Tenant: single tenant, `customerId = 00000000-0000-4000-a000-000000000003`
  (State-X). Every GraphQL entity returns this `customerId`. `x-customer-id`
  request headers are accepted and ignored.

### Identity REST (shapes copied from identity-service so the ported
`identity-client.ts` files work unchanged)

All errors: non-2xx `{ "error": "<code>", "message": "<text>", "field": "<name>|null" }`.
Codes used: `invalid_credentials`, `email_taken`, `validation_error`, `wrong_app`, `unauthenticated`.

- `POST /api/auth/register` `{ email, password, firstName, lastName, customerId? }`
  → `201 { success: true, personId, identityId }`. Creates a `users` row (role
  `resident`) **and** a `persons` row (`personId === user id`). Does NOT log in.
- `POST /api/auth/login` `{ email, password }` → `{ success: true, payload, session }` and sets the app cookie.
  ```json
  {
    "success": true,
    "payload": { "sub": "<userId>", "customerId": "<tenant>", "engagementId": "eng_<id>",
                 "programs": ["MEDICAID"], "policyId": "pol_<id>", "firstName": "..", "lastName": "..",
                 "roles": ["resident"], "permissions": ["my_cases:read"] },
    "session": { "sessionId": "<token>", "personId": "<userId>", "firstName": "..", "lastName": "..",
                 "email": "..", "customerId": "<tenant>", "engagementId": "eng_<id>", "programs": ["MEDICAID"],
                 "issuedAt": "<iso>", "expiresAt": "<iso>", "status": "active" }
  }
  ```
  Staff payload: `roles: ["caseworker"]` or `["admin"]`, `permissions: ["cases:read","cases:write","audit_logs:read","verify_assist:read","verify_assist_flags:write"]`, `programs: []`.
  The `session.sessionId` IS the bearer token (the resident app passes it to the
  Verify Assist REST calls it makes; cookie also works).
- `POST /api/auth/refresh` `{}` → `{ success: true, payload, expiresIn: <seconds>, session: {...session, aal: "AAL1"} }` (same session, extends expiry). 401 when no valid session.
- `POST /api/auth/logout` `{}` → `{ success: true }`, clears the app cookie, deletes the session.
- `POST /api/enrollment` `{ personId, program }` → `{ success: true, engagement: { engagementId, personId, customerId, status: "ACTIVE" } }` (no-op record; exists because the resident register flow calls it).
- `GET /api/auth/me` → `{ user: { id, role, email, firstName, lastName, createdAt } }`.

The resident operations file also carries GraphQL auth documents
(`LoginResident`, `CreateResidentAccount`, `LogoutResident`,
`RefreshResidentToken`, `RefreshToken`, `ResidentMe`, `Me`). The server
implements them too (same sessions/cookies as the REST) so every document
validates, but the ported apps use the REST above.

## GraphQL (`POST /graphql`)

Schema lives at `apps/server/src/graphql/schema.graphql`. It is a pruned,
single-service replica of the ht-platform supergraph covering exactly the
operations in:

- `apps/resident/src/lib/operations.ts` (+ `document-operations.ts`)
- `apps/admin/src/lib/ee-operations.ts`, `apps/admin/src/lib/audit-operations.ts`

Rule: **the client operation documents are the contract.** Every field they
select must exist with the same name, nullability and enum values as the
ht-platform supergraph (`services/gateway/supergraph.graphql` in isapp/ht-platform
is the reference). Payload types keep the `{ <entity>, errors { code message field } }` shape.
`JSON` scalar for `intakeData`, `ruleEvaluations`, `metadata`.

Auth: session via cookie or Bearer + `x-app`. Resident callers see only cases
where `applicantPersonId === their userId`; staff see all. Unauthenticated →
GraphQL error `extensions.code = "UNAUTHENTICATED"`.

### Operations that must work

Resident: `UpdatePerson`, `CreatePerson`, `CreateHousehold`, `AddHouseholdMember`,
`RemoveHouseholdMember`, `GetHousehold`, `CreateMedicaidEeCase`,
`ListMyMedicaidEeCases`, `GetMedicaidEeCase`, `GetEligibilityNotice`,
`GetPayrollLinkToken` (returns a fake token — Argyle stays mocked),
`ExtractDocumentFields` (returns `{ fields: [], errors: [] }` — Reducto not wired),
`CreateDocument` / `ConfirmDocumentUpload` (record metadata only, `uploadUrl` is a
data-sink URL the server accepts with `PUT` and discards).

Admin: `ListEECases`, `GetEECase`, `QueueForReviewEECase`, `ApproveEECase`,
`DenyEECase`, `IssueRfiEECase`, `ResolveRfiEECase`, `GetEligibilityNotice`,
`GetCaseAuditLog` (`medicaidAuditLog`), `ListHouseholds`, `CreateEECase`,
`CreateArgyleUser` / `RequestIncomeVerification` / `GetBankingConnectUrl` /
`RequestAssetVerification` (mock: flip the case's `incomeVerification` /
`assetVerification` to VERIFIED with plausible demo numbers).

### Case lifecycle (mirrors medicaid-ee-service)

`PENDING_VERIFICATION → IN_REVIEW → APPROVED | DENIED`; any non-terminal → `CANCELED`.
`caseNumber` format `SX-2026-NNNNNN` (assigned at creation for the demo).
On `createMedicaidEeCase` the server:

1. Stores `intakeData` verbatim (built client-side by `build-intake-data.ts`).
2. Runs the demo MAGI evaluator (`src/ee/rules.ts`). **Deviation from the
   original plan:** `ruleEvaluations` is stored in the ENG-1669 *sectioned trace*
   shape that medicaid-ee-service's `handleBreEvaluation` writes and that the
   admin workspace's `SectionedRuleTrace` / `parseRuleEvaluations` /
   `buildVerificationSteps` consume — not the flat
   `[{ ruleId, ruleName, status, description }]` seed array (which would leave the
   Evaluate step's rule trace in its "not evaluated yet" state):

   ```json
   { "outcome": "ELIGIBLE|INELIGIBLE|NEEDS_REVIEW", "evaluatedAt": "<iso>", "engineVersion": "4.2-demo",
     "sections": [ { "name": "Residency", "ordering": 2, "summary?": "…",
       "rows": [ { "ruleId": "SX-RES-001", "ruleName": "State residency", "displayCode": "RES-001",
                   "status": "PASS|FAIL|PENDING", "leftLabel": "State of residence",
                   "rightValue": "SX — State-X resident (address on file)", "note?": "…",
                   "slot?": "hierarchy", "threshold?": "≤138% FPL" } ] } ],
     "summary": { "passed": 9, "failed": 5, "pending": 2 } }
   ```

   Sections emitted: `Identity Verification` (CLEAR result + coverage discovery),
   `Residency`, `Citizenship & Immigration` (both map onto the Verify step's
   pipeline), `Pathway`, `Household & Income` (incl. `Income within MAGI threshold`),
   `Coverage Group` (slot `hierarchy`), `Final Determination`; Non-MAGI cases add
   `SSI Status`, `ABD Category`, `ABD Financial Tests`. The evaluator also seeds one
   `MedicaidEeDetermination` per household member (`status: PENDING`,
   `category: MAGI|NON_MAGI`, `coverageGroup` label, `personId` from
   `intakeData.householdMembers[].personId` with the household roster as fallback).
   `case-assist-derive.ts` (which expects a flat array) therefore falls back to its
   status-based copy; its context paragraph is overridden by `caseAssistNarrative`.
3. Links identity verification: `input.identityVerificationId` if present,
   else the caller's most recent completed `verifications` row (role
   `applicant`) with no `case_id`. Sets `verifications.case_id`.
4. If the linked verification's `determination.duplicate_enrollment === true`
   (or an open `flags` row exists for it): appends `OOS-MCD` to
   `intakeData.displayMeta.flags`, sets `flagReason = 'verify_assist:out_of_state_medicaid'`,
   and keeps status `PENDING_VERIFICATION`. Clean path: status stays
   `PENDING_VERIFICATION` too (caseworker queues it for review).
5. Writes audit entries (`CASE_CREATED`, `BRE_EVALUATED`, `IDENTITY_VERIFICATION_LINKED`).
6. Generates `caseAssistNarrative` (template, or Claude when `ANTHROPIC_API_KEY` is set — see Case Assist).

`approveMedicaidEeCase` (IN_REVIEW → APPROVED) sets every determination to
`ELIGIBLE` with `effectiveDate` = first of next month, `expirationDate` = end of
the 12-month certification, `determinedAt`/`determinedBy` (actor id).
`denyMedicaidEeCase` (reason required) → `INELIGIBLE` with `denialReason` and
`statusReason`. `issueMedicaidEeCaseRfi` sets `flagReason = 'rfi:pending'` +
`rfiDetails` (`RFI_ALREADY_PENDING` on repeat, `INVALID_STATUS_TRANSITION` on a
terminal case); `resolveMedicaidEeCaseRfi` clears both. Domain errors come back in
`errors[]` (`MedicaidEeErrorCode`), never as thrown GraphQL errors.

Lifecycle mutations write `medicaid_audit_log` rows that `GetCaseAuditLog`
returns (`action`: `STATUS_TRANSITION`, `ISSUE_RFI`, `RESOLVE_RFI`, `CASE_CREATED`,
`BRE_EVALUATED`, `IDENTITY_VERIFICATION_LINKED`, `VERIFY_ASSIST_FLAG_UPDATED`, `CASE_FLAG_UPDATED`, plus
`RECEIVE_VERIFICATION` from the Argyle mocks; `resourceType: 'MedicaidEeCase'`;
`outcome: 'success'|'failure'`; `metadata` JSON with `fromStatus/toStatus/reason`,
`actorType: SYSTEM|CASEWORKER|APPLICANT`, etc.). `medicaidAuditLog` is staff-only
(`FORBIDDEN` for residents); `startDate`/`endDate` bound the window, `resourceId`
= caseId scopes it to one case.

`CreateMedicaidEeCaseInput.applicantPersonId` is **nullable here** (the supergraph
has `ID!`) and defaults to the household HEAD's personId — the admin's
`CreateEECase` document omits it. Residents may only create cases for themselves.

### Additions to the supergraph shapes (new in this demo)

```graphql
extend type MedicaidEeCase {
  """CLEAR / Verify Assist identity verification linked to this case. Null until linked."""
  identityVerification: IdentityVerification
  """Rule-based Case Assist findings + optional Claude narrative."""
  caseAssist: CaseAssistResult!
}

type IdentityVerification {
  id: ID!
  provider: String!            # "CLEAR"
  status: String!              # awaiting_user | in_progress | success | failed | expired
  mode: String!                # "mock" | "sandbox"
  subjectName: String
  createdAt: String!
  completedAt: String
  checks: [VerificationCheck!]!      # CURATED identity checks (see below), { name, status: success|failed }
  checksSummary: String              # "8 identity checks passed · 13 additional CLEAR checks passed · 3 not applicable" | null
  traits: IdentityTraits             # identity only; staff also get coverage below
  determination: CoverageDetermination
  resolution: String                 # ended_submit_proof | confirm_enrolled | null
  flag: VerifyAssistFlag             # staff-only; null for residents
}
type VerificationCheck { name: String!, status: String! }
type IdentityTraits {
  document: DocumentTraits
  phone: String
  ssnLast4: String
}
type DocumentTraits {
  first_name: String, middle_name: String, last_name: String, date_of_birth: String,
  address_line1: String, address_line2: String, city: String, state: String, postal_code: String,
  document_type: String, issuing_state: String, document_number_last4: String, expiration_date: String, gender: String
}
type CoverageDetermination {
  result: String!                    # issue_found | clear
  duplicate_enrollment: Boolean!
  payer_state: String
  payer_state_name: String
  coverage: HealthInsuranceTraits    # staff-only (null for residents)
}
type HealthInsuranceTraits {
  payer_id: String, payer_name: String, plan_status: String, insurance_member_id: String,
  policy_holder_first_name: String, policy_holder_last_name: String, coverage_start_date: String
}
type VerifyAssistFlag {
  id: ID!, type: String!, status: String!, assignee: String, dispositionReason: String,
  details: JSON, notes: [FlagNote!]!, createdAt: String!, updatedAt: String!
}
type FlagNote { id: ID!, author: String!, body: String!, createdAt: String! }

type CaseAssistResult {
  recommendations: [CaseAssistRecommendation!]!
  narrative: String
  narrativeSource: String!          # "claude" | "template"
  generatedAt: String!
}
type CaseAssistRecommendation {
  id: ID!
  type: String!                     # guidance | draft_task | draft_notice
  priority: Int!                    # 1 act now, 2 soon, 3 fyi
  severity: String!                 # critical | warning | info
  source: String!                   # verify_assist | rules | intake
  title: String!
  body: String!
  rationale: CaseAssistRationale!
  suggestedActions: [String!]!
}
type CaseAssistRationale { summary: String!, citedFieldPaths: [String!]! }

extend input CreateMedicaidEeCaseInput { identityVerificationId: ID }

extend type Mutation {
  """Caseworker works the out-of-state Medicaid flag from the Case Assist panel."""
  updateVerifyAssistFlag(input: UpdateVerifyAssistFlagInput!): UpdateVerifyAssistFlagPayload!
}
input UpdateVerifyAssistFlagInput { flagId: ID!, status: String, dispositionReason: String, note: String, assignee: String }
type UpdateVerifyAssistFlagPayload { flag: VerifyAssistFlag, errors: [PayloadError!]! }
```

### Case Assist rules (deterministic; `src/case-assist/rules.ts`)

| id | trigger | severity | title |
|---|---|---|---|
| `oos-medicaid` | linked verification `determination.duplicate_enrollment` (or an open flag) **while the Verify Assist flag is `open`/`in_review`** — nothing is emitted once the flag is `resolved`/`dismissed` (the flag card's history is the record). The applicant's hosted-flow response (`resolution`) is folded into the body and `rationale.summary`; there are no separate applicant-response recommendations any more. | critical | Active out-of-state Medicaid coverage detected (South Carolina) |
| `identity-verified` | verification `status === 'success'` and every **curated** check passed (`clear/check-curation.ts` — category headers, phone/device and NFC rows are ignored); body says "N/N identity checks passed" using the curated count | info | Identity verified by CLEAR — no manual ID review needed |
| `identity-unverified` | no linked verification, or status failed/expired | warning | Identity not verified — request ID documents |
| `rfi-pending` | `flagReason` starts with `rfi:` | warning | RFI outstanding |
| `income-unverified` | `incomeVerification.status !== 'VERIFIED'` | info | Income not yet verified electronically |

`citedFieldPaths` reference real paths, e.g. `identityVerification.determination.payer_state`,
`identityVerification.determination.coverage.payer_name`, `identityVerification.resolution`,
`intakeData.applicant.address.state`, `incomeVerification.status`.
`suggestedActions` for `oos-medicaid`: "Issue RFI for proof of SC Medicaid disenrollment",
"Contact South Carolina DHHS to confirm termination date", "Hold determination until resolved".

`IdentityVerification.mode` is per verification (`sandbox` when a CLEAR session id
is recorded, else `mock`); `checks[].status` is normalised to `success|failed`
from CLEAR's `value` flag.

**Check curation** (`apps/server/src/clear/check-curation.ts`, `curateChecks`) — the
real CLEAR sandbox returns ~26 rows mixing category headers, phone/device signals,
NFC passport reads and skipped rows with the identity checks. One server-side
function decides what everyone sees: `shown` = the identity-relevant checks in a
fixed order (`Selfie passes liveness check`, `Selfie matches portrait on Gov ID`,
`Gov ID is likely authentic`, `Gov ID front is not suspicious`, `Gov ID back is not
suspicious`, `Gov ID is not expired`, `Gov ID captured image is acceptable`,
`Gov ID matches DMV records`, `User's information matches a trusted source`), deduped
by normalized name (straight/curly apostrophes equal), skipped rows dropped, plus
any completed-false check that is not NFC/passport related (real failures are
never hidden). Everything else is hidden: completed+true → `hiddenPassed`, skipped
or NFC/passport false → `notApplicable`. Applied to GraphQL `checks`/`checksSummary`,
the hosted flow `/api/flow/sessions/:token`, the resident `/api/verifications/:id`
(and `/mine`), and the `identity-verified` rule; the staff REST detail
`/api/admin/verifications/:id` keeps the raw `verification.checks` and adds
`curatedChecks: { shown, hiddenPassed, notApplicable }` alongside. `DocumentTraits.document_number_last4` and
`IdentityTraits.ssnLast4` are the only identifier fragments exposed.

Narrative: a **short status summary** (2–3 sentences) that never restates the
recommendation bodies — e.g. "Jordan's State Medicaid application (household of
1) is pending verification. Identity verified by CLEAR. One open Verify Assist
finding — active South Carolina Medicaid — must be resolved before
determination." and, once worked, "… The out-of-state coverage finding was
resolved on Sep 14, 2026 (disenrollment confirmed by the other state)." When
`ANTHROPIC_API_KEY` is set, one non-streaming `messages.create`
(`@anthropic-ai/sdk`, model `claude-opus-5`, `max_tokens: 1024`, `thinking: { type: "adaptive" }`)
writes it with the same guidance (2 sentences, no bullet restating) grounded ONLY in
the case summary (applicant first name, household size, program, status,
identity/coverage-finding status, RFI state) and the recommendation titles. No SSN,
no full DOB, no address in the prompt. Result cached in
`medicaid_ee_cases.case_assist_narrative`; regenerated when the cache key — case
status, Verify Assist flag status, RFI pending, plus each recommendation's
`id@severity` — changes. Otherwise the template narrative is used and
`narrativeSource = "template"`. Any API error → template fallback, never a 500.

### Verify Assist flag ↔ case sync

`updateVerifyAssistFlag` / `PATCH /api/admin/flags/:id` moving the flag to
`resolved` or `dismissed` also updates the linked case (`ee/cases.ts`
`syncOutOfStateCaseFlag`): removes `OOS-MCD` from `intakeData.displayMeta.flags`,
nulls `flagReason` when it is `verify_assist:out_of_state_medicaid`, and writes a
`CASE_FLAG_UPDATED` audit row (`metadata: { flag: 'OOS-MCD', flagAction:
'removed'|'added', verifyAssistFlagStatus }`). A flag returning to `open`/`in_review`
re-adds them. The admin therefore shows the chip, the red banner and the
critical recommendation only while the finding is open.

## Verify Assist REST (unchanged from ht-clear unless noted)

See `docs/verify-assist-api-contract.md` for full shapes. Changes for this demo:

- Auth accepts cookie **or** Bearer (see above). `x-app` header optional here.
- `POST /api/verifications` `{ role: "applicant" | "household" }` (resident) →
  `{ verification: { id, externalRef, hostedUrl, status } }`. `externalRef`
  is the future application reference `SX-APP-2026-NNNNNN`; stored on the
  verification and reused as the case's external ref.
- `returnTo` for the hosted flow = `RESIDENT_APP_URL + '/#/personal?verified=<verificationId>'`
  (the wizard's hash router step). Configurable via `VERIFY_ASSIST_RETURN_PATH`.
- `GET /api/verifications/:id` (owner or staff). Owner view strips
  `traits.health_insurance` and flags; keeps `determination` + `resolution`.
  Every verification read also carries `caseId` (null until linked).
- `GET /api/verifications/mine` (resident) → `{ verifications: [ResidentVerification] }`.
- Hosted flow (`/api/flow/sessions/:token`, `.../clear-complete`, `.../resolution`) unchanged.
- Admin flags (`GET /api/admin/flags`, `PATCH /api/admin/flags/:id`) unchanged
  (list rows additionally carry `caseId`); the GraphQL `updateVerifyAssistFlag`
  mutation wraps the same service function (`src/flags.ts`). Flag updates on a
  verification linked to a case also write a `VERIFY_ASSIST_FLAG_UPDATED` audit row
  on that case. `PATCH` error codes are lower-cased (`invalid_status_transition`,
  `validation_error`, `not_found`); the mutation returns them upper-cased in `errors[]`.
- Provider-enrollment routes and the `providers` tables are removed.

## Demo identity (mock mode or `DEMO_ENRICHMENT=true`)

Applicant overlay (role `applicant`): **Jordan Rivera**, DOB 1991-01-10 (name/DOB configurable via `DEMO_APPLICANT_*`),
`742 Evergreen Terrace, Springfield, SX 55501`, `drivers_license` issued by SX,
SSN `123-45-6789` (only last-4 leaves the server), phone `(555) 123-4567`, and

```json
{ "payer_id": "SCMCD", "payer_name": "South Carolina Medicaid", "plan_status": "ACTIVE",
  "insurance_member_id": "123485135", "policy_holder_first_name": "Jordan",
  "policy_holder_last_name": "Rivera", "coverage_start_date": "2025-11-01" }
```

Household overlay (role `household`): **Sam Rivera**, DOB 1993-03-14, same address, no coverage → clean.

Tenant state code is `SX` (`VERIFY_ASSIST_TENANT_STATE=SX`). Rule: Medicaid payer
whose state ≠ tenant state and `plan_status === 'ACTIVE'` → `duplicate_enrollment`.
Payer map: `SCMCD → SC (South Carolina)`, `ILMCD → IL (Illinois)`.

**Important:** the overlay applies only to identity + coverage traits. In sandbox
mode with `DEMO_ENRICHMENT=false`, CLEAR's real traits flow through unchanged.

## Environment variables (server)

| Var | Default | Notes |
|---|---|---|
| `PORT` | 4000 | |
| `NODE_ENV` | | `production` enables static serving + Secure cookies |
| `SERVE_STATIC` | false | force static serving in non-prod |
| `DATABASE_PATH` | `./data/demo.db` (relative to apps/server) | Render: `/var/data/demo.db` |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` | base URL for hostedUrl/returnTo |
| `RESIDENT_APP_URL` | `PUBLIC_URL` or `http://localhost:5181` | |
| `VERIFY_APP_URL` | `PUBLIC_URL/verify` or `http://localhost:5187` | |
| `MOCK_CLEAR` | true | `false` = real CLEAR sandbox |
| `DEMO_ENRICHMENT` | false | overlay demo identity on sandbox runs |
| `DEMO_APPLICANT_FIRST_NAME`, `DEMO_APPLICANT_MIDDLE_NAME`, `DEMO_APPLICANT_LAST_NAME`, `DEMO_APPLICANT_DOB`, `DEMO_APPLICANT_SEX` (M/F/X) | Jordan / – / Rivera / 1991-01-10 / – | name, DOB and sex of the demo applicant identity. Fields the demo identity leaves empty keep CLEAR's real value on sandbox runs (mock mode and sandbox overlay). Address, SSN and coverage stay as documented above; the coverage policy holder follows this name. |
| `DEMO_HOUSEHOLD_FIRST_NAME`, `DEMO_HOUSEHOLD_MIDDLE_NAME`, `DEMO_HOUSEHOLD_LAST_NAME`, `DEMO_HOUSEHOLD_DOB`, `DEMO_HOUSEHOLD_SEX` | Sam / – / Rivera / 1993-03-14 / – | same for the household-member identity |
| `DEMO_ENRICHMENT_PASSTHROUGH` | (empty) | comma-separated `traits.document` fields that keep CLEAR's real value under the overlay (e.g. `first_name,last_name,dob`; aliases `name`, `dob`, `address`, `all`). Coverage, SSN and the rest stay demo. Policy-holder name follows the final document name. |
| `CLEAR_API_KEY`, `CLEAR_PROJECT_ID` | | sandbox creds |
| `VERIFY_ASSIST_TENANT_STATE` | SX | |
| `ANTHROPIC_API_KEY` | | optional; enables Claude narratives (`GET /api/health` reports `caseAssistNarrative: "claude"|"template"` and `clearConfigured`) |
| `CASE_ASSIST_MODEL` | claude-opus-5 | |
| `SESSION_SECRET` | random at boot | not needed for opaque tokens; reserved |
