# riskapp-frontend

React + Vite frontend for the RiskApp Governance Console.

## Dev setup

```bash
cd riskapp-frontend
npm install
npm run dev       # Vite on :5173, proxies /api → Express :3000
```

Express must be running on port 3000 for API calls to work.

## Build for production

```bash
npm run build     # outputs to ../public  (relative to vite.config.js outDir)
```

Then start Express normally — it serves the bundle via the static-serve
snippet in `STATIC_SERVE_SNIPPET.js` (copy into `src/app.js` before the 404
handler if not already there).

## Project structure

```
src/
  api/
    client.js         Axios instance + silent refresh interceptor
    index.js          Typed wrappers for each Express endpoint
  components/
    ProtectedRoute.jsx Auth + role guard
    Shell.jsx          Persistent top-bar layout
    ValidateModal.jsx  CISO validate/return modal
  context/
    AuthContext.jsx    Global auth state + login/logout
  pages/
    LoginPage.jsx      Login form with TOTP step
    PendingRisksPage.jsx  Pending risks dashboard
    UnauthorizedPage.jsx  403 page
  styles/
    globals.css        CSS variables + resets
  App.jsx             Router
  main.jsx            Entry point
```

## Vertical slice implemented

```
POST /api/v1/auth/login
  ↓ (access_token + refresh_token stored in localStorage)
GET /api/v1/governance/risks/pending
  ↓ (table with status filter)
POST /api/v1/governance/risks/:id/validate
  ↓ (validate or return with notes)
  → optimistic row removal + toast
```

## Auth flow

- Access tokens (15 min) stored in `localStorage.access_token`
- Refresh tokens (30 days) stored in `localStorage.refresh_token`
- Axios interceptor silently refreshes on 401, queues concurrent requests
- Token reuse detection on the server causes family-wide revocation → redirect to /login

## Design

Industrial security terminal aesthetic.
- **Dark slate** background (`#0d0f13`)
- **Amber** accents for pending state and primary actions
- **IBM Plex Mono** for data / identifiers
- **Syne** for headings
