-- 0131 — an SoA decision records what changed, from what, to what
--
-- WHY. Clearing the v130 findings on 2026-09-24 turned up two objectives excluded
-- on 2026-07-29 with no reason: ID.RA-09, which was nonetheless in place on 15
-- systems and counting on 10 risks, and GV.SC-08. `audit_log` held one row for
-- each — action 'update', entity 'soa_entry', narrative "SoA (operational)
-- updated" — with **no field, no old value and no new value**. So the question
-- "what was decided, and what did it change?" was unanswerable for the single
-- most consequential statement in an ISO 27001 ISMS. H-15 4b, governance values.
--
-- BY TRIGGER, not in the controller (H-15's own instruction). The July sweep is
-- the argument: whatever wrote those rows, a controller-level fix cannot cover a
-- script, a migration or a hand-run UPDATE, and this is a table that gets those.
-- The actor comes from `cirks.actor_id` (v106); NULL is recorded as
-- 'unattributed' rather than dropped, which is what makes an uninstrumented path
-- visible instead of silent.
--
-- WHAT IS AUDITED. Every field of the decision that a person sets:
--   applicable, justification, drivers, implementation_status,
--   implementation_description, owner_user_id
-- and, separately, WHERE it applies (`soa_entry_scopes`), because narrowing an
-- objective to a scope changes which systems it is measured against — v129's
-- denominator and v130's mirror finding both read it.
--
-- `implementation_status` is audited even though v129 derives it for per-system
-- controls: the stored value is still the stated one for organisation-wide, group
-- and not-stated controls, and a change to it is a human statement.
--
-- The narrative is written for the auditor who will read it cold: "GV.SC-08
-- adopted — it applies" beats "applicable: false → true", so it says both.

CREATE OR REPLACE FUNCTION fn_audit_soa_entry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  col        TEXT;
  old_v      TEXT;
  new_v      TEXT;
  diff       JSONB := '{}'::jsonb;
  parts      TEXT[] := '{}';
  actor      UUID   := cirks_audit_actor();
  actor_name TEXT;
  actor_role user_role;
  rec        RECORD := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  title      TEXT;
  ref        TEXT;
  label      TEXT;
  headline   TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOREACH col IN ARRAY ARRAY['applicable', 'justification', 'drivers',
                               'implementation_status', 'implementation_description',
                               'owner_user_id'] LOOP
      old_v := to_jsonb(OLD) ->> col;
      new_v := to_jsonb(NEW) ->> col;
      IF old_v IS DISTINCT FROM new_v THEN
        diff  := diff || jsonb_build_object(col, jsonb_build_object('from', old_v, 'to', new_v));
        parts := parts || CASE
          WHEN col = 'owner_user_id'
            THEN format('owner: %s → %s', cirks_audit_person(old_v::uuid), cirks_audit_person(new_v::uuid))
          WHEN col = 'applicable'
            THEN CASE WHEN new_v = 'true' THEN 'adopted — it applies' ELSE 'marked not applicable' END
          ELSE format('%s: %s → %s', replace(col, '_', ' '),
                      COALESCE(nullif(btrim(old_v), ''), 'none'),
                      COALESCE(nullif(btrim(new_v), ''), 'none'))
        END;
      END IF;
    END LOOP;
    IF diff = '{}'::jsonb THEN
      RETURN NEW;                      -- a touch that decided nothing
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    diff  := jsonb_build_object('applicable', jsonb_build_object('from', NULL, 'to', NEW.applicable),
                                'justification', jsonb_build_object('from', NULL, 'to', NEW.justification));
    parts := ARRAY[CASE WHEN NEW.applicable THEN 'decided: it applies' ELSE 'decided: it does not apply' END];
  ELSE
    diff  := jsonb_build_object('deleted', to_jsonb(OLD));
    parts := ARRAY['the decision was removed entirely'];
  END IF;

  SELECT full_name, role INTO actor_name, actor_role FROM users WHERE id = actor;
  SELECT c.title,
         COALESCE((SELECT sc.ref_code FROM control_mappings cm
                     JOIN standard_controls sc ON sc.id = cm.standard_control_id
                     JOIN standards st ON st.id = sc.standard_id
                    WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
                  c.reference_code)
    INTO title, ref
    FROM controls c WHERE c.id = rec.control_id;
  label    := COALESCE(ref || ' — ' || title, title, rec.control_id::text);
  headline := format('Statement of Applicability: %s — %s', label, array_to_string(parts, '; '));

  INSERT INTO audit_log (
    user_id, user_name, user_role, entity_type, entity_id, entity_label,
    action, field_name, old_value, new_value, changes, human_narrative
  ) VALUES (
    actor, COALESCE(actor_name, 'unattributed'), actor_role,
    'soa_entry', rec.control_id, label,
    (CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'update' END)::audit_action,
    -- One changed field names itself; several are in `changes`, which is the
    -- honest answer when a single save moved more than one thing.
    -- `AS t(k)` names the COLUMN: `FROM jsonb_object_keys(diff) k` aliases the
    -- table, and `SELECT k` then returns the row, not the key (found by reading
    -- the first empty field_name off dev).
    CASE WHEN jsonb_object_keys_count(diff) = 1 THEN (SELECT k FROM jsonb_object_keys(diff) AS t(k)) END,
    CASE WHEN jsonb_object_keys_count(diff) = 1
         THEN (SELECT diff -> k ->> 'from' FROM jsonb_object_keys(diff) AS t(k)) END,
    CASE WHEN jsonb_object_keys_count(diff) = 1
         THEN (SELECT diff -> k ->> 'to' FROM jsonb_object_keys(diff) AS t(k)) END,
    diff,
    headline || CASE WHEN actor IS NULL
                     THEN ' (no acting user recorded — changed outside the application)'
                     ELSE format(' (by %s)', actor_name) END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- Small helper: how many fields moved. Inline `(SELECT count(*) …)` twice reads
-- worse than naming it once.
CREATE OR REPLACE FUNCTION jsonb_object_keys_count(j JSONB) RETURNS INT
LANGUAGE sql IMMUTABLE AS $$ SELECT count(*)::int FROM jsonb_object_keys(j) $$;

DROP TRIGGER IF EXISTS trg_audit_soa_entry ON soa_entries;
CREATE TRIGGER trg_audit_soa_entry
  AFTER INSERT OR UPDATE OR DELETE ON soa_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_soa_entry();

-- Where it applies. A separate table, and a separate statement: narrowing an
-- objective to a scope changes the systems it is measured against.
CREATE OR REPLACE FUNCTION fn_audit_soa_entry_scope() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  actor      UUID := cirks_audit_actor();
  actor_name TEXT;
  actor_role user_role;
  rec        RECORD := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  label      TEXT;
  scope_name TEXT;
BEGIN
  SELECT full_name, role INTO actor_name, actor_role FROM users WHERE id = actor;
  SELECT COALESCE((SELECT sc.ref_code FROM control_mappings cm
                     JOIN standard_controls sc ON sc.id = cm.standard_control_id
                    WHERE cm.control_id = c.id LIMIT 1) || ' — ' || c.title, c.title)
    INTO label FROM controls c WHERE c.id = rec.control_id;
  SELECT name INTO scope_name FROM scopes WHERE id = rec.scope_id;

  INSERT INTO audit_log (
    user_id, user_name, user_role, entity_type, entity_id, entity_label,
    action, field_name, old_value, new_value, changes, human_narrative
  ) VALUES (
    actor, COALESCE(actor_name, 'unattributed'), actor_role,
    'soa_entry', rec.control_id, label,
    (CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'delete' END)::audit_action,
    'scope',
    CASE WHEN TG_OP = 'DELETE' THEN scope_name END,
    CASE WHEN TG_OP = 'INSERT' THEN scope_name END,
    jsonb_build_object('scope_id', rec.scope_id, 'scope', scope_name),
    format('Statement of Applicability: %s %s scope "%s"%s — it is measured against %s systems.',
           COALESCE(label, rec.control_id::text),
           CASE WHEN TG_OP = 'INSERT' THEN 'narrowed to' ELSE 'no longer narrowed to' END,
           COALESCE(scope_name, 'a deleted scope'),
           CASE WHEN actor IS NULL THEN ' (changed outside the application)'
                ELSE format(' (by %s)', actor_name) END,
           CASE WHEN TG_OP = 'INSERT' THEN 'that scope''s' ELSE 'the remaining' END)
  );
  RETURN rec;
END $$;

DROP TRIGGER IF EXISTS trg_audit_soa_entry_scope ON soa_entry_scopes;
CREATE TRIGGER trg_audit_soa_entry_scope
  AFTER INSERT OR DELETE ON soa_entry_scopes
  FOR EACH ROW EXECUTE FUNCTION fn_audit_soa_entry_scope();

COMMENT ON FUNCTION fn_audit_soa_entry() IS
  'Field-level audit of an SoA decision (v131): what changed, from what, to what, and who by — as a trigger, so a script or a hand-run UPDATE is caught too. H-15 4b.';
