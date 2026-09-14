# Verify Assist — Internal API Contract (v0, demo)

Single source of truth for the REST contract between `apps/server` (:4000),
`apps/resident` (:5186), and `apps/admin` (:5185). Both frontends reach the
server via a Vite dev proxy at `/api` (no CORS in dev).

Auth: `Authorization: Bearer <token>` (opaque session token from login/register,
stored client-side by each app's auth store). Errors: non-2xx with
`{ "error": { "code": string, "message": string } }`. All timestamps ISO-8601.

## Roles

- `resident` — self-registered from the resident app (demo simulation).
- `caseworker`, `admin` — seeded; log into the admin console.

Seeded logins (created by `npm run seed -w @verify-assist/server`, idempotent):

| Email | Password | Role |
|---|---|---|
| `admin@verify-assist.test` | `password1234` | admin |
| `caseworker@verify-assist.test` | `password1234` | caseworker |

## CLEAR data shapes

Identical to the real CLEAR Verified API (see legacy `legacy/ga-gateway-demo/lib/types.ts`):
`DocumentTraits`, `HealthInsuranceTraits`, `VerificationCheck`,
`SessionStatus = awaiting_user | in_progress | success | failed | expired`.

`Determination` (computed server-side by the coverage rules):

```json
{
  "result": "issue_found" | "clear",
  "duplicate_enrollment": true,
  "payer_state": "SC",
  "payer_state_name": "South Carolina",
  "coverage": { ...HealthInsuranceTraits }
}
```

## Entities

**User** `{ id, role, email, firstName, lastName, createdAt }` — never includes password.

**Draft** (one per resident) `{ userId, externalRef, data, sectionsComplete: string[], updatedAt }`
— `data` is the wizard's form JSON, opaque to the server. `externalRef`
(format `VA-APP-2026-NNNNNN`) is the application reference: minted when the
application starts (first draft save or first verification) and carried through
every downstream artifact — verifications, flags, the submitted application.

**Application** `{ id, externalRef, userId, data, status: "submitted" | "under_review", submittedAt }`
— `externalRef` is reused from the draft (same number the applicant saw while
filling out).

**Verification**

```json
{
  "id": "verify_<nanoid>",
  "externalRef": "VA-APP-2026-000001" | null,
  "userId": "...",
  "role": "applicant" | "household",
  "subjectName": "First Last" | null,
  "status": "awaiting_user" | "in_progress" | "success" | "failed" | "expired",
  "hostedUrl": "...",
  "createdAt": "...", "completedAt": "..." | null,
  "checks": [{ "name": "selfie_liveness", "status": "success" }, ...],
  "traits": { "document": DocumentTraits, "phone": {"number": "..."},
              "ssn9": "123456789", "health_insurance": HealthInsuranceTraits | null } | null,
  "determination": Determination | null
}
```

**Run** `{ id, verificationId, seq, type: "initial" | "monitoring", status,
determination, coverage, createdAt }` — one `initial` run is recorded when the
verification completes; `monitoring` runs are added by the admin re-check action.

**Flag** `{ id, verificationId, externalRef, type: "out_of_state_medicaid",
status: "open" | "in_review" | "resolved" | "dismissed", assignee: string | null,
dispositionReason: string | null, details: { coverage, payer_state, payer_state_name },
notes: [{ id, author, body, createdAt }], createdAt, updatedAt }`

**AuditEntry** `{ id, at, actor, actorRole, action, subject, meta }` — e.g.
`action: "verification.created" | "verification.completed" | "run.recorded" |
"flag.created" | "flag.updated" | "admin.viewed_verification" | "admin.searched" |
"auth.registered" | "auth.login" | "auth.logout" | "application.submitted" |
"webhook.delivered"`.

## Endpoints

### Auth (both apps)

- `POST /api/auth/register` `{ email, password, firstName, lastName }` →
  `{ token, user }`. Resident-only self-service (demo account simulation);
  password min 8 / max 128. Auto-logs-in.
- `POST /api/auth/login` `{ email, password }` → `{ token, user }`.
- `POST /api/auth/logout` → `{ ok: true }`.
- `GET /api/auth/me` → `{ user }`.

The admin console requires `role` `admin` or `caseworker` on login; the resident
app requires `resident`. Logging into the wrong app returns 403 `wrong_app`.

### Resident (role `resident`)

- `GET /api/draft` → `{ draft: Draft | null }`
- `PUT /api/draft` `{ data, sectionsComplete }` → `{ draft }`
- `DELETE /api/draft` → `{ ok: true }`
- `POST /api/applications` `{}` → `{ application }` — snapshots the draft into a
  submitted application (reuses the draft's `externalRef`, deletes the draft).
- `GET /api/applications/mine` → `{ applications: [{ ...Application,
  verifications: [VerificationSummary] }] }` (newest first). Summaries:
  `{ id, role, subjectName, status, determination, completedAt }` — no raw
  coverage traits, no flags (see "Resident data posture" below).
- `POST /api/verifications` `{ role: "applicant" | "household" }` →
  `{ verification: { id, externalRef, hostedUrl, status } }` — creates a CLEAR
  verification session (mock or sandbox per `MOCK_CLEAR`). The application
  `externalRef` is stamped at creation (minting a draft ref if none exists yet).
- `GET /api/verifications/:id` → `{ verification }` — owner or admin/caseworker.
  Resident app polls this after returning from the hosted flow. **Owners receive
  the identity-only view**; staff receive the full record.
- `GET /api/verifications/:id/flags` → `{ flags: [Flag] }` — staff only.

### Resident data posture

Coverage discovery runs in Verify Assist; the resident application renders the
service's conclusions, not its raw data (the legacy GA contract: the
verification component returns a `determination`, the host renders it as-is).
Every resident-facing response therefore strips `traits.health_insurance` and
flags, but **includes `determination`** — whose `coverage` field carries what
the applicant-facing duplicate-enrollment alert needs (payer, plan status,
member ID, policy holder). Enforced server-side (`toResidentVerification`),
not by frontend convention. Flag workflow state never reaches the resident.

### Hosted Verify Assist flow (public; session-token-scoped)

The standalone flow app (`apps/verify`, :5187) is where the origin application
hands the user: `hostedUrl` is always `${VERIFY_APP_URL}/flow?token=<token>`.
The flow app explains the process, runs the CLEAR step (mock mode: the local
CLEAR capture replica lives inside the flow app; sandbox mode: redirect out to
`clearUrl` — CLEAR's real hosted UI — which returns the user to the flow app),
shows coverage findings, captures the applicant's resolution, then closes out
to `returnTo` (the origin app). The unguessable token is the credential.

- `GET /api/flow/sessions/:token` → `{ session: { verificationId, status, role,
  mode: "mock" | "sandbox", externalRef, subjectName, checks, traits (resident
  view), determination, resolution, clearUrl (sandbox mode), returnTo } }`.
  In sandbox mode a non-terminal session triggers a server-side CLEAR poll and,
  on terminal status, the completion pipeline.
- `POST /api/flow/sessions/:token/clear-complete`
  `{ selfie?, documentFront?, documentBack? }` (image data URLs, ≤ ~3 MB each)
  → `{ ok, verificationId }`
  — mock mode only; stands in for CLEAR's servers: marks `success`, applies the
  demo-identity enrichment for the session's role (applicant → Vadim
  Vishnepolsky + active SC Medicaid; household → Jane Doe, no coverage), runs
  coverage rules, records the initial run, creates an `out_of_state_medicaid`
  flag when `duplicate_enrollment` is true, audits.
- `POST /api/flow/sessions/:token/resolution`
  `{ resolution: "ended_submit_proof" | "confirm_enrolled", proofName? }` →
  `{ ok, returnTo }` — requires completed verification; persists
  `verification.resolution`, appends an applicant note to the open flag (with
  the proof filename when supplied), audits `verification.resolution_recorded`.

`Verification.resolution` (`"ended_submit_proof" | "confirm_enrolled" | null`)
is returned on all verification reads, resident and staff.

### Admin (role `admin` or `caseworker`)

- `GET /api/admin/stats` → `{ verifications, completed, openFlags, applications }`
- `GET /api/admin/verifications?search=&status=` → `{ verifications: [
  { id, externalRef, subjectName, role, status, flagCount, lastRunAt, createdAt } ] }`
  — `search` matches name, externalRef, or last-4 SSN. `flagCount` counts only
  actionable flags (`open` / `in_review`); resolved and dismissed flags drop out.
- `GET /api/admin/verifications/:id` → `{ verification, runs: [Run],
  flags: [Flag], audit: [AuditEntry] }` — the view itself is audited.
- `POST /api/admin/verifications/:id/rerun` `{}` → `{ run, flag: Flag | null }`
  — simulates a monitoring re-check (new `monitoring` run; re-evaluates rules;
  creates a flag only if none is open for the same coverage).
- `GET /api/admin/flags?status=` → `{ flags: [ { ...Flag, subjectName } ] }`
- `PATCH /api/admin/flags/:id` `{ status?, assignee?, dispositionReason?, note? }`
  → `{ flag }` — `note` appends `{ author: <actor email>, body }`. Status
  transitions: open → in_review → resolved | dismissed (dismiss/resolve
  requires `dispositionReason`).
- `GET /api/admin/audit?limit=100` → `{ entries: [AuditEntry] }`

## Verification images (staff-only)

`VerificationImages = { selfie, document_front, document_back,
face_scan_preview_ref, source: "mock-capture" | "clear" }`. Mock mode stores
the real webcam captures posted by the flow app's capture step; sandbox mode
passes through whatever CLEAR's session response carries — the Standard
Integration API currently **redacts image bytes** (`"REDACTED"`) and supplies a
`face_scan_preview` reference, so real bytes appear only for CLEAR projects
with image entitlement. Exposed exclusively as the `images` field of
`GET /api/admin/verifications/:id`; never on resident-facing or list responses.

## SSN handling (demo posture per verify-assist-planning.md)

The server stores `ssn9` but list endpoints and admin detail return only
`ssnLast4`; the full value never leaves the server. Search accepts last-4.

## Env (`apps/server/.env`, see `.env.example`)

```
PORT=4000
MOCK_CLEAR=true
CLEAR_API_KEY=
CLEAR_PROJECT_ID=
RESIDENT_APP_URL=http://localhost:5186
DATABASE_PATH=./data/verify-assist.db
```
