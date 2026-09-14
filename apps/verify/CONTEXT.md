# Verify Assist — Hosted Flow App (`@demo/verify`)

**Path:** `apps/verify/` · dev port **5187** · Vite `base: '/verify/'` · `/api` proxied to `http://localhost:4000`

## Purpose

The standalone, applicant-facing Verify Assist "hosted flow" for the State-X
demo tenant (agency: State-X Health & Human Services; program: State-X
Medicaid). The origin application (the resident wizard, `apps/resident`, :5181)
creates a verification via `POST /api/verifications` and sends the browser to
`hostedUrl = ${VERIFY_APP_URL}/flow?token=<token>`. This app owns the entire
verification journey and closes out back to `session.returnTo`. There is no
login: the unguessable per-session token in the URL is the credential.

Roles: `applicant` and `household` only (the ht-clear provider-enrollment
variant is not part of this demo).

## Base path

- Production: `apps/server` mounts the built `dist/` at `/verify` (same origin,
  no CORS). Asset URLs are emitted as `/verify/assets/...`.
- Dev: Vite serves at `http://localhost:5187/verify/`; the flow URL is
  `http://localhost:5187/verify/flow?token=…`.
- CLEAR (sandbox mode) redirects back to `<origin>/verify/flow?token=…&returned=1`.
- The token is read from `window.location.search` regardless of path prefix,
  so `/flow?token=…` and `/verify/flow?token=…` both work.

## The journey (state machine in `src/App.tsx`)

Phases: `loading → welcome → clear | clear-redirect → processing → results → closeout`,
plus `invalid` and `failed`.

1. **welcome** (`steps/Welcome.tsx`) — process interstitial: three steps
   explained, consent disclosure, "Begin verification".
2. **CLEAR step**
   - mock mode (`session.mode === 'mock'`, server `MOCK_CLEAR=true`):
     `steps/clear/ClearCapture.tsx`, the in-app CLEAR-branded capture replica
     (phone → OTP `123456` → webcam selfie → ID photo via getUserMedia, with a
     "Simulate capture" fallback when no camera). Scoped styling in
     `clear-capture.css`, deliberately not Civic. Completion posts `/clear-complete`.
   - sandbox mode: `steps/ClearRedirect.tsx` sends the user to `session.clearUrl`
     (verified.clearme.com); CLEAR returns them to `/verify/flow?token=…&returned=1`,
     which resumes at processing.
3. **processing** (`steps/Processing.tsx`) — polls the session until terminal,
   then plays the analysis rows (identity → details → out-of-state coverage; the
   coverage row flips to a warning when `determination.duplicate_enrollment`).
4. **results** (`steps/Results.tsx`) — clean path: verified summary + return.
   Issue path: warning banner ("We found active Medicaid coverage in
   `{payer_state_name}`"), the "Coverage we found" card, and the resolution
   choice: **"My coverage there has ended"** (choose a proof file; only the file
   name is sent as `proofName`) or **"I'm still enrolled"** (caseworker review).
   Submits `POST /resolution`. Revisits of a resolved session show a read-only
   summary. All state wording comes from `session.determination.payer_state_name`
   (demo: South Carolina) — nothing is hardcoded.
5. **closeout** (`steps/CloseOut.tsx`) — "Results sent", then
   `window.location.assign(returnTo)` with the server-supplied URL verbatim
   (e.g. `http://localhost:5181/#/personal?verified=<id>`; the hash is preserved).

Failure states: `steps/InvalidLink.tsx` (bad/missing token — reveals nothing)
and `steps/FlowFailed.tsx` (failed/expired verification).

## API calls (`src/lib/api.ts`)

Contract: `docs/api-contract.md` § Verify Assist REST and
`docs/verify-assist-api-contract.md` § Hosted Verify Assist flow.

- `GET /api/flow/sessions/:token` → `{ session }` (status, role, mode,
  externalRef, checks, identity-only traits, determination, resolution,
  clearUrl, returnTo). Also used for polling during processing.
- `POST /api/flow/sessions/:token/clear-complete` `{ selfie?, documentFront?, documentBack? }`
  — mock mode only; image data URLs from the capture step.
- `POST /api/flow/sessions/:token/resolution` `{ resolution, proofName? }` → `{ ok, returnTo }`.

## Env

None in this app. Behaviour (mock vs sandbox, returnTo, tenant state) is decided
server-side; see the server env table in `docs/api-contract.md`
(`VERIFY_APP_URL`, `RESIDENT_APP_URL`, `MOCK_CLEAR`, `VERIFY_ASSIST_TENANT_STATE`).

## Styling

Vendored Civic model: `src/styles/civic-globals.css` + `theme.css` (owned
source), ui primitives in `src/components/ui/` (button, card, radio-group,
label), brand chrome in `src/components/FlowShell.tsx` (Verify Assist shield
mark, agency/program subtitle, three-stage stepper, consent footer).

## Scripts

`npm run dev -w @demo/verify` · `npm run typecheck -w @demo/verify` ·
`npm run build -w @demo/verify` (→ `apps/verify/dist`) · `npm run test -w @demo/verify`
