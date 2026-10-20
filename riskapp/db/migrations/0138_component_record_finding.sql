-- 0138 — the second finding: a system missing components its own controls need
--        (docs/assurance-findings.md §2 #2; defect 1d of security-action-scopes.md)
--
-- WHY. A control on a system is delivered by components, and a component that
-- the system's controls need but nobody has recorded on the system counts as a
-- gap on every risk there: 373 of 425 operational controls on CIRKS-test read
-- "needs improvement" for that reason alone. The system page has shown these
-- since 2026-09-18 (`expected_components`); nothing asked anyone to act on them.
--
-- ONLY PER-SYSTEM COMPONENTS. v137 (§5) was built first so that this finding
-- would be right from its first day: a component that exists once for the
-- organisation (a policy, one team) is present wherever it is implied and can
-- never be missing from one system's record. And a component nobody has yet
-- classified is not counted either — it may turn out to be a single shared
-- policy, and asking thirty system owners to record it is exactly the manufactured
-- work §5 exists to prevent. So on an install where nothing is classified the
-- finding is empty, and the agenda says why; each "on each system" answer turns
-- real gaps into findings. An unknown is not reported as a known gap.
--
-- Same shape as v134: a derived view, never a table; an action or an acceptance
-- answers it (subject = system, origin = component_record); an action cannot be
-- completed while the finding still holds (done means fixed).

CREATE VIEW v_system_component_findings AS
WITH needed AS (
  -- per-system components the system's own per-system controls need
  SELECT DISTINCT syc.system_id, cc.id AS component_id, cc.name
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
    JOIN control_component_links ccl ON ccl.control_id = syc.control_id
    JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation = 'per_system'
   WHERE syc.status <> 'not_applicable'
)
SELECT s.id              AS system_id,
       s.name            AS system_name,
       s.department_id,
       s.is_shared,
       s.owner_user_id,
       COUNT(*)::int                                  AS missing_count,
       ARRAY_AGG(n.component_id ORDER BY n.name)      AS missing_component_ids,
       ARRAY_AGG(n.name ORDER BY n.name)              AS missing_component_names,
       (SELECT COUNT(*) FROM needed a WHERE a.system_id = s.id)::int AS needed_count
  FROM needed n
  JOIN systems s ON s.id = n.system_id AND s.is_active
 WHERE NOT EXISTS (SELECT 1 FROM system_components x
                    WHERE x.system_id = n.system_id AND x.component_id = n.component_id)
 GROUP BY s.id;

COMMENT ON VIEW v_system_component_findings IS
  'Finding: an active system missing per-system components its own controls need (only components stated per_system — v137). Derived; closes itself when recorded (v138).';

-- ── The finding's origin, on both responses ───────────────────────────────────
ALTER TABLE security_actions
  DROP CONSTRAINT chk_sa_origin,
  DROP CONSTRAINT chk_sa_origin_matches_subject,
  ADD CONSTRAINT chk_sa_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record')),
  ADD CONSTRAINT chk_sa_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset')
           AND (origin <> 'component_record'  OR subject_type = 'system'));

ALTER TABLE exceptions
  DROP CONSTRAINT chk_exc_origin,
  DROP CONSTRAINT chk_exc_origin_matches_subject,
  ADD CONSTRAINT chk_exc_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record')),
  ADD CONSTRAINT chk_exc_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset')
           AND (origin <> 'component_record'  OR subject_type = 'system'));

-- ── Done means fixed, for this finding too ────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
BEGIN
  IF NEW.origin = 'rating_incomplete' THEN
    SELECT f.missing_table_names INTO missing
      FROM v_asset_rating_findings f WHERE f.asset_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'the asset is still not rated against: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'component_record' THEN
    SELECT f.missing_component_names INTO missing
      FROM v_system_component_findings f WHERE f.system_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'the system still has no record of: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Expiry sweep and SoD learn the system subject ─────────────────────────────
CREATE OR REPLACE FUNCTION expire_overdue_exceptions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id, e.subject_type, e.origin, e.expires_at,
           t.name AS threat_name, s.name AS system_name,
           COALESCE(ia.name, ss.name) AS subject_name
      FROM exceptions e
      LEFT JOIN risks   rk ON rk.id = e.risk_id
      LEFT JOIN systems s  ON s.id  = rk.system_id
      LEFT JOIN threats t  ON t.id  = rk.threat_id
      LEFT JOIN information_assets ia ON ia.id = e.subject_id AND e.subject_type = 'asset'
      LEFT JOIN systems ss ON ss.id = e.subject_id AND e.subject_type = 'system'
     WHERE e.status = 'active'
       AND e.expires_at < CURRENT_DATE
  LOOP
    UPDATE exceptions
       SET status       = 'expired',
           escalated_at = COALESCE(escalated_at, now()),
           updated_at   = now()
     WHERE id = r.id;

    IF r.subject_type = 'risk' THEN
      INSERT INTO audit_log (entity_type, entity_id, action, human_narrative)
      VALUES ('risk_exceptions', r.id, 'update',
              format('Exception on risk for "%s" (%s) auto-expired on review date %s and escalated for breach review.',
                     r.threat_name, r.system_name, r.expires_at));
    ELSE
      INSERT INTO audit_log (entity_type, entity_id, action, human_narrative)
      VALUES ('exceptions', r.id, 'update',
              format('Acceptance of the "%s" finding on %s "%s" auto-expired on review date %s; the finding is open again.',
                     r.origin, r.subject_type, COALESCE(r.subject_name, '?'), r.expires_at));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION sod_exception_accept()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_owners UUID[];
BEGIN
  IF NEW.accepted_by IS NOT NULL AND sod_enabled('exception.accept') THEN
    IF NEW.subject_type = 'risk' THEN
      SELECT dro.owner_user_ids INTO v_owners
        FROM risks r
        JOIN systems s ON s.id = r.system_id
        JOIN v_department_risk_owner dro ON dro.department_id = s.department_id
       WHERE r.id = NEW.risk_id;
    ELSIF NEW.subject_type = 'asset' THEN
      SELECT dro.owner_user_ids INTO v_owners
        FROM information_assets ia
        JOIN v_department_risk_owner dro ON dro.department_id = ia.department_id
       WHERE ia.id = NEW.subject_id;
    ELSIF NEW.subject_type = 'system' THEN
      SELECT dro.owner_user_ids INTO v_owners
        FROM systems s
        JOIN v_department_risk_owner dro ON dro.department_id = s.department_id
       WHERE s.id = NEW.subject_id;
    END IF;
    IF v_owners IS NOT NULL AND NEW.accepted_by = ANY (v_owners) THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the owner cannot accept an exception on their own %', NEW.subject_type;
    END IF;
  END IF;
  RETURN NEW;
END $$;
