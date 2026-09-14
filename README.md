# State-X E&E demo — CLEAR Verify Assist + Case Assist

End-to-end Eligibility & Enrollment demo for a CMS audience:

1. An applicant creates an account in the **State-X Medicaid resident portal**,
   fills the application wizard, and on the *Personal information* step clicks
   **Verify with CLEAR**. They are handed to the standalone **Verify Assist**
   hosted flow (CLEAR identity verification: selfie + government ID), which
   also discovers healthcare coverage. The demo identity carries active
   **South Carolina Medicaid**, so the flow surfaces an out-of-state duplicate
   enrollment finding and captures the applicant's response before returning
   to the portal with fields pre-filled and marked *Verified by CLEAR*.
2. The applicant submits. The server evaluates MAGI rules, opens a case
   (`SX-2026-NNNNNN`), links the CLEAR verification, and flags the case
   `OOS-MCD`.
3. A **caseworker** signs into the admin portal, opens the case, and the
   in-app **Case Assist** panel lists the finding first (critical), with the
   evidence CLEAR returned, cited fields, suggested actions (issue an RFI for
   proof of disenrollment, work the flag), and a narrative written by Claude
   when `ANTHROPIC_API_KEY` is set. The caseworker works the flag, issues or
   resolves the RFI, and approves or denies.

Built from [isapp/ht-platform](https://github.com/isapp/ht-platform)
(`apps/cms-demo` resident + admin) and [isapp/ht-clear](https://github.com/isapp/ht-clear)
(Verify Assist server + hosted flow), re-platformed onto one Express + SQLite
server so it deploys as a single Render web service.

## Apps

| Workspace | Dev URL | Prod path | What it is |
|---|---|---|---|
| `apps/server` (`@demo/server`) | :4000 | `/api`, `/graphql` | Express 5 + better-sqlite3. Identity REST, GraphQL (Apollo-Router-shaped subset of the ht-platform supergraph), Verify Assist REST, CLEAR integration (mock replica or real sandbox), coverage rules, flags, Case Assist rules + narrative, audit log, static hosting. |
| `apps/resident` (`@demo/resident`) | :5181 | `/` | State-X resident wizard (from ht-platform `apps/cms-demo/resident`). Verify with CLEAR on the Personal information step. |
| `apps/verify` (`@demo/verify`) | :5187 | `/verify` | Verify Assist hosted flow (from ht-clear `apps/verify`): interstitial → CLEAR → coverage findings → resolution → return. Token-scoped, no login. |
| `apps/admin` (`@demo/admin`) | :5180 | `/admin` | Caseworker portal (from ht-platform `apps/cms-demo/admin`, trimmed to the cases flow) with the Case Assist panel and CLEAR identity verification card. |

Contract between them: [`docs/api-contract.md`](docs/api-contract.md).

## Run locally

```bash
npm install
npm run dev          # server :4000, resident :5181, admin :5180, verify :5187
```

- Resident: http://localhost:5181 — create an account (any email), start the
  application, click **Verify with CLEAR** on *Personal information*. In mock
  mode the CLEAR step is an in-app replica (webcam selfie + ID photo, OTP `123456`,
  "Simulate capture" if no camera).
- Admin: http://localhost:5180/admin — `caseworker@state-x.gov` / `password1234`
  (or `admin@state-x.gov`).

## Deploy on Render

`render.yaml` is a Blueprint for one web service + a 1 GB disk. Connect the
GitHub repo in Render (New → Blueprint) or `render blueprint launch`. After
the first deploy:

| Setting | Effect |
|---|---|
| `CLEAR_API_KEY`, `CLEAR_PROJECT_ID` (dashboard secrets) | Real CLEAR sandbox. Register `<service-url>/verify/flow` as the project's redirect URL. Until set, the server falls back to mock mode and says so in `/api/health`. |
| `DEMO_ENRICHMENT=true` (default in the blueprint) | Overlays the deterministic demo identity (Jordan Rivera + active South Carolina Medicaid) on sandbox runs so the out-of-state flag always fires. CLEAR's sandbox itself returns "John Doe" with no coverage. Set `false` for pure CLEAR data. |
| `ANTHROPIC_API_KEY` | Case Assist narratives written by Claude (`CASE_ASSIST_MODEL`, default `claude-opus-5`). Otherwise templated. |

## Repo layout

```
apps/        server, resident, verify, admin
packages/    vendored ht-platform packages the UIs import (runtime-env, i18n, locales, coverage-dates)
docs/        api-contract.md (this demo), verify-assist-api-contract.md (inherited REST detail)
scripts/     npm-install.sh (serialized install helper)
render.yaml  Render Blueprint
```
