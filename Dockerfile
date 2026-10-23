# CIRKS — production image (single Express service: serves /public + /api/v1)
#
# Multi-stage:
#   1. frontend-build  — builds the Vite bundle into /build/public
#   2. backend-deps    — installs production-only backend node_modules
#   3. runtime         — slim Node + postgresql-client-17 (psql for the baseline
#                        load, pg_dump for the pre-migrate backup), app + bundle
#
# Build context is the repo ROOT (needs both riskapp/ and riskapp-frontend/).
#   docker build -t cirks:latest .
#
# Node.js is pinned to an exact release, in all three stages, so a rebuild
# always gets that release: a floating tag such as node:24-bookworm-slim, once
# cached on a machine, is not fetched again by `docker compose up --build`.
# Move it on with each Node.js security release (nodejs.org/en/blog/vulnerability).
# 24 is the LTS line, supported until 2028-04-30; 20 ended on 2026-04-30.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim

# ── Stage 1: build the React/Vite frontend ──────────────────────────────────────
FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /build/riskapp-frontend
# Install deps first (cached unless the lockfile changes).
COPY riskapp-frontend/package.json riskapp-frontend/package-lock.json ./
RUN npm ci
# Build — vite outDir is ../public → lands at /build/public.
COPY riskapp-frontend/ ./
RUN npm run build

# ── Stage 2: production backend dependencies ────────────────────────────────────
FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /app/riskapp
COPY riskapp/package.json riskapp/package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 3: runtime ────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime

# postgresql-client-17 from the PGDG repo. The bundled DB server is PG17, and
# pg_dump refuses to dump a server newer than itself — so the client major
# version must match (Debian's own psql is 15). Installed at build time; the
# resulting image is fully self-contained for air-gapped `docker save` bundles.
#
# PG_CLIENT_MIN is the oldest client the build accepts (17.11 fixes code
# execution in pg_dump and psql: CVE-2026-19385, CVE-2026-18408). Raise it with
# each PostgreSQL security release, together with the db image in
# docker-compose.yml: changing it also makes Docker rebuild this layer instead of
# reusing a cached one holding the old client.
ARG PG_CLIENT_MIN=17.11
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-17; \
    v="$(psql --version | awk '{print $3}')"; \
    dpkg --compare-versions "$v" ge "$PG_CLIENT_MIN" \
      || { echo "postgresql-client-17 is $v, older than PG_CLIENT_MIN $PG_CLIENT_MIN" >&2; exit 1; }; \
    apt-get purge -y --auto-remove curl gnupg; \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Backend source + production deps.
COPY --from=backend-deps /app/riskapp/node_modules ./riskapp/node_modules
COPY riskapp/ ./riskapp/

# Built frontend bundle → app.js serves it from path.join(__dirname,'../../public').
COPY --from=frontend-build /build/public ./public

# Entrypoint: wait for DB → pre-migrate backup → migrate up → start.
COPY docker/entrypoint.sh /usr/local/bin/cirks-entrypoint
RUN chmod +x /usr/local/bin/cirks-entrypoint

# Persisted at runtime via named volumes (see docker-compose.yml).
#   /app/riskapp/uploads/meetings  — meeting attachments
#   /app/backups                   — pre-migrate pg_dump archives
RUN mkdir -p /app/riskapp/uploads/meetings /app/backups

# Drop privileges — the stock `node` user ships in the base image.
RUN chown -R node:node /app/riskapp/uploads /app/backups
USER node

EXPOSE 3000

# Container-level liveness; compose adds its own healthcheck too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["cirks-entrypoint"]
