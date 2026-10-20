#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# ⚠ DELIBERATE BASELINE RE-CUT ONLY — NOT part of the normal workflow.
#
# The schema is now managed by db/migrate.js (a frozen db/baseline.sql + ordered
# db/migrations/*.sql). For a routine schema change you ADD A MIGRATION — you do
# NOT run this. The only legitimate use is a rare, intentional "squash": fold all
# applied migrations back into a fresh frozen baseline. See riskapp/db/README.md.
#
# It dumps the CURRENT schema of riskapp_dev to db/baseline.sql and strips the
# psql-17-only \restrict/\unrestrict wrapper lines so the file loads under any
# psql 16+ client.
#
#   bash test/e2e/db/dump-schema.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../../../.env"
OUT="$HERE/../../../db/baseline.sql"

if [[ -z "${PGPASSWORD:-}" && -f "$ENV_FILE" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  if [[ "$DB_URL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/(.+)$ ]]; then
    : "${PGUSER:=${BASH_REMATCH[2]}}"
    export PGPASSWORD="${BASH_REMATCH[3]}"
    : "${PGHOST:=${BASH_REMATCH[4]}}"
    : "${PGPORT:=${BASH_REMATCH[5]}}"
    : "${SRC_DB:=${BASH_REMATCH[6]}}"
  fi
fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-stanley_admin}"
SRC_DB="${SRC_DB:-riskapp_dev}"

echo "⚠ Re-cutting the FROZEN baseline from ${SRC_DB} → ${OUT}"
echo "  (only do this for a deliberate squash — see db/README.md)"
pg_dump --schema-only --no-owner --no-privileges "$SRC_DB" \
  | sed -E '/^\\(restrict|unrestrict) /d' > "$OUT"
echo "✓ wrote $(wc -c < "$OUT") bytes to db/baseline.sql"
