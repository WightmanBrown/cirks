#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
#
# Install CIRKS with nobody at the keyboard, on a new Ubuntu machine:
# docs/INSTALL.md Parts 1 and 2, then either Part 3A (a Misty Isles training
# instance) or the first administrator of an empty instance (3B.1).
#
#   ADMIN_PASSWORD='…' ~/cirks/deploy/install.sh --training
#   ADMIN_PASSWORD='…' ADMIN_EMAIL=you@example.org ADMIN_NAME='Your Name' \
#     ~/cirks/deploy/install.sh --empty
#
# Run it as the guide is followed: as an ordinary user who can use sudo without
# a password prompt, from the checkout at ~/cirks (INSTALL.md 1.3). The
# administrator's password must meet the password rule (INSTALL.md 3B.1).
# CIRKS is reached at https://cirks.local/, as in the guide.
#
# The blocks between "# >>> INSTALL.md <id>" and "# <<< INSTALL.md <id>" are the
# guide's own commands, copied exactly. deploy/check-install-script.mjs fails CI
# when the two differ, so a change to the guide is a change to this script.
# Everything outside them is what a script needs and a person does not: stopping
# on Docker installed as a snap, using sudo for Docker until the next log-in,
# and passing the password in instead of prompting for it.
# shellcheck disable=SC1091  # the guide reads the host's /etc/os-release (1.1)
set -euo pipefail

say() { printf '\n[install] %s\n' "$*"; }
die() { printf '\n[install] STOPPED: %s\n' "$*" >&2; exit 1; }

MODE="${1:-}"
case "$MODE" in
  --training|--empty) ;;
  *) echo "usage: ADMIN_PASSWORD=… $0 --training | --empty   (see the top of this file)" >&2; exit 2 ;;
esac

# ── Before anything changes ───────────────────────────────────────────────────
[ "$(id -u)" -ne 0 ] || die "run it as an ordinary user with sudo, not as root: CIRKS lives in that user's ~/cirks"
here="$(cd "$(dirname "$0")/.." && pwd -P)"
if [ ! -d ~/cirks ] || [ "$(cd ~/cirks && pwd -P)" != "$here" ]; then
  die "run it from the checkout at ~/cirks (INSTALL.md 1.3); this copy is at $here"
fi
sudo -n true 2>/dev/null || die "sudo asks for a password; this script needs sudo without one"

# The application checks the password rule too, but only after the image is
# built, minutes from now. Refuse a bad password while it costs nothing.
[ -n "${ADMIN_PASSWORD:-}" ] || die "set ADMIN_PASSWORD, the administrator's password"
[ "$(printf %s "$ADMIN_PASSWORD" | wc -m)" -ge 12 ] || die "ADMIN_PASSWORD must be at least 12 characters (INSTALL.md 3B.1)"
[ "$(printf %s "$ADMIN_PASSWORD" | wc -c)" -le 72 ] || die "ADMIN_PASSWORD must be at most 72 bytes (INSTALL.md 3B.1)"
if [ "$MODE" = --empty ]; then
  [ -n "${ADMIN_EMAIL:-}" ] || die "set ADMIN_EMAIL, the administrator's email address"
  [ -n "${ADMIN_NAME:-}" ]  || die "set ADMIN_NAME, the administrator's full name"
fi
export ADMIN_PASSWORD ADMIN_EMAIL="${ADMIN_EMAIL:-}" ADMIN_NAME="${ADMIN_NAME:-}"
export USER="${USER:-$(id -un)}"

# The guide's blocks call `docker` as a person would after logging back in
# (1.2). A script cannot log back in, so until the docker group applies, Docker
# runs through sudo. `docker compose exec` gets no terminal (-T) and the
# administrator's details, which the tools read instead of prompting.
docker() {
  local run=(command docker)
  if [[ " $(id -nG) " != *" docker "* ]]; then
    # shellcheck disable=SC2054  # the commas are sudo's list, not array separators
    run=(sudo --preserve-env=ADMIN_PASSWORD,ADMIN_EMAIL,ADMIN_NAME docker)
  fi
  if [ "${1:-}" = compose ] && [ "${2:-}" = exec ]; then
    shift 2
    "${run[@]}" compose exec -T -e ADMIN_PASSWORD -e ADMIN_EMAIL -e ADMIN_NAME "$@"
  else
    "${run[@]}" "$@"
  fi
}

