# CIRKS — Deployment Runbook

CIRKS ships as a **single application container** (Express serves the built
React SPA from `/public` and the API at `/api/v1` from one process) plus a
**PostgreSQL 17** database. This document covers a fresh install, upgrades
(with the data-loss guarantee), and an air-gapped offline install.

> Covers Phases 1–4 of the deployment epic: containers, production bootstrap +
> first-admin, spreadsheet import, and hardening (TLS, helmet, auth rate
> limiting, opt-in least-privilege DB role, backup/restore, secrets).

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin (`docker compose`).
- ~2 GB free disk for images + database volume.
- For builds: outbound internet (to pull base images and `postgresql-client-17`
  from the PGDG apt repo). Runtime needs no internet.

## 1. Fresh install (internet-connected host)

```bash
git clone <repo> cirks && cd cirks
cp .env.docker.example .env
# Edit .env:
#   - DB_PASSWORD: a strong password
#   - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: two distinct 64-byte hex strings
#     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
docker compose up -d --build
docker compose logs -f app
```

On first boot the entrypoint:

1. Loads the frozen `riskapp/db/baseline.sql` (schema through v88) via `psql`,
   stamps the baseline, applies any forward migrations in `riskapp/db/migrations/`.
2. **Seeds reference data** (`db/seed.js`, idempotent) — the schema-only baseline
   carries no data, so this populates: the `org_config` singleton (name from the
   `ORG_NAME` env var, default *My Organisation*), the capability catalogue, the
   four SoA-lens `standards` rows, the canonical `role_permissions` grants (from
   `src/auth/capabilityDefaults.js`), and the **bundled NIST CSF 2.0 catalogue**
   (106 controls → the NIST SoA is covered out of the box). No users are created.
3. Serves on `http://localhost:${APP_PORT}` (default **8080**).

Quick check: `make smoke` (or `curl localhost:8080/health`).

### Create the first admin

There is **no default account and no default password**. Create the first admin
once the stack is up:

```bash
# Interactive (hidden password prompt, entered twice):
docker compose exec app node db/create-admin.js --email you@org --name "Your Name"

# Or non-interactive (automation):
docker compose exec -e ADMIN_PASSWORD='a-strong-password' app \
  node db/create-admin.js --email you@org --name "Your Name"
```

Passwords are bcrypt-hashed (cost 12), minimum 12 characters. Then log in at
`http://localhost:${APP_PORT}` and use **Setup** to stand up departments, impact
tables, systems and the rest of the picture (the org starts in *setup phase*).

### Reset a forgotten password

`create-admin.js` refuses an email that already exists, so use `reset-password.js`
to set a new password on an **existing** account (any role — the recovery path when
the sole admin is locked out). It only changes `password_hash`; role, department
and active state are untouched.

```bash
# Interactive (hidden prompt, entered twice):
docker compose exec app node db/reset-password.js --email you@org

# Or non-interactive (automation):
docker compose exec -e NEW_PASSWORD='a-strong-password' app \
  node db/reset-password.js --email you@org
```

Same rules as create: bcrypt cost 12, minimum 12 characters. Behind the TLS
overlay, add both `-f` flags (`-f docker-compose.yml -f
deploy/docker-compose.tls.yml`) as with every command for that stack.

### Load organisation data from spreadsheets (optional)

**Capturing a new organisation?** Start from the workbook in
[`docs/templates/`](templates/README.md): one sheet per file below for
departments, users, impact tables, information assets, systems and business
services, with the column names in place, drop-downs for what each column
accepts, and a worked example.

Instead of entering everything by hand, you can bulk-load the org's content from
CSV files — the read-side of the admin exporter (**Admin → Data Export**), so an
export round-trips back in. `db/import.js` loads a directory of `<slug>.csv`
files (one per dataset) in dependency order.

```bash
# Put the filled-in CSV files in ./import on the host (next to docker-compose.yml).
# The app container sees that folder, read-only, as /import. (Copying files INTO
# the container does not work: its root filesystem is read-only.)

# 1. Preview — every row runs and is rolled back:
docker compose exec app node riskapp/db/import.js /import --dry-run

# 2. Load for real. --password is the starting password for every new account;
#    there is no default, and a user row without one is refused:
docker compose exec app node riskapp/db/import.js /import --password '<starting password>'
```

