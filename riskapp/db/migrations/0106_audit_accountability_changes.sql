-- v106 — audit who changed accountability, in the database rather than the app.
--
-- RATIONALE (H-15). CLAUDE.md claimed "No controller writes directly to tables".
-- Controllers make 117 direct INSERT/UPDATE/DELETE statements, and `audit_log`
-- covers only risk validate/return, role switches and a few meeting actions. So
-- "who changed the owner of Medical Records System, from whom, to whom" was
-- unanswerable. `api_request_log` proves a PUT happened; it holds no payload and
-- no before/after.
--
-- Found by repairing 11 mis-assigned system owners: the repair produced ZERO
-- audit_log rows. Ownership is the accountability spine of the IAO model, and
-- ISO 27001 A.8.15/A.5.28 expect changes to be attributable.
--
-- WHY TRIGGERS, NOT CONTROLLER CODE. A trigger fires for every writer — the API,
-- a migration, a repair script, someone in psql. Controller-level auditing
-- covers only the paths someone remembered to instrument, and the case most
-- worth catching is the one nobody instrumented. Had that owner repair been run
-- as raw SQL instead of through the API it would have left no trace at all.
--
-- ROW-LEVEL WITH A JSONB DIFF, not one row per column. A bulk change (pruning a
-- register, re-linking a dataset) would otherwise write a row per column per
-- row, and `audit_log` is not append-only yet (H-06) — a table that grows
-- faster than it is read gets truncated by someone, which is worse than a
-- coarser record.
--
-- THE ACTOR. A trigger cannot see the application user. It reads a transaction-
-- local setting, `cirks.actor_id`, which the app sets via db/pool.js
-- `withActor()`. When it is absent — direct SQL, a migration, a script — the
-- change is STILL recorded with a NULL actor. That is the point: an
-- unattributed change is evidence, and silently recording nothing is not.

-- Reads the acting user, or NULL. `true` = missing_ok, so this never throws in
-- a session that has not set it.
CREATE OR REPLACE FUNCTION cirks_audit_actor() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE v TEXT;
BEGIN
  v := current_setting('cirks.actor_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;   -- a malformed setting must not block the write it describes
END $$;

-- Renders a user id as a name for the narrative, falling back to the id so an
-- unresolvable reference is still legible rather than blank.
CREATE OR REPLACE FUNCTION cirks_audit_person(p UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT full_name FROM users WHERE id = p), p::text, 'nobody')
$$;

-- One function for all three tables; the columns to watch are trigger arguments,
-- because business_services has no owner_user_id (a service is owned by a
-- DEPARTMENT) and the shapes differ.
CREATE OR REPLACE FUNCTION fn_audit_accountability() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  col          TEXT;
  old_v        TEXT;
  new_v        TEXT;
  diff         JSONB := '{}'::jsonb;
  parts        TEXT[] := '{}';
  actor        UUID   := cirks_audit_actor();
  actor_name   TEXT;
  actor_role   user_role;
  label        TEXT;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    old_v := to_jsonb(OLD) ->> col;
    new_v := to_jsonb(NEW) ->> col;
    IF old_v IS DISTINCT FROM new_v THEN
      diff := diff || jsonb_build_object(col, jsonb_build_object('from', old_v, 'to', new_v));
      IF col LIKE '%user_id' THEN
        parts := parts || format('%s: %s → %s', col,
                                 cirks_audit_person(old_v::uuid), cirks_audit_person(new_v::uuid));
      ELSE
        parts := parts || format('%s: %s → %s', col, COALESCE(old_v, 'none'), COALESCE(new_v, 'none'));
      END IF;
    END IF;
  END LOOP;

  IF diff = '{}'::jsonb THEN
    RETURN NEW;      -- nothing accountable changed; most updates land here
  END IF;

  SELECT full_name, role INTO actor_name, actor_role FROM users WHERE id = actor;
  label := to_jsonb(NEW) ->> 'name';

  INSERT INTO audit_log (
    user_id, user_name, user_role,
    entity_type, entity_id, entity_label,
    action, changes, human_narrative
  ) VALUES (
    actor,
    COALESCE(actor_name, 'unattributed'),   -- direct SQL, a migration, a script
    actor_role,
    TG_TABLE_NAME, NEW.id, label,
    'update', diff,
    format('%s on %s "%s" changed — %s%s',
           CASE WHEN array_length(parts,1) = 1 THEN 'Accountability' ELSE 'Accountability' END,
           TG_TABLE_NAME, COALESCE(label, NEW.id::text),
           array_to_string(parts, '; '),
           CASE WHEN actor IS NULL
                THEN ' (no acting user recorded — changed outside the application)'
                ELSE format(' (by %s)', actor_name) END)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_accountability_systems
  AFTER UPDATE ON systems
  FOR EACH ROW EXECUTE FUNCTION fn_audit_accountability(
    'owner_user_id', 'managed_by_user_id', 'department_id');

CREATE TRIGGER trg_audit_accountability_assets
  AFTER UPDATE ON information_assets
  FOR EACH ROW EXECUTE FUNCTION fn_audit_accountability(
    'owner_user_id', 'managed_by_user_id', 'department_id');

-- A business service has no person owner — only owner_department_id — so the
-- accountable facts differ.
CREATE TRIGGER trg_audit_accountability_services
  AFTER UPDATE ON business_services
  FOR EACH ROW EXECUTE FUNCTION fn_audit_accountability(
    'managed_by_user_id', 'department_id', 'owner_department_id');

COMMENT ON FUNCTION fn_audit_accountability() IS
  'Writes an audit_log row when an accountability column changes. Columns are '
  'trigger arguments. Records the change even when no acting user is set '
  '(direct SQL) — an unattributed change is still evidence.';
