<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# Contributing to CIRKS

Thank you for considering it. Bug reports, fixes, documentation improvements and
ideas are all welcome.

## Before you start

- **Small fixes** (a typo, a clear bug with an obvious fix): open a pull request.
- **Anything larger** (a new feature, a change to how risk is calculated, a
  schema change): start a [discussion](https://github.com/WightmanBrown/cirks/discussions)
  or an issue first, so that we can agree the approach before you spend time on
  it.
- **Security vulnerabilities** go through [SECURITY.md](SECURITY.md), never a
  public pull request.

CIRKS follows one rule above all: **only model things that help answer a
security question.** CIRKS is a risk system, not an architecture modelling tool.
A proposal that adds a new kind of record or a new level of detail should say
which security answer it changes: which risk it scores differently, which
control objective it shows met or unmet, or who has to act.

## How contributions reach a release

CIRKS is developed in a private repository at Wightman Brown Limited and
published here at each release, as one commit per version. When your pull
request is accepted, we apply it to the development repository with your
authorship and sign-off kept. It appears in the next release, and the release
commit credits you as a co-author. Your pull request here is then closed with a
link to that release.

## Signing off your commits (DCO)

Every commit must be signed off, to certify that you wrote it or otherwise have
the right to contribute it under the project's licence, as set out in the
[Developer Certificate of Origin](https://developercertificate.org/). Add the
sign-off with `-s`:

```bash
git commit -s -m "Explain what this changes"
```

This adds a `Signed-off-by: Your Name <you@example.org>` line, using your real
name.

## Licence of contributions

CIRKS is licensed under the [Apache License 2.0](LICENSE). By contributing, you
agree that your contribution is licensed under it too (section 5 of the
licence). Copyright in your contribution stays with you.

The CIRKS name is a trademark of Wightman Brown Limited and is not covered by
the licence; see the [trademark policy](TRADEMARKS.md).

## What a good pull request has

- **One change**, with a description of what it changes and why.
- **Tests.** The suites and what each catches are described under
  [Tests](#tests) below. A change that touches SQL needs the integration suite,
  because the mocked unit tests cannot catch a wrong query.
- **Schema changes as a new migration.** Add
  `riskapp/db/migrations/NNNN_short_name.sql`. Never edit a migration that has
  already been released: the runner checksums them, and refuses to start on a
  database where an applied migration has changed.
- **Passing checks.** CI runs lint, every test suite and the documentation build
  on each pull request.

## Repository layout

```
riskapp/              Node.js / Express API + PostgreSQL schema
  src/                  routes, middleware, auth, stored-function callers
  db/                   migration runner, baseline, migrations/, seed
  test/e2e/db/          deterministic test seed + reset harness
riskapp-frontend/     React + Vite single-page app
  src/                  pages, components, api client, contexts
  e2e/                  Playwright end-to-end specs
docs/                 install guide, user guides, capture workbook, docs site
docker/, deploy/      container + deployment assets
```

`riskapp` / `riskapp-frontend` are the internal package names; **CIRKS is the
user-facing brand** (login, top bar, page title).

## Setting up a development environment

For working on CIRKS itself, without Docker. To install and run it, see the
[install guide](docs/INSTALL.md). You need:

| Tool | Version |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| PostgreSQL | 17+ |

### 1. Get the code and its dependencies

```bash
git clone https://github.com/<you>/cirks.git && cd cirks    # your fork
(cd riskapp && npm install)
(cd riskapp-frontend && npm install)
```

### 2. Configure

```bash
cd riskapp && cp .env.example .env
```

Fill in the required values. Generate the two JWT secrets separately — they must
differ:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create the database and build the schema

```bash
createdb cirks
cd riskapp
npm run migrate        # loads the frozen baseline, then every forward migration
npm run seed           # reference data: capabilities, standards, control catalogue
npm run create-admin   # interactive: your first admin account
```

The schema is managed by a migration runner (`riskapp/db/migrate.js`): a frozen
`db/baseline.sql` plus ordered forward migrations in `db/migrations/NNNN_slug.sql`.
`npm run migrate:status` shows what is pending. Migrations are checksummed —
editing one that has already been applied is refused. Fix forward with a new file.
See [`riskapp/db/README.md`](riskapp/db/README.md).

### 4. Run

```bash
cd riskapp && npm run dev            # API on :3000
cd riskapp-frontend && npm run dev   # app on :5173, proxies /api to :3000
```

### 5. Load demo data (optional)

The training organisation, Misty Isles Government, is built by one command into an
**empty** database, with the backend running (it works through the API):

```bash
cd riskapp && node db/dataset/misty-isles/install.js
```

It asks for the administrator's password; every other account is left with no
usable password until the administrator sets one. On a server, see
the [install guide](docs/INSTALL.md) Part 3A; to load your own organisation
instead, Part 3B.

## Tests

| Layer | Command | What it catches |
|---|---|---|
| Backend unit (mocked pool) | `cd riskapp && npm test` | route/controller logic — **not** SQL errors |
| Backend integration (real DB) | `cd riskapp && npm run test:integration` | schema drift, triggers, the true RBAC contract |
| Frontend unit | `cd riskapp-frontend && npm test` | components, helpers, contracts |
| End-to-end | `cd riskapp-frontend && npm run test:e2e` | full role-based flows in a browser |

The mocked backend tests **cannot** catch a bad query — the mock returns whatever
the test says. Anything touching SQL needs the integration suite or a real
request. Integration and e2e run against a dedicated `riskapp_test` database with
a safety latch that refuses any non-test database.

CI (GitHub Actions) runs all four on every PR, building the test database through
the migration runner so the migration path itself is continuously validated.

## Code of conduct

Everyone taking part is expected to follow the
[code of conduct](CODE_OF_CONDUCT.md).
