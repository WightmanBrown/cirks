-- 0123 — a control objective's own reference must identify it
--
-- WHY. `controls.reference_code` has existed since the baseline and nothing has
-- ever read or written it (0 of 110 rows set on 2026-09-21). An objective loaded
-- from a standard borrows that standard's numbering (GV.OC-01) through its
-- mapping, but a CUSTOM objective — one the organisation writes itself, mapped to
-- no standard — had no reference at all: the Add dialog offered none after v122
-- removed fields the server was silently discarding, so a custom objective could
-- neither be referred to nor sorted. The column is now written on create and edit.
--
-- A reference that two objectives share identifies neither, so it is unique —
-- ignoring case and surrounding space, since "ORG-01" and "org-01 " are the same
-- reference to anyone reading an SoA. NULL stays allowed: most objectives take
-- their reference from the standard they are mapped to. A blank string is
-- refused rather than treated as a reference.

ALTER TABLE controls
  ADD CONSTRAINT chk_controls_reference_code_not_blank
  CHECK (reference_code IS NULL OR btrim(reference_code) <> '');

CREATE UNIQUE INDEX uq_controls_reference_code
  ON controls (lower(btrim(reference_code)))
  WHERE reference_code IS NOT NULL;

COMMENT ON COLUMN controls.reference_code IS
  'The organisation''s own reference for this control objective (e.g. ORG-AC-01). Unique ignoring case. Shown for objectives mapped to no standard; mapped objectives show their standard''s reference.';
