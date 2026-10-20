-- 0129 — a per-system control's implementation status is DERIVED, not typed
--
-- WHY. soa_entries.implementation_status was a hand-maintained summary of facts the
-- database already holds, and it decayed the way such summaries do. Measured on
-- CIRKS-test (2026-09-22), among the 71 adopted controls not delivered
-- organisation-wide or for a group: 41 stated "implemented", of which 16 were
-- deployed on no system at all, while 34 of the 38 that ARE deployed are degraded
-- on at least one system. docs/statement-of-applicability.md §4.5,
-- docs/security-action-scopes.md §10.
--
-- WHICH CONTROLS (owner, 2026-09-22). Only a control delivered ON EACH SYSTEM
-- (controls.delivery = 'system') has facts to derive from. For a control delivered
-- organisation-wide or for a group the stated status IS the observation — v128
-- already treats it as the control's status on every system it reaches — so it
-- stays stated. A control whose mode is NOT STATED also keeps its stated value,
-- flagged: deriving it would call the 16 incident-handling and risk-assessment
-- objectives "not implemented" when they are organisational processes whose mode
-- was simply never set.
--
-- THE DENOMINATOR (owner, 2026-09-22). "Every system it should be on" is taken as
-- the systems carrying an identified threat the control treats
-- (system_threats ∩ control_threats), within where the objective applies (its
-- scopes), less systems where it is excluded with a reason (v117). So
-- "implemented" means implemented FOR THE RISKS WE HAVE IDENTIFIED — the read-out
-- says so. Coverage over where it applies (the scope denominator) is returned
-- beside it, not folded in: with no scopes drawn that is every active system, and
-- 0 of 71 controls would be implemented.
--
-- THE RULE. Present on a system = operational or degraded, as the risk
-- calculation counts it.
--   implemented      present on every denominator system, degraded on none
--   partial          present somewhere, and short of that: its reasons say which —
--                    'coverage' (missing from denominator systems) and/or
--                    'health' (degraded somewhere). Never shown bare.
--   planned          present nowhere, but an open action item targets it
--   not_implemented  present nowhere, nothing planned
-- A deployed control that treats no identified threat (a baseline attachment) is
-- judged over the systems it is on: implemented unless degraded somewhere.
-- 'unknown' is NOT in place — the risk calculation does not count it either, and a
-- status that did would contradict the scores. It is returned separately
-- (threat_systems_unknown) because it needs checking, not deploying: on CIRKS-test
-- 90 of the 159 at-risk gaps are 'unknown', 64 'missing', 4 have no record.
-- Delivering components are deliberately NOT a reason: 373 of 425 controls read
-- "needs improvement" today only because their component records have drifted,
-- and a status that fails for bookkeeping is not believed.
--
-- The stored column stays: it is the stated value for organisation-wide, group and
-- not-stated controls, and the frozen value belongs in an approved SoA version.

CREATE VIEW v_control_implementation AS
WITH present AS (
  SELECT sc.control_id, sc.system_id, sc.status
    FROM system_controls sc
    JOIN systems s ON s.id = sc.system_id AND s.is_active
   WHERE sc.status IN ('operational', 'degraded')
),
denominator AS (
  SELECT DISTINCT ct.control_id, st.system_id
    FROM control_threats ct
    JOIN system_threats st ON st.threat_id = ct.threat_id
    JOIN systems s         ON s.id = st.system_id AND s.is_active
    JOIN v_objective_expected_systems e
                           ON e.control_id = ct.control_id AND e.system_id = st.system_id
   WHERE NOT EXISTS (SELECT 1 FROM system_controls x
                      WHERE x.control_id = ct.control_id AND x.system_id = st.system_id
                        AND x.status = 'not_applicable')
),
facts AS (
  -- COALESCE, not a bare comparison: a NULL (not stated) delivery must give FALSE.
  -- `delivery = 'system'` alone is NULL there, `NOT NULL` is NULL too, and the
  -- status CASE would fall through to deriving a control nobody said is per-system.
  SELECT c.id AS control_id, c.delivery, se.implementation_status AS stated,
         (COALESCE(c.delivery, '') = 'system' AND COALESCE(se.applicable, FALSE)) AS derives,
         (SELECT count(*) FROM denominator d WHERE d.control_id = c.id)::int AS threat_systems,
         (SELECT count(*) FROM denominator d JOIN present p
             ON p.control_id = d.control_id AND p.system_id = d.system_id
           WHERE d.control_id = c.id)::int                                  AS threat_systems_present,
         -- At-risk systems where its state was never recorded: a check, not a
         -- deployment, is what closes these, so the read-out names them apart.
         (SELECT count(*) FROM denominator d JOIN system_controls x
             ON x.control_id = d.control_id AND x.system_id = d.system_id AND x.status = 'unknown'
           WHERE d.control_id = c.id)::int                                  AS threat_systems_unknown,
         (SELECT count(*) FROM present p WHERE p.control_id = c.id)::int    AS present_systems,
         (SELECT count(*) FROM present p WHERE p.control_id = c.id AND p.status = 'degraded')::int AS degraded_systems,
         (SELECT count(*) FROM v_objective_expected_systems e WHERE e.control_id = c.id)::int AS expected_systems,
         (SELECT count(*) FROM v_objective_expected_systems e JOIN present p
             ON p.control_id = e.control_id AND p.system_id = e.system_id
           WHERE e.control_id = c.id)::int                                  AS expected_systems_present,
         EXISTS (SELECT 1 FROM security_action_items i
                   JOIN security_actions sa ON sa.id = i.action_id
                  WHERE i.control_id = c.id AND i.element_type = 'control'
                    AND i.status IN ('pending', 'in_progress')
                    AND sa.status NOT IN ('completed', 'cancelled'))         AS work_planned
    FROM controls c
    JOIN soa_entries se ON se.control_id = c.id
)
SELECT f.control_id,
       CASE WHEN f.derives THEN 'derived' ELSE 'stated' END AS status_source,
       CASE
         WHEN NOT f.derives THEN f.stated
         WHEN f.present_systems = 0 THEN CASE WHEN f.work_planned THEN 'planned' ELSE 'not_implemented' END
         WHEN f.degraded_systems > 0
           OR (f.threat_systems > 0 AND f.threat_systems_present < f.threat_systems) THEN 'partial'
         ELSE 'implemented'
       END AS implementation_status,
       CASE WHEN f.derives AND f.present_systems > 0 THEN
         array_remove(ARRAY[
           CASE WHEN f.threat_systems > 0 AND f.threat_systems_present < f.threat_systems THEN 'coverage' END,
           CASE WHEN f.degraded_systems > 0 THEN 'health' END], NULL)
       ELSE '{}'::text[] END AS partial_reasons,
       f.threat_systems, f.threat_systems_present, f.threat_systems_unknown, f.present_systems, f.degraded_systems,
       f.expected_systems, f.expected_systems_present, f.work_planned,
       (f.delivery IS NULL) AS delivery_not_stated
  FROM facts f;

COMMENT ON VIEW v_control_implementation IS
  'Effective implementation status per SoA entry (v129): DERIVED for adopted controls delivered on each system (over the systems carrying an identified threat they treat, within scope, less exclusions; partial carries coverage/health reasons), STATED otherwise. Coverage over where the objective applies is returned beside it.';
