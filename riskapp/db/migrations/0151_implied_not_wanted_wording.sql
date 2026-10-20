-- 0151 — "implied", not "wanted": the one user-visible sentence the database
--        writes (owner, 2026-10-07)
--
-- WHY. The design note calls an objective the security architecture expects on a
-- system "wanted", and the word reached the screen: "13 control objectives
-- wanted here but not recorded". The owner asked what it meant. It hid the
-- cause — wanted by whom? — and the answer is always the same: a component
-- recorded on the system triggers a security solution, and that solution
-- delivers the objective. The system's own record IMPLIES it. So on screen an
-- objective is "implied by" its solution (or by the security architecture, where
-- there is no single cause to name), and "called for by" a threat, which the
-- screens already said.
--
-- The screens and the API's messages change in the application. This migration
-- changes the only such sentence the database writes: the reason an action
-- raised from the component-record finding cannot yet be completed (v148).
--
-- Internal names are unchanged — v_system_wanted_solutions,
-- v_system_wanted_objectives and the design note keep "wanted", which no user
-- sees. docs/terminology.md records the screen word.

CREATE OR REPLACE FUNCTION fn_component_record_outstanding(p_system UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(concat_ws('; ',
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
$$;
