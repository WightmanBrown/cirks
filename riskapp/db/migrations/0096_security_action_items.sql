-- 0096 — security_action_items + CISO-accept snapshot (gap-driven actions, step 1)
--
-- WHY. Security actions are being rebuilt to be gap-driven (docs/security-actions.md):
-- an action becomes a CONTAINER of ITEMS, each item = one remediation unit (one
-- control or component, on one system, add-or-improve) with its own Responsible
-- owner, target, status and context comment. This replaces the plain M:M
-- security_action_controls / security_action_components link tables (which carried
-- only `notes` — no per-item owner, system, change kind, or target) so that one
-- action can span multiple teams and complete incrementally.
--
-- This migration is SCHEMA ONLY (the new table + the accept-snapshot columns). The
-- generation-from-gap, CISO-accept, and per-item-completion→operational mechanics
-- are API-layer (step 2), mirroring how the current verify flow flips status in the
-- route rather than a trigger. The legacy link tables + per-action target_residual
-- columns are retired in a later phase once nothing reads them.
--
-- OWNERS reuse existing columns (no new owner columns): item owner default = the
-- system owner (systems.owner_user_id); the org-level library owners are
-- controls.owner_user_id (user) and control_components.owner_department_id (dept),
-- used for defaults + the org-wide roll-up VIEW (derived, step 2).
--
-- ACCEPT SNAPSHOT: on CISO acceptance the action's items/owners/targets freeze and
-- the linked risk's CURRENT scores are snapshotted as the progress baseline
-- (replacing the old per-action target_locked_at at a finer grain). Stored per
-- (action, risk) on security_action_risks, and the accept who/when on the action.

-- ── The item: one element × one system × one change kind ────────────────────
CREATE TABLE public.security_action_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     uuid NOT NULL REFERENCES public.security_actions(id) ON DELETE CASCADE,
  system_id     uuid NOT NULL REFERENCES public.systems(id),
  element_type  text NOT NULL CHECK (element_type IN ('control','component')),
  control_id    uuid REFERENCES public.controls(id),
  component_id  uuid REFERENCES public.control_components(id),
  change_kind   text NOT NULL CHECK (change_kind IN
                  ('control_add','control_improve','component_add','component_improve')),
  owner_user_id uuid REFERENCES public.users(id),           -- Responsible; default = system owner
  -- Control items carry the target residual the finished control should achieve
  -- (seeded from the coverage panel's risk_control_probability row; confirmed/
  -- edited by the analyst at completion). Component items are status-only.
  target_p_c    smallint CHECK (target_p_c BETWEEN 1 AND 5),
  target_p_i    smallint CHECK (target_p_i BETWEEN 1 AND 5),
  target_p_a    smallint CHECK (target_p_a BETWEEN 1 AND 5),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed')),
  completed_by  uuid REFERENCES public.users(id),
  completed_at  timestamptz,
  comment       text,                                        -- per-item context box
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- exactly one of control_id / component_id, matching element_type
  CONSTRAINT chk_sai_element CHECK (
    (element_type = 'control'   AND control_id   IS NOT NULL AND component_id IS NULL) OR
    (element_type = 'component' AND component_id IS NOT NULL AND control_id   IS NULL)
  ),
  -- change_kind consistent with element_type
  CONSTRAINT chk_sai_kind CHECK (
    (element_type = 'control'   AND change_kind IN ('control_add','control_improve')) OR
    (element_type = 'component' AND change_kind IN ('component_add','component_improve'))
  )
);

COMMENT ON TABLE public.security_action_items IS
  'One remediation unit of a security action: a control or component on a system, '
  'add-or-improve, with its own Responsible owner (default system owner), target '
  '(control items, seeded from the coverage panel), status, and context comment. '
  'Completing an item flips the element to operational on that system (API, step 2).';

-- One item per (action, system, element). Partial uniques because exactly one of
-- control_id / component_id is set.
CREATE UNIQUE INDEX uq_sai_control
  ON public.security_action_items (action_id, system_id, control_id)
  WHERE control_id IS NOT NULL;
CREATE UNIQUE INDEX uq_sai_component
  ON public.security_action_items (action_id, system_id, component_id)
  WHERE component_id IS NOT NULL;

CREATE INDEX idx_sai_action    ON public.security_action_items (action_id);
CREATE INDEX idx_sai_owner     ON public.security_action_items (owner_user_id);
CREATE INDEX idx_sai_control   ON public.security_action_items (control_id)   WHERE control_id   IS NOT NULL;
CREATE INDEX idx_sai_component ON public.security_action_items (component_id) WHERE component_id IS NOT NULL;
CREATE INDEX idx_sai_open      ON public.security_action_items (status)       WHERE status <> 'completed';

CREATE TRIGGER trg_sai_upd BEFORE UPDATE ON public.security_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── CISO-accept snapshot ────────────────────────────────────────────────────
ALTER TABLE public.security_actions
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN accepted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.security_actions.accepted_at IS
  'When the CISO accepted the action; items/owners/targets freeze at this point.';

-- Per (action, risk): the risk''s current scores at accept time — the baseline to
-- measure incremental completion against.
ALTER TABLE public.security_action_risks
  ADD COLUMN baseline_risk_c     smallint,
  ADD COLUMN baseline_risk_i     smallint,
  ADD COLUMN baseline_risk_a     smallint,
  ADD COLUMN baseline_risk_score smallint;
