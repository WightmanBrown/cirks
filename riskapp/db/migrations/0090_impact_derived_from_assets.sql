-- 0090 — impact is strictly derived from the assets (no per-risk impact override)
--
-- WHY. A risk's impact is the business harm if the threat succeeds — a property of
-- the information ASSETS in the system, not of the risk. CIRKS already derives it
-- upward: assets carry the CIA ratings → a system's C/I/A is the MAX over its linked
-- assets (trigger-maintained) → a risk's impact is that system C/I/A. Yet the score
-- let `residual_impact_*` OVERRIDE that per risk (a free-hand "the control limits the
-- damage" edit, also pushed by a verified action's impact target). That contradicts
-- the single-source-of-truth model and invites drift/gaming: two risks on one system
-- could disagree on the assets' worth. If the impact is wrong, the honest fix is the
-- asset ratings. (Damage-limiting controls like backups fold naturally into a lower
-- PROBABILITY of a *successful* attack, so nothing is lost.)
--
-- CHANGE. (1) trg_fn_compute_cia_scores derives impact from the system ONLY — the
-- `residual_impact_*` override is removed; score = system_impact × probability.
-- (2) apply_verified_action_target reduces PROBABILITY only on verify (the impact
-- lines are dropped). (3) the now-vestigial residual_impact_* columns are cleared.
-- The columns are KEPT for now (readers still reference them defensively); a later
-- migration may drop them once the action propose/target UI is impact-free.
--
-- No score change is expected where residual_impact already equalled the system
-- impact; where it was hand-lowered, the score correctly rises to the true impact.

-- (1) Impact strictly from the system.
CREATE OR REPLACE FUNCTION public.trg_fn_compute_cia_scores() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_c SMALLINT; v_i SMALLINT; v_a SMALLINT;
  v_rc SMALLINT; v_ri SMALLINT; v_ra SMALLINT; v_summary SMALLINT;
BEGIN
  -- Impact is DERIVED from the system (MAX over its information assets); it is
  -- never overridden per-risk. The analyst's lever is probability.
  SELECT impact_c, impact_i, impact_a INTO v_c, v_i, v_a
    FROM systems WHERE id = NEW.system_id;
  v_c := COALESCE(v_c, 1);
  v_i := COALESCE(v_i, 1);
  v_a := COALESCE(v_a, 1);

  v_rc := GREATEST(1, LEAST(25, v_c * NEW.probability_c));
  v_ri := GREATEST(1, LEAST(25, v_i * NEW.probability_i));
  v_ra := GREATEST(1, LEAST(25, v_a * NEW.probability_a));
  v_summary := derive_summary_score(v_rc, v_ri, v_ra);

  NEW.risk_c     := v_rc;
  NEW.risk_i     := v_ri;
  NEW.risk_a     := v_ra;
  NEW.risk_score := v_summary;
  RETURN NEW;
END;
$$;

-- (2) A verified action reduces PROBABILITY only (impact is derived, not treatable).
CREATE OR REPLACE FUNCTION public.apply_verified_action_target() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status <> 'verified' OR OLD.status = 'verified' THEN
    RETURN NEW;
  END IF;
  IF NEW.target_residual_p_c IS NULL THEN
    RAISE EXCEPTION 'Cannot verify an action without a target residual.';
  END IF;

  PERFORM set_config('riskapp.residual_source', 'action_verified', true);
  PERFORM set_config('riskapp.residual_source_action_id', NEW.id::text, true);
  PERFORM set_config('riskapp.residual_changed_by', NEW.verified_by::text, true);

  FOR r IN
    SELECT risk_id FROM security_action_risks WHERE action_id = NEW.id
  LOOP
    UPDATE risks SET
      probability_c = NEW.target_residual_p_c,
      probability_i = NEW.target_residual_p_i,
      probability_a = NEW.target_residual_p_a
    WHERE id = r.risk_id;
  END LOOP;

  PERFORM set_config('riskapp.residual_source', '', true);
  PERFORM set_config('riskapp.residual_source_action_id', '', true);
  PERFORM set_config('riskapp.residual_changed_by', '', true);

  RETURN NEW;
END;
$$;

-- (3) Clear the vestigial per-risk impact overrides so every reader falls back to
-- the system impact, then force a score recompute (the scoring trigger fires on
-- UPDATE OF probability_*; residual_impact is not in that list).
UPDATE risks
   SET residual_impact_c = NULL, residual_impact_i = NULL, residual_impact_a = NULL,
       residual_impact_rationale = NULL
 WHERE residual_impact_c IS NOT NULL OR residual_impact_i IS NOT NULL
    OR residual_impact_a IS NOT NULL OR residual_impact_rationale IS NOT NULL;

UPDATE risks SET probability_c = probability_c;
