-- 0139 — a policy or document has a kind and a lifecycle, and its state follows
--        from them (Policies & documents, step 3 — docs/roadmap.md)
--
-- WHY. The documented information the ISMS runs on — policies, standards,
-- procedures (ISO 27001 clause 7.5, component type `information`, shown as
-- "Policies & documents") — had only a hand-set state. Clause 7.5 expects it to
-- be CONTROLLED: an owner, a version, an approval, a review date. And a policy
-- nobody has reviewed for three years still read "Published" for as long as
-- nobody remembered to change it.
--
-- WHAT.
--   * `document_*` columns on control_components, meaningful only for the
--     information type (a CHECK keeps them NULL on every other type): kind,
--     version, owner, approved by/on, next review date, and a link to where the
--     document actually lives. CIRKS points at the document management system;
--     it does not store the file.
--   * KIND: policy | standard | procedure | guideline. A GUIDELINE does not
--     deliver a control — it is advisory and nobody is bound by it (owner's
--     ruling 2026-09-29) — so it cannot be linked to one, and a linked document
--     cannot be reclassified as a guideline. Refused by trigger, every path.
--   * DERIVED STATE (v_component_state): a Published (operational) document whose
--     next review date has passed reads as Under review (degraded), with
--     `review_overdue` set. Not stored — the date passes and the state follows,
--     with nobody having to remember. v_component_presence reads it, so an
--     organisation-wide policy that falls overdue flags on every system that
--     relies on it, on the day it falls due.
--   * AUDIT: kind, approval and review date changes are audited by trigger with
--     their before and after — they are the GV.PO-02 evidence ("policy is
--     reviewed, updated, communicated").
--
-- Nothing moves on migration: no document has a review date yet.

ALTER TABLE control_components
  ADD COLUMN document_kind        TEXT
    CHECK (document_kind IN ('policy', 'standard', 'procedure', 'guideline')),
  ADD COLUMN document_version     TEXT,
  ADD COLUMN document_owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN document_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN document_approved_on DATE,
  ADD COLUMN document_next_review DATE,
  ADD COLUMN document_url         TEXT
    CHECK (document_url IS NULL OR document_url ~* '^https?://'),
  ADD CONSTRAINT chk_document_fields_only_for_documents
    CHECK (component_type = 'information'
           OR (document_kind IS NULL AND document_version IS NULL AND document_owner_id IS NULL
               AND document_approved_by IS NULL AND document_approved_on IS NULL
               AND document_next_review IS NULL AND document_url IS NULL));

COMMENT ON COLUMN control_components.document_kind IS
  'Policies & documents only: policy | standard | procedure | guideline. A guideline is advisory and cannot deliver a control (v139).';
COMMENT ON COLUMN control_components.document_next_review IS
  'Policies & documents only: when it must next be reviewed. Past it, a Published document reads as Under review (v_component_state, v139).';

-- ── The state, derived ────────────────────────────────────────────────────────
CREATE VIEW v_component_state AS
SELECT cc.id AS component_id,
       cc.status::text AS stated_status,
       (cc.component_type = 'information' AND cc.status = 'operational'
        AND cc.document_next_review IS NOT NULL
        AND cc.document_next_review < CURRENT_DATE)            AS review_overdue,
       CASE WHEN cc.component_type = 'information' AND cc.status = 'operational'
                 AND cc.document_next_review < CURRENT_DATE
            THEN 'degraded' ELSE cc.status::text END           AS status
  FROM control_components cc;

COMMENT ON VIEW v_component_state IS
  'A component''s effective catalogue state: its stated status, except that a Published document past its review date reads as Under review (degraded) — v139.';

-- v_component_presence (v137) takes the organisational state from here, so an
-- overdue policy flags on every system that relies on it. Same columns.
CREATE OR REPLACE VIEW v_component_presence AS
  SELECT sc.system_id, sc.component_id, sc.status::text AS status,
         'recorded'::text AS via, sc.role, sc.added_at
    FROM system_components sc
    JOIN control_components cc ON cc.id = sc.component_id
   WHERE cc.instantiation IS DISTINCT FROM 'organisational'
UNION ALL
  SELECT p.system_id, cc.id,
         CASE st.status
           WHEN 'operational' THEN 'operational'
           WHEN 'degraded'    THEN 'degraded'
           WHEN 'unknown'     THEN 'unknown'
           ELSE 'missing'                      -- planned, decommissioned
         END,
         'organisation'::text, NULL::text, NULL::timestamptz
    FROM control_components cc
    JOIN v_component_state st ON st.component_id = cc.id
    JOIN (
      SELECT syc.system_id, ccl.component_id
        FROM system_controls syc
        JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
        JOIN control_component_links ccl ON ccl.control_id = syc.control_id
       WHERE syc.status <> 'not_applicable'
      UNION
      SELECT system_id, component_id FROM system_components
    ) p ON p.component_id = cc.id
   WHERE cc.instantiation = 'organisational';

-- ── A guideline delivers no control ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_guideline_delivers_no_control()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'control_component_links' THEN
    IF (SELECT document_kind FROM control_components WHERE id = NEW.component_id) = 'guideline' THEN
      RAISE EXCEPTION 'a guideline is advisory and cannot deliver a control'
        USING ERRCODE = 'check_violation', HINT = 'guideline_no_control';
    END IF;
  ELSIF NEW.document_kind = 'guideline' AND OLD.document_kind IS DISTINCT FROM 'guideline'
        AND EXISTS (SELECT 1 FROM control_component_links WHERE component_id = NEW.id) THEN
    RAISE EXCEPTION 'this document delivers controls, so it cannot be a guideline — unlink it from them first'
      USING ERRCODE = 'check_violation', HINT = 'guideline_no_control';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_link_no_guideline
  BEFORE INSERT OR UPDATE OF component_id ON control_component_links
  FOR EACH ROW EXECUTE FUNCTION fn_guideline_delivers_no_control();
CREATE TRIGGER trg_component_no_guideline_with_links
  BEFORE UPDATE OF document_kind ON control_components
  FOR EACH ROW EXECUTE FUNCTION fn_guideline_delivers_no_control();

-- ── Audit the lifecycle — the GV.PO-02 evidence ───────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_document_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor UUID := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
  diff  JSONB := '{}'::jsonb;
BEGIN
  IF NEW.document_kind IS DISTINCT FROM OLD.document_kind THEN
    diff := diff || jsonb_build_object('kind', jsonb_build_object('from', OLD.document_kind, 'to', NEW.document_kind));
  END IF;
  IF NEW.document_version IS DISTINCT FROM OLD.document_version THEN
    diff := diff || jsonb_build_object('version', jsonb_build_object('from', OLD.document_version, 'to', NEW.document_version));
  END IF;
  IF NEW.document_approved_by IS DISTINCT FROM OLD.document_approved_by
     OR NEW.document_approved_on IS DISTINCT FROM OLD.document_approved_on THEN
    diff := diff || jsonb_build_object('approved', jsonb_build_object(
      'from', jsonb_build_object('by', OLD.document_approved_by, 'on', OLD.document_approved_on),
      'to',   jsonb_build_object('by', NEW.document_approved_by, 'on', NEW.document_approved_on)));
  END IF;
  IF NEW.document_next_review IS DISTINCT FROM OLD.document_next_review THEN
    diff := diff || jsonb_build_object('next_review', jsonb_build_object('from', OLD.document_next_review, 'to', NEW.document_next_review));
  END IF;
  IF diff <> '{}'::jsonb THEN
    INSERT INTO audit_log (user_id, entity_type, entity_id, action, human_narrative, changes)
    VALUES (actor, 'control_components', NEW.id, 'update',
            format('Document "%s": %s changed.', NEW.name,
                   (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(diff) k)),
            diff);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_document_lifecycle
  AFTER UPDATE OF document_kind, document_version, document_approved_by, document_approved_on, document_next_review
  ON control_components
  FOR EACH ROW EXECUTE FUNCTION fn_audit_document_lifecycle();
