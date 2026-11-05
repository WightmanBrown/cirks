-- 0174 — the risk analyst reads the reports (owner, 2026-11-04:
--        docs/reporting-analyst.md §6 decision 1, "They should have broad
--        access")
--
-- The analyst already reads every risk the reports are built from. They now
-- hold `reports.read` (the board summary, the SIRO and CISO reports, and the
-- new unknown-risk report) and `reports.department` for every department (My
-- department and My systems for any department, with the picker).
--
-- No capability is added, so only the grants change: this migration,
-- src/auth/capabilityDefaults.js and test/e2e/db/seed.sql.

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'risk_analyst'::user_role, g.cap, 'all_depts'
  FROM (VALUES ('reports.read'), ('reports.department')) AS g(cap)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
