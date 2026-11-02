-- v162: an objective's own reference, and its subject.
--
-- CIRKS ships its own control objectives (owner, 2026-10-28), with NIST CSF,
-- ISO 27001 and CIS mapped onto them as reporting sets. Until now an objective's
-- framework badge was its FIRST mapped standard reference, which was right while
-- the library WAS NIST, and wrong now: every CIRKS objective would show as a NIST
-- subcategory or an ISO clause, which is the confusion the change removes.
--
-- One rule, in one place (eight routes copied a subquery before):
--   * a shipped CIRKS objective (reference CIRKS<n>.<SUBJECT>-<nn>) is CIRKS, under
--     its own reference;
--   * otherwise the first mapped standard, as before (a NIST-library install is
--     unchanged);
--   * otherwise Custom, under the organisation's own reference.
-- The pattern is strict on purpose: an organisation's own "CIRKS.OT.T-01" is not
-- a shipped objective.

ALTER TABLE controls ADD COLUMN subject text;
COMMENT ON COLUMN controls.subject IS
  'The subject a shipped CIRKS objective belongs to (e.g. "Detective monitoring"); groups the Statement of Applicability. NULL for an organisation''s own objectives (v162).';

CREATE VIEW v_control_reference AS
SELECT c.id AS control_id,
       CASE WHEN c.reference_code ~ '^CIRKS[0-9]+\.[A-Z]+-[0-9]{2}$' THEN 'cirks'
            WHEN first.code IS NOT NULL THEN first.code
            ELSE 'custom' END AS framework,
       CASE WHEN c.reference_code ~ '^CIRKS[0-9]+\.[A-Z]+-[0-9]{2}$' THEN 'CIRKS'
            WHEN first.name IS NOT NULL THEN first.name
            ELSE 'Custom' END AS framework_label,
       CASE WHEN c.reference_code ~ '^CIRKS[0-9]+\.[A-Z]+-[0-9]{2}$' THEN c.reference_code
            ELSE COALESCE(first.ref_code, c.reference_code) END AS framework_ref
  FROM controls c
  LEFT JOIN LATERAL (
    SELECT s.code, s.name, sc.ref_code
      FROM control_mappings cm
      JOIN standard_controls sc ON sc.id = cm.standard_control_id
      JOIN standards s ON s.id = sc.standard_id
     WHERE cm.control_id = c.id
     ORDER BY s.sort_index, sc.sort_index
     LIMIT 1) first ON TRUE;

COMMENT ON VIEW v_control_reference IS
  'How an objective is labelled: a shipped CIRKS objective under its own reference; otherwise its first mapped standard reference; otherwise Custom (v162).';
