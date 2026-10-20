# SWG E2E tests

End-to-end Playwright tests for the Security Working Group flows, driven through
the real UI against a **dedicated `riskapp_test` database** so your dev data
(`riskapp_dev`) is never touched.

## How it runs

- A separate test stack boots automatically: **backend on :3100** (pointed at
  `riskapp_test` via `DATABASE_URL`) and **frontend on :5273** (proxying to it).
  The dev servers on :3000/:5173 keep running undisturbed.
- `globalSetup` clones the `riskapp_dev` schema into `riskapp_test` on first run.
- A per-test fixture (`support/fixtures.js`) reseeds the deterministic baseline
  before **every** test, so test order never matters.

## Seed baseline

Defined in `../../riskapp/test/e2e/db/seed.sql` with fixed UUIDs mirrored in
`support/constants.js`. It provides one user per role (password `Riskapp123`),
a pending + two validated risks, one action per lifecycle state, a draft cycle
(for plan-meeting), and open + closed-unissued meetings.

## Commands (run from `riskapp-frontend/`)

```bash
npm run test:e2e            # run the suite (boots the test stack)
npm run test:e2e:headed     # watch it in a browser
npm run test:e2e:reset      # re-clone schema + reseed riskapp_test manually
CLONE_E2E_DB=1 npm run test:e2e   # force a schema re-clone (after migrations)
```

Prerequisites: `npx playwright install chromium` once, and a reachable
`riskapp_dev` to clone the schema from.

## Layout

- `support/constants.js` — seed UUIDs / credentials (keep in sync with seed.sql)
- `support/auth.js` — `loginAs(page, role)` + `apiToken(request, role)`
- `support/fixtures.js` — `test`/`expect` with the auto reseed
- `swg/*.spec.js` — the flow specs
