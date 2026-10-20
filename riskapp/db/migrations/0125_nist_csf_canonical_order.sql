-- 0125 — NIST CSF requirements sort in the CSF's own order
--
-- WHY. Every NIST CSF 2.0 requirement was loaded with a sort_index built from the
-- digits of its reference alone, so GV.OC-01, ID.AM-01 and DE.CM-01 all got
-- 000.001.000. Ordering by it interleaved the sections, and v122 fell back to a
-- natural sort on the reference, which keeps each section together but puts the
-- functions in ALPHABETICAL order (DE, GV, ID, PR, RC, RS) instead of the CSF's
-- (GV, ID, PR, DE, RS, RC) — the order every CSF document and auditor uses.
--
-- The canonical category order is the order of the bundled NIST CPRT export
-- (riskapp/db/seed/nist_csf_catalogue.sql), 22 categories. sort_index becomes
-- "<category position>.<subcategory number>", e.g. GV.OC-01 → 01.001,
-- RC.CO-04 → 22.004. db/seed/nist_csf_catalogue.sql applies the same rule for
-- fresh installs.

UPDATE standard_controls sc
   SET sort_index = lpad(array_position(ARRAY[
         'GV.OC','GV.RM','GV.RR','GV.PO','GV.OV','GV.SC',
         'ID.AM','ID.RA','ID.IM',
         'PR.AA','PR.AT','PR.DS','PR.PS','PR.IR',
         'DE.CM','DE.AE',
         'RS.MA','RS.AN','RS.CO','RS.MI',
         'RC.RP','RC.CO'], split_part(sc.ref_code, '-', 1))::text, 2, '0')
       || '.' || lpad(split_part(sc.ref_code, '-', 2), 3, '0'),
       updated_at = now()
  FROM standards s
 WHERE s.id = sc.standard_id
   AND s.code = 'nist_csf'
   AND array_position(ARRAY[
         'GV.OC','GV.RM','GV.RR','GV.PO','GV.OV','GV.SC',
         'ID.AM','ID.RA','ID.IM',
         'PR.AA','PR.AT','PR.DS','PR.PS','PR.IR',
         'DE.CM','DE.AE',
         'RS.MA','RS.AN','RS.CO','RS.MI',
         'RC.RP','RC.CO'], split_part(sc.ref_code, '-', 1)) IS NOT NULL;
