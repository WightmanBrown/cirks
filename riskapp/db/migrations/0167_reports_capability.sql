-- 0167 — reports.read: the reports under Metrics & Reporting (owner, 2026-11-03)
--
-- The first role-specific reports are the SIRO's (docs/reporting-siro.md). The
-- owner's ruling: "within the system the reports are Admin, CISO, SIRO". One
-- capability for the reports, held by those three roles, so another role can be
-- given them from the RBAC page without a code change.
--
-- Four-file rule: also db/seed/capabilities.sql, src/auth/capabilityDefaults.js
-- and test/e2e/db/seed.sql. The grant is conditional on role_permissions being
-- populated, because db/seed.js seeds that table only when it is empty.

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('reports.read', 'reports', 'read', FALSE,
   'Read the reports under Metrics & Reporting, such as the SIRO''s report: organisation-wide figures across every department')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role, 'reports.read', 'all_depts'
  FROM (VALUES ('admin'::user_role), ('ciso'), ('siro')) AS r(role)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
