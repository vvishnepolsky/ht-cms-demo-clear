# apps/admin — State-X caseworker portal (`@demo/admin`)

Caseworker-facing Eligibility & Enrollment workspace for the CLEAR Verify Assist +
Case Assist demo. Ported from the ht-platform `cms-demo-admin` app and trimmed to the
cases flow; it talks only to `apps/server` on the same origin.

## What it does

- **Case list** (`/ee/cases`) — queue of Medicaid E&E cases with pathway, SLA days,
  flags, and a **Verify Assist** column (shield: green "CLEAR verified" / red
  "Out-of-state coverage"). Cases with an open out-of-state Medicaid finding are pinned
  to the top of the queue (`lib/case-list-order.ts`) and counted in the
  "Verify Assist Flags" KPI tile.
- **Case workspace** (`/ee/cases/:id`) — Verify / Evaluate / Determine phases with the
  Case Assist banner, applicant sidebar, evidence panels, approve / deny / RFI actions,
  the Case Details drawer (application data, documents, notices, audit log), and the
  **Case Assist rail** (see below).
- **Login** (`/login`) — email/password against `/api/auth/login`; the seeded demo
  logins are listed under the form and one click fills them in.

## Routes

| Route            | Page          | Notes                                         |
| ---------------- | ------------- | --------------------------------------------- |
| `/login`         | LoginPage     | Sets the httpOnly admin cookie via REST       |
| `/`              | → `/ee/cases` |                                               |
| `/ee/cases`      | DashboardPage | Case list, KPIs, tabs, search, county filter  |
| `/ee/cases/:id`  | WorkspacePage | Case workspace + Case Assist rail             |
| `*`              | → `/ee/cases` |                                               |

The SPA is served under **`/admin/`**: Vite `base: '/admin/'` and
`<BrowserRouter basename="/admin">` (`src/App.tsx`). Route paths, `navigate()` and
`<Navigate>` are written without the prefix. The only raw redirect is the
UNAUTHENTICATED handler in `src/lib/apollo.ts`, which prepends `import.meta.env.BASE_URL`.

## Backend / auth

- One server (`apps/server`, `:4000`). GraphQL at `POST /graphql`, identity REST at
  `/api/auth/*`. In dev, `vite.config.ts` proxies `/api` and `/graphql` to `:4000`, so
  no URL configuration is needed (`@ht/runtime-env` defaults: `gatewayUrl '/graphql'`,
  `identityUrl ''`).
- Every request carries `x-app: cms-demo-admin` (Apollo `HttpLink` headers and
  `identity-client.ts`) with `credentials: 'include'`. The server reads the
  `cms-demo-admin_session` cookie and requires role `caseworker|admin`.
- `lib/auth-store.ts` mirrors the login payload into sessionStorage for rendering the
  signed-in identity (sidebar bottom, sign-out). `RequireAuth` redirects to `/login`
  when the mirror is empty; an `UNAUTHENTICATED` GraphQL error clears the store and
  redirects (sessions last 7 days — no token refresh plumbing).
- Seeded staff logins (`docs/api-contract.md`):
  - `admin@state-x.gov` / `password1234` (admin, "David Chen")
  - `caseworker@state-x.gov` / `password1234` (caseworker, "Maria Lopez")

## GraphQL operations

`src/lib/ee-operations.ts` and `src/lib/audit-operations.ts` are the contract the
server resolves. Beyond the ht-platform operations, `GetEECase` selects
`identityVerification { … }` (CLEAR session, checks, document/identity traits, coverage
determination, applicant resolution, Verify Assist flag + notes) and
`caseAssist { recommendations narrative narrativeSource generatedAt }`; `ListEECases`
selects a narrowed `identityVerification { status subjectName determination flag }`;
`UpdateVerifyAssistFlag` works the flag from the Case Assist panel. Types live in
`src/types/ee.ts` (`IdentityVerification`, `CaseAssistResult`, `VerifyAssistFlag`, plus
the helpers `hasOpenOutOfStateFlag` / `isIdentityVerified`).

## Case Assist (the demo centerpiece)

