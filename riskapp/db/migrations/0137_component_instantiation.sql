-- 0137 — a component exists ONCE for the organisation, or once PER SYSTEM
--        (docs/security-action-scopes.md §5)
--
-- WHY. A control on a system implies the components that deliver it, and a
-- component implied but not recorded on the system counts as a gap everywhere
-- the coverage is read. On CIRKS-test 1,036 (system, component) pairs are implied
-- and unrecorded, across 40 of 51 systems. Some of that is real — an OSSEC agent
-- is installed host by host, and "is it on Approach radar?" has a per-system
-- answer. Much of it is not: the *Data handling policy* is implied on 32 systems
-- in 11 departments and is one document, written once, in force for everyone or
-- no one. Treating it per system asks 32 owners to record the same fact, lets
-- them record it differently, and makes it 32 remediation items for one job.
--
-- The owner's decision (2026-09-29): build §5 before the component-record
-- finding, so the finding is right from its first day.
--
-- WHAT. `control_components.instantiation` — 'per_system' | 'organisational',
-- NULL = not stated. NEVER defaulted: `component_type` is no honest prior (the
-- InfoSec Team is a people component linked to 27 systems and is one team), and
-- a default is a guess that computes. Every component starts not stated, so this
-- migration changes no answer anywhere until someone says what a component is.
--
-- `v_component_presence` is then the one answer to "is this component on this
-- system, and in what state" — the component counterpart of v_control_presence
-- (v128):
--   * per_system / not stated — the recorded system_components row, as before;
--   * organisational — present on every system whose controls imply it (and any
--     it is recorded on), with the CATALOGUE status. The per-system rows' own
--     status is not read, so an organisational element can no longer be
--     "operational on 20 systems and missing on 7". `planned` and
--     `decommissioned` read as missing: neither means it is there.
--
-- An organisational component is never a per-system remediation item: it is
-- fixed once, on the catalogue. So open per-system items for a component that
-- becomes organisational are WITHDRAWN, with the reason on the item — the same
-- orphaning v119 (exclusion), v121 (threat unlink) and v128 (delivery mode)
-- each had to handle, done by trigger for the same reason: every path.

ALTER TABLE control_components
  ADD COLUMN instantiation TEXT
    CHECK (instantiation IN ('per_system', 'organisational'));

COMMENT ON COLUMN control_components.instantiation IS
  'Does the component exist once for the organisation (organisational — its status is the catalogue status, on every system that implies it) or once per system (per_system — status recorded per system)? NULL = not stated; treated as per_system. §5, v137.';

CREATE VIEW v_component_presence AS
  -- Recorded, per system (per_system or not stated).
  SELECT sc.system_id, sc.component_id, sc.status::text AS status,
         'recorded'::text AS via, sc.role, sc.added_at
    FROM system_components sc
    JOIN control_components cc ON cc.id = sc.component_id
   WHERE cc.instantiation IS DISTINCT FROM 'organisational'
UNION ALL
  -- Organisational: wherever implied or recorded, in the catalogue's state.
  SELECT p.system_id, cc.id,
         CASE cc.status
           WHEN 'operational' THEN 'operational'
           WHEN 'degraded'    THEN 'degraded'
           WHEN 'unknown'     THEN 'unknown'
           ELSE 'missing'                      -- planned, decommissioned
         END,
         'organisation'::text, NULL::text, NULL::timestamptz
    FROM control_components cc
    JOIN (
      SELECT syc.system_id, ccl.component_id
        FROM system_controls syc
        JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
        JOIN control_component_links ccl ON ccl.control_id = syc.control_id
       WHERE syc.status <> 'not_applicable'
      UNION
      SELECT system_id, component_id FROM system_components
    ) p ON p.component_id = cc.id
   WHERE cc.instantiation = 'organisational';

COMMENT ON VIEW v_component_presence IS
  'Is this component on this system, and in what state: the recorded row for a per-system component; for an organisational one, every system that implies it, in the catalogue status (v137).';

-- ── Withdraw per-system work for a component that turns out to exist once ────
CREATE OR REPLACE FUNCTION fn_component_instantiation_withdraw()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item RECORD;
  actor  UUID := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
BEGIN
  IF NEW.instantiation = 'organisational'
     AND OLD.instantiation IS DISTINCT FROM 'organisational' THEN
    FOR v_item IN
      SELECT sai.id, sai.action_id, s.name AS system_name
        FROM security_action_items sai
        JOIN security_actions sa ON sa.id = sai.action_id
        JOIN systems s ON s.id = sai.system_id
       WHERE sai.component_id = NEW.id
         AND sai.status IN ('pending', 'in_progress')
         AND sa.status NOT IN ('completed', 'cancelled')
    LOOP
      UPDATE security_action_items
         SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = actor
       WHERE id = v_item.id;
      INSERT INTO security_action_notes (action_id, item_id, author_user_id, note)
      VALUES (v_item.action_id, v_item.id, actor,
              format('Withdrawn — "%s" exists once for the organisation, so it is fixed once on the catalogue, not on %s.',
                     NEW.name, v_item.system_name));
    END LOOP;
  END IF;

  IF NEW.instantiation IS DISTINCT FROM OLD.instantiation THEN
    INSERT INTO audit_log (user_id, entity_type, entity_id, action, human_narrative)
    VALUES (actor, 'control_components', NEW.id, 'update',
            format('Component "%s" recorded as existing %s (was %s).', NEW.name,
                   CASE NEW.instantiation WHEN 'organisational' THEN 'once for the organisation'
                                          WHEN 'per_system' THEN 'on each system' ELSE 'not stated' END,
                   CASE OLD.instantiation WHEN 'organisational' THEN 'once for the organisation'
                                          WHEN 'per_system' THEN 'on each system' ELSE 'not stated' END));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_component_instantiation
  AFTER UPDATE OF instantiation ON control_components
  FOR EACH ROW EXECUTE FUNCTION fn_component_instantiation_withdraw();
