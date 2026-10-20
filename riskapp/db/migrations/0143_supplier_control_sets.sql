-- 0143 — the control objectives each kind of supplier relationship is expected
--        to meet (docs/supplier-model.md, step 2)
--
-- WHY. Onshore contractors, a company operating our network, a SaaS provider
-- and a software vendor are different risks and need different controls. The
-- owner set starting lists from NIST CSF 2.0 and will replace them with better
-- custom objectives later (decision 4) — so the sets are DATA, editable by
-- whoever holds controls.write, not code.
--
-- THE SHAPE. `supplier_type_objectives` maps a kind of relationship to a control
-- objective. `applies_to = 'all'` is the supplier programme itself (GV.SC-01…10,
-- ID.AM-04), expected of every relationship. A relationship's set is DERIVED —
-- `v_supplier_relationship_objectives`, 'all' plus its own type's — never
-- copied onto the relationship, so editing a set reaches every relationship at
-- once and nothing can drift.
--
-- HOW AN OBJECTIVE IS MET — evidence only (owner, 2026-09-30, decision 8): a
-- report or terms in the contract, recorded in step 3. Nothing here says
-- whether an objective is met; this migration only says what is expected.
--
-- SEEDING. On an existing install the NIST catalogue is already loaded, so the
-- migration seeds the sets now. On a FRESH install the migrations run before
-- db/seed.js loads the catalogue, so seed.js calls the same function straight
-- after loading it. Both paths only ever seed alongside the catalogue load —
-- never on every boot — so an objective an organisation deliberately removed
-- stays removed (the capabilities re-seed trap, CLAUDE.md "Known issues").

CREATE TABLE supplier_type_objectives (
  applies_to  TEXT NOT NULL
    CHECK (applies_to IN ('all', 'onshore', 'contracted_service', 'service_provider', 'product')),
  control_id  UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (applies_to, control_id)
);
CREATE INDEX idx_sto_control ON supplier_type_objectives (control_id);

COMMENT ON TABLE supplier_type_objectives IS
  'Which control objectives a kind of supplier relationship is expected to meet; applies_to=all is every supplier. Editable data (v143, docs/supplier-model.md step 2).';

-- The owner's starting sets (docs/supplier-model.md §5), resolved through the
-- bundled NIST CSF mapping. An objective the install does not have is skipped,
-- not invented. Idempotent.
CREATE OR REPLACE FUNCTION seed_supplier_type_objectives()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO supplier_type_objectives (applies_to, control_id)
  SELECT DISTINCT d.applies_to, cm.control_id
    FROM (VALUES
      ('all','GV.SC-01'), ('all','GV.SC-02'), ('all','GV.SC-03'), ('all','GV.SC-04'), ('all','GV.SC-05'),
      ('all','GV.SC-06'), ('all','GV.SC-07'), ('all','GV.SC-08'), ('all','GV.SC-09'), ('all','GV.SC-10'),
      ('all','ID.AM-04'),
      ('onshore','GV.RR-04'), ('onshore','PR.AA-01'), ('onshore','PR.AA-02'), ('onshore','PR.AA-05'),
      ('onshore','PR.AT-01'), ('onshore','DE.CM-03'),
      ('contracted_service','PR.AA-05'), ('contracted_service','DE.CM-06'), ('contracted_service','PR.PS-04'),
      ('contracted_service','GV.SC-08'), ('contracted_service','GV.SC-10'),
      ('service_provider','ID.RA-10'), ('service_provider','PR.DS-01'), ('service_provider','PR.DS-02'),
      ('service_provider','PR.DS-11'), ('service_provider','RC.RP-01'), ('service_provider','GV.SC-10'),
      ('product','ID.RA-10'), ('product','ID.RA-01'), ('product','PR.PS-02'), ('product','ID.AM-02')
    ) AS d(applies_to, ref)
    JOIN standard_controls sc ON sc.ref_code = d.ref
    JOIN standards st         ON st.id = sc.standard_id AND st.code = 'nist_csf'
    JOIN control_mappings cm  ON cm.standard_control_id = sc.id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

SELECT seed_supplier_type_objectives();

-- A relationship's expected set: the programme ('all') plus its own type's. An
-- objective in both is one row, with both sources named.
CREATE VIEW v_supplier_relationship_objectives AS
SELECT sr.id AS relationship_id,
       sto.control_id,
       array_agg(sto.applies_to ORDER BY sto.applies_to = 'all', sto.applies_to) AS sources
  FROM supplier_relationships sr
  JOIN supplier_type_objectives sto
    ON sto.applies_to = 'all' OR sto.applies_to = sr.relationship_type
 GROUP BY sr.id, sto.control_id;

COMMENT ON VIEW v_supplier_relationship_objectives IS
  'The control objectives a supplier relationship is expected to meet: every-supplier plus its type''s set. Derived, never copied (v143).';
