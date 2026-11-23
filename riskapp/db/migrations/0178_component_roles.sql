-- v178: roles on components; the system profile retired; a system pattern can
-- trigger a security solution (owner, 2026-11-10; docs/system-patterns.md).
--
-- After v177 the system profile's membership groups did one thing: say which
-- components can answer which question ("Windows 11 is an operating system").
-- That is a property of the component, the same on every system, so it moves
-- onto the component as its ROLES, and the groups go:
--
--   * control_components.roles — the system pattern slots a component can
--     answer (operating_system, hosting, network, sign_in, support_team, users).
--     Empty = none. A component may have several (IT Administrators: support
--     team and who uses it). Copied from the groups' members and their slots;
--   * the groups' cited standard goes with them: they were never approved lists
--     (Windows 7 is an operating system). Security pattern triggers keep theirs;
--   * which slots a system must answer comes from its pattern alone
--     (system_pattern_slots(), the SQL copy of src/lib/systemPatterns.js).
--     Required only where something reads the answer: the triggers (operating
--     system, hosting, network, sign-in), supplier assurance (supplier) — owner,
--     2026-11-10. Sign-in is required even where it triggers nothing: "no central
--     sign-in" is the fact that matters on OT and supplier-run services;
--   * a business system with NO pattern is asked nothing, and is itself a line
--     in the component-record finding ("no system pattern stated"); a security
--     system is exempt — its security solutions describe it;
--   * a security pattern trigger may name a system pattern
--     (architecture_rule_pattern_triggers): "a supplier-run service → Provided by
--     the supplier", so no stand-in component is needed to fire it.
--
-- NOT LOST SILENTLY: each group and what it held is written to the audit log
-- before the tables are dropped, as v158 did for component relationships.

ALTER TABLE control_components
  ADD COLUMN roles text[] NOT NULL DEFAULT '{}'
    CONSTRAINT chk_component_roles
      CHECK (roles <@ ARRAY['operating_system','hosting','network','sign_in','support_team','users']::text[]);

COMMENT ON COLUMN control_components.roles IS
  'The system pattern slots this component can answer on any system that records it (v178). Empty = none.';

UPDATE control_components c
   SET roles = sub.r
  FROM (SELECT m.component_id, array_agg(DISTINCT g.slot_key ORDER BY g.slot_key) AS r
          FROM membership_group_members m
          JOIN membership_groups g ON g.id = m.group_id
         WHERE g.slot_key IS NOT NULL
         GROUP BY m.component_id) sub
 WHERE c.id = sub.component_id;

INSERT INTO audit_log (entity_type, entity_id, entity_label, action, changes, human_narrative)
SELECT 'membership_group', g.id, g.name, 'delete',
       jsonb_build_object(
         'retired', 'system_profile', 'migration', '0178',
         'slot_key', g.slot_key, 'standard', doc.name, 'notes', g.notes,
         'members', COALESCE((SELECT jsonb_agg(cc.name ORDER BY cc.name) FROM membership_group_members m
                                JOIN control_components cc ON cc.id = m.component_id WHERE m.group_id = g.id), '[]'),
         'triggers', COALESCE((SELECT jsonb_agg(cc.name ORDER BY cc.name) FROM membership_group_triggers t
                                 JOIN control_components cc ON cc.id = t.component_id WHERE t.group_id = g.id), '[]')),
       CASE WHEN g.slot_key IS NULL
            THEN format('System profile group "%s" retired (v178). It answered no system pattern slot, so its members were given no role; add a role on each component if one applies.', g.name)
            ELSE format('System profile group "%s" retired (v178). Its members now carry the role "%s" on the component.', g.name, g.slot_key) END
  FROM membership_groups g
  JOIN control_components doc ON doc.id = g.standard_id;

