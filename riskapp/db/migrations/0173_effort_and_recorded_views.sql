-- 0173 — the estimated effort to operate a security solution, and a recorded
--        view on a decision (owner, 2026-11-04: docs/reporting-iam.md §6,
--        decisions 3 and 5)
--
-- Effort (decision 3): beside the estimated cost (v170), hours a month to run
-- a security solution, for the organisation (once) or per system it is on. The
-- IAM's system report sums it for "people needed to run it" (M6). The same
-- rules as cost: never defaulted, NULL is "not known", a figure needs a basis,
-- who and when are kept, changes audited.
--
-- A recorded view (decision 5): an IAO or IAM may attach a dated, signed note
-- to a decision on a risk in their department — "I disagree because …". It
-- never changes the decision, is shown wherever the decision is, and cannot be
-- edited or removed afterwards: a correction is a new view. The table refuses
-- UPDATE and DELETE by trigger, whoever asks.
--
-- Four-file rule for `decisions.record_view`: also db/seed/capabilities.sql,
-- src/auth/capabilityDefaults.js, test/e2e/db/seed.sql.

ALTER TABLE delivery_patterns
  ADD COLUMN effort_hours_month NUMERIC(8,1) CHECK (effort_hours_month >= 0),
  ADD COLUMN effort_basis TEXT CHECK (effort_basis IN ('organisation', 'per_system')),
  ADD COLUMN effort_note TEXT,
  ADD COLUMN effort_set_by UUID REFERENCES users(id),
  ADD COLUMN effort_set_at TIMESTAMPTZ,
  ADD CONSTRAINT chk_delivery_pattern_effort_basis
    CHECK ((effort_hours_month IS NULL) = (effort_basis IS NULL));

COMMENT ON COLUMN delivery_patterns.effort_hours_month IS
  'Estimated effort to operate the solution, hours a month (v173); NULL = not known, never defaulted. effort_basis says whether once for the organisation or per system.';

CREATE TABLE risk_decision_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id       UUID NOT NULL REFERENCES risks(id),
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('validated', 'minuted', 'accepted', 'action_accepted')),
  -- The decision: the agenda item (minuted), the acceptance (accepted) or the
  -- security action (action_accepted). A validation is the risk's own.
  decision_ref  UUID,
  body          TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  written_by    UUID NOT NULL REFERENCES users(id),
  written_role  TEXT NOT NULL,
  written_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((decision_kind = 'validated') = (decision_ref IS NULL))
);
CREATE INDEX idx_risk_decision_views_risk ON risk_decision_views (risk_id, written_at);

COMMENT ON TABLE risk_decision_views IS
  'A recorded view on a decision about a risk (v173): written by the department''s IAO or IAM, never changes the decision, never edited or removed (a correction is a new view).';

CREATE FUNCTION trg_fn_risk_decision_views_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A recorded view cannot be changed or removed; record a new one instead.'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_risk_decision_views_immutable
  BEFORE UPDATE OR DELETE ON risk_decision_views
  FOR EACH ROW EXECUTE FUNCTION trg_fn_risk_decision_views_immutable();

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('decisions.record_view', 'decisions', 'record_view', TRUE,
   'Record a view on a decision about a risk in your department (it never changes the decision)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT g.role::user_role, 'decisions.record_view', 'own_dept'
  FROM (VALUES ('information_asset_owner'), ('information_asset_manager')) AS g(role)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
