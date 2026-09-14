# State-X Medicaid Application — resident app

Citizen-facing Eligibility & Enrollment wizard for the State-X demo, with a
"Verify with CLEAR" identity step (Verify Assist handoff). Talks only to the
same-origin demo server (`apps/server`): `/api/*` REST and `/graphql`.

```sh
# from the repo root — never run bare `npm install` (serialized across agents)
./scripts/npm-install.sh
npm run dev -w @demo/resident      # http://localhost:5181 (proxies /api + /graphql → :4000)
npm run typecheck -w @demo/resident
npm run test -w @demo/resident
npm run build -w @demo/resident    # tsc && vite build → dist/
```

Copy `.env.example` to `.env.local` if you need to override anything; the
defaults work with `npm run dev -w @demo/server` on port 4000.

See `CONTEXT.md` for routes, auth, the CLEAR step, and the data model.
