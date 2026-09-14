# End-to-end storyline

Drives the real UI in headless Chromium against a running single-service build:

```bash
# from repo root: build and start the server in single-service mode
npm run build
PORT=4777 SERVE_STATIC=true MOCK_CLEAR=true DATABASE_PATH=./data/e2e.db PUBLIC_URL=http://localhost:4777 npm run start -w @demo/server

# in another shell
cd e2e && npm install && npx playwright install chromium
BASE_URL=http://localhost:4777 npm run storyline
```

Creates fresh resident accounts on every run, walks the wizard, completes the
mock CLEAR flow (South Carolina Medicaid finding, "still enrolled"), submits,
then logs in as the caseworker and works the Case Assist flag through RFI →
resolve → approve. Screenshots land in `shots/`.
