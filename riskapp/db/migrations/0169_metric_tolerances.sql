-- 0169 — metric_tolerances: the board summary's tiles rated against a tolerance
--        a person set (owner, 2026-11-03: "add tolerances so the tiles can be RAG
--        rated")
--
-- The Cyber Governance Code (E2) asks the board to "set suitable metrics to
-- track, and agree tolerances for each"; practice guidance adds that a RAG
-- colour without a defined scale means nothing. So a tile is red, amber or green
-- only against a tolerance recorded here, by a named person, with a reason. No
-- row is ever seeded: an unset tolerance shows as "no tolerance set", not as a
-- guess (docs/reporting-siro.md §3 rule 2).
--
-- For a figure where lower is better: value <= green_max is green, <= amber_max
-- is amber, anything above is red. (higher_better reverses it, for later use on
-- percentages.) Changes are audited; the monthly capture keeps the tolerances in
-- force with each month's figures, so a past month's colour can be redrawn.
--
-- Set by `reports.tolerances` — the SIRO's, not the CISO's: the CISO reports
-- against the tolerance and should not set it. Four-file rule: also
-- db/seed/capabilities.sql, src/auth/capabilityDefaults.js, test/e2e/db/seed.sql.

CREATE TABLE metric_tolerances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key  TEXT NOT NULL UNIQUE,
  direction   TEXT NOT NULL CHECK (direction IN ('lower_better', 'higher_better')),
  green_max   NUMERIC NOT NULL,      -- lower_better: green up to here; higher_better: green from here
  amber_max   NUMERIC NOT NULL,      -- lower_better: amber up to here; higher_better: amber from here
  reason      TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  set_by      UUID NOT NULL REFERENCES users(id),
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (green_max >= 0 AND amber_max >= 0),
  CHECK (CASE direction WHEN 'lower_better' THEN green_max <= amber_max ELSE green_max >= amber_max END)
);

COMMENT ON TABLE metric_tolerances IS
  'Tolerances for the board summary''s headline figures (v169), set by the SIRO (reports.tolerances) with a reason. lower_better: <= green_max green, <= amber_max amber, else red. Never seeded; changes audited.';

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('reports.tolerances', 'reports', 'tolerances', FALSE,
   'Set the tolerances the board summary''s headline figures are rated against (red, amber, green)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'siro'::user_role, 'reports.tolerances', 'all_depts'
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
