-- v177: system patterns (owner, 2026-11-10; docs/system-patterns.md).
--
-- The system profile asked every system the same questions: where it is hosted,
-- what operating system it runs, who supports it, and so on. Those are the
-- questions for an application on servers we run. A service a supplier runs, a
-- vendor's control system on its own network, a desktop or a set of printed
-- playbooks cannot answer them, so they carried permanent gaps or answers made
-- up to clear them ("Supplier-managed (SaaS)" as an operating system).
--
-- Six system patterns (S1 application on servers we run … S6 document record),
-- each a set of named SLOTS, are shipped with the code (src/lib/systemPatterns.js),
-- like the security solution patterns (v176). The database records only what a
-- person decides:
--
--   * which pattern a system follows (NULL = not stated, never defaulted);
--   * which slot a membership group answers (Operating system answers the
--     operating_system slot), so a system is asked a group only when its
--     pattern requires that slot. A group with no slot, or a system with no
--     pattern, is asked as before;
--   * which slot a component recorded on a system fills, where no group says so
--     (the application, the control system, the printed document).
--
-- system_pattern_required_slots() is the SQL copy of each pattern's required
-- slots, for the views; systemPatterns.integration.test.js holds it to the code.
--
-- Report only: a system's fit against its pattern is derived on read. The only
-- thing that follows the pattern is which membership groups the system is asked,
-- which reaches the component-record finding (v148), never a status or a score.

ALTER TABLE systems
  ADD COLUMN system_pattern text
    CONSTRAINT chk_system_pattern CHECK (system_pattern IN ('S1','S2','S3','S4','S5','S6'));

ALTER TABLE system_components
  ADD COLUMN slot_key text
    CONSTRAINT chk_system_component_slot_key CHECK (slot_key ~ '^[a-z][a-z_]{0,39}$');

ALTER TABLE membership_groups
  ADD COLUMN slot_key text
    CONSTRAINT chk_membership_group_slot_key CHECK (slot_key ~ '^[a-z][a-z_]{0,39}$');

COMMENT ON COLUMN systems.system_pattern IS
  'The system pattern this system follows (S1-S6, src/lib/systemPatterns.js). NULL = not stated: every membership group is asked.';
COMMENT ON COLUMN system_components.slot_key IS
  'The system pattern slot this component fills on this system, when stated; NULL = read from its membership group.';
COMMENT ON COLUMN membership_groups.slot_key IS
  'The system pattern slot this group answers (operating_system, hosting, …). NULL = asked of every system.';

CREATE OR REPLACE FUNCTION system_pattern_required_slots(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p
    WHEN 'S1' THEN ARRAY['operating_system','support_team','sign_in','hosting','network','users']
    WHEN 'S2' THEN ARRAY['service','supplier','sign_in','network','users']
    WHEN 'S3' THEN ARRAY['control_system','users','sign_in','network','hosting','support_team']
    WHEN 'S4' THEN ARRAY['operating_system','users','sign_in','hosting','network','support_team']
    WHEN 'S5' THEN ARRAY['equipment','operating_system','support_team','hosting']
    WHEN 'S6' THEN ARRAY['document','owner','users','hosting','copy_register']
  END
$$;

COMMENT ON FUNCTION system_pattern_required_slots(text) IS
  'The required slots of a system pattern; a copy of src/lib/systemPatterns.js, checked by systemPatterns.integration.test.js.';

-- The membership groups a system is asked (v148 triggers, v165 members, v177
-- pattern). One rule, read by the gaps below and by the system's security view.
-- A system with no pattern stated is asked every group: written out, because a
-- NULL pattern in `= ANY(...)` would be NULL, not true.
CREATE OR REPLACE VIEW v_system_membership_asked AS
SELECT s.id AS system_id, g.id AS group_id
  FROM systems s
  JOIN membership_groups g ON TRUE
 WHERE s.is_active
   AND EXISTS (SELECT 1 FROM membership_group_members m0 WHERE m0.group_id = g.id)
   AND (NOT EXISTS (SELECT 1 FROM membership_group_triggers gt WHERE gt.group_id = g.id)
        OR EXISTS (SELECT 1 FROM membership_group_triggers gt
                     JOIN system_components x ON x.component_id = gt.component_id AND x.system_id = s.id
                    WHERE gt.group_id = g.id))
   AND (g.slot_key IS NULL
        OR s.system_pattern IS NULL
        OR g.slot_key = ANY (system_pattern_required_slots(s.system_pattern)));

COMMENT ON VIEW v_system_membership_asked IS
  'Membership groups each active system is asked (v177): the group has members, its triggers (if any) are recorded, and the system''s pattern requires the group''s slot (or either is not stated).';

-- Same columns as v165, so the component-record finding and the library's
-- "systems unanswered" count follow without change.
CREATE OR REPLACE VIEW v_system_membership_gaps AS
SELECT a.system_id, g.id AS group_id, g.name AS group_name, g.sort_index
  FROM v_system_membership_asked a
  JOIN membership_groups g ON g.id = a.group_id
 WHERE NOT EXISTS (SELECT 1 FROM membership_group_members m
                     JOIN system_components x ON x.component_id = m.component_id AND x.system_id = a.system_id
                    WHERE m.group_id = g.id);

-- The CIRKS starter groups (v165) answer the slots of the same names.
UPDATE membership_groups SET slot_key = CASE lower(name)
    WHEN 'connectivity'           THEN 'network'
    WHEN 'hosting'                THEN 'hosting'
    WHEN 'operating system'       THEN 'operating_system'
    WHEN 'authentication service' THEN 'sign_in'
    WHEN 'support team'           THEN 'support_team'
    WHEN 'user group'             THEN 'users'
  END
 WHERE slot_key IS NULL
   AND lower(name) IN ('connectivity','hosting','operating system','authentication service','support team','user group');
