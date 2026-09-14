# ht-cms-demo-clear — project brief

State-X Eligibility & Enrollment demo with CLEAR Verify Assist (identity +
coverage discovery) and an in-app Case Assist panel. One Express + SQLite
server, three Vite SPAs, one Render web service. Read `README.md` for the
story and `docs/api-contract.md` for the contract between apps — keep the
contract updated whenever an endpoint, GraphQL field, or shape changes.

## Rules of the road

- npm workspaces (not pnpm). No `workspace:*` protocol. Node ≥ 20.
- Everything is same-origin: SPAs call `/api` and `/graphql` only (Vite proxy in dev).
- The GraphQL schema (`apps/server/src/graphql/schema.graphql`) mirrors the
  ht-platform supergraph for the operations the ported UIs use. Adding a field
  to a client operation document means adding it to the schema and resolver.
- Full SSN never leaves the server; only `ssnLast4`. Residents never receive
  raw `traits.health_insurance` or flag workflow state.
- Case Assist recommendations are deterministic rules; Claude only writes the
  narrative (optional, `ANTHROPIC_API_KEY`). Never put SSN/DOB/address in the prompt.
- Demo tenant is State-X (`SX`); the out-of-state coverage is South Carolina Medicaid.
- Quality gates before committing: `npm run typecheck`, `npm run build`,
  `npm run smoke -w @demo/server` (storyline against a scratch DB).

## Where things live

| Concern | Path |
|---|---|
| Auth / sessions / seeds | `apps/server/src/auth.ts`, `routes/auth-routes.ts` |
| GraphQL schema + resolvers | `apps/server/src/graphql/` |
| Case lifecycle + demo MAGI evaluator | `apps/server/src/ee/` |
| CLEAR client, normalize, demo identity, coverage rules | `apps/server/src/clear/` |
| Case Assist rules + narrative | `apps/server/src/case-assist/` |
| Hosted flow | `apps/verify/src/` |
| Resident CLEAR step | `apps/resident/src/wizard/` (personal step, `verify-assist-client.ts`) |
| Caseworker Case Assist panel | `apps/admin/src/components/ee/case-assist/` |
