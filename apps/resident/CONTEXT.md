# Resident app (State-X Medicaid Application)

**Package:** `@demo/resident` · **Path:** `apps/resident/` · **Dev port:** 5181
**Purpose:** Citizen-facing Medicaid Eligibility & Enrollment wizard for the
State-X demo, with a "Verify with CLEAR" identity step (Verify Assist handoff)
and a post-submit dashboard.

Originally a Figma Make export wired to the ht-platform federation
(identity-service + medicaid-ee-service behind an Apollo Router). In this repo
it is ported onto one same-origin Express server (`apps/server`) — see
`docs/api-contract.md` for the full contract this app is written against.

---

## TL;DR

- **Only two backends, same origin:** `/api/*` (identity REST + Verify Assist
  REST) and `/graphql`. In dev, `vite.config.ts` proxies both to
  `http://localhost:4000`; in prod the server serves `dist/` itself.
  No CORS, no federation, no separate identity host.
- **Auth** = httpOnly cookie `cms-demo-resident_session` set by
  `POST /api/auth/login`; every request sends `credentials: 'include'` and
  `x-app: cms-demo-resident`. Sessions last 7 days; no refresh dance.
- **Wizard form state** lives in `FormDataContext` and is mirrored to
  `localStorage['sx-wizard-form']` on every change (needed so the CLEAR
  round-trip — a full-page navigation to the hosted flow and back — keeps the
  applicant's answers).
- **CLEAR step** lives on the `personal` wizard step: `POST /api/verifications`
  → hosted Verify Assist flow → back to `/#/personal?verified=<id>` → poll
  `GET /api/verifications/:id` → prefill name/DOB/address/phone/sex from the
  verified ID, mask SSN to last-4, badge fields "Verified by CLEAR".
- **Submission** (`sign` step) → `createMedicaidEeCase` with the intake JSON
  built client-side (`build-intake-data.ts`) and `identityVerificationId`.
- Argyle (income) is mocked; Reducto document extraction returns nothing and
  the UI degrades to manual entry.

---

## Run

```sh
./scripts/npm-install.sh                 # repo root; serialized install
npm run dev -w @demo/resident            # :5181 → proxies /api,/graphql → :4000
npm run typecheck -w @demo/resident
npm run test -w @demo/resident           # vitest (jsdom)
npm run build -w @demo/resident          # tsc && vite build
```

Env (`.env.example`): `VITE_CUSTOMER_ID` (State-X tenant, default
`00000000-0000-4000-a000-000000000003`), optional `VITE_GATEWAY_URL`
(default `/graphql`), `VITE_IDENTITY_URL` (default `''` = same origin),
`VITE_DEV_API_TARGET` (dev proxy target), `VITE_MAPBOX_ACCESS_TOKEN`
(address autocomplete; empty = plain inputs).

Runtime defaults come from the vendored `packages/runtime-env`
(`runtimeEnv.gatewayUrl`, `runtimeEnv.identityUrl`). `packages/i18n` and
`packages/locales` are the other vendored deps; all three export TypeScript
source (`./src/index.ts`) and are bundled by Vite — no `dist/` build step.

---

## Routing

`react-router` `BrowserRouter` at the top level (`src/main.tsx`); the wizard
keeps its own **hash** step router inside `wizard/app.tsx`.

| Path         | Component          | Notes |
| ------------ | ------------------ | ----- |
| `/`          | `<App/>` (wizard)  | Steps tracked as `#/<stepId>`; see `STEPS` in `wizard/app.tsx` |
| `/dashboard` | `<Dashboard/>`     | Reads the resident's case via `GetMedicaidEeCase`; inbox/docs are demo seed |
| `*`          | redirect to `/`    | |

Wizard steps (ids): `welcome` → `apply-method` (→ `phone-schedule` /
`paper-upload` terminal branches) → `login` → `household-info` → `auth-rep` →
`personal` (CLEAR) → `demographics` → `members` → `tax-deps` → employment/income
steps → `nm-*` (ABD only) → `health-intro` → `insurance` → `employer-cov` →
`retroactive` → `preferences` → `review` → `sign` → `confirmation`.

The hash router (`useStepRouter`) tolerates a query string after the step id
(`#/personal?verified=abc`): it resolves the step from the part before `?`,
hands `verified` to `clear-verification.ts` (`setReturnLegVerificationId`),
and its sync effect rewrites the hash to the bare `#/personal` so a refresh
does not replay the return leg.

---

## Auth (`src/lib/identity-client.ts`, `src/lib/auth-store.ts`)

`StepLoginV2` (`wizard/screens-e.tsx`) does everything in one panel:

1. **Create account:** `POST /api/auth/register {email,password,firstName,lastName,customerId}`
   → `{ personId, identityId }` (does not log in), then
   `POST /api/auth/login` → `{ payload, session }` (sets the cookie), then
   `POST /api/enrollment { personId, program: 'medicaid_ee' }` (409 ignored).
2. **Sign in:** `POST /api/auth/login`; enrolls if `session.engagementId === 'none'`;
   if the resident already has a case (`ListMyMedicaidEeCases`) → `/dashboard`.
3. Both paths call `setResident({ id: payload.sub, personId: session.personId, customerId, … })`
   — `auth-store.ts` keeps that snapshot in sessionStorage for rendering; the
   cookie is the source of truth.
4. **Guest:** `Continue as a guest` skips auth. Guest submissions never hit
   the server (`useSubmitCase` short-circuits without `personId`/`customerId`).

`src/lib/apollo.ts`: plain `@apollo/client` v4 — `HttpLink({ uri: runtimeEnv.gatewayUrl,
credentials: 'include', headers: { 'x-app', 'x-customer-id' } })`, `InMemoryCache`,
and an `ErrorLink` that on `extensions.code === 'UNAUTHENTICATED'` calls
`setResident(null)` and redirects to `/`.

---

## Verify with CLEAR (personal step)

Files: `wizard/clear-verification.ts` (helpers), `lib/verify-assist-client.ts`
(REST), `wizard/VerifiedChip.tsx`, `StepPersonalInfoV2` + `ClearVerifyPanel`
in `wizard/screens-e.tsx`, styles in `styles/app.css` (`.btn--clear`,
`.verified-*`, `.verify-panel-*`).

**Outbound:** click "Verify with CLEAR" →
`POST /api/verifications { role: 'applicant' }` → `{ verification: { id, hostedUrl, … } }`
→ save `{ id, role }` to `sessionStorage['sx-pending-verification']`
→ flush the form to localStorage → `window.location.assign(hostedUrl)`.

**Return leg:** the hosted flow (`apps/verify`) sends the browser to
`RESIDENT_APP_URL/#/personal?verified=<id>`. The step mounts in the `polling`
state ("Confirming your verification with CLEAR…") and polls
`GET /api/verifications/:id` every 1.5s for up to ~30s until a terminal
status:

- `success` → `applyVerificationToPrimary()` writes `traits.document`
  (`first_name/middle_name/last_name`, DOB normalised to `YYYY-MM-DD`,
  address lines, city, state, zip), `traits.phone` (→ 10 digits), and sex
  (gender → `female|male|x`) into `primaryApplicant`, and records
  `primaryApplicant.identityVerification = { id, provider: 'CLEAR', status: 'success',
  verifiedFields, ssnLast4, verifiedAt }`. The CTA is replaced permanently by a
  green "Verified with CLEAR" pill; each prefilled field's label gets a
  "Verified by CLEAR" chip. Editing a field drops it from `verifiedFields`.
- `failed` / `expired` / still pending after the budget → `failed` state with
  the CTA as a retry and a note that manual entry still works.
- The pending marker is cleared either way. If only the marker exists (user
  pressed Back into the wizard mid-flow) the step peeks twice and quietly
  returns to idle.

**SSN:** CLEAR only reveals last-4. When `identityVerification.ssnLast4` is
set the SSN field renders read-only as `•••-••-1234` with hint "Confirmed
during identity verification", the "no SSN" checkbox is hidden, and the
`personal` step validator accepts
`noSSN || ssn.length >= 9 || !!identityVerification?.ssnLast4`.

**Demo identity:** in mock mode / `DEMO_ENRICHMENT=true` the server returns
Jordan Rivera, 742 Evergreen Terrace, Springfield, **SX** 55501 — `SX`
(`State-X`) is the first entry in `US_STATES` (`wizard/context.tsx`,
`CMS_DEMO_STATE = 'SX'`) and the default state on a fresh form.

**Submission:** `build-intake-data.ts` mirrors the record to
`intakeData.applicant.identityVerification` **and**
`intakeData.displayMeta.identityVerification`; `useSubmitCase` passes
`identityVerificationId` in `CreateMedicaidEeCaseInput`.

**Review / confirmation:** the personal-info review section shows "Identity
verified by CLEAR"; the confirmation receipt shows the case number from the
mutation result and "Your identity was verified by CLEAR".

**Dashboard:** `GetMedicaidEeCase` selects `identityVerification { id status
provider completedAt determination { result duplicate_enrollment payer_state
payer_state_name } resolution }`. Status `success` → "Identity verified by
CLEAR" chip in the status hero. `determination.duplicate_enrollment` → amber
notice "Coverage we found: active Medicaid in <payer_state_name>" + "Your
response: …" (`describeResolution`) + "A caseworker will review this before a
decision is made." Payer/member ids are staff-only and never selected.

---

## Data flow & persistence

| Step | Server call | Where ids land |
| --- | --- | --- |
| `login` | register / login / enrollment REST | `auth-store` (sessionStorage) |
| `personal` | `updatePerson` (Continue) | — |
| `personal` (CLEAR) | `POST/GET /api/verifications` | `primaryApplicant.identityVerification` (localStorage form) |
| `members` | `createPerson` ×N, `createHousehold`, `addHouseholdMember`/`removeHouseholdMember` | `sessionStorage[household-id]`, member personId cache |
| `sign` | `createMedicaidEeCase` | `sessionStorage[case-id]`, `_caseId/_caseNumber` on the form |
| `confirmation` | — | comm prefs → sessionStorage for the dashboard |

`GetPayrollLinkToken` (Argyle) returns a fake token — the Argyle UI is a mock.
`ExtractDocumentFields` (Reducto) returns no fields — `useReductoExtract` still
runs, and both consumers (`StepPaperUpload`, payroll upload in
`screens-g.tsx`) fall back to "enter it yourself".

Sensitive-data posture: the wizard form (PHI) is mirrored to localStorage
for the demo; `resetForm()` ("Start over") clears it. Full SSNs typed by the
applicant are sent only in `updatePerson` and `intakeData.displayMeta.ssn`;
CLEAR-verified SSNs are last-4 only end to end.

---

## Tests

`vitest run` (jsdom). Pure-function coverage for intake building, eligibility,
income math, household diffing, session-key hygiene, dashboard derivations and
the CLEAR trait application (`wizard/clear-verification.test.ts`). No
Playwright/e2e in this repo.

---

## Branding

Copy says "State-X HHS" / "State-X Medicaid" (TopBar wordmark, page title,
locale JSON in `packages/locales`). Identifiers such as `IOWA_COUNTIES`,
`--iowa-*` CSS tokens and `useIowaTweaks` are legacy names and intentionally
unchanged.
