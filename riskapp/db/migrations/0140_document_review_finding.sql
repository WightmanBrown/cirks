-- 0140 — the third finding: a policy or document overdue for review
--        (Policies & documents step 3b; docs/assurance-findings.md)
--
-- WHY. v139 made a document's review date part of its record and derived its
-- state from it: a Published document past its review date reads as Under review
-- everywhere. That makes the lapse VISIBLE; this makes it something the SWG is
-- asked about and someone answers — act (review it) or accept (until a date, for
-- a reason). ISO 27001 7.5.3 expects documented information to be controlled,
-- and GV.PO-02 expects policy to be reviewed and updated.
--
-- WHAT COUNTS. A policy, standard or procedure (not a guideline — advisory, it
-- controls nothing) that is Published and past its review date. The view reads
-- `review_overdue` from v_component_state, so the finding and the "Under review"
-- the rest of CIRKS shows are one fact, not two. A published document with no
-- review date at all is NOT counted here: that is a different gap ("never
-- scheduled"), and the owner framed this finding as overdue for review.
--
-- A NEW KIND OF SUBJECT. The first two findings were about an asset and a system;
-- this one is about a document — a catalogue component — so `component` joins the
-- subject types on security_actions and exceptions. A document belongs to no
-- department: v_security_action_departments treats it as organisation-wide
-- (visible to all, like a control), and the SoD rule's "owner" is the document's
-- own owner, who may not accept the lapse of their own document.

CREATE VIEW v_document_review_findings AS
SELECT cc.id                    AS component_id,
       cc.name                  AS document_name,
       NULL::uuid               AS department_id,
       TRUE                     AS is_shared,
       cc.document_owner_id     AS owner_user_id,
       cc.document_kind,
       cc.document_version,
       cc.document_next_review::text AS next_review,
       (CURRENT_DATE - cc.document_next_review)::int AS days_overdue,
       (SELECT COUNT(*) FROM control_component_links l WHERE l.component_id = cc.id)::int AS supports_count
  FROM control_components cc
  JOIN v_component_state st ON st.component_id = cc.id AND st.review_overdue
 WHERE cc.component_type = 'information'
   AND cc.document_kind IS DISTINCT FROM 'guideline';

COMMENT ON VIEW v_document_review_findings IS
  'Finding: a Published policy, standard or procedure past its review date (not guidelines). Derived from v_component_state; closes when a new review date is recorded (v140).';

-- ── `component` as a subject, and the origin, on both responses ───────────────
ALTER TABLE security_actions
  DROP CONSTRAINT chk_sa_subject_type,
  DROP CONSTRAINT chk_sa_origin,
  DROP CONSTRAINT chk_sa_origin_matches_subject,
  ADD CONSTRAINT chk_sa_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'component', 'organisation')),
  ADD CONSTRAINT chk_sa_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review')),
  ADD CONSTRAINT chk_sa_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset')
           AND (origin <> 'component_record'  OR subject_type = 'system')
           AND (origin <> 'document_review'   OR subject_type = 'component'));

ALTER TABLE exceptions
  DROP CONSTRAINT chk_exc_subject_type,
  DROP CONSTRAINT chk_exc_origin,
  DROP CONSTRAINT chk_exc_origin_matches_subject,
  ADD CONSTRAINT chk_exc_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'component', 'organisation')),
  ADD CONSTRAINT chk_exc_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review')),
  ADD CONSTRAINT chk_exc_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset')
           AND (origin <> 'component_record'  OR subject_type = 'system')
           AND (origin <> 'document_review'   OR subject_type = 'component'));

-- ── A document is organisation-wide for department scoping ────────────────────
CREATE OR REPLACE VIEW v_security_action_departments AS
  SELECT sar.action_id, s.department_id, s.is_shared AS org_wide
    FROM security_action_risks sar
    JOIN risks   r ON r.id = sar.risk_id AND r.is_active = TRUE
    JOIN systems s ON s.id = r.system_id
UNION ALL
  SELECT sa.id, s.department_id, s.is_shared
    FROM security_actions sa JOIN systems s ON s.id = sa.subject_id
   WHERE sa.subject_type = 'system'
UNION ALL
  SELECT sa.id, ia.department_id, ia.is_shared
    FROM security_actions sa JOIN information_assets ia ON ia.id = sa.subject_id
   WHERE sa.subject_type = 'asset'
UNION ALL
  SELECT sa.id, bs.department_id, bs.is_shared
    FROM security_actions sa JOIN business_services bs ON bs.id = sa.subject_id
   WHERE sa.subject_type = 'service'
UNION ALL
  SELECT sa.id, NULL::uuid, TRUE
    FROM security_actions sa
   WHERE sa.subject_type IN ('control', 'component', 'organisation');

-- ── Done means fixed ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
  overdue TEXT;
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
  ELSIF NEW.origin = 'document_review' THEN
    SELECT f.next_review INTO overdue
      FROM v_document_review_findings f WHERE f.component_id = NEW.subject_id;
    IF overdue IS NOT NULL THEN
      RAISE EXCEPTION 'the document is still past its review date (%) — record the review and its next date', overdue
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Expiry sweep and SoD learn the component subject ──────────────────────────
CREATE OR REPLACE FUNCTION expire_overdue_exceptions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id, e.subject_type, e.origin, e.expires_at,
           t.name AS threat_name, s.name AS system_name,
           COALESCE(ia.name, ss.name, cc.name) AS subject_name
      FROM exceptions e
      LEFT JOIN risks   rk ON rk.id = e.risk_id
      LEFT JOIN systems s  ON s.id  = rk.system_id
      LEFT JOIN threats t  ON t.id  = rk.threat_id
      LEFT JOIN information_assets ia ON ia.id = e.subject_id AND e.subject_type = 'asset'
      LEFT JOIN systems ss ON ss.id = e.subject_id AND e.subject_type = 'system'
      LEFT JOIN control_components cc ON cc.id = e.subject_id AND e.subject_type = 'component'
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
    ELSIF NEW.subject_type = 'component' THEN
      -- A document has no department; its owner is the document's own owner.
      SELECT ARRAY_REMOVE(ARRAY[cc.document_owner_id], NULL) INTO v_owners
        FROM control_components cc WHERE cc.id = NEW.subject_id;
    END IF;
    IF v_owners IS NOT NULL AND NEW.accepted_by = ANY (v_owners) THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the owner cannot accept an exception on their own %', NEW.subject_type;
    END IF;
  END IF;
  RETURN NEW;
END $$;
