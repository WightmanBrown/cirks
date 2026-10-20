-- 0089 — per-system control & component status  (design note: docs/per-system-control-status.md)
--
-- WHY. A threat "affects" a system when a needed control is missing/degraded on it,
-- OR a component that delivers a control is missing/degraded on it. Until now the
-- per-system link tables recorded only PRESENCE (a row = it's deployed) plus a
-- per-system control MATURITY; component health was enterprise-wide only
-- (control_components.status), so "this component is degraded ON THIS SYSTEM" could
-- not be expressed. This adds a per-system STATUS to both link tables so a gap is a
-- first-class fact at two levels — control-on-system and component-on-system.
--
-- MODEL. One shared status vocabulary for both a control-on-a-system and a
-- component-on-a-system. 'planned' is deliberately NOT in the enum: it is derived on
-- read from an OPEN security_action linked to the element, so it can never go stale.
-- Maturity becomes an ORGANISATION-WIDE concept (a property of the control); the
-- per-system system_controls.maturity is retired in a LATER migration, once its
-- readers (the rating UIs, the v83 maturity ceiling, apply_verified_action_target)
-- have been moved onto status. This migration is deliberately ADDITIVE and
-- non-breaking — maturity is kept for now and nothing reads `status` yet.
--
-- SEED / BACKFILL. control_components.status is retained as the catalogue "seed
-- default" — the status a component gets when first provisioned onto a system (so a
-- known-degraded appliance starts degraded). Existing rows are backfilled from it
-- here. Existing deployed controls (a system_controls row exists) that carry a
-- maturity are treated as 'operational' (they were considered in place); an unrated
-- deployed control is 'unknown' (recorded but not yet assessed).

CREATE TYPE system_element_status AS ENUM ('operational', 'degraded', 'missing', 'unknown');

ALTER TABLE system_controls
  ADD COLUMN status system_element_status NOT NULL DEFAULT 'unknown';

ALTER TABLE system_components
  ADD COLUMN status system_element_status NOT NULL DEFAULT 'unknown';

-- Existing deployed controls: rated ⇒ presumed operational, unrated ⇒ unknown.
UPDATE system_controls
   SET status = CASE WHEN maturity IS NOT NULL THEN 'operational'::system_element_status
                     ELSE 'unknown'::system_element_status END;

-- Existing components: seed from the catalogue status. Shared values map straight
-- through; decommissioned ⇒ missing; planned/anything-else ⇒ unknown (planned is a
-- derived per-system state, never a stored value).
UPDATE system_components sc
   SET status = CASE cc.status
                  WHEN 'operational'    THEN 'operational'::system_element_status
                  WHEN 'degraded'       THEN 'degraded'::system_element_status
                  WHEN 'decommissioned' THEN 'missing'::system_element_status
                  ELSE 'unknown'::system_element_status
                END
  FROM control_components cc
 WHERE cc.id = sc.component_id;
