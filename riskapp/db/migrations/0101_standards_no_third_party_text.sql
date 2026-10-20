-- v101 — CIRKS distributes no third-party standard text except NIST.
--
-- RATIONALE. The standards registry advertised ISO/IEC 27001 and NIST SP 800-53
-- as `bundled = TRUE`. Neither has ever had a single row in `standard_controls`
-- — only NIST CSF 2.0 does (106). So the flag was simply wrong, and it drove a
-- "bundled" tag in the control-sets UI that promised content CIRKS does not have
-- and, for ISO, must not ship: Annex A is copyrighted. CIS was already correctly
-- marked import-only (CC BY-NC-SA 4.0, whose non-commercial term rules out
-- redistribution in a commercial product anyway).
--
-- The registry ROWS stay. Naming a standard is not reproducing it, and the row
-- is what lets an organisation import its own licensed copy — the standard is a
-- lens you may load at your discretion, not content we withhold. Only the claim
-- that we ship the text is removed.
--
-- This is a migration and not just a seed edit because `db/seed/standards.sql`
-- is `INSERT … ON CONFLICT DO NOTHING`: edits there reach a FRESH database only,
-- and would silently never arrive on an existing install. Same trap as v98's
-- capability re-seed. Both files are changed together.
--
-- Related: the paraphrased Annex A catalogue was removed from
-- schema/v81_statement_of_applicability.sql at the same time. That file is
-- pre-baseline reference the runner never executes, so its removal changes no
-- running system — but it would have shipped with a public clone.

UPDATE public.standards
   SET bundled = FALSE,
       license = 'Copyrighted (ISO) — no text distributed; import your own licensed copy'
 WHERE code = 'iso27001';

UPDATE public.standards
   SET bundled = FALSE,
       license = 'Public domain (US Government work) — no text distributed; import your own copy'
 WHERE code = 'nist_800_53';

UPDATE public.standards
   SET license = 'CC BY-NC-SA 4.0 (non-commercial) — no text distributed; import your own copy'
 WHERE code = 'cis_v8';

-- Belt and braces: if any install ever acquired ISO control text (an early
-- build, a hand-run schema/v81), it is not ours to hold. Deliberately scoped to
-- ISO only — an organisation's OWN imported copy lives in the same table, so
-- this runs once against the seeded rows and finds nothing on a clean install.
DELETE FROM public.standard_controls sc
 USING public.standards s
 WHERE s.id = sc.standard_id
   AND s.code = 'iso27001'
   AND sc.created_at < '2026-08-13'::date;