To get header-only templates, use the capture workbook (`docs/templates/`) or
run `node riskapp/db/import.js --template <dir>` on a checkout with Node.

Each row reports `imported / skipped / errors`; a row whose business key already
exists is **skipped**, so re-running is safe (idempotent). A bad row is isolated
(per-row savepoint) and reported without aborting the rest. Use `--format tsv`
for tab-separated files, and `--actor <email>` to choose which user is recorded
as the creator of imported components (defaults to the earliest admin).

**Load order** (handled automatically): departments → users → user_roles →
impact-tables → impact-table bil/cia levels → threats → controls →
control-threats → control-mappings → components → control-component-links →
information-assets → asset-impact-ratings → systems → system-assets →
system-components → business-services → business-service-systems, then the
security solutions, the architecture, the SoA and suppliers. `node db/import.js
--template <dir>` writes a header-only file for every one.

**Files saved from a spreadsheet load as they are**: Excel's "CSV UTF-8"
byte-order mark is ignored, header names are trimmed, and a row of empty cells is
a blank line. Loading **one file at a time** works — put a single file in the
folder — provided the order above is kept; load `departments.csv` once more
after `users.csv` to fill in the department heads.

**FK resolution:** files reference each other by **business key** (department
name, user email, entity name, standard `code`/`ref_code`) — no UUIDs. Asset CIA
is derived from `asset-impact-ratings`, and system/service impact then cascades
from the linked assets, so import the ratings and the links and the scores
compute themselves.

**Users are imported** with a starting password: a blank `password` cell takes
`--password <pw>` (or `DEMO_PASSWORD`). There is no default — a user with no
password is refused. CIRKS has no self-service password change yet, so an
administrator then sets each person's own password (Admin → Account Management →
Reset password). **Not imported here:**
the RBAC/capability/standards datasets (seeded by `db/seed.js`). The per-standard reference catalogues (ISO/CIS) load
via **Setup → Control Sets**. Owner/manager emails resolve to a user when present,
else are left unset.

## 2. Upgrades (the data-loss guarantee)

Upgrades migrate existing data in place — they never recreate the schema.

```bash
cd cirks
git pull                      # or: docker load a new image bundle (§4)
docker compose up -d --build
```

On boot the entrypoint:

1. Waits for the database.
2. Detects an existing schema and checks for pending migrations.
3. **If any are pending, takes a compressed `pg_dump` backup** to the `backups`
   volume (`/app/backups/pre-migrate-<UTC-timestamp>.sql.gz`) *before* touching
   the schema.
4. Applies migrations, each in its own transaction, under a Postgres advisory
   lock (safe with multiple replicas).
5. Starts the app.

### Rollback

```bash
# 1. Restore the pre-migrate dump taken above.
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c <backup>.sql.gz | docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME"
# 2. Redeploy the previous image tag / git checkout.
```

Copy a backup out of the volume with:

```bash
docker compose cp app:/app/backups ./backups
```

## 3. Volumes & persistence

| Volume     | Mount                               | Holds                          |
|------------|-------------------------------------|--------------------------------|
| `pgdata`   | `db:/var/lib/postgresql/data`       | the database                   |
| `uploads`  | `app:/app/riskapp/uploads/meetings` | meeting attachments            |
| `backups`  | `app:/app/backups`                  | pre-migrate `pg_dump` archives |

`docker compose down` keeps volumes; `down -v` **deletes** them (only for
throwaway/dev — see `make fresh`).

## 4. Air-gapped / offline install

On an internet-connected build host:

```bash
make bundle          # → dist-bundle/ : cirks-images.tar.gz, docker-compose.yml,
                     #   .env.docker.example, README.md
```

Transfer `dist-bundle/` to the air-gapped host, then:

```bash
cd dist-bundle
docker load < cirks-images.tar.gz      # loads cirks:latest + postgres:17
cp .env.docker.example .env            # edit secrets as in §1
docker compose up -d
```

The image already contains `postgresql-client-17` and the frozen baseline, so
no network access is required at run time.

## 5. Operations

```bash
make up            # start (build if needed)
make logs          # follow app logs
make down          # stop, keep data
make fresh-smoke   # wipe volumes, clean install, assert /health (CI-style loop)
docker compose exec app node db/migrate.js status   # migration state
```

