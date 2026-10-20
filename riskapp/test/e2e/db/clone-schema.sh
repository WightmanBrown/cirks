#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# Recreate an EMPTY riskapp_test database (drop + create from template0).
# The schema itself is built by the migration runner (db/migrate.js), invoked by
# reset.mjs after this script — so this no longer touches riskapp_dev or pg_dump.
# Dev data is never affected. Safe to re-run.
#
# Env overrides (defaults target the local dev setup):
#   PGHOST (localhost)  PGPORT (5432)  PGUSER (stanley_admin)
#   PGPASSWORD (read from riskapp/.env DATABASE_URL if unset)
#   TEST_DB (riskapp_test)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../../../.env"

# Pull credentials from DATABASE_URL in .env when not already in the environment.
if [[ -z "${PGPASSWORD:-}" && -f "$ENV_FILE" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  # postgresql://user:pass@host:port/db
  if [[ "$DB_URL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/(.+)$ ]]; then
    : "${PGUSER:=${BASH_REMATCH[2]}}"
    export PGPASSWORD="${BASH_REMATCH[3]}"
    : "${PGHOST:=${BASH_REMATCH[4]}}"
    : "${PGPORT:=${BASH_REMATCH[5]}}"
  fi
fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-stanley_admin}"
TEST_DB="${TEST_DB:-riskapp_test}"

echo "→ Recreating EMPTY ${TEST_DB} (host=${PGHOST} user=${PGUSER})"

# Terminate any open connections to the test DB, then drop + recreate.
# template0 avoids the glibc collation-version mismatch that template1/postgres
# carry after an OS library upgrade.
psql -d postgres -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${TEST_DB};
CREATE DATABASE ${TEST_DB} TEMPLATE template0;
SQL

echo "✓ ${TEST_DB} recreated empty — schema built next by db/migrate.js"
