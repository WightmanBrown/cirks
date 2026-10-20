-- migrate:no-transaction
--
-- v111 — an API key answers enrichment questions and nothing else.
--
-- Owner's decision 2026-09-10: "the API should probably only answer simple
-- enrichment questions". Today it can do far more than that, in two ways.
--
-- FIRST, knowledge.query gates all four knowledge endpoints — /enrich,
-- /enrich/bulk, /search AND /graph — so any key already reaches the universal
-- search. After v110 made soc_analyst a read-only power user, a key minted as
-- that role would read the entire register.
--
-- SECOND, and worse: POST /admin/api-keys accepts ANY role that holds
-- knowledge.query, and its only check is roleCanQuery(). admin holds it (45
-- capabilities) and so does ciso (44). An administrator could therefore mint a
-- long-lived bearer credential with full administrative powers — including every
-- write — and hand it to an integration. The code comment guarded the opposite
-- hazard: "minting a key for a role that can't query would be a footgun."
--
-- The fix is structural, because the enrichment RESPONSE is still being designed
-- against a real integration and will change. What must not change afterwards is
-- the boundary: content is cheap to revise, a credential already in the field is
-- not.
--
--   knowledge.enrich  ->  /enrich, /enrich/bulk        (machines and humans)
--   knowledge.query   ->  /search, /graph              (humans only)
--
-- soc_integration is a machine identity holding knowledge.enrich and NOTHING
-- else. It is named for what it is rather than reusing ai_agent, which exists in
-- the enum as an ungranted system identity: putting a Wazuh key on a role called
-- "AI Agent" would invite mixing two different trust levels later.
--
-- no-transaction: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that then references the new value.
--
-- AND THAT IS WHY THE GRANTS LIVE IN 0113 RATHER THAN HERE. no-transaction stops
-- the runner opening an explicit transaction, but it still sends the file as ONE
-- query, which Postgres executes in a single implicit transaction — so an INSERT
-- naming 'soc_integration' in this file is refused with "unsafe use of new value
-- of enum type user_role", exactly as if the directive were absent.
--
-- This was not caught before it reached a deployment, and the reason is worth
-- recording: the grants are guarded on role_permissions already being POPULATED,
-- which is false on a fresh database — so the INSERT no-opped and never named the
-- new value. Local test runs and CI both build fresh, so both passed. Only an
-- existing install takes the failing path, which is the one that matters. A guard
-- protecting fresh installs hid a bug that only upgrades could hit.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'soc_integration';

-- The capability itself. Description matches db/seed/capabilities.sql; the seed
-- uses ON CONFLICT DO NOTHING, so wording only reaches an existing install from
-- here.
INSERT INTO capabilities (key, resource, action, dept_scopable, description)
VALUES ('knowledge.enrich', 'knowledge', 'enrich', FALSE,
        'Resolve an IP or hostname to the systems it belongs to')
ON CONFLICT (key) DO UPDATE
   SET description = EXCLUDED.description;