- **Rail**: `src/components/ee/case-assist/CaseAssistPanel.tsx`, rendered by
  WorkspacePage as a 380px right column beside the phase content (always visible for
  active cases). Header with sparkle icon + "Narrative by Claude" / "Rule-based"
  (`caseAssist.narrativeSource`) + relative `generatedAt`; narrative paragraph
  (`caseAssist.narrative`, falling back to `eeCase.caseAssistNarrative`);
  `VerifyAssistFlagCard` (status badge, assignee, disposition, notes thread, and
  "Mark flag in review" / "Resolve flag" / "Dismiss flag" → `updateVerifyAssistFlag`;
  resolve/dismiss go through `FlagDispositionDialog` for a reason + optional note);
  `RecommendationCard`s ordered by priority with a severity stripe, "Why" rationale and
  cited field paths as monospace chips, and suggested actions. The `oos-medicaid`
  recommendation's "Issue RFI for proof of SC Medicaid disenrollment" opens
  `IssueRfiModal` pre-filled with the disenrollment-proof item; "Hold determination" is
  acknowledged with a toast; other actions are a session checklist.
- **Banner**: `lib/case-assist-derive.ts` takes `identityVerification` + `narrative`
  options. An open / in-review out-of-state finding yields the red "ACTION NEEDED —
  Resolve out-of-state Medicaid coverage before determination" banner ahead of every
  other rule (including per-case overrides); `CaseActionBanner` just renders it.
- **Approve guard**: WorkspacePage's `handleApprove` opens a `ConfirmationModal`
  ("Verify Assist flag still open", Approve anyway / Back to case) while the flag is
  open — soft gate, never a hard block. The bottom ActionBar status mirrors the finding.
- **Flags**: the server writes `OOS-MCD` into `intakeData.displayMeta.flags`; the client
  derives `ID-CLEAR` when `identityVerification.status === 'success'`. Both tones live
  in `lib/ee-flags.ts` (with `EE_FLAG_LABELS` tooltips) and render on the dashboard,
  CaseNavBar, and drawer header automatically.

## Identity verification card

`src/components/ee/IdentityVerificationCard.tsx` renders in the Verify phase (below
the Auto-Processing Pipeline, both pathways): CLEAR mark + status badge + completed
time; the checks (`selfie_liveness`, `document_authenticity`, `selfie_document_match` —
any names arriving are humanised) with pass/fail icons; document summary (type, issuing
state, last-4 behind `SensitiveValue`, expiration); verified identity (name, DOB behind
`SensitiveValue`, address, SSN last-4); and a red "Coverage discovered" sub-card when
`determination.duplicate_enrollment` (payer, plan status, member id, coverage start, the
applicant's hosted-flow resolution as friendly text). `identityVerificationStep()` in
`AutoProcessingPipeline.tsx` adds an "Identity verification (CLEAR)" row to the
pipeline (`info` when clean, `warn` with coverage found, `block` on failure) that is
listed but not counted in the "N of M sources passed" tally. `ApplicantSidebar` and
`CaseNavBar` show a "Verified by CLEAR" chip and fall back to
`identityVerification.subjectName` when no other applicant name is known.

## Mock data still in use

`src/data/` keeps only what the kept surfaces import: `case-details.ts` (drawer fixture
shape + defaults), `documents.ts`, `demoToday.ts`, `renewals.ts` (ex-parte renewal
panels reachable from WorkspacePage), `exParteAuditLog.ts` / `personaAuditNarratives.ts`
(Activity Log tab), and `team.ts` (actor-name resolution in `lib/audit-presenter.ts`).

## Environment

Nothing is required in dev. Optional (`.env.example`):

- `VITE_GATEWAY_URL` / `VITE_IDENTITY_URL` — only when the API is not same-origin.
- `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` — pre-fill the login form (dev only).

## Commands (run from the repo root)

```bash
npm run dev -w @demo/admin        # Vite dev server → http://localhost:5180/admin/ (needs apps/server on :4000)
npm run build -w @demo/admin      # tsc && vite build → apps/admin/dist (assets prefixed /admin/)
npm run typecheck -w @demo/admin
npm run test -w @demo/admin       # vitest (jsdom + Testing Library)
```

Dependencies are installed from the repo root with `scripts/npm-install.sh` (never bare
`npm install`). Workspace deps: `@ht/coverage-dates`, `@ht/runtime-env` (version `*`).
