# Database schema: baseline + migrations

CIRKS schema is managed by a small custom runner (`migrate.js`). One **frozen
baseline** captures the schema through **v88**; every change after that is an
ordered **forward migration**. The runner brings a fresh database up to current
and applies only pending migrations to an existing one — transactionally,
idempotently, with checksum tamper-detection.

```
db/
  baseline.sql      frozen schema-only dump (through v88). DO NOT regenerate routinely.
  migrations/       forward migrations: 0089_slug.sql, 0090_slug.sql, …
  migrate.js        the runner
```

## Commands (run from riskapp/)

```bash
npm run migrate          # bootstrap → baseline (if empty) → apply pending
npm run migrate:status   # show baseline + applied + pending (read-only)
node db/migrate.js baseline-stamp   # mark an existing DB as baselined, apply nothing
```

Connection comes from `DATABASE_URL` (preferred) or `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
(+ `DB_SSL`) — the same resolution as `src/db/pool.js`.

## Writing a forward migration

1. Create `db/migrations/NNNN_short_slug.sql` — 4-digit zero-padded, next number
   after the highest existing (the lineage continues from 88, so the first is `0089`).
2. **Plain SQL only.** No `BEGIN`/`COMMIT` (the runner wraps each file in its own
   transaction) and **no** `INSERT INTO schema_migrations` (the runner stamps it).
3. Write it schema-unqualified or put `SET search_path = public;` at the top.
4. Run `npm run migrate` and `npm run migrate:status`.
5. **Document the *why*** — see "The migration is also a design ledger" below.
   This is a required step, not a nicety.

### The migration is also a design ledger

The schema history is a **second, primary-source record** of the system's design —
*why* each change was made, what model it replaced, what trade-off it encoded. We
rely on it to avoid rebuilding things that already exist: it's verifiable ground
truth (it *is* the SQL), unlike the higher-level design notes, which are lossy,
editable summaries. The `schema/v*.sql` files + their `CLAUDE.md` narrative carried
this through v88 (the narrative now lives in `docs/schema-history.md`, archived out of
`CLAUDE.md`); **forward migrations must continue it**, or the record dies at the
baseline exactly where active development resumes.

So every forward migration must:

- **Carry a header comment** explaining the rationale — the problem, the chosen
  model, what it replaces, and any deliberate non-obvious trade-off (not just *what*
  the DDL does, which the SQL already says).
- **Get a matching narrative entry** in `docs/schema-history.md` (the design ledger,
  archived out of `CLAUDE.md` on 2026-07-28) — a short "vNN — …" paragraph in the same
  prose style as the v23–v88 history, newest first — **plus** a one-line bump to the
  current-state summary in `CLAUDE.md`. The migration number and the narrative entry are
  two halves of one ledger record.

A bare-DDL migration with no rationale is considered incomplete.

### Statements that can't run in a transaction

`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, etc. must not be wrapped.
Put this as the **first line** of the file and write the statements idempotently
(`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`) — a no-transaction migration that
fails midway is not atomic and will re-run from the top:

```sql
-- migrate:no-transaction
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'new_role';
```

## Hard rules

- **Never edit an applied migration.** The runner stores a sha256 of every applied
  file and hard-fails on any change. Fix forward with a new migration.
- **Never regenerate `baseline.sql` as part of normal work.** It is frozen at v88.
  Re-cutting it is a deliberate, rare "squash" operation (see `dump-schema.sh`).
- Migrations are **schema-only**. Seed/reference data is separate
  (`test/e2e/db/seed.sql` for tests; the production seed is a later deploy phase).
- The advisory-lock key (`7480010132`) serialises concurrent runners — frozen.

## History — the design ledger (keep it; do not archive)

The pre-baseline migrations live in `../../schema/v*.sql` (v23–v88). The runner
does **not** execute them — `baseline.sql` is the consolidation of that history —
but they are **not dead weight**: together with the per-version narrative (in
`docs/schema-history.md`) they are the project's append-only **design ledger** (see
"The migration is also a design ledger" above). Keep them. They are deliberately retained as
primary-source history even though nothing runs them.

The ledger does not stop at v88 — it continues through the forward migrations in
`migrations/` and their `CLAUDE.md` entries. Treat `schema/v*.sql` (≤v88) +
`db/migrations/*.sql` (≥0089) + the `docs/schema-history.md` narrative as one continuous record.
`db/patches/` is likewise retained pre-baseline history.
