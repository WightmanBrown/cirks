-- v184: a system's page and every change to it no longer compute solution
-- delivery for every system (roadmap 8, owner 2026-11-19).
--
-- v_system_solutions_in_use and v_system_component_findings marked their CTEs
-- AS MATERIALIZED, which stops PostgreSQL pushing a "WHERE system_id = …" down
-- into them: a query for one system computed delivery for all of them (~0.9 s
-- on CIRKS-dev) and threw the rest away. GET /systems/:id and the check after
-- each change (fn_component_record_outstanding) each paid it, so clearing
-- "Record incomplete" took about 4 s a change.
--
-- The views are recreated from their current definitions with NOT MATERIALIZED
-- and nothing else changed. Measured on a copy of CIRKS-dev: one system
-- 923 -> 70 ms, fn_component_record_outstanding 918 -> 68 ms, all systems
-- unchanged (928 ms), and the rows identical both ways (EXCEPT = 0).

CREATE OR REPLACE VIEW v_system_solutions_in_use AS
 WITH w AS NOT MATERIALIZED (
         SELECT v_system_wanted_objectives.system_id,
            v_system_wanted_objectives.control_id,
            v_system_wanted_objectives.pattern_ids,
            v_system_wanted_objectives.chosen_pattern_id
           FROM v_system_wanted_objectives
          WHERE v_system_wanted_objectives.pattern_ids IS NOT NULL
        ), d AS NOT MATERIALIZED (
         SELECT v_system_control_delivery.system_id,
            v_system_control_delivery.control_id,
            v_system_control_delivery.pattern_id
           FROM v_system_control_delivery
          WHERE v_system_control_delivery.pattern_id IS NOT NULL
        )
 SELECT w.system_id,
    w.control_id,
    unnest(w.pattern_ids) AS pattern_id,
        CASE
            WHEN w.chosen_pattern_id IS NOT NULL THEN 'chosen'::text
            ELSE 'architecture'::text
        END AS basis
   FROM w
UNION ALL
 SELECT d.system_id,
    d.control_id,
    d.pattern_id,
    'in_play'::text AS basis
   FROM d
  WHERE NOT (EXISTS ( SELECT 1
           FROM w
          WHERE w.system_id = d.system_id AND w.control_id = d.control_id));

CREATE OR REPLACE VIEW v_system_component_findings AS
 WITH legacy AS NOT MATERIALIZED (
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
        ), in_use AS NOT MATERIALIZED (
         SELECT v_system_solutions_in_use.system_id,
            v_system_solutions_in_use.control_id,
            v_system_solutions_in_use.pattern_id,
            v_system_solutions_in_use.basis
           FROM v_system_solutions_in_use
        ), patterned AS NOT MATERIALIZED (
         SELECT DISTINCT u.system_id,
            pp.component_id,
            cc.name
           FROM in_use u
             JOIN delivery_pattern_parts pp ON pp.pattern_id = u.pattern_id AND pp.location = 'on_system'::text
             JOIN control_components cc ON cc.id = pp.component_id
        ), needed AS NOT MATERIALIZED (
         SELECT legacy.system_id,
            legacy.component_id,
            legacy.name
           FROM legacy
        UNION
         SELECT patterned.system_id,
            patterned.component_id,
            patterned.name
           FROM patterned
        ), missing AS NOT MATERIALIZED (
         SELECT n.system_id,
            count(*)::integer AS n,
            array_agg(n.component_id ORDER BY n.name) AS ids,
            array_agg(n.name ORDER BY n.name) AS names
           FROM needed n
          WHERE NOT (EXISTS ( SELECT 1
                   FROM system_components x
                  WHERE x.system_id = n.system_id AND x.component_id = n.component_id))
          GROUP BY n.system_id
        ), groups AS NOT MATERIALIZED (
         SELECT v_system_slot_gaps.system_id,
            array_agg(v_system_slot_gaps.label ORDER BY v_system_slot_gaps.sort_index) AS names
           FROM v_system_slot_gaps
          GROUP BY v_system_slot_gaps.system_id
        ), objectives AS NOT MATERIALIZED (
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
  WHERE s.is_active AND (m.n > 0 OR g.names IS NOT NULL OR NOT s.is_security_system AND s.system_pattern IS NULL OR o.unrecorded IS NOT NULL OR o.needs_solution > 0 OR o.conflicts > 0);
