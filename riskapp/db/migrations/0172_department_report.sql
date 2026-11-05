-- 0172 — the Information Asset Owner's report, and reputational impact tables
--        (owner, 2026-11-04: docs/reporting-iao.md §6, all six decisions agreed)
--
-- `reports.department` reads the My department report (/reporting/department):
-- own department for the IAO and IAM, every department for admin, CISO and SIRO
-- (decision 1). It shows an IAO the risks on systems their department's
-- services use but another department owns, read only (decision 2).
--
-- `impact_tables.is_reputational` says which impact tables the organisation
-- counts as reputational, so the report can show a department's reputational
-- risks (decision 4). FALSE means "not marked": CIRKS never guesses from a
-- table's name. Marked by the CISO or admin (`bil.reputational`), audited.
--
-- Four-file rule: also db/seed/capabilities.sql, src/auth/capabilityDefaults.js,
-- test/e2e/db/seed.sql.

ALTER TABLE impact_tables ADD COLUMN is_reputational BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN impact_tables.is_reputational IS
  'The organisation counts this impact table as reputational (v172): the IAO report shows risks whose impact comes from information rated on it. Never inferred from the name; set by bil.reputational.';

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('reports.department', 'reports', 'department', TRUE,
   'Read the My department report: a department''s risk, actions, obligations and the shared systems it depends on'),
  ('bil.reputational', 'bil', 'reputational', FALSE,
   'Mark which impact tables the organisation counts as reputational')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT g.role::user_role, g.cap, g.scope
  FROM (VALUES ('information_asset_owner',   'reports.department', 'own_dept'),
               ('information_asset_manager', 'reports.department', 'own_dept'),
               ('admin', 'reports.department', 'all_depts'),
               ('ciso',  'reports.department', 'all_depts'),
               ('siro',  'reports.department', 'all_depts'),
               ('admin', 'bil.reputational', 'all_depts'),
               ('ciso',  'bil.reputational', 'all_depts')) AS g(role, cap, scope)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
