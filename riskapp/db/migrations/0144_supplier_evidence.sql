-- 0144 — supplier assurance evidence, and the finding when it is missing
--        (docs/supplier-model.md, step 3)
--
-- WHY. v143 says what each supplier relationship is expected to meet. This says
-- whether it IS met. The owner's rule (decisions 5 and 8): an objective is met
-- for a supplier by EVIDENCE — an assurance REPORT (a SOC 2 report, a
-- certification audit report) or TERMS IN THE CONTRACT that bind the supplier to
-- it — and by nothing else, for now.
--
-- EVIDENCE. `supplier_evidence` is one report or one set of contract terms, on
-- one relationship; `supplier_evidence_objectives` says which of the
-- relationship's expected objectives it covers. When it stops counting:
--   * a report must carry its expiry — a report with no stated period would count
--     for ever, which is the placeholder-that-looks-like-an-answer failure. CHECK.
--   * contract terms end with the contract (the relationship's contract_end),
--     unless the terms carry their own date. An open-ended contract's terms count
--     until someone records an end.
--
-- COVERAGE is DERIVED (`v_supplier_objective_coverage`): per relationship and
-- expected objective, is it met by current evidence, until when, and has it only
-- expired evidence. Nothing is stored that the dates can decide.
--
-- THE FINDING (the v133–v141 machinery): `v_supplier_assurance_findings` holds for
-- a LIVE relationship (active or exiting — a proposed one has no contract in
-- force yet) with any expected objective not met, and says why: `no_evidence`
-- (nothing current at all), `expired` (something it relied on has lapsed) or
-- `partial`. A new subject type, `supplier_relationship`, owned by the contracting
-- department (its IAO, else the SIRO — v_department_risk_owner), so the IAO
-- raises the action and the CISO/SIRO accepts, as decision 2 says. Done means
-- fixed: an action raised from it cannot complete while the finding holds.

CREATE TABLE supplier_evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id  UUID NOT NULL REFERENCES supplier_relationships(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('report', 'contract_terms')),
  title            TEXT NOT NULL CHECK (btrim(title) <> ''),
  reference        TEXT,          -- the report's issuer/number, or the contract clause
  url              TEXT CHECK (url IS NULL OR url ~* '^https?://'),
  issued_on        DATE,
  expires_on       DATE,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_se_report_expires CHECK (kind <> 'report' OR expires_on IS NOT NULL),
  CONSTRAINT chk_se_dates CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX idx_se_relationship ON supplier_evidence (relationship_id);

CREATE TABLE supplier_evidence_objectives (
  evidence_id  UUID NOT NULL REFERENCES supplier_evidence(id) ON DELETE CASCADE,
  control_id   UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  PRIMARY KEY (evidence_id, control_id)
);
CREATE INDEX idx_seo_control ON supplier_evidence_objectives (control_id);

COMMENT ON TABLE supplier_evidence IS
  'A report or contract terms showing a supplier relationship meets some of its expected objectives. A report must carry its expiry; contract terms end with the contract unless dated (v144).';

-- When a piece of evidence stops counting. NULL = open-ended (contract terms on a
-- contract with no end recorded).
CREATE VIEW v_supplier_evidence_state AS
SELECT e.id AS evidence_id, e.relationship_id,
       COALESCE(e.expires_on, CASE WHEN e.kind = 'contract_terms' THEN sr.contract_end END) AS effective_expiry,
       (COALESCE(e.expires_on, CASE WHEN e.kind = 'contract_terms' THEN sr.contract_end END) IS NULL
        OR COALESCE(e.expires_on, CASE WHEN e.kind = 'contract_terms' THEN sr.contract_end END) >= CURRENT_DATE) AS is_current
  FROM supplier_evidence e
  JOIN supplier_relationships sr ON sr.id = e.relationship_id;

-- Per relationship × expected objective: met by current evidence, until when.
CREATE VIEW v_supplier_objective_coverage AS
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
 GROUP BY ro.relationship_id, ro.control_id, ro.sources;

COMMENT ON VIEW v_supplier_objective_coverage IS
  'Whether each expected objective of a supplier relationship is met by current evidence, and until when (NULL covered_until with met = open-ended). Derived (v144).';

-- ── The finding ────────────────────────────────────────────────────────────────
CREATE VIEW v_supplier_assurance_findings AS
WITH refd AS (
  SELECT c.*,
         COALESCE((SELECT sc.ref_code FROM control_mappings cm
                     JOIN standard_controls sc ON sc.id = cm.standard_control_id
                     JOIN standards st ON st.id = sc.standard_id
                    WHERE cm.control_id = c.control_id ORDER BY st.sort_index, sc.sort_index LIMIT 1),
                  ctl.reference_code, ctl.title) AS ref
    FROM v_supplier_objective_coverage c
    JOIN controls ctl ON ctl.id = c.control_id
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
  'Finding: a live supplier relationship with an expected objective not met by current evidence (no_evidence / expired / partial). Closes when every objective is covered (v144).';

-- ── `supplier_relationship` as a subject, and the origin, on both responses ───
ALTER TABLE security_actions
  DROP CONSTRAINT chk_sa_subject_type,
  DROP CONSTRAINT chk_sa_origin,
  DROP CONSTRAINT chk_sa_origin_matches_subject,
  ADD CONSTRAINT chk_sa_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'component',
                            'supplier_relationship', 'organisation')),
  ADD CONSTRAINT chk_sa_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review',
                      'supplier_assurance')),
  ADD CONSTRAINT chk_sa_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete'  OR subject_type = 'asset')
           AND (origin <> 'component_record'   OR subject_type = 'system')
           AND (origin <> 'document_review'    OR subject_type = 'component')
           AND (origin <> 'supplier_assurance' OR subject_type = 'supplier_relationship'));

