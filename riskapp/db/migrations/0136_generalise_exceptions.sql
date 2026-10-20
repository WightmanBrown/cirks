-- 0136 — an exception can accept a finding, not only a risk
--        (docs/assurance-findings.md §6, owner's decision 2026-09-18: generalise)
--
-- WHY. A finding has two responses, mirroring risk treatment: ACT (a security
-- action — v133/v134) or ACCEPT (we know, and we live with it until a date, for a
-- reason). `risk_exceptions` is exactly the second, for risks: a subject, a
-- reason, who accepted it in what role, when it expires, a lifecycle
-- (active/expired/renewed/revoked), one active per subject, an expiry sweep that
-- escalates, and an SoD rule. The owner chose to generalise it rather than build
-- a sibling: the act and the authority are identical (v107 made accepting a
-- governance act for admin/CISO/SIRO), and two tables meaning the same thing is
-- how the SoA came to keep two sets of books (#118).
--
-- WHAT CHANGES.
--   * The table is renamed `exceptions`. Views and foreign keys follow the rename
--     (Postgres binds them by OID); the two PL/pgSQL functions that name it in
--     their bodies are rewritten below.
--   * It gains the same subject/origin shape as security_actions (v133):
--     `subject_type`, `subject_id`, `origin`, with no defaults. A RISK exception
--     keeps its `risk_id` (now nullable) — the foreign key, its ON DELETE CASCADE
--     and the one-active-per-risk index all still apply to it — and its
--     subject_id stays NULL, so the risk is not stored twice. CHECKs make both
--     descriptions agree.
--   * One active acceptance per finding: a partial unique index on
--     (origin, subject_type, subject_id), the counterpart of the per-risk one.
--   * The expiry sweep expires every subject, not only risks, so an accepted
--     finding re-surfaces when its date passes. Audit rows for risk exceptions
--     keep entity_type 'risk_exceptions', so the audit viewer's filter still
--     finds the whole history; a finding acceptance is 'exceptions'.
--   * The SoD rule asks for the owners of the SUBJECT's department: for a risk,
--     the system's (unchanged); for an asset, the asset's.
--
-- WHAT DOES NOT. v_active_exceptions / v_escalated_exceptions inner-join risks,
-- so they remain the risk exceptions register — its page, stats and department
-- counts are unchanged. A finding's acceptance is shown with the finding.
--
-- Backfill: every existing row is a risk exception — ('risk', NULL,
-- 'risk_treatment') is true of all of them.

ALTER TABLE risk_exceptions RENAME TO exceptions;

ALTER TABLE exceptions
  ADD COLUMN subject_type TEXT,
  ADD COLUMN subject_id   UUID,
  ADD COLUMN origin       TEXT;

UPDATE exceptions SET subject_type = 'risk', subject_id = NULL, origin = 'risk_treatment';

ALTER TABLE exceptions
  ALTER COLUMN subject_type SET NOT NULL,
  ALTER COLUMN origin       SET NOT NULL,
  ALTER COLUMN risk_id      DROP NOT NULL,
  ADD CONSTRAINT chk_exc_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'organisation')),
  ADD CONSTRAINT chk_exc_subject_id
    CHECK ((subject_type IN ('risk', 'organisation')) = (subject_id IS NULL)),
  ADD CONSTRAINT chk_exc_risk_id
    CHECK ((subject_type = 'risk') = (risk_id IS NOT NULL)),
  ADD CONSTRAINT chk_exc_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete')),
  ADD CONSTRAINT chk_exc_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset'));

CREATE UNIQUE INDEX uq_exceptions_one_active_finding
  ON exceptions (origin, subject_type, subject_id)
  WHERE status = 'active' AND subject_id IS NOT NULL;

COMMENT ON TABLE exceptions IS
  'A time-bounded acceptance: of a risk (risk_id), or of an assurance finding (subject_type/subject_id + origin). Was risk_exceptions until v136.';

-- ── The expiry sweep, for every subject ───────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_overdue_exceptions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id, e.subject_type, e.origin, e.expires_at,
           t.name AS threat_name, s.name AS system_name, ia.name AS asset_name
      FROM exceptions e
      LEFT JOIN risks   rk ON rk.id = e.risk_id
      LEFT JOIN systems s  ON s.id  = rk.system_id
      LEFT JOIN threats t  ON t.id  = rk.threat_id
      LEFT JOIN information_assets ia ON ia.id = e.subject_id AND e.subject_type = 'asset'
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
                     r.origin, r.subject_type, COALESCE(r.asset_name, '?'), r.expires_at));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- ── SoD: the subject's owners may not accept their own ────────────────────────
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
    END IF;
    IF v_owners IS NOT NULL AND NEW.accepted_by = ANY (v_owners) THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the owner cannot accept an exception on their own %', NEW.subject_type;
    END IF;
  END IF;
  RETURN NEW;
END $$;
