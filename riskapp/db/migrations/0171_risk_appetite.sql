-- 0171 — the organisation sets its own risk appetite (owner, 2026-11-04:
--        "we should allow the organisation to set the Action Threshold … at a
--        chosen level somewhere in the administration interface")
--
-- Three numbers in org_config that until now nobody could change in the app:
--   mandatory_action_score       — the action threshold: a risk scoring this or
--                                  more must be treated (default 12)
--   exception_accept_analyst_max — a risk analyst may accept up to here (11)
--   exception_accept_owner_max   — a risk owner may accept up to here (19); above
--                                  it only the CISO, SIRO or admin
--
-- Owner's decisions (2026-11-04): the SIRO and admin set them
-- (`risk_appetite.write`); all three on one page; and a change that would put a
-- risk marked "no action required" at or above the threshold is REFUSED, naming
-- the risks, until each has a treatment decision. A reason is required and
-- every change is audited with its before and after.
--
-- They must stay in order: an analyst may accept only what the organisation does
-- not require to be treated, and a risk owner can accept at least up to the
-- threshold. NOT VALID so an install whose values were changed by hand still
-- migrates; every later change is checked.
--
-- Four-file rule: also db/seed/capabilities.sql, src/auth/capabilityDefaults.js,
-- test/e2e/db/seed.sql.

ALTER TABLE org_config
  ADD COLUMN risk_appetite_reason TEXT,
  ADD COLUMN risk_appetite_set_by UUID REFERENCES users(id),
  ADD COLUMN risk_appetite_set_at TIMESTAMPTZ,
  ADD CONSTRAINT chk_org_config_risk_appetite_order
    CHECK (exception_accept_analyst_max < mandatory_action_score
           AND mandatory_action_score <= exception_accept_owner_max) NOT VALID;

COMMENT ON COLUMN org_config.risk_appetite_reason IS
  'Why the risk appetite (action threshold and acceptance limits) was last changed (v171). NULL: the shipped values, never changed.';

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('risk_appetite.write', 'risk_appetite', 'write', FALSE,
   'Set the organisation''s risk appetite: the score at which a risk must be treated, and how high a risk analyst and a risk owner may accept')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r::user_role, 'risk_appetite.write', 'all_depts'
  FROM unnest(ARRAY['siro', 'admin']) AS r
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