# ── Part 1: prepare the machine ───────────────────────────────────────────────
say "1.1 Check the host"
# >>> INSTALL.md 1.1
. /etc/os-release && echo "$PRETTY_NAME"; uname -m
docker --version 2>/dev/null || echo "docker: not installed"
git --version    2>/dev/null || echo "git: not installed"
snap list docker curl 2>/dev/null || true         # should print nothing
# <<< INSTALL.md 1.1
if snap list docker >/dev/null 2>&1; then
  die "Docker is installed as a snap, which cannot run the CIRKS application container. Remove it first (INSTALL.md 1.1): sudo snap remove --purge docker"
fi

say "1.2 Install Docker and Git"
# >>> INSTALL.md 1.2-install
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 docker-buildx git curl
sudo usermod -aG docker "$USER"
# <<< INSTALL.md 1.2-install
# >>> INSTALL.md 1.2-check
docker compose version          # must report v2 or later
docker buildx version           # the image builder; without it Compose warns "buildx isn't installed"
docker run --rm hello-world
# <<< INSTALL.md 1.2-check

# 1.3 Get the source: done, this script runs from the checkout.

# ── Part 2: configure and start CIRKS ─────────────────────────────────────────
say "2.1 Write the configuration file"
# >>> INSTALL.md 2.1
cd ~/cirks
if [ -e .env ]; then
  echo ".env already exists: keeping its secrets"
else
  cp .env.docker.example .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|"               .env
  sed -i "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$(openssl rand -hex 24)|"       .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 64)|"   .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 64)|" .env
  chmod 600 .env
fi
# <<< INSTALL.md 2.1

say "2.2 Choose the name people will use"
# >>> INSTALL.md 2.2
sed -i "s|^CIRKS_DOMAIN=.*|CIRKS_DOMAIN=cirks.local|" .env
sed -i "s|^CIRKS_TLS=.*|CIRKS_TLS=tls internal|"      .env
grep -q '^COMPOSE_FILE=' .env ||
  printf '\n# Always run with the bundled Caddy (docs/INSTALL.md 2.2)\nCOMPOSE_FILE=docker-compose.yml:deploy/docker-compose.tls.yml\n' >> .env
# <<< INSTALL.md 2.2

say "2.3 Start it (the first start builds the image: several minutes)"
# >>> INSTALL.md 2.3
cd ~/cirks
docker compose up -d --build
until [ "$(docker compose ps app --format '{{.Health}}')" = healthy ]; do sleep 5; done
docker compose ps               # app and db "healthy", caddy "Up"
docker compose logs app | grep -E "entrypoint|seed|listening"
# <<< INSTALL.md 2.3

say "2.4 Make the name resolve, and check"
# Caddy may still be starting even though the application is healthy.
for _ in $(seq 30); do
  curl -sk --resolve cirks.local:443:127.0.0.1 -o /dev/null https://cirks.local/health && break
  sleep 2
done
# >>> INSTALL.md 2.4
grep -q '\scirks\.local$' /etc/hosts ||
  echo "127.0.0.1  cirks.local" | sudo tee -a /etc/hosts      # on the CIRKS machine
curl -sk https://cirks.local/health                           # expect {"status":"ok",…}
# <<< INSTALL.md 2.4
health="$(curl -sk https://cirks.local/health)"
[[ "$health" == *'"status":"ok"'* ]] || die "https://cirks.local/health did not answer ok: $health"

# ── Part 3 ────────────────────────────────────────────────────────────────────
if [ "$MODE" = --training ]; then
  say "3A Load Misty Isles (about six minutes)"
# >>> INSTALL.md 3A
cd ~/cirks
docker compose exec app node riskapp/db/dataset/misty-isles/install.js
# <<< INSTALL.md 3A
  say "Done. Sign in at https://cirks.local/ as A.James@mig.local with ADMIN_PASSWORD."
else
  say "3B.1 Create the first administrator"
  cd ~/cirks
  docker compose exec app node riskapp/db/create-admin.js
  say "Done. Sign in at https://cirks.local/ as $ADMIN_EMAIL. Then load your organisation: INSTALL.md 3B.2."
fi
