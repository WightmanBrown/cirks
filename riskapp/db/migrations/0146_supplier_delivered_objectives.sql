-- 0146 — a supplier who delivers an objective on a system is expected to evidence it
--
-- WHY. v145 lets an objective be "provided by the supplier": met when the supplier
-- hosting or operating the system has current evidence covering it. But evidence
-- can only cover objectives in the relationship's EXPECTED set (v144), and that set
-- came only from the supplier type's control set (v143). So a SaaS system whose
-- endpoint monitoring the provider delivers could never read "delivered": endpoint
-- monitoring is not in the SaaS set, so no evidence could ever cover it. Found while
-- building the Misty Isles dataset (2026-09-30): every supplier-hosted system read
-- incomplete for endpoint monitoring and backup, however good the evidence.
--
-- THE RULE. A relationship's expected objectives are its type's set PLUS every
-- objective deployed on the system it hosts or operates that the supplier is
-- actually RELIED ON to deliver: the objective has a "provided by the supplier"
-- pattern, and none of our own patterns is in play there. Relying on a supplier to
-- deliver something is expecting them to evidence it. The source is named
-- 'delivered_here' so the page can say why the objective is expected.
--
-- "None of our own patterns in play" matters: a contractor maintaining the
-- approach radar does not deliver its endpoint monitoring — our Wazuh agents do —
-- and counting the contract as covering it would HIDE our own degraded agents
-- behind a supplier pattern read as complete (caught in the dataset rebuild).
-- In play means as in v145: a pattern with an on-system part recorded on the
-- system, or with no on-system parts at all.
--
-- Only relationships that touch a system directly (service providers and
-- contracted-out services) can be relied on to deliver on it. The type sets are
-- unchanged: they remain what every relationship of a type is held to.

CREATE OR REPLACE VIEW v_supplier_relationship_objectives AS
SELECT relationship_id, control_id,
       array_agg(source ORDER BY source = 'all', source = 'delivered_here', source) AS sources
  FROM (
    SELECT sr.id AS relationship_id, sto.control_id, sto.applies_to AS source
      FROM supplier_relationships sr
      JOIN supplier_type_objectives sto ON sto.applies_to = 'all' OR sto.applies_to = sr.relationship_type
    UNION
    SELECT sr.id, syc.control_id, 'delivered_here'
      FROM supplier_relationships sr
      JOIN system_controls syc ON syc.system_id = sr.system_id AND syc.status <> 'not_applicable'
     WHERE sr.relationship_type IN ('service_provider', 'contracted_service')
       AND EXISTS (SELECT 1 FROM delivery_patterns dp WHERE dp.control_id = syc.control_id AND dp.kind = 'supplier')
       AND NOT EXISTS (
         SELECT 1 FROM delivery_patterns own
          WHERE own.control_id = syc.control_id AND own.kind = 'parts'
            AND (NOT EXISTS (SELECT 1 FROM delivery_pattern_parts pp
                              WHERE pp.pattern_id = own.id AND pp.location = 'on_system')
                 OR EXISTS (SELECT 1 FROM delivery_pattern_parts pp
                              JOIN system_components x ON x.component_id = pp.component_id AND x.system_id = syc.system_id
                             WHERE pp.pattern_id = own.id AND pp.location = 'on_system')))
  ) x
 GROUP BY relationship_id, control_id;

COMMENT ON VIEW v_supplier_relationship_objectives IS
  'The control objectives a supplier relationship is expected to meet: every-supplier, its type''s set, and (v146) any objective deployed on the system it hosts or operates that is "provided by the supplier" (source delivered_here). Derived.';
