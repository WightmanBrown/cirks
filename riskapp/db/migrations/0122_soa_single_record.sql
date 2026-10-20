-- 0122 — the Statement of Applicability is recorded ONCE, against the control
--
-- WHY. Applicability was recorded twice: `soa_entries` per CIRKS control, and
-- `standard_soa_entries` per standard REQUIREMENT, each with its own applicable,
-- drivers, justification, implementation status and owner. Nothing kept the two
-- in step. On CIRKS-test they disagreed on applicability for 4 of 106 controls;
-- on a copy with a second standard loaded they disagreed on implementation
-- status for 97 of 104, because every requirement row still held the default
-- 'not_implemented' that nobody chose. Which view you read the SoA through
-- changed whether 43 controls counted as baseline or untraced.
--
-- Applicability and implementation are facts about CONTROLS — controls are what
-- exist on systems. A requirement reads them through `control_mappings`. The one
-- thing a requirement genuinely owns is an EXCLUSION with its justification
-- ("2.3 does not apply: we hold no stored card data"), so that is all it keeps.
-- See docs/statement-of-applicability.md §4.1 and §4.4.
--
-- WHAT.
--   1. `soa_entries.implementation_description` — HOW a control is implemented,
--      separate from the justification (WHY it applies). Found by looking at what
--      people actually typed: on CIRKS-test the hand-written requirement texts
--      were all descriptions of implementation ("Provided by our ManageEngine 365
--      instance"), written into a field labelled justification.
--   2. `standard_requirement_exclusions` — a requirement excluded for its
--      standard, with a mandatory reason.
--   3. Hand-edited requirement rows are merged into the control record, the
--      newer edit winning (owner decision 2026-09-21):
--        • only where the requirement maps to exactly ONE control, the only case
--          where the two records describe the same thing;
--        • applicable and implementation status are taken from the requirement
--          row when it was edited more recently than the control row;
--        • its text goes to implementation_description if the requirement was
--          applicable, else to justification (an exclusion reason) — appended,
--          never overwriting words already there;
--        • drivers are unioned; an owner fills an empty owner.
--      A requirement excluded with a reason but NOT mapped one-to-one becomes a
--      requirement exclusion.
--   4. EVERY hand-edited requirement row is copied whole into `audit_log` before
--      the table goes, whichever path it took. No typed word is lost even if a
--      rule above does not apply to it.
--   5. `standard_soa_entries` is dropped.
--
-- Rows never edited by hand (`updated_by IS NULL`) carry no decision — they are
-- the seed's defaults — and are dropped without merging.

ALTER TABLE soa_entries ADD COLUMN implementation_description text;

COMMENT ON COLUMN soa_entries.implementation_description IS
  'How the control is implemented (evidence for the auditor). Distinct from justification, which says why it applies or why it is excluded.';

CREATE TABLE standard_requirement_exclusions (
    standard_control_id uuid PRIMARY KEY REFERENCES standard_controls(id) ON DELETE CASCADE,
    justification       text NOT NULL,
    excluded_by         uuid REFERENCES users(id) ON DELETE SET NULL,
    excluded_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_requirement_exclusion_reason CHECK (btrim(justification) <> '')
);

COMMENT ON TABLE standard_requirement_exclusions IS
  'A standard requirement declared out of scope for that standard, with its reason. The ONLY thing a requirement records for itself: whether it is covered, partly covered or a gap is derived from control_mappings and soa_entries.';

DO $$
DECLARE
  r          record;
  se         soa_entries%ROWTYPE;
  newer      boolean;
  editor     text;
  std_label  text;
  txt        text;
  new_status text;
BEGIN
  FOR r IN
    SELECT sse.*, sc.ref_code, s.name AS standard_name,
           (SELECT count(*) FROM control_mappings cm
             WHERE cm.standard_control_id = sse.standard_control_id) AS n_mapped,
           (SELECT cm.control_id FROM control_mappings cm
             WHERE cm.standard_control_id = sse.standard_control_id LIMIT 1) AS control_id
    FROM standard_soa_entries sse
    JOIN standard_controls sc ON sc.id = sse.standard_control_id
    JOIN standards s          ON s.id  = sc.standard_id
    WHERE sse.updated_by IS NOT NULL
  LOOP
    SELECT full_name INTO editor FROM users WHERE id = r.updated_by;
    std_label := r.standard_name || ' ' || r.ref_code;

    -- (4) Preserve the whole row first, whatever happens to it below.
    INSERT INTO audit_log (entity_type, entity_id, entity_label, action, changes, human_narrative)
    VALUES ('standard_soa_entry', r.standard_control_id, std_label, 'delete',
            jsonb_build_object('applicable', r.applicable, 'drivers', r.drivers,
                               'justification', r.justification,
                               'implementation_status', r.implementation_status,
                               'owner_user_id', r.owner_user_id,
                               'updated_by', r.updated_by, 'updated_at', r.updated_at),
            format('Requirement SoA record for %s retired by migration 0122 (last edited by %s on %s); preserved here in full.',
                   std_label, coalesce(editor, 'an unknown user'), r.updated_at::date));

    IF r.n_mapped = 1 THEN
      SELECT * INTO se FROM soa_entries WHERE control_id = r.control_id;
      IF NOT FOUND THEN
        INSERT INTO soa_entries (control_id, applicable, implementation_status, updated_by, updated_at)
        VALUES (r.control_id, r.applicable, r.implementation_status, r.updated_by, r.updated_at)
        RETURNING * INTO se;
      END IF;

      newer := se.updated_by IS NULL OR r.updated_at > se.updated_at;

      IF newer AND r.applicable IS DISTINCT FROM se.applicable THEN
        UPDATE soa_entries SET applicable = r.applicable WHERE control_id = r.control_id;
        -- Mirror PATCH /soa's control status lifecycle, or the catalogue status
        -- disagrees with the SoA it is derived from.
        UPDATE controls
           SET status = CASE WHEN NOT r.applicable THEN 'not_applicable'
                             WHEN effectiveness IS NOT NULL THEN 'active'
                             ELSE 'under_review' END::control_status,
               updated_at = now()
         WHERE id = r.control_id;
        INSERT INTO audit_log (entity_type, entity_id, entity_label, action, field_name, old_value, new_value, human_narrative)
        VALUES ('soa_entry', r.control_id, std_label, 'update', 'applicable',
                se.applicable::text, r.applicable::text,
                format('Applicability taken from the %s record, edited more recently by %s on %s (migration 0122).',
                       std_label, coalesce(editor, 'an unknown user'), r.updated_at::date));
      END IF;

      IF newer AND r.implementation_status IS DISTINCT FROM se.implementation_status THEN
        UPDATE soa_entries SET implementation_status = r.implementation_status WHERE control_id = r.control_id;
        INSERT INTO audit_log (entity_type, entity_id, entity_label, action, field_name, old_value, new_value, human_narrative)
        VALUES ('soa_entry', r.control_id, std_label, 'update', 'implementation_status',
                se.implementation_status, r.implementation_status,
                format('Implementation status taken from the %s record, edited more recently by %s on %s (migration 0122).',
                       std_label, coalesce(editor, 'an unknown user'), r.updated_at::date));
      END IF;

      txt := NULLIF(btrim(coalesce(r.justification, '')), '');
      IF txt IS NOT NULL THEN
        IF r.applicable THEN
          IF coalesce(se.implementation_description, '') NOT LIKE '%' || txt || '%' THEN
            UPDATE soa_entries
               SET implementation_description = CASE
                     WHEN NULLIF(btrim(coalesce(implementation_description, '')), '') IS NULL THEN txt
                     ELSE implementation_description || E'\n\n' || txt END
             WHERE control_id = r.control_id;
            INSERT INTO audit_log (entity_type, entity_id, entity_label, action, field_name, old_value, new_value, human_narrative)
            VALUES ('soa_entry', r.control_id, std_label, 'update', 'implementation_description',
                    se.implementation_description, txt,
                    format('Implementation description carried over from the %s record written by %s on %s (migration 0122).',
                           std_label, coalesce(editor, 'an unknown user'), r.updated_at::date));
          END IF;
        ELSE
          IF coalesce(se.justification, '') NOT LIKE '%' || txt || '%' THEN
            UPDATE soa_entries
               SET justification = CASE
                     WHEN NULLIF(btrim(coalesce(justification, '')), '') IS NULL THEN txt
                     ELSE justification || E'\n\n' || txt END
             WHERE control_id = r.control_id;
            INSERT INTO audit_log (entity_type, entity_id, entity_label, action, field_name, old_value, new_value, human_narrative)
            VALUES ('soa_entry', r.control_id, std_label, 'update', 'justification',
                    se.justification, txt,
                    format('Exclusion reason carried over from the %s record written by %s on %s (migration 0122).',
                           std_label, coalesce(editor, 'an unknown user'), r.updated_at::date));
          END IF;
        END IF;
      END IF;

      IF coalesce(array_length(r.drivers, 1), 0) > 0 THEN
        UPDATE soa_entries
           SET drivers = ARRAY(SELECT DISTINCT unnest(drivers || r.drivers) ORDER BY 1)
         WHERE control_id = r.control_id;
      END IF;

      IF r.owner_user_id IS NOT NULL AND se.owner_user_id IS NULL THEN
        UPDATE soa_entries SET owner_user_id = r.owner_user_id WHERE control_id = r.control_id;
      END IF;

      IF newer THEN
        UPDATE soa_entries SET updated_by = r.updated_by, updated_at = r.updated_at
         WHERE control_id = r.control_id;
      END IF;

    ELSIF NOT r.applicable AND NULLIF(btrim(coalesce(r.justification, '')), '') IS NOT NULL THEN
      INSERT INTO standard_requirement_exclusions (standard_control_id, justification, excluded_by, excluded_at)
      VALUES (r.standard_control_id, btrim(r.justification), r.updated_by, r.updated_at)
      ON CONFLICT (standard_control_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

DROP TABLE standard_soa_entries;
