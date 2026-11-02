-- v163: the starting supplier control sets name CIRKS objectives.
--
-- seed_supplier_type_objectives() (v143) resolved the owner's starting sets
-- through the NIST CSF mapping. With CIRKS objectives mapped onto NIST that would
-- give each supplier type EVERY CIRKS objective mapped to each NIST code. The
-- sets are now stated in CIRKS objectives directly, translated from the v143
-- NIST list with the primaries the owner approved on 2026-10-28 (32 NIST entries
-- fold into 28), plus two the owner added on 2026-10-29 that NIST had no
-- equivalent for: a contracted service's access is contained (SCM-10) and its
-- activity monitored (SCM-09). The function still skips an objective the install does not
-- have, so on an install whose library is NIST it seeds nothing; it runs only
-- from db/seed.js, after a fresh install's catalogue is loaded, never on boot.
CREATE OR REPLACE FUNCTION seed_supplier_type_objectives()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO supplier_type_objectives (applies_to, control_id)
  SELECT DISTINCT d.applies_to, c.id
    FROM (VALUES
      ('all','CIRKS1.SCM-01'), ('all','CIRKS1.SCM-02'), ('all','CIRKS1.SCM-03'), ('all','CIRKS1.SCM-04'),
      ('all','CIRKS1.SCM-05'), ('all','CIRKS1.SCM-07'), ('all','CIRKS1.IR-01'),
      ('onshore','CIRKS1.PER-02'), ('onshore','CIRKS1.IDA-01'), ('onshore','CIRKS1.IDA-03'),
      ('onshore','CIRKS1.AA-03'), ('onshore','CIRKS1.SAT-01'), ('onshore','CIRKS1.DM-07'),
      ('contracted_service','CIRKS1.AA-03'), ('contracted_service','CIRKS1.DM-05'), ('contracted_service','CIRKS1.DM-09'),
      ('contracted_service','CIRKS1.IR-01'), ('contracted_service','CIRKS1.SCM-07'),
      ('contracted_service','CIRKS1.SCM-10'), ('contracted_service','CIRKS1.SCM-09'),
      ('service_provider','CIRKS1.SCM-03'), ('service_provider','CIRKS1.DCH-04'), ('service_provider','CIRKS1.DCH-05'),
      ('service_provider','CIRKS1.BRR-02'), ('service_provider','CIRKS1.BRR-06'), ('service_provider','CIRKS1.SCM-07'),
      ('product','CIRKS1.SCM-03'), ('product','CIRKS1.SVM-02'), ('product','CIRKS1.SVM-03'), ('product','CIRKS1.EST-02')
    ) AS d(applies_to, ref)
    JOIN controls c ON c.reference_code = d.ref
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
