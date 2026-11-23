-- v179 — the risk context graph is retired (owner, 2026-11-13).
--
-- The risk page is reorganised around the questions people bring to a risk
-- (docs/insights-drilldown.md): how bad, why, what is being done, who decided.
-- The graph answered none of them that the new sections do not, so it goes, and
-- with it GET /graph/risk/:id, its only route, and graph.read, the capability
-- that existed only for it (the control and system graphs went in v158; the
-- knowledge graph is knowledge.query).
--
-- A capability is retired in four places (CLAUDE.md, Known issues): here, the
-- boot seed db/seed/capabilities.sql, src/auth/capabilityDefaults.js and the
-- test fixture test/e2e/db/seed.sql.

DELETE FROM role_permissions WHERE capability_key = 'graph.read';
DELETE FROM capabilities     WHERE key            = 'graph.read';
