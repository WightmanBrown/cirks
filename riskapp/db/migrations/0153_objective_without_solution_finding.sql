-- 0153 — finding: a control objective with no security solution
--        (owner, 2026-10-07; stage 2 of docs/system-security-view.md §7, part 1)
--
-- WHY. The owner's ruling: "All of the control objectives for the organisation
-- must by implication have security solutions or they are 'not applicable'. Any
-- control objective which does not have a security solution must have one built
-- and the components identified." Stage 2 will make such an objective read
-- MISSING on every system. That would show as hundreds of missing rows spread
-- across the systems — 363 on Misty Isles — when the cause is 24 objectives
-- nobody has written a solution for. This finding names the cause once per
-- objective, so the security team has a worklist before the rule is switched on.
--
-- THE FINDING. An objective that is not ruled out by the Statement of
-- Applicability (applicable, or no decision yet) and that no security solution
-- delivers. It closes itself when a solution is added to the objective, or the
-- SoA rules the objective not applicable. Derive the finding, store the
-- response (docs/assurance-findings.md): act (build the solution) or accept
-- until a date.
--
-- Every delivery mode counts — per system, organisation-wide, for a group, not
-- stated — because the ruling is about every objective. Only the per-system ones
-- change a status on a system; `systems_count` says how many rows that is, so
-- the list sorts by what stage 2 would touch.
--
-- Organisation-wide like the document-review finding (v140): an objective
-- belongs to no department, so there is no seat and department-scoped roles do
-- not raise for it. Subject type `control` has been allowed since v133.

CREATE VIEW v_objective_solution_findings AS
SELECT c.id                 AS control_id,
       c.title              AS objective_title,
       (SELECT sc2.ref_code
          FROM control_mappings cm
          JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
          JOIN standards s ON s.id = sc2.standard_id
         WHERE cm.control_id = c.id
         ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS reference,
       NULL::uuid           AS department_id,
       TRUE                 AS is_shared,
       c.owner_user_id,
       c.delivery,
       (SELECT COUNT(*) FROM system_controls sc JOIN systems s ON s.id = sc.system_id AND s.is_active
         WHERE sc.control_id = c.id AND sc.status <> 'not_applicable')::int      AS systems_count,
       (SELECT COUNT(*) FROM risk_control_probability p JOIN risks r ON r.id = p.risk_id AND r.is_active
         WHERE p.control_id = c.id)::int                                          AS judged_count,
       (SELECT COUNT(*) FROM control_component_links l WHERE l.control_id = c.id)::int AS listed_components
  FROM controls c
 WHERE NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM soa_entries se WHERE se.control_id = c.id AND se.applicable = FALSE);

COMMENT ON VIEW v_objective_solution_findings IS
  'Finding (v153): a control objective the SoA does not rule out and no security solution delivers. systems_count = rows on active systems that would read missing once status is derived for it; judged_count = residual judgements resting on it. Closes when a solution delivers the objective or the SoA rules it not applicable.';

ALTER TABLE security_actions
  DROP CONSTRAINT chk_sa_origin,
  DROP CONSTRAINT chk_sa_origin_matches_subject,
  ADD CONSTRAINT chk_sa_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review',
                      'supplier_assurance', 'objective_solution')),
  ADD CONSTRAINT chk_sa_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete'  OR subject_type = 'asset')
           AND (origin <> 'component_record'   OR subject_type = 'system')
           AND (origin <> 'document_review'    OR subject_type = 'component')
           AND (origin <> 'supplier_assurance' OR subject_type = 'supplier_relationship')
           AND (origin <> 'objective_solution' OR subject_type = 'control'));

ALTER TABLE exceptions
  DROP CONSTRAINT chk_exc_origin,
  DROP CONSTRAINT chk_exc_origin_matches_subject,
  ADD CONSTRAINT chk_exc_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review',
                      'supplier_assurance', 'objective_solution')),
  ADD CONSTRAINT chk_exc_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete'  OR subject_type = 'asset')
           AND (origin <> 'component_record'   OR subject_type = 'system')
           AND (origin <> 'document_review'    OR subject_type = 'component')
           AND (origin <> 'supplier_assurance' OR subject_type = 'supplier_relationship')
           AND (origin <> 'objective_solution' OR subject_type = 'control'));

-- Done means fixed (v134): an action raised from this finding completes only
-- once the objective has a solution or is ruled not applicable.
CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
  overdue TEXT;
  outstanding TEXT;
BEGIN
  IF NEW.origin = 'rating_incomplete' THEN
    SELECT f.missing_table_names INTO missing
      FROM v_asset_rating_findings f WHERE f.asset_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'the asset is still not rated against: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'component_record' THEN
    outstanding := fn_component_record_outstanding(NEW.subject_id);
    IF outstanding IS NOT NULL THEN
      RAISE EXCEPTION 'the system''s record is still incomplete — %', outstanding
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'document_review' THEN
    SELECT f.next_review INTO overdue
      FROM v_document_review_findings f WHERE f.component_id = NEW.subject_id;
    IF overdue IS NOT NULL THEN
      RAISE EXCEPTION 'the document is still past its review date (%) — record the review and its next date', overdue
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'supplier_assurance' THEN
    SELECT f.unmet_refs INTO missing
      FROM v_supplier_assurance_findings f WHERE f.relationship_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'no current evidence yet covers: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'objective_solution' THEN
    IF EXISTS (SELECT 1 FROM v_objective_solution_findings f WHERE f.control_id = NEW.subject_id) THEN
      RAISE EXCEPTION 'the control objective still has no security solution — add one to it, or rule it not applicable in the Statement of Applicability'
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