ALTER TABLE exceptions
  DROP CONSTRAINT chk_exc_subject_type,
  DROP CONSTRAINT chk_exc_origin,
  DROP CONSTRAINT chk_exc_origin_matches_subject,
  ADD CONSTRAINT chk_exc_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'component',
                            'supplier_relationship', 'organisation')),
  ADD CONSTRAINT chk_exc_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete', 'component_record', 'document_review',
                      'supplier_assurance')),
  ADD CONSTRAINT chk_exc_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete'  OR subject_type = 'asset')
           AND (origin <> 'component_record'   OR subject_type = 'system')
           AND (origin <> 'document_review'    OR subject_type = 'component')
           AND (origin <> 'supplier_assurance' OR subject_type = 'supplier_relationship'));

-- ── A relationship belongs to its contracting department ───────────────────────
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
  SELECT sa.id, sr.department_id, FALSE
    FROM security_actions sa JOIN supplier_relationships sr ON sr.id = sa.subject_id
   WHERE sa.subject_type = 'supplier_relationship'
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
  ELSIF NEW.origin = 'supplier_assurance' THEN
    SELECT f.unmet_refs INTO missing
      FROM v_supplier_assurance_findings f WHERE f.relationship_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'no current evidence yet covers: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Expiry sweep and SoD learn the supplier-relationship subject ───────────────
CREATE OR REPLACE FUNCTION expire_overdue_exceptions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id, e.subject_type, e.origin, e.expires_at,
           t.name AS threat_name, s.name AS system_name,
           COALESCE(ia.name, ss.name, cc.name, sp.name) AS subject_name
      FROM exceptions e
      LEFT JOIN risks   rk ON rk.id = e.risk_id
      LEFT JOIN systems s  ON s.id  = rk.system_id
      LEFT JOIN threats t  ON t.id  = rk.threat_id
      LEFT JOIN information_assets ia ON ia.id = e.subject_id AND e.subject_type = 'asset'
      LEFT JOIN systems ss ON ss.id = e.subject_id AND e.subject_type = 'system'
      LEFT JOIN control_components cc ON cc.id = e.subject_id AND e.subject_type = 'component'
      LEFT JOIN supplier_relationships sr ON sr.id = e.subject_id AND e.subject_type = 'supplier_relationship'
      LEFT JOIN suppliers sp ON sp.id = sr.supplier_id
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
    ELSIF NEW.subject_type = 'supplier_relationship' THEN
      -- The contracting department owns the relationship (decision 2).
      SELECT dro.owner_user_ids INTO v_owners
        FROM supplier_relationships sr
        JOIN v_department_risk_owner dro ON dro.department_id = sr.department_id
       WHERE sr.id = NEW.subject_id;
    END IF;
    IF v_owners IS NOT NULL AND NEW.accepted_by = ANY (v_owners) THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the owner cannot accept an exception on their own %', NEW.subject_type;
    END IF;
  END IF;
  RETURN NEW;
END $$;
