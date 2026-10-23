-- 0160 — a supplier objective that is OURS is met by our own control, and is not
-- the supplier's finding
--
-- WHY (owner, 2026-10-23). Every supplier relationship is expected to meet the
-- programme objectives — GV.SC-01…10, ID.AM-04 — and, by v144's decision 8, an
-- objective was met only by a supplier's report or contract terms. GV.SC-04,
-- "suppliers are known and prioritized by criticality", was therefore unmet on
-- every relationship, though no supplier document could ever close it: it is
-- met by our own register. docs/supplier-model.md decision 8 said to revisit
-- exactly this "if 'our' objectives keep turning up as unmet findings that no
-- supplier document could ever close". Measured on Misty Isles: 215 unmet
-- objective rows on 24 live relationships, 101 of them ours.
--
-- THE RULE (decisions 9 and 10).
--   Ours       an objective delivered once for the ORGANISATION
--              (controls.delivery = 'organisation'), unless the supplier is relied
--              on to deliver it on a system (source delivered_here, v146) — then it
--              is the supplier's, whatever its mode.
--   Met        ours: applicable in the Statement of Applicability AND stated
--              implemented there. For an organisation-wide objective the stated
--              status IS the observation (v129), and the risk calculation reads it
--              the same way (v128: implemented = operational). Supplier evidence
--              does not meet it: a supplier's report is the wrong evidence for our
--              programme. Partial is not met.
--              the supplier's: by current evidence, as before (v144).
--   Finding    counts only the supplier's objectives. Ours are shown on the
--              relationship with their SoA status, and are ours to put in place
--              there; the supplier's owner cannot close them.
-- Misty Isles: relationships holding the finding 20 → 17; unmet rows counted
-- 215 → 114.

-- Column order and types up to covered_until are unchanged (CREATE OR REPLACE);
-- `ours` and `our_status` are added at the end.
CREATE OR REPLACE VIEW v_supplier_objective_coverage AS
WITH ev AS (
  SELECT ro.relationship_id, ro.control_id, ro.sources,
         COALESCE(bool_or(es.is_current), FALSE)                    AS met,
         COALESCE(bool_or(NOT es.is_current), FALSE)
           AND NOT COALESCE(bool_or(es.is_current), FALSE)          AS expired_only,
         CASE WHEN bool_or(es.is_current AND es.effective_expiry IS NULL) THEN NULL
              ELSE MAX(es.effective_expiry) FILTER (WHERE es.is_current) END AS covered_until
    FROM v_supplier_relationship_objectives ro
    LEFT JOIN (supplier_evidence_objectives eo
               JOIN v_supplier_evidence_state es ON es.evidence_id = eo.evidence_id)
           ON eo.control_id = ro.control_id AND es.relationship_id = ro.relationship_id
   GROUP BY ro.relationship_id, ro.control_id, ro.sources
), classed AS (
  SELECT ev.*,
         -- COALESCE: a NULL delivery mode is "not stated", which is not organisation-wide.
         (COALESCE(c.delivery, '') = 'organisation'
            AND NOT ('delivered_here' = ANY(ev.sources)))           AS ours,
         se.applicable, se.implementation_status
    FROM ev
    JOIN controls c ON c.id = ev.control_id
    LEFT JOIN soa_entries se ON se.control_id = ev.control_id
)
SELECT relationship_id, control_id, sources,
       CASE WHEN ours THEN COALESCE(applicable, FALSE) AND implementation_status = 'implemented'
            ELSE met END                                             AS met,
       CASE WHEN ours THEN FALSE ELSE expired_only END               AS expired_only,
       CASE WHEN ours THEN NULL  ELSE covered_until END              AS covered_until,
       ours,
       CASE WHEN NOT ours THEN NULL
            WHEN applicable IS FALSE THEN 'not_applicable'
            ELSE COALESCE(implementation_status, 'not_stated') END   AS our_status
  FROM classed;

COMMENT ON VIEW v_supplier_objective_coverage IS
  'Whether each expected objective of a supplier relationship is met (v144, v160). The supplier''s objectives: by current evidence, until covered_until (NULL with met = open-ended). Ours (ours = TRUE: delivered organisation-wide and not relied on from the supplier): by our own control, stated implemented in the SoA; our_status says how it stands.';

-- The finding counts only what the supplier's evidence can close.
CREATE OR REPLACE VIEW v_supplier_assurance_findings AS
WITH refd AS (
  SELECT c.*,
         COALESCE((SELECT sc.ref_code FROM control_mappings cm
                     JOIN standard_controls sc ON sc.id = cm.standard_control_id
                     JOIN standards st ON st.id = sc.standard_id
                    WHERE cm.control_id = c.control_id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
                  ctl.reference_code, ctl.title) AS ref
    FROM v_supplier_objective_coverage c
    JOIN controls ctl ON ctl.id = c.control_id
   WHERE NOT c.ours
), cov AS (
  SELECT relationship_id,
         COUNT(*)::int                                  AS expected_count,
         COUNT(*) FILTER (WHERE NOT met)::int           AS unmet_count,
         COUNT(*) FILTER (WHERE expired_only)::int      AS expired_count,
         COUNT(*) FILTER (WHERE met)::int               AS met_count,
         array_agg(ref ORDER BY ref) FILTER (WHERE NOT met) AS unmet_refs
    FROM refd
   GROUP BY relationship_id
)
SELECT sr.id                     AS relationship_id,
       sr.supplier_id,
       sp.name                   AS supplier_name,
       sr.relationship_type,
       COALESCE(sys.name, cc.name) AS touches,
       sr.department_id,
       FALSE                     AS is_shared,
       dro.owner_user_ids[1]     AS owner_user_id,
       cov.expected_count, cov.met_count, cov.unmet_count, cov.expired_count, cov.unmet_refs,
       CASE WHEN cov.met_count = 0 AND cov.expired_count = 0 THEN 'no_evidence'
            WHEN cov.expired_count > 0 THEN 'expired'
            ELSE 'partial' END   AS reason,
       crit.max_impact
  FROM supplier_relationships sr
  JOIN suppliers sp ON sp.id = sr.supplier_id
  JOIN cov ON cov.relationship_id = sr.id AND cov.unmet_count > 0
  LEFT JOIN systems sys ON sys.id = sr.system_id
  LEFT JOIN control_components cc ON cc.id = sr.component_id
  LEFT JOIN v_department_risk_owner dro ON dro.department_id = sr.department_id
  LEFT JOIN v_supplier_relationship_criticality crit ON crit.relationship_id = sr.id
 WHERE sr.status IN ('active', 'exiting');

COMMENT ON VIEW v_supplier_assurance_findings IS
  'Finding: a live supplier relationship with one of the SUPPLIER''s expected objectives not met by current evidence (no_evidence / expired / partial). Objectives that are ours (v160) are not counted: they are met, or not, by our own control in the SoA. Closes when every supplier objective is covered (v144, v160).';
