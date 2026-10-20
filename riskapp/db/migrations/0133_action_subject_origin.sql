-- 0133 — a security action says what it is ABOUT and WHY it exists
--
-- WHY. CIRKS has exactly one route to a security action: a risk's coverage gap.
-- That is right for risk treatment, and it left no home for the work the ISMS
-- generates that no risk explains — the findings of docs/assurance-findings.md
-- (an asset missing a mandatory impact table, an objective deployed where it was
-- ruled not applicable, …). A finding names no threat, so it must never become a
-- risk (§4 of that note: it double-counts, in the wrong direction). What it needs
-- is an action that can hang off something other than a risk.
--
-- Two columns, because one will not do:
--   subject_type / subject_id — WHAT the action is about. Drives navigation and,
--       as important, is the second path to a DEPARTMENT: today every read of
--       an action reaches the department through action → risk → system, so an
--       action with no risk is not merely missing from the queues, it is
--       unscopable (GET /actions/:id answers 403 because `.some()` over no risks
--       is false).
--   origin — WHY it exists. Subject type alone cannot tell "this asset's rating
--       is incomplete" from "this asset is somewhere it should not be"; both
--       are subject_type = 'asset'.
--
-- A RISK action keeps its risks where they already are, in
-- security_action_risks, and subject_id stays NULL: the risk link is many-to-one
-- by design, and copying one of them into subject_id would store the same fact
-- twice. An ORGANISATION action has no subject row at all. Every other subject
-- type names its row. The CHECK below makes that an equivalence, and a trigger
-- refuses a risk link on an action that is not about a risk, so the two
-- descriptions of one action cannot disagree.
--
-- NO DEFAULTS, deliberately. A default of 'risk' / 'risk_treatment' would be
-- true of every row today and quietly false of the first writer that forgets —
-- the "placeholder that looks like an answer" this codebase has shipped four
-- times. Every INSERT now says what it means.
--
-- TEXT + CHECK rather than enums: the origin list grows one finding at a time,
-- and widening a CHECK is one statement, where an enum value cannot be used in
-- the migration that adds it. `origin` admits risk treatment and ONE finding —
-- `rating_incomplete`, an information asset not rated against every mandatory
-- impact table (43 of 44 assets on CIRKS-test). The owner chose it as the first
-- finding to carry end to end (2026-09-28): it is a real worklist, and its
-- subject is an asset, so it exercises the department path below. Each further
-- finding adds its value when it gains a way to raise an action, and states
-- which subject it is about, as this one does.
--
-- Backfill: all 13 (dev) / 15 (CIRKS-test) actions have exactly one risk, all
-- built from the gap, so ('risk', NULL, 'risk_treatment') is true of every row.

ALTER TABLE security_actions
  ADD COLUMN subject_type TEXT,
  ADD COLUMN subject_id   UUID,
  ADD COLUMN origin       TEXT;

UPDATE security_actions
   SET subject_type = 'risk', subject_id = NULL, origin = 'risk_treatment';

ALTER TABLE security_actions
  ALTER COLUMN subject_type SET NOT NULL,
  ALTER COLUMN origin       SET NOT NULL,
  ADD CONSTRAINT chk_sa_subject_type
    CHECK (subject_type IN ('risk', 'system', 'asset', 'service', 'control', 'organisation')),
  ADD CONSTRAINT chk_sa_subject_id
    CHECK ((subject_type IN ('risk', 'organisation')) = (subject_id IS NULL)),
  ADD CONSTRAINT chk_sa_origin
    CHECK (origin IN ('risk_treatment', 'rating_incomplete')),
  -- Each origin is about one kind of subject. Risk treatment is what a risk
  -- action IS, so nothing else may claim it, and a risk action claims nothing else.
  ADD CONSTRAINT chk_sa_origin_matches_subject
    CHECK ((origin = 'risk_treatment') = (subject_type = 'risk')
           AND (origin <> 'rating_incomplete' OR subject_type = 'asset'));

CREATE INDEX idx_sa_subject ON security_actions (subject_type, subject_id)
  WHERE subject_id IS NOT NULL;

COMMENT ON COLUMN security_actions.subject_type IS
  'What the action is about. risk: its risks are in security_action_risks; organisation: no subject row; otherwise subject_id names the row.';
COMMENT ON COLUMN security_actions.subject_id IS
  'The subject row for system/asset/service/control. NULL for risk (see security_action_risks) and organisation.';
COMMENT ON COLUMN security_actions.origin IS
  'Why the action exists: risk_treatment, or the finding that raised it (docs/assurance-findings.md).';

-- A risk link on an action about something else would give it two subjects.
CREATE OR REPLACE FUNCTION fn_sar_subject_is_risk()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT subject_type FROM security_actions WHERE id = NEW.action_id) <> 'risk' THEN
    RAISE EXCEPTION 'security action % is not about a risk; it cannot be linked to one', NEW.action_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sar_subject_is_risk
  BEFORE INSERT OR UPDATE OF action_id ON security_action_risks
  FOR EACH ROW EXECUTE FUNCTION fn_sar_subject_is_risk();

-- The one answer to "which department is this action in": every read that scopes
-- actions by department uses it, so a non-risk action is scoped by its subject
-- rather than silently dropped.
--
-- One row per (action, department). `org_wide` marks a row every department may
-- see: a shared system/asset/service (as GET /risks/:id already admits), and a
-- control or organisation action — the objective catalogue is organisation-wide
-- and readable by every role that reads actions, so there is no department to
-- withhold it from. Risk rows count only ACTIVE risks, preserving the existing
-- behaviour that an action on a retired risk leaves the departmental queues.
CREATE VIEW v_security_action_departments AS
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
   WHERE sa.subject_type IN ('control', 'organisation');

COMMENT ON VIEW v_security_action_departments IS
  'Which department(s) a security action belongs to — through its active risks, or through its subject when it is not about a risk. org_wide = visible to every department.';
