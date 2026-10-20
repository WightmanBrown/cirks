-- 0149 — a security solution with no part on the system is in place only where
--        the system wants it (owner, 2026-10-02)
--
-- WHY. v145 had to guess for a solution that leaves no trace on the system — all
-- of its parts on a security system or once for the organisation (Entra ID,
-- Active Directory, NIDS, the perimeter firewall, network isolation). Nothing
-- recorded on the system could say whether it used one, so it counted as in play
-- on EVERY system deploying the objective. The owner found Entra ID (cloud)
-- claiming Medical Records System, an on-premises server that signs in with
-- Active Directory: Entra ID was "in place" on 43 systems and wanted on 7. The
-- system page meanwhile named Active Directory, so the two pages disagreed.
--
-- Since v148 the architecture says what each system wants, so the guess can go:
-- such a solution is in play where a rule requires it of the system, or someone
-- chose it there. A solution with a part on the system is unchanged (in play
-- where that part is recorded), and so is "provided by the supplier".
--
-- Report only: this view feeds the delivery report, the solution pages and which
-- solution's parts an objective needs; no status or score reads it.

CREATE OR REPLACE VIEW v_delivery_pattern_state AS
WITH dep AS (
  SELECT syc.system_id, syc.control_id
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, '') IN ('system', '')
    JOIN systems s  ON s.id = syc.system_id AND s.is_active
   WHERE syc.status <> 'not_applicable'
), parts AS (
  SELECT d.system_id, d.control_id, p.id AS pattern_id, pp.component_id, pp.location, cc.name AS component_name,
         CASE pp.location
           WHEN 'on_system' THEN (SELECT x.status::text FROM system_components x
                                   WHERE x.system_id = d.system_id AND x.component_id = pp.component_id)
           WHEN 'service'   THEN (SELECT x.status::text FROM system_components x
                                   WHERE x.system_id = pp.service_system_id AND x.component_id = pp.component_id)
           ELSE (SELECT st.status FROM v_component_state st WHERE st.component_id = pp.component_id)
         END AS raw_status
    FROM dep d
    JOIN delivery_pattern_objectives o ON o.control_id = d.control_id
    JOIN delivery_patterns p       ON p.id = o.pattern_id AND p.kind = 'parts'
    JOIN delivery_pattern_parts pp ON pp.pattern_id = p.id
    JOIN control_components cc     ON cc.id = pp.component_id
), part_rollup AS (
  SELECT system_id, control_id, pattern_id,
         COUNT(*)::int                                                          AS parts_total,
         COUNT(*) FILTER (WHERE raw_status = 'operational')::int                AS parts_ok,
         array_agg(component_name ORDER BY component_name) FILTER (WHERE raw_status = 'degraded') AS degraded_parts,
         array_agg(component_name ORDER BY component_name)
           FILTER (WHERE raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))  AS missing_parts,
         array_agg(component_id ORDER BY component_name)
           FILTER (WHERE location = 'on_system' AND (raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))) AS missing_on_system_ids,
         array_agg(component_name ORDER BY component_name)
           FILTER (WHERE location = 'on_system' AND (raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))) AS missing_on_system_names,
         COUNT(*) FILTER (WHERE location = 'on_system')::int                    AS on_system_parts,
         COUNT(*) FILTER (WHERE location = 'on_system' AND raw_status IS NOT NULL)::int AS on_system_recorded
    FROM parts GROUP BY system_id, control_id, pattern_id
), supplier AS (
  SELECT d.system_id, d.control_id, p.id AS pattern_id,
         EXISTS (SELECT 1 FROM supplier_relationships sr
                  WHERE sr.system_id = d.system_id AND sr.status IN ('active', 'exiting')
                    AND sr.relationship_type IN ('service_provider', 'contracted_service')) AS has_supplier,
         EXISTS (SELECT 1 FROM supplier_relationships sr
                   JOIN v_supplier_objective_coverage cov ON cov.relationship_id = sr.id AND cov.control_id = d.control_id AND cov.met
                  WHERE sr.system_id = d.system_id AND sr.status IN ('active', 'exiting')
                    AND sr.relationship_type IN ('service_provider', 'contracted_service')) AS evidenced
    FROM dep d
    JOIN delivery_pattern_objectives o ON o.control_id = d.control_id
    JOIN delivery_patterns p ON p.id = o.pattern_id AND p.kind = 'supplier'
)
SELECT r.system_id, r.control_id, r.pattern_id, p.name AS pattern_name, 'parts'::text AS kind,
       -- A solution with a part ON the system is in play where that part is
       -- recorded. One with no such part leaves no trace on the system, so it is
       -- in play only where the system WANTS it (v148): an architecture rule or
       -- a choice. Before, it was in play on every system deploying the objective.
       CASE WHEN r.on_system_parts > 0 THEN r.on_system_recorded > 0
            ELSE EXISTS (SELECT 1 FROM v_system_wanted_solutions w
                          WHERE w.system_id = r.system_id AND w.pattern_id = r.pattern_id)
       END                                                                        AS in_play,
       CASE WHEN r.missing_parts IS NOT NULL THEN 'incomplete'
            WHEN r.degraded_parts IS NOT NULL THEN 'degraded'
            ELSE 'complete' END                                                  AS state,
       r.parts_total, r.parts_ok, r.degraded_parts, r.missing_parts,
       r.missing_on_system_ids, r.missing_on_system_names, r.on_system_recorded
  FROM part_rollup r JOIN delivery_patterns p ON p.id = r.pattern_id
UNION ALL
SELECT s.system_id, s.control_id, s.pattern_id, p.name, 'supplier',
       s.has_supplier,
       CASE WHEN s.evidenced THEN 'complete' ELSE 'incomplete' END,
       0, 0, NULL, CASE WHEN s.evidenced THEN NULL ELSE ARRAY['current supplier evidence']::text[] END,
       NULL, NULL, CASE WHEN s.has_supplier THEN 1 ELSE 0 END
  FROM supplier s JOIN delivery_patterns p ON p.id = s.pattern_id;
