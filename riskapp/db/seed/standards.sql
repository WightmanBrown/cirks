-- SPDX-License-Identifier: Apache-2.0
-- Copyright (C) 2026 Wightman Brown Limited
-- CIRKS standards registry (the four SoA lenses). Reference data.
--
-- ONLY NIST CSF 2.0 ships with control text (see nist_csf_catalogue.sql) — it is
-- a US Government work in the public domain. Every other standard is registered
-- as an IMPORT-ONLY lens: the row names the standard so an organisation can load
-- its own licensed copy, and CIRKS distributes none of its text. ISO/IEC 27001
-- Annex A is copyrighted; CIS is CC BY-NC-SA 4.0, whose non-commercial term is
-- incompatible with redistribution here. Idempotent on code — note that means
-- edits to this file never reach an existing install, so changes to these rows
-- need an accompanying migration.
INSERT INTO standards (id, code, name, version, publisher, description, is_active, is_enabled, license, sort_index, bundled) VALUES
  ('bc627a9f-4e44-4f95-b39e-04fbc6fc6ebd','iso27001','ISO/IEC 27001','2022','ISO/IEC','Information security management systems — requirements',TRUE,TRUE,'Copyrighted (ISO) — no text distributed; import your own licensed copy',1,FALSE),
  ('405e1fcc-331e-4a0b-9da0-3f3f107ef641','cis_v8','CIS Critical Security Controls','v8','Center for Internet Security','Prioritised set of cyber defence actions',TRUE,TRUE,'CC BY-NC-SA 4.0 (non-commercial) — no text distributed; import your own copy',2,FALSE),
  ('4e501484-2f9b-4ffe-8755-db9ed81ea256','nist_csf','NIST Cybersecurity Framework','2.0','NIST','Framework for improving critical infrastructure cybersecurity',TRUE,TRUE,'Public domain (US Government work)',3,TRUE),
  ('128f5d84-ece6-4c9c-8951-48883ff3628a','nist_800_53','NIST SP 800-53','Rev 5','NIST','',TRUE,TRUE,'Public domain (US Government work) — no text distributed; import your own copy',4,FALSE)
ON CONFLICT (code) DO NOTHING;
