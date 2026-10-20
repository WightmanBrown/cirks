-- 0134 — the first finding, end to end: an asset not rated against every
--        mandatory impact table (docs/assurance-findings.md §11 step 2)
--
-- WHY THIS ONE. The owner's choice, 2026-09-28. It is a real worklist — 43 of 44
-- assets on CIRKS-test miss at least one mandatory table — and it matters beyond
-- tidiness: recomputeAssetCia takes MAX over whatever ratings exist, so a missing
-- mandatory table can only UNDERSTATE an asset's impact, and that flows into
-- systems.impact_* and every risk score on those systems.
--
-- DERIVE THE FINDING, STORE THE RESPONSE. `v_asset_rating_findings` is the
-- finding: a query, never a table, so it closes itself the moment the last
-- mandatory table is rated. It uses exactly the definition the asset list's
-- "not fully rated" chip already uses (routes/assets: every `mandatory` impact
-- table, against every active asset, no exemptions — decided 2026-09-16), so the
-- chip, the finding and the action cannot disagree about which assets are
-- incomplete. The response is a security action with origin `rating_incomplete`
-- and the asset as its subject (v133).
--
-- RATED MEANS A LEVEL. Linking a table to an asset (POST /assets/:id/impact-tables)
-- writes an asset_impact_ratings row with NO level, and the chip counted any row
-- — so a mandatory table merely linked read as rated, and an action could have
-- been closed by linking the table without rating anything. recomputeAssetCia
-- takes MAX over levels, so a level-less row contributes nothing to impact; it
-- must count as nothing here too. None exist today (0 of 66 rows on CIRKS-test),
-- so this changes no current answer; the chip in routes/assets is corrected to
-- the same rule in the same change.
--
-- DONE MEANS FIXED (owner, 2026-09-28). Such an action cannot be completed while
-- the asset still misses a mandatory table. Enforced by trigger rather than in
-- the route so that no path — an API call, a hand-run UPDATE — can close the
-- action on a problem that is still there. The derived finding is the evidence;
-- a status someone set is not.
--
-- ONE OPEN ACTION PER FINDING. Two live actions against the same asset for the
-- same reason is a duplicate, not extra effort: whoever completes one leaves the
-- other open against a finding that no longer exists.
--
-- WHO MAY RAISE ONE (owner, 2026-09-28): the asset's IAM or IAO, the CISO and the
-- risk analysts — a new capability, `findings.act`. The department restriction
-- for IAM/IAO is the seat gate (assertWriteScope) in the route, as for every
-- other departmental write. Accepting it stays `actions.adopt` (admin, CISO —
-- exactly who accepts a risk action): a nonconformity is no different from a
-- risk in that respect, so it gets no second authority to maintain.

CREATE VIEW v_asset_rating_findings AS
SELECT ia.id                AS asset_id,
       ia.name              AS asset_name,
       ia.department_id,
       ia.is_shared,
       ia.owner_user_id,
       ia.managed_by_user_id,
       (SELECT COUNT(*) FROM impact_tables t WHERE t.mandatory)::int     AS mandatory_total,
       COUNT(*)::int                                                     AS missing_count,
       ARRAY_AGG(mt.id   ORDER BY mt.name)                               AS missing_table_ids,
       ARRAY_AGG(mt.name ORDER BY mt.name)                               AS missing_table_names,
       -- "Never rated" is an untouched backlog item; "partial" is an asset
       -- someone believed they had finished. Different conversations.
       CASE WHEN EXISTS (SELECT 1 FROM asset_impact_ratings a WHERE a.asset_id = ia.id
                           AND COALESCE(a.rated_level, a.c_level, a.i_level, a.a_level) IS NOT NULL)
            THEN 'partial' ELSE 'never_rated' END                        AS band,
       (SELECT MAX(a.rated_at) FROM asset_impact_ratings a WHERE a.asset_id = ia.id) AS last_rated_at
  FROM information_assets ia
  JOIN impact_tables mt ON mt.mandatory
 WHERE ia.is_active
   AND NOT EXISTS (SELECT 1 FROM asset_impact_ratings air
                    WHERE air.asset_id = ia.id AND air.impact_table_id = mt.id
                      AND COALESCE(air.rated_level, air.c_level, air.i_level, air.a_level) IS NOT NULL)
 GROUP BY ia.id;

COMMENT ON VIEW v_asset_rating_findings IS
  'Finding: an active information asset not rated against every mandatory impact table. Derived; closes itself when the last one is rated (v134).';

CREATE UNIQUE INDEX uq_sa_open_finding_action
  ON security_actions (origin, subject_type, subject_id)
  WHERE subject_id IS NOT NULL
    AND status NOT IN ('completed', 'cancelled', 'verified', 'rejected');

CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
BEGIN
  IF NEW.origin = 'rating_incomplete' THEN
    SELECT f.missing_table_names INTO missing
      FROM v_asset_rating_findings f WHERE f.asset_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'the asset is still not rated against: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sa_finding_resolved_before_complete
  BEFORE UPDATE OF status ON security_actions
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_sa_finding_resolved_before_complete();

-- The capability. Catalogue row always; grants only on an existing install — on a
-- fresh one role_permissions is empty here and db/seed.js grants from
-- src/auth/capabilityDefaults.js (CLAUDE.md, v109/v113).
INSERT INTO capabilities (key, resource, action, dept_scopable, description)
VALUES ('findings.act', 'findings', 'act', TRUE,
        'Raise a security action against an assurance finding (own department for IAM/IAO)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role::user_role, 'findings.act', r.scope
  FROM (VALUES ('ciso', 'all_depts'), ('risk_analyst', 'all_depts'),
               ('information_asset_manager', 'own_dept'),
               ('information_asset_owner', 'own_dept')) AS r(role, scope)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
