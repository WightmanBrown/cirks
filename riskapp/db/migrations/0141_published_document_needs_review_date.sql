-- 0141 — a published document must have a review date
--
-- WHY. Owner's ruling, 2026-09-29: "a published document must have a review
-- date". Without one nothing ever flags it — v139 derives *Under review* from the
-- date passing, and v140's finding lists documents past it — so a policy with no
-- date is the one that is never looked at again, which is worse than one a few
-- days late.
--
-- THE RULE. A policy or document (component type `information`) cannot be
-- Published (status `operational`) without `document_next_review`. Enforced by a
-- CHECK, so no path — the API, a script, a hand-run UPDATE — can publish one
-- without a date.
--
-- NOT VALID, deliberately. An install may already hold published documents with
-- no date. A plain CHECK would fail this migration there; backfilling a date here
-- would invent an answer for every customer (the placeholder that computes). NOT
-- VALID enforces the rule on every row inserted or updated from now on — touching
-- such a document at all means giving it a date — while existing rows are left
-- as they are and surfaced instead: the overdue-for-review finding (v140) now also
-- lists a published document with no review date, as `no_review_date`.
--
-- CIRKS-test and CIRKS-dev are brought into line by a data fix, run by hand
-- (db/datafixes/2026-09-29_document-review-dates.sql): every document there
-- without a date gets 1 January 2028, the owner's chosen date.

ALTER TABLE control_components
  ADD CONSTRAINT chk_published_document_has_review_date
    CHECK (component_type <> 'information' OR status <> 'operational'
           OR document_next_review IS NOT NULL) NOT VALID;

COMMENT ON CONSTRAINT chk_published_document_has_review_date ON control_components IS
  'A published policy or document must have a review date (owner, 2026-09-29). NOT VALID: enforced on every insert/update; rows that predate it are surfaced by v_document_review_findings (v141).';

-- The finding now also holds for a published document that was never given a
-- review date (legacy rows only — new ones cannot exist). `reason` says which.
-- Columns kept in place; `reason` is added at the end.
CREATE OR REPLACE VIEW v_document_review_findings AS
SELECT cc.id                    AS component_id,
       cc.name                  AS document_name,
       NULL::uuid               AS department_id,
       TRUE                     AS is_shared,
       cc.document_owner_id     AS owner_user_id,
       cc.document_kind,
       cc.document_version,
       cc.document_next_review::text AS next_review,
       (CURRENT_DATE - cc.document_next_review)::int AS days_overdue,
       (SELECT COUNT(*) FROM control_component_links l WHERE l.component_id = cc.id)::int AS supports_count,
       CASE WHEN cc.document_next_review IS NULL THEN 'no_review_date' ELSE 'overdue' END AS reason
  FROM control_components cc
  JOIN v_component_state st ON st.component_id = cc.id
 WHERE cc.component_type = 'information'
   AND cc.document_kind IS DISTINCT FROM 'guideline'
   AND (st.review_overdue
        OR (cc.status = 'operational' AND cc.document_next_review IS NULL));

-- The completion message must cover both reasons.
CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
  why     TEXT;
  due     TEXT;
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
    SELECT f.reason, f.next_review INTO why, due
      FROM v_document_review_findings f WHERE f.component_id = NEW.subject_id;
    IF why = 'no_review_date' THEN
      RAISE EXCEPTION 'the document still has no review date — record the review and its next date'
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    ELSIF why IS NOT NULL THEN
      RAISE EXCEPTION 'the document is still past its review date (%) — record the review and its next date', due
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
