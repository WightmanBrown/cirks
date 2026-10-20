# CIRKS container helpers. `make help` lists targets.
IMAGE       ?= cirks:latest
COMPOSE     ?= docker compose
BUNDLE_DIR  ?= dist-bundle

.DEFAULT_GOAL := help

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the app image
	docker build -t $(IMAGE) .

.PHONY: up
up: ## Start the stack (build if needed), detached
	$(COMPOSE) up -d --build

.PHONY: down
down: ## Stop the stack (keep volumes)
	$(COMPOSE) down

.PHONY: logs
logs: ## Follow app logs
	$(COMPOSE) logs -f app

.PHONY: fresh
fresh: ## Tear down INCLUDING volumes, then bring up a clean install
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

.PHONY: smoke
smoke: ## Wait for the app and assert /health responds 200
	@echo "Waiting for http://localhost:$${APP_PORT:-8080}/health …"
	@for i in $$(seq 1 60); do \
	  code=$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$${APP_PORT:-8080}/health || true); \
	  if [ "$$code" = "200" ]; then echo "OK — /health is 200"; exit 0; fi; \
	  sleep 2; \
	done; \
	echo "FAILED — /health never returned 200" >&2; \
	$(COMPOSE) logs --tail=50 app >&2; exit 1

.PHONY: fresh-smoke
fresh-smoke: fresh smoke ## Clean install + smoke test (the CI-style loop)

.PHONY: tls-up
tls-up: ## Start with the bundled Caddy TLS terminator (set CIRKS_DOMAIN + CIRKS_TLS in .env)
	$(COMPOSE) -f docker-compose.yml -f deploy/docker-compose.tls.yml up -d --build

# Backup/restore assume the compose .env DB defaults (DB_USER/DB_NAME=cirks);
# override on the command line if you changed them, e.g. `make backup DB_USER=foo`.
DB_USER ?= cirks
DB_NAME ?= cirks

.PHONY: backup
backup: ## Dump the database to ./backups/manual-<UTC>.sql.gz
	@mkdir -p backups
	@ts=$$(date -u +%Y%m%dT%H%M%SZ); out=backups/manual-$$ts.sql.gz; \
	$(COMPOSE) exec -T db pg_dump -U $(DB_USER) $(DB_NAME) | gzip > $$out; \
	echo "wrote $$out ($$(du -h $$out | cut -f1))"

.PHONY: restore
restore: ## Restore FILE=backups/<f>.sql.gz — DESTRUCTIVE: drops + reloads the schema
	@test -n "$(FILE)" || { echo "usage: make restore FILE=backups/<file>.sql.gz"; exit 1; }
	@test -f "$(FILE)" || { echo "no such file: $(FILE)"; exit 1; }
	@echo "This will DROP the current schema and restore from $(FILE). Ctrl-C to abort."; sleep 4
	$(COMPOSE) exec -T db psql -U $(DB_USER) -d $(DB_NAME) -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
	gunzip -c $(FILE) | $(COMPOSE) exec -T db psql -U $(DB_USER) -d $(DB_NAME)
	@echo "restored from $(FILE)"

.PHONY: bundle
bundle: build ## Build an air-gapped offline bundle (docker save + compose + runbook)
	mkdir -p $(BUNDLE_DIR)
	docker pull postgres:17
	docker save $(IMAGE) postgres:17 | gzip > $(BUNDLE_DIR)/cirks-images.tar.gz
	cp docker-compose.yml .env.docker.example $(BUNDLE_DIR)/
	cp docs/deployment.md $(BUNDLE_DIR)/README.md
	@echo "Bundle ready in $(BUNDLE_DIR)/ — transfer it, then on the host:"
	@echo "  docker load < cirks-images.tar.gz && cp .env.docker.example .env && docker compose up -d"
