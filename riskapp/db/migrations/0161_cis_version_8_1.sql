-- v161: CIS Controls registered as v8.1, the version CIRKS's own control
-- objectives are mapped to (owner, 2026-10-28). The code stays cis_v8: it is an
-- identifier other rows and URLs use, not a label. The boot seed never
-- overwrites a registry row, so an existing install changes only here.
UPDATE standards SET version = 'v8.1', updated_at = now()
 WHERE code = 'cis_v8' AND version = 'v8';
