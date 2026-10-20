-- v102 — every impact table has an owning department, including org-wide ones.
--
-- RATIONALE. `impact_tables` made one column do two jobs. `department_id` was
-- simultaneously "who owns this" and "which department does this apply to", and
-- a CHECK enforced the collapse:
--
--     CONSTRAINT scope_dept_check CHECK (
--       ((scope = 'organisation') AND (department_id IS NULL)) OR
--       ((scope = 'department')   AND (department_id IS NOT NULL)))
--
-- So an organisation-scope table could not have an owner. Not an oversight in
-- the data — the database refused to record one. Nine of the eighteen tables on
-- the training instance therefore showed a blank Department column, which reads
-- as missing data because, in accountability terms, it IS missing: an impact
-- scale is a governance artefact, and "applies to everyone" is not the same
-- statement as "belongs to nobody".
--
-- `business_services` already models this correctly — department_id NOT NULL for
-- the owner, is_shared for reach — so sharing and ownership are separate axes
-- there. This brings impact tables into line:
--
--     department_id  →  WHO OWNS IT          (now NOT NULL, every scope)
--     scope          →  HOW FAR IT REACHES   (organisation-wide, or that dept)
--
-- Ownership deliberately does NOT become a visibility restriction. The list
-- query keeps returning organisation-scope tables to every department
-- (`WHERE scope = 'organisation' OR department_id = <caller>`), and
-- `alwaysInScope` on the frontend filter keeps them inside a "My Dept" view.
-- Owning a table means being accountable for it, not gatekeeping it.
--
-- BACKFILL. Existing organisation-scope tables have no provenance to recover —
-- `created_by` is NULL on all of them, because they arrived through the CSV
-- importer. The owner is therefore assigned by policy, in priority order:
-- the CISO's department first (the CISO owns the impact scale, and
-- POST /bil/impact-tables already restricts organisation-scope creation to
-- ciso/siro/admin), then the SIRO's, then an admin's, then the first department
-- by name. If an install has organisation-scope tables and no departments at
-- all, the migration stops with an explicit message rather than inventing one.

-- ── 1. Assign an owner to every organisation-scope table ─────────────────────
-- Drop the constraint first: it forbids the very UPDATE we need to make.
ALTER TABLE impact_tables DROP CONSTRAINT IF EXISTS scope_dept_check;

UPDATE impact_tables
   SET department_id = COALESCE(
         (SELECT u.department_id FROM users u
           WHERE u.role = 'ciso'  AND u.is_active AND u.department_id IS NOT NULL
           ORDER BY u.created_at LIMIT 1),
         (SELECT u.department_id FROM users u
           WHERE u.role = 'siro'  AND u.is_active AND u.department_id IS NOT NULL
           ORDER BY u.created_at LIMIT 1),
         (SELECT u.department_id FROM users u
           WHERE u.role = 'admin' AND u.is_active AND u.department_id IS NOT NULL
           ORDER BY u.created_at LIMIT 1),
         (SELECT d.id FROM departments d ORDER BY d.name LIMIT 1)
       ),
       updated_at = now()
 WHERE department_id IS NULL;

-- ── 2. Refuse to continue silently if anything is still ownerless ────────────
-- Only reachable on an install that has impact tables but no departments at
-- all. Guessing there would defeat the point of the migration.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM impact_tables WHERE department_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'v102: % impact table(s) have no owning department and none could be '
      'derived (no CISO, SIRO or admin with a department, and no departments '
      'exist). Create a department and assign these tables before migrating.', n;
  END IF;
END $$;

-- ── 3. Ownership is now mandatory at every scope ─────────────────────────────
ALTER TABLE impact_tables ALTER COLUMN department_id SET NOT NULL;

COMMENT ON COLUMN impact_tables.department_id IS
  'Owning department — accountable for this table. Required at every scope; '
  'organisation-scope tables are owned by one department but apply to all. '
  'Reach is expressed by `scope`, not by this column (v102).';
