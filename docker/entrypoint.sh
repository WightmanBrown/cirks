#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# CIRKS container entrypoint.
#
#   1. Wait for the database to accept connections.
#   2. If the schema already exists AND there are pending migrations, take a
#      compressed pre-migrate pg_dump backup — this is the data-loss guarantee
#      for upgrades (rollback = restore this dump + the previous image tag).
#   3. Apply pending migrations (the runner is advisory-lock-safe, so racing
#      replicas serialise rather than collide).
#   4. exec the application.
set -euo pipefail

cd /app/riskapp

# ── Resolve connection args (mirror src/db/pool.js: DATABASE_URL or DB_*) ────────
# The same CONN array works for both psql and pg_dump.
if [ -n "${DATABASE_URL:-}" ]; then
  CONN=("$DATABASE_URL")
else
  export PGPASSWORD="${DB_PASSWORD:-}"
  CONN=(-h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" \
        -U "${DB_USER:-postgres}" -d "${DB_NAME:-riskapp}")
fi

# ── 1. Wait for the database ─────────────────────────────────────────────────────
echo "[entrypoint] Waiting for database…"
attempts="${DB_WAIT_ATTEMPTS:-60}"
for i in $(seq 1 "$attempts"); do
  if psql "${CONN[@]}" -tAc 'SELECT 1' >/dev/null 2>&1; then
    echo "[entrypoint] Database is up."
    break
  fi
  if [ "$i" -eq "$attempts" ]; then
    echo "[entrypoint] Database unreachable after $((attempts * 2))s — aborting." >&2
    exit 1
  fi
  sleep 2
done

# ── 2. Pre-migrate backup (only when there is something to lose AND to change) ───
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
mkdir -p "$BACKUP_DIR"

has_schema="$(psql "${CONN[@]}" -tAc \
  "SELECT to_regclass('public.schema_migrations') IS NOT NULL" 2>/dev/null || echo f)"

if [ "$has_schema" = "t" ]; then
  # Parse the runner's summary line: "… | pending N …"
  pending="$(node db/migrate.js status 2>/dev/null \
             | sed -n 's/.*| pending \([0-9]*\).*/\1/p' | tail -1)"
  pending="${pending:-0}"
  if [ "$pending" -gt 0 ]; then
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    backup_file="$BACKUP_DIR/pre-migrate-$stamp.sql.gz"
    echo "[entrypoint] $pending pending migration(s); existing schema → backup → $backup_file"
    pg_dump "${CONN[@]}" | gzip > "$backup_file"
    echo "[entrypoint] Backup complete ($(du -h "$backup_file" | cut -f1))."
  else
    echo "[entrypoint] Schema present, 0 pending — no backup needed."
  fi
else
  echo "[entrypoint] Fresh database — baseline will be loaded, no backup needed."
fi

# ── 3. Migrate ───────────────────────────────────────────────────────────────────
echo "[entrypoint] Applying migrations…"
node db/migrate.js up

# ── 4. Seed reference data (idempotent — org_config, capabilities, standards, ────
#      role_permissions, NIST CSF catalogue). No users; create the first admin
#      with `docker compose exec app node db/create-admin.js`.
echo "[entrypoint] Seeding reference data…"
node db/seed.js

# ── 4b. (Opt-in) least-privilege app DB role (H-01) ──────────────────────────────
#       Migrate + seed above ran as the OWNER. If APP_DB_PASSWORD is set, create/
#       refresh a restricted login role (DML + EXECUTE, no DDL) and point the
#       running app at it — so a compromised app process can't alter the schema.
if [ -n "${APP_DB_PASSWORD:-}" ]; then
  APP_DB_USER="${APP_DB_USER:-cirks_app}"
  echo "[entrypoint] Configuring least-privilege app role '${APP_DB_USER}'…"
  psql "${CONN[@]}" -q -v ON_ERROR_STOP=1 \
    -v approle="${APP_DB_USER}" -v apppw="${APP_DB_PASSWORD}" \
    -f db/grant-app-role.sql
  # Derive the restricted connection from the owner URL (swap user:password).
  if [ -n "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.username=process.env.APP_DB_USER;u.password=process.env.APP_DB_PASSWORD;process.stdout.write(u.toString())')"
  else
    export DB_USER="$APP_DB_USER"; export DB_PASSWORD="$APP_DB_PASSWORD"
  fi
  echo "[entrypoint] App will connect as restricted role '${APP_DB_USER}'."
fi

# ── 5. Start ─────────────────────────────────────────────────────────────────────
echo "[entrypoint] Starting CIRKS…"
exec node src/server.js
