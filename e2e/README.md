# End-to-end storyline

Drives the real UI in headless Chromium against a running single-service build:

```bash
# from repo root: build and start the server in single-service mode
npm run build
PORT=4777 SERVE_STATIC=true MOCK_CLEAR=true DEMO_APPLICANT_SEX=F DATABASE_PATH=./data/e2e.db PUBLIC_URL=http://localhost:4777 npm run start -w @demo/server

# in another shell
cd e2e && npm install && npx playwright install chromium
BASE_URL=http://localhost:4777 npm run storyline
```

Creates fresh resident accounts on every run, walks the wizard, completes the
mock CLEAR flow (South Carolina Medicaid finding, "still enrolled"), submits,
then logs in as the caseworker and works the Case Assist flag through RFI →
resolve → approve. Screenshots land in `shots/`.

`DEMO_APPLICANT_SEX=F` is required by the storyline's "sex pre-marked by CLEAR" check; the server default leaves it unset.

## Coverage scenarios

The server's `DEMO_COVERAGE_SCENARIO` decides what CLEAR's coverage discovery
"finds" for the demo applicant:

| Scenario | Server env | Storyline |
|---|---|---|
| Out-of-state Medicaid (default) | `DEMO_COVERAGE_SCENARIO=oos_medicaid` | `npm run storyline` (`storyline.mjs`) — SC Medicaid finding, applicant response, OOS-MCD flag worked to resolution |
| Employer plan | `DEMO_COVERAGE_SCENARIO=employer_plan` | `npm run storyline:employer` (`storyline-employer.mjs`) — no finding, no flag; the hosted flow returns after identity, `/#/insurance` is prefilled with the Aetna plan (locked, editable), Case Assist adds the TPL note |

`storyline-employer.mjs` starts its own single-service server on `:4795`
(`DEMO_COVERAGE_SCENARIO=employer_plan DEMO_APPLICANT_SEX=F`, scratch DB
`apps/server/data/e2e-employer.db`) after `npm run build`; set `BASE_URL` to
reuse a server you started yourself. The two scenarios are a server-side switch —
restart the server to change it (`/api/health` echoes `demoCoverageScenario`).
