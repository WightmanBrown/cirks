-- 0127 — how a control is delivered: organisation-wide, for a group, or on each system
--
-- WHY. Scopes (v126) made the read-out say "on X of N systems where it applies",
-- and at once GV.OC-01 — met by a policy and a process — read "on 0 of 39". The
-- count was honest: nothing told the model the control is organisational. On
-- CIRKS-test all 31 NIST governance objectives are on 0 systems and linked to 0
-- threats, and PR.AT-01 (awareness training for everyone) had been attached BY
-- HAND to 21 of 51 systems so it would count at all. The only way to model a
-- control that is not per-system was to attach it system by system.
-- docs/statement-of-applicability.md §4.8.
--
-- WHAT. controls.delivery, one of:
--   organisation — delivered once for everyone; reaches every system where the
--                  objective applies (its scopes, or the whole organisation)
--   group        — delivered to a group of people, modelled as a PEOPLE component
--                  linked to the control; reaches the systems where that group is
--                  present (system_components), within where the objective applies
--   system       — deployed and checked system by system (system_controls), as now
-- Exactly one per control: it keeps the model honest by preventing mixed modes
-- (owner, 2026-09-22). A baseline for everyone plus extra for a group is two
-- objectives, as the NIST CSF does with PR.AT-01 and PR.AT-02.
--
-- NULL = NOT STATED. Never defaulted: a default would read as a decision nobody
-- made (the failure of item targets, the mandatory flag and control owners). Until
-- stated, a control reaches where it is deployed — exactly today's behaviour — and
-- the read-out says the mode is not stated.
--
-- v_control_reach is the single derivation of "the systems this control reaches".
-- It changes NO calculation yet: the risk calculation still reads system_controls.
-- Counting organisation-wide and group controls on every system they reach moves
-- risk scores, so that change is measured and brought to the owner first, with the
-- training dataset corrected in the same change (owner, 2026-09-22).

ALTER TABLE controls ADD COLUMN delivery text;
ALTER TABLE controls ADD CONSTRAINT chk_controls_delivery
  CHECK (delivery IS NULL OR delivery IN ('organisation', 'group', 'system'));

COMMENT ON COLUMN controls.delivery IS
  'How the control is delivered: organisation | group | system; NULL = not stated (never defaulted). One mode per control (v127).';

CREATE VIEW v_control_reach AS
-- On each system — and not stated, which behaves as today: where it is deployed.
SELECT syc.control_id, syc.system_id, 'deployed'::text AS via
  FROM system_controls syc
  JOIN controls c ON c.id = syc.control_id
 WHERE syc.status <> 'not_applicable'
   AND (c.delivery IS NULL OR c.delivery = 'system')
UNION
-- Organisation-wide: everywhere the adopted objective applies.
SELECT e.control_id, e.system_id, 'organisation'
  FROM v_objective_expected_systems e
  JOIN controls c ON c.id = e.control_id AND c.delivery = 'organisation'
UNION
-- For a group: where the objective applies AND one of its people groups is present.
SELECT e.control_id, e.system_id, 'group'
  FROM v_objective_expected_systems e
  JOIN controls c ON c.id = e.control_id AND c.delivery = 'group'
 WHERE EXISTS (
   SELECT 1
     FROM control_component_links l
     JOIN control_components cc ON cc.id = l.component_id AND cc.component_type = 'people'
     JOIN system_components sc ON sc.component_id = cc.id AND sc.system_id = e.system_id
    WHERE l.control_id = c.id);

COMMENT ON VIEW v_control_reach IS
  'The systems each control reaches, by its delivery mode (v127): deployed (system / not stated), organisation (where it applies), group (where it applies and its people group is present). Not yet read by the risk calculation.';
