-- v165: a membership group with no members asks nothing yet (owner, 2026-11-02,
-- with the CIRKS starter template).
--
-- v148 made every group a question each system must answer by recording one of
-- its members. A group with NO members is a question nobody can answer: until
-- now it flagged every active system in the component-record finding ("nothing
-- recorded for: Hosting") with no way for a system owner to clear it. The
-- starter template (POST /architecture/groups/starter) creates its six groups
-- empty, because which hosting, operating system and so on is the
-- organisation's own; those groups must not flag every system the moment they
-- are added. A group asks its question once it has at least one member.
--
-- Same columns, so the finding (v148 v_system_component_findings) and the
-- library's "systems unanswered" count follow without change. The system's
-- security view drops memberless groups the same way (routes/systems/security.js).

CREATE OR REPLACE VIEW v_system_membership_gaps AS
SELECT s.id AS system_id, g.id AS group_id, g.name AS group_name, g.sort_index
  FROM systems s
  JOIN membership_groups g ON TRUE
 WHERE s.is_active
   AND EXISTS (SELECT 1 FROM membership_group_members m0 WHERE m0.group_id = g.id)
   AND (NOT EXISTS (SELECT 1 FROM membership_group_triggers gt WHERE gt.group_id = g.id)
        OR EXISTS (SELECT 1 FROM membership_group_triggers gt
                     JOIN system_components x ON x.component_id = gt.component_id AND x.system_id = s.id
                    WHERE gt.group_id = g.id))
   AND NOT EXISTS (SELECT 1 FROM membership_group_members m
                     JOIN system_components x ON x.component_id = m.component_id AND x.system_id = s.id
                    WHERE m.group_id = g.id);
