-- 0155 — the architecture capability, and a system says it is a security system
--        (owner, 2026-10-09; guided creation, step 1 of the build)
--
-- TWO THINGS, both groundwork for guiding people through creating components,
-- systems and security solutions.
--
-- 1. `architecture.write`. The systems architecture template (which components
-- answer which group) and the system architecture patterns were editable only
-- with controls.write, the security team's permission. The owner's ruling: that
-- work is an ARCHITECT's — "most (if not all) risk analysts would also be
-- architects; it's the other roles where this is less clear, for example IAM in
-- some cases but definitely not all of them". So it gets its own capability,
-- held by the risk analyst, the CISO and the admin today, and grantable to a
-- department manager who does the job without making them a security-team
-- member. Security solutions and the rules that require them stay with
-- controls.write. (A Security Architect role, for the "some IAMs", is a later
-- step: a role touches the whole application.)
--
-- Four-file rule: also db/seed/capabilities.sql, src/auth/capabilityDefaults.js
-- and test/e2e/db/seed.sql. The grant is conditional on role_permissions being
-- populated, because db/seed.js seeds that table only when it is empty.
--
-- 2. `systems.is_security_system`. v148 declined a system TYPE: types multiply,
-- and nothing then needed one. One has since emerged for a reason — a system
-- whose purpose is to protect other systems (CCTV, an anti-virus console, a
-- backup server). It changes what a person is asked when creating it, which
-- systems a solution's part may be placed "on", and what the system's page
-- offers. So it is recorded, as a plain TRUE/FALSE and nothing more: it changes
-- no score and no rule, and a security system is assessed like any other.
--
-- Not a guess for the existing rows: a system that a security solution already
-- names as the place a part lives IS a security system (8 on Misty Isles), and is
-- set TRUE; every other system is FALSE until someone says otherwise. And it
-- cannot drift: naming a system in a solution's part sets the flag, and the flag
-- cannot be cleared while a solution still relies on the system.

INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('architecture.write', 'architecture', 'write', FALSE,
   'Edit the systems architecture template (which components answer each group) and the system architecture patterns')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role, 'architecture.write', 'all_depts'
  FROM (VALUES ('admin'::user_role), ('ciso'), ('risk_analyst')) AS r(role)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;

ALTER TABLE systems ADD COLUMN is_security_system BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN systems.is_security_system IS
  'TRUE = this system exists to protect other systems (v155): a security solution''s part may be placed on it and its state read from there. Stated when the system is created, set by trigger when a solution names it, and not clearable while a solution relies on it. Changes no score.';

UPDATE systems s SET is_security_system = TRUE
 WHERE EXISTS (SELECT 1 FROM delivery_pattern_parts pp WHERE pp.service_system_id = s.id);

-- A solution that names a system as where a part lives makes it a security system.
CREATE OR REPLACE FUNCTION fn_part_marks_security_system() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_system_id IS NOT NULL THEN
    UPDATE systems SET is_security_system = TRUE
     WHERE id = NEW.service_system_id AND NOT is_security_system;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_part_marks_security_system
  AFTER INSERT OR UPDATE OF service_system_id ON delivery_pattern_parts
  FOR EACH ROW EXECUTE FUNCTION fn_part_marks_security_system();

-- …and the flag cannot be cleared while one still does.
CREATE OR REPLACE FUNCTION fn_security_system_still_relied_on() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  relying TEXT;
BEGIN
  IF OLD.is_security_system AND NOT NEW.is_security_system THEN
    SELECT string_agg(DISTINCT p.name, ', ' ORDER BY p.name) INTO relying
      FROM delivery_pattern_parts pp JOIN delivery_patterns p ON p.id = pp.pattern_id
     WHERE pp.service_system_id = NEW.id;
    IF relying IS NOT NULL THEN
      RAISE EXCEPTION 'this system is relied on as a security system by: %', relying
        USING ERRCODE = 'check_violation', HINT = 'security_system_relied_on';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_security_system_still_relied_on
  BEFORE UPDATE OF is_security_system ON systems
  FOR EACH ROW EXECUTE FUNCTION fn_security_system_still_relied_on();
