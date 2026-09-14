# @demo/server

Single Express 5 + SQLite service behind the State-X E&E demo: identity REST,
GraphQL (`POST /graphql`), the Verify Assist hosted-flow REST, and — in
production — the three built SPAs. The full contract lives in
[`docs/api-contract.md`](../../docs/api-contract.md); this README is the
operator's view.

## Run

```bash
# from the repo root (installs are serialized — always use the script)
scripts/npm-install.sh

npm run dev -w @demo/server          # tsx watch, http://localhost:4000, mock CLEAR
npm run typecheck -w @demo/server    # tsc --noEmit
npm run seed -w @demo/server         # (re)create the two staff logins — also runs at boot
npm run smoke -w @demo/server        # end-to-end storyline against a running server
                                     # (SMOKE_BASE_URL=http://localhost:4193 to target another port)
npm run start -w @demo/server        # production entry (NODE_ENV=production serves the SPAs)
```

The database (`./data/demo.db` by default) is created on first boot; schema
changes are additive (`ensureColumn`). Delete the file to reset the demo.

## Environment

| Var | Default | Notes |
|---|---|---|
| `PORT` | 4000 | |
| `NODE_ENV` | | `production` → static SPA serving + `Secure` cookies |
| `SERVE_STATIC` | false | force static serving outside prod |
| `DATABASE_PATH` | `./data/demo.db` | relative to `apps/server`; Render: `/var/data/demo.db` |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` | base URL for `hostedUrl`, `returnTo`, upload/notice links |
| `RESIDENT_APP_URL` | `PUBLIC_URL` or `http://localhost:5181` | |
| `VERIFY_APP_URL` | `PUBLIC_URL/verify` or `http://localhost:5187` | |
| `VERIFY_ASSIST_RETURN_PATH` | `/#/personal` | hosted flow returns to `RESIDENT_APP_URL + path + ?verified=<id>` |
| `MOCK_CLEAR` | true | `false` = real CLEAR sandbox (falls back to mock with a warning if creds are missing) |
| `CLEAR_API_KEY`, `CLEAR_PROJECT_ID` | | sandbox credentials |
| `DEMO_ENRICHMENT` | false | overlay the demo identities on real sandbox runs |
| `VERIFY_ASSIST_TENANT_STATE` | SX | out-of-state Medicaid rule |
| `ANTHROPIC_API_KEY` | | optional — enables Claude Case Assist narratives (`claude-opus-5`) |
| `CASE_ASSIST_MODEL` | claude-opus-5 | |

See `.env.example`; a `.env` file next to `package.json` is loaded at boot.

## Endpoints

| Surface | Path |
|---|---|
| Health | `GET /api/health` → `{ ok, mode, clearConfigured, caseAssistNarrative }` |
| Identity REST | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/auth/me`; `POST /api/enrollment` |
| GraphQL | `POST /graphql` (alias `POST /api/graphql`); schema in `src/graphql/schema.graphql` |
| Verify Assist (resident) | `POST /api/verifications`, `GET /api/verifications/mine`, `GET /api/verifications/:id` |
| Hosted flow (token-scoped) | `GET /api/flow/sessions/:token`, `POST …/clear-complete` (mock only), `POST …/resolution` |
| Verify Assist (staff) | `GET /api/admin/stats`, `/verifications`, `/verifications/:id`, `POST …/rerun`, `GET /api/admin/flags`, `PATCH /api/admin/flags/:id`, `GET /api/admin/audit` |
| Documents | `PUT /api/uploads/:documentId` (data sink), `GET /api/cases/:id/notice.pdf` |
| Static (prod) | `/` resident · `/verify` hosted flow · `/admin` caseworker console |

Auth: an opaque session token, accepted as an httpOnly cookie
(`cms-demo-resident_session` / `cms-demo-admin_session`, chosen by the `x-app`
header, else inferred from the Referer) **or** `Authorization: Bearer <token>`.
`x-app: cms-demo-admin` requires a `caseworker|admin`; `cms-demo-resident`
requires a `resident` — mismatches are `403 wrong_app`.

## Demo credentials

| Email | Password | Role |
|---|---|---|
| `admin@state-x.gov` | `password1234` | admin (David Chen) |
| `caseworker@state-x.gov` | `password1234` | caseworker (Maria Lopez) |

Residents self-register from the resident portal.

## Demo storyline

1. **Jordan Rivera** registers in the resident portal, fills in the wizard and
   is handed to the Verify Assist hosted flow (`POST /api/verifications
   {role:"applicant"}`). In mock mode CLEAR "verifies" the deterministic demo
   identity (Jordan Rivera, 742 Evergreen Terrace, Springfield SX) and coverage
   discovery finds **ACTIVE South Carolina Medicaid** → `duplicate_enrollment`,
   an `out_of_state_medicaid` flag, and the applicant records a resolution
   (`confirm_enrolled` / `ended_submit_proof`). A household member
   verification (**Sam Rivera**) is clean.
2. `createMedicaidEeCase` stores the wizard's `intakeData`, runs the demo MAGI
   evaluator (`src/ee/rules.ts` → sectioned rule trace + one PENDING
   determination per member), links the verification, appends `OOS-MCD` to
   `intakeData.displayMeta.flags`, sets `flagReason =
   verify_assist:out_of_state_medicaid`, writes the audit trail and kicks off
   the Case Assist narrative.
3. **Maria Lopez** opens the case in the admin console: `identityVerification`
   (CLEAR checks, coverage, flag) and `caseAssist` (rule-based recommendations
   — `oos-medicaid` first — plus the narrative) drive the Case Assist panel.
   She works the flag (`updateVerifyAssistFlag`), queues the case, issues an
   RFI for proof of SC disenrollment, resolves it, runs the (mocked) Argyle
   income/asset verifications and approves. Determinations flip to `ELIGIBLE`
   effective the first of next month and the eligibility notice PDF becomes
   available; `medicaidAuditLog` shows every step.

`npm run smoke` replays exactly this storyline (plus the clean household path,
resident scoping, and every client operation document) against a running server.