-- Which slots each pattern has, with its label and whether it is required. The
-- copy of src/lib/systemPatterns.js the views read; systemPatterns.integration
-- .test.js holds the two together.
CREATE OR REPLACE FUNCTION system_pattern_slots(p text)
RETURNS TABLE (slot_key text, label text, required boolean, fill text, sort_index int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT v.slot_key, v.label, v.required, v.fill, v.sort_index::int FROM (VALUES
    ('S1','application','The application',false,'explicit',1), ('S1','operating_system','Operating system',true,'role',2),
    ('S1','users','Who uses it',false,'role',3), ('S1','support_team','Support team',false,'role',4),
    ('S1','sign_in','Sign-in',true,'role',5), ('S1','hosting','Where it runs',true,'role',6), ('S1','network','Network',true,'role',7),
    ('S2','service','The service',false,'explicit',1), ('S2','administrators','Who administers our settings',false,'explicit',2),
    ('S2','users','Who uses it',false,'role',3), ('S2','supplier','Supplier',true,'supplier',4),
    ('S2','sign_in','Sign-in',true,'role',5), ('S2','network','Reached over',true,'role',6),
    ('S3','control_system','Control system',false,'explicit',1), ('S3','operating_system','Computer it runs on',false,'role',2),
    ('S3','support_team','Who maintains it',false,'role',3), ('S3','users','Operators',false,'role',4),
    ('S3','sign_in','Accounts',true,'role',5), ('S3','network','Isolated network',true,'role',6), ('S3','hosting','Where it is',true,'role',7),
    ('S4','operating_system','Device and operating system',true,'role',1), ('S4','applications','Applications',false,'explicit',2),
    ('S4','support_team','Support team',false,'role',3), ('S4','users','Who uses it',false,'role',4),
    ('S4','sign_in','Sign-in',true,'role',5), ('S4','hosting','Where it is used',true,'role',6), ('S4','network','Network',true,'role',7),
    ('S5','equipment','Network equipment',false,'explicit',1), ('S5','operating_system','Network operating system',true,'role',2),
    ('S5','support_team','Who runs it',false,'role',3), ('S5','management','Managed from',false,'explicit',4), ('S5','hosting','Sites',true,'role',5),
    ('S6','document','The document',false,'explicit',1), ('S6','owner','Owner',false,'explicit',2),
    ('S6','users','Who uses it',false,'role',3), ('S6','hosting','Where copies are kept',true,'role',4), ('S6','copy_register','Copy register',false,'explicit',5)
  ) AS v(pattern, slot_key, label, required, fill, sort_index)
  WHERE v.pattern = p
$$;

COMMENT ON FUNCTION system_pattern_slots(text) IS
  'The slots of a system pattern (v178): key, label, required, how it is filled (role | explicit | supplier). A copy of src/lib/systemPatterns.js.';

-- The required slots each system with a pattern has not answered. A role slot is
-- answered by a recorded component that can play the role, or one a person has
-- put in the slot; the supplier slot by a live supplier relationship.
CREATE OR REPLACE VIEW v_system_slot_gaps AS
SELECT s.id AS system_id, sl.slot_key, sl.label, sl.sort_index
  FROM systems s
  CROSS JOIN LATERAL system_pattern_slots(s.system_pattern) sl
 WHERE s.is_active
   AND sl.required
   AND CASE sl.fill
         WHEN 'supplier' THEN NOT EXISTS (
           SELECT 1 FROM supplier_relationships r
            WHERE r.system_id = s.id AND r.status IN ('active', 'exiting'))
         ELSE NOT EXISTS (
           SELECT 1 FROM system_components x JOIN control_components cc ON cc.id = x.component_id
            WHERE x.system_id = s.id
              AND (x.slot_key = sl.slot_key OR (sl.fill = 'role' AND sl.slot_key = ANY (cc.roles))))
       END;

COMMENT ON VIEW v_system_slot_gaps IS
  'Required slots of its pattern each active system has not answered (v178). A system with no pattern has none here; the finding names it instead.';

-- A security pattern trigger may name a system pattern (v178).
CREATE TABLE architecture_rule_pattern_triggers (
  rule_id        uuid NOT NULL REFERENCES architecture_rules(id) ON DELETE CASCADE,
  system_pattern text NOT NULL CONSTRAINT chk_rule_pattern_trigger CHECK (system_pattern IN ('S1','S2','S3','S4','S5','S6')),
  PRIMARY KEY (rule_id, system_pattern)
);

COMMENT ON TABLE architecture_rule_pattern_triggers IS
  'System patterns that trigger a security pattern rule (v178): the solution is required of every active system following the pattern.';

CREATE OR REPLACE VIEW v_system_wanted_solutions AS
SELECT s.id AS system_id,
    r.pattern_id,
    p.name AS pattern_name,
    'architecture'::text AS reason,
    r.id AS rule_id,
    r.standard_id,
    doc.name AS standard_name,
    t.component_id AS trigger_component_id,
    cc.name AS trigger_component_name,
    NULL::uuid AS control_id,
    NULL::text AS trigger_pattern
   FROM systems s
     JOIN system_components x ON x.system_id = s.id
     JOIN architecture_rule_triggers t ON t.component_id = x.component_id
     JOIN architecture_rules r ON r.id = t.rule_id
     JOIN delivery_patterns p ON p.id = r.pattern_id
     JOIN control_components doc ON doc.id = r.standard_id
     JOIN control_components cc ON cc.id = t.component_id
  WHERE s.is_active
UNION ALL
 SELECT ch.system_id,
    ch.pattern_id,
    p.name AS pattern_name,
    'chosen'::text AS reason,
    NULL::uuid AS rule_id,
    NULL::uuid AS standard_id,
    NULL::character varying AS standard_name,
    NULL::uuid AS trigger_component_id,
    NULL::character varying AS trigger_component_name,
    ch.control_id,
    NULL::text AS trigger_pattern
   FROM system_solution_choices ch
     JOIN systems s ON s.id = ch.system_id AND s.is_active
     JOIN delivery_patterns p ON p.id = ch.pattern_id
UNION ALL
 -- v178: a rule may name a system pattern as its trigger ("a supplier-run
 -- service → Provided by the supplier").
 SELECT s.id AS system_id,
    r.pattern_id,
    p.name AS pattern_name,
    'architecture'::text AS reason,
    r.id AS rule_id,
    r.standard_id,
    doc.name AS standard_name,
    NULL::uuid AS trigger_component_id,
    NULL::character varying AS trigger_component_name,
    NULL::uuid AS control_id,
    s.system_pattern AS trigger_pattern
   FROM systems s
     JOIN architecture_rule_pattern_triggers pt ON pt.system_pattern = s.system_pattern
     JOIN architecture_rules r ON r.id = pt.rule_id
     JOIN delivery_patterns p ON p.id = r.pattern_id
     JOIN control_components doc ON doc.id = r.standard_id
  WHERE s.is_active;

-- The component-record finding reads the pattern's slots instead of the groups,
-- and names a business system with no pattern. missing_membership_names keeps
-- its name (the finding's readers use it) and now holds the unanswered slots.
CREATE OR REPLACE VIEW v_system_component_findings AS
WITH legacy AS MATERIALIZED (
         SELECT DISTINCT syc.system_id,
            cc.id AS component_id,
            cc.name
           FROM system_controls syc
             JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system'::text) = 'system'::text
             JOIN control_component_links ccl ON ccl.control_id = syc.control_id
             JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation = 'per_system'::text
          WHERE syc.status <> 'not_applicable'::system_element_status AND NOT (EXISTS ( SELECT 1
                   FROM delivery_pattern_objectives o_1
                  WHERE o_1.control_id = syc.control_id))
        ), in_use AS MATERIALIZED (
         SELECT v_system_solutions_in_use.system_id,
            v_system_solutions_in_use.control_id,
            v_system_solutions_in_use.pattern_id,
            v_system_solutions_in_use.basis
           FROM v_system_solutions_in_use
        ), patterned AS MATERIALIZED (
         SELECT DISTINCT u.system_id,
            pp.component_id,
            cc.name
           FROM in_use u
             JOIN delivery_pattern_parts pp ON pp.pattern_id = u.pattern_id AND pp.location = 'on_system'::text
             JOIN control_components cc ON cc.id = pp.component_id
        ), needed AS MATERIALIZED (
         SELECT legacy.system_id,
            legacy.component_id,
            legacy.name
           FROM legacy
        UNION
         SELECT patterned.system_id,
            patterned.component_id,
            patterned.name
           FROM patterned
        ), missing AS MATERIALIZED (
         SELECT n.system_id,
            count(*)::integer AS n,
            array_agg(n.component_id ORDER BY n.name) AS ids,
            array_agg(n.name ORDER BY n.name) AS names
           FROM needed n
          WHERE NOT (EXISTS ( SELECT 1
                   FROM system_components x
                  WHERE x.system_id = n.system_id AND x.component_id = n.component_id))
          GROUP BY n.system_id
        ), groups AS MATERIALIZED (
         SELECT v_system_slot_gaps.system_id,
            array_agg(v_system_slot_gaps.label ORDER BY v_system_slot_gaps.sort_index) AS names
           FROM v_system_slot_gaps
          GROUP BY v_system_slot_gaps.system_id
        ), objectives AS MATERIALIZED (
         SELECT w.system_id,
            array_agg(COALESCE(c.reference_code::text || ' '::text, ''::text) || c.title::text ORDER BY c.reference_code, c.title) FILTER (WHERE w.state <> 'needs_solution'::text AND NOT w.recorded) AS unrecorded,
            count(*) FILTER (WHERE w.state = 'needs_solution'::text)::integer AS needs_solution,
            count(*) FILTER (WHERE w.state = 'conflict'::text)::integer AS conflicts
           FROM v_system_wanted_objectives w
             JOIN controls c ON c.id = w.control_id
          GROUP BY w.system_id
        )
 SELECT s.id AS system_id,
    s.name AS system_name,
    s.department_id,
    s.is_shared,
    s.owner_user_id,
    COALESCE(m.n, 0) AS missing_count,
    COALESCE(m.ids, '{}'::uuid[]) AS missing_component_ids,
    COALESCE(m.names, '{}'::character varying[]) AS missing_component_names,
    (( SELECT count(*) AS count
           FROM needed a
          WHERE a.system_id = s.id))::integer AS needed_count,
    COALESCE(g.names, '{}'::text[]) AS missing_membership_names,
    COALESCE(o.unrecorded, '{}'::text[]) AS unrecorded_objective_names,
    COALESCE(o.needs_solution, 0) AS needs_solution_count,
    COALESCE(o.conflicts, 0) AS conflict_count,
    NOT s.is_security_system AND s.system_pattern IS NULL AS pattern_not_stated
   FROM systems s
     LEFT JOIN missing m ON m.system_id = s.id
     LEFT JOIN groups g ON g.system_id = s.id
     LEFT JOIN objectives o ON o.system_id = s.id
  WHERE s.is_active AND (m.n > 0 OR g.names IS NOT NULL OR (NOT s.is_security_system AND s.system_pattern IS NULL) OR o.unrecorded IS NOT NULL OR o.needs_solution > 0 OR o.conflicts > 0);

COMMENT ON COLUMN v_system_component_findings.missing_membership_names IS
  'Required slots of the system''s pattern it has not answered (v178; the name is from the retired system profile).';

CREATE OR REPLACE FUNCTION fn_component_record_outstanding(p_system uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(concat_ws('; ',
           CASE WHEN f.pattern_not_stated THEN 'no system pattern stated' END,
           CASE WHEN f.missing_count > 0 THEN 'no record of: ' || array_to_string(f.missing_component_names, ', ') END,
           CASE WHEN cardinality(f.missing_membership_names) > 0
                THEN 'nothing recorded for: ' || array_to_string(f.missing_membership_names, ', ') END,
           CASE WHEN cardinality(f.unrecorded_objective_names) > 0
                THEN 'implied by the security architecture but not recorded: ' || array_to_string(f.unrecorded_objective_names, ', ') END,
           CASE WHEN f.needs_solution_count > 0
                THEN f.needs_solution_count || ' objective(s) needing a security solution chosen' END,
           CASE WHEN f.conflict_count > 0
                THEN f.conflict_count || ' objective(s) with conflicting security solutions' END), '')
    FROM v_system_component_findings f WHERE f.system_id = p_system
$function$;

DROP VIEW v_system_membership_gaps;
DROP VIEW v_system_membership_asked;
DROP FUNCTION system_pattern_required_slots(text);
DROP TABLE membership_group_triggers;
DROP TABLE membership_group_members;
DROP TABLE membership_groups;
