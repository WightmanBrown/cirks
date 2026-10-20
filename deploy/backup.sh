#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# CIRKS backup — the database and the meeting attachments, into ./backups.
#
#   deploy/backup.sh            # run from anywhere; works on the checkout it lives in
#   KEEP_DAYS=60 deploy/backup.sh
#
# Writes two files with the same UTC timestamp:
#   backups/cirks-db-<UTC>.sql.gz            pg_dump of the whole database
#   backups/cirks-attachments-<UTC>.tar.gz   the meeting attachments volume
# The database refers to the attachments, so a restore needs the PAIR
# (docs/INSTALL.md, Part 4). .env is not copied: keep it separately.
#
# Deletes this script's own backups older than KEEP_DAYS (default 30). The
# entrypoint's pre-migrate dumps live in a Docker volume and are not touched.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups
umask 077

ts=$(date -u +%Y%m%dT%H%M%SZ)
db="backups/cirks-db-$ts.sql.gz"
att="backups/cirks-attachments-$ts.tar.gz"

# Write to .part and rename, so a failed run never leaves a file that looks good.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$db.part"
mv "$db.part" "$db"

docker compose exec -T app tar -C /app/riskapp/uploads -czf - meetings > "$att.part"
mv "$att.part" "$att"

find backups -maxdepth 1 -name 'cirks-*-*.gz' -mtime +"${KEEP_DAYS:-30}" -delete

echo "wrote $db ($(du -h "$db" | cut -f1)) and $att ($(du -h "$att" | cut -f1))"