## 6. TLS (CIRKS terminates its own)

CIRKS does not rely on an external load balancer for TLS — it ships a bundled
**Caddy** reverse proxy as an overlay. Caddy faces the internet on 80/443 and
proxies to the app over the internal network; the app's own port is no longer
published. The app honours `X-Forwarded-*` (it sets `trust proxy` in production)
so client IPs and rate limiting stay accurate.

Set the hostname and **one** certificate mode in `.env`, then start with the
overlay:

```bash
# .env:
#   CIRKS_DOMAIN=cirks.example.org
#   CIRKS_TLS=...        # pick one mode below
docker compose -f docker-compose.yml -f deploy/docker-compose.tls.yml up -d
# or: make tls-up
```

| Mode | `CIRKS_TLS` value | Notes |
|---|---|---|
| **Bring your own cert** | `tls /certs/cert.pem /certs/key.pem` | put `cert.pem`+`key.pem` in `deploy/certs/` (git-ignored, mounted read-only) |
| **ACME / Let's Encrypt** | *(blank)* or `tls you@example.org` | domain must resolve to the host; 80/443 reachable; auto-renews |
| **Self-signed / internal** | `tls internal` | air-gapped / no public DNS; Caddy's internal CA issues the cert |

> **Host SSH access** (for the few users who need it) is the administrator's
> responsibility to manage on the host OS — it is outside CIRKS. The app
> container runs only the Node process; there is no SSH daemon inside it.

## 7. Backup & restore

The entrypoint already takes an automatic `pg_dump` **before every migration**
(§2). For scheduled backups use `deploy/backup.sh`. It writes the database and
the meeting attachments as a pair, because the database refers to the
attachments and `pg_dump` does not include them. The schedule, the off-host
copy and the restore onto a wiped machine are in
[INSTALL.md, Part 4](INSTALL.md#part-4--looking-after-it).

`make backup` / `make restore FILE=…` still work, but they cover the
**database only** and restore into a running stack (drop + reload the schema).
For point-in-time needs, run Postgres WAL archiving on the `pgdata` volume
(standard Postgres ops, outside this runbook).

## 8. Secrets handling

Secrets are supplied via the git-ignored **`.env`** file (env-var injection).
This is deliberately simple; treat it accordingly:

- **Generate strong values** — JWT secrets with
  `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`;
  the app refuses to boot if the JWT secrets are left as `REPLACE_…`.
- **Restrict the file**: `chmod 600 .env`, owned by the deploy user. Never
  commit it (it is git-ignored; only `.env.docker.example` placeholders are
  tracked).
- **Caveat**: env-injected secrets are visible to anyone who can run
  `docker inspect` / read the container's environment on the host. For sensitive
  sites, source `.env` from a secret manager at deploy time, or move to Docker
  secrets — host access control is the real boundary here.
- **Rotate** as in [INSTALL.md, *Changing the generated secrets*](INSTALL.md#changing-the-generated-secrets).
  `JWT_*` and `APP_DB_PASSWORD`: edit `.env` and recreate the app container
  (`JWT_*` signs everyone out). **`DB_PASSWORD` is different**: Postgres reads it
  only when the volume is first initialised, so `ALTER ROLE` it in the database
  first, then edit `.env`. Editing `.env` alone stops the app connecting.

## Notes & current limitations

- **`postgresql-client-17` is required in the image**: the bundled DB server is
  PG17, and `pg_dump` refuses to dump a server newer than itself, so the client
  major version must match the server.
- The image runs as the non-root `node` user; the `uploads`/`backups` volumes
  are pre-chowned in the Dockerfile.
- **Security headers** (helmet) and an **auth brute-force throttle** (per-IP,
  `AUTH_RATE_LIMIT_*`) are always on. The CSP allows the SPA's Google-Fonts use;
  tighten it if you self-host fonts.
- **Least-privilege DB role (H-01)** is opt-in: set `APP_DB_PASSWORD` and
  migrations run as the owner while the app connects as a restricted role that
  can DML but not change the schema. Validate your full workflow before relying
  on it in production.
- **Image provenance** (signing / SBOM) is not yet wired — it lands with the
  GHCR publish pipeline (distribution).
