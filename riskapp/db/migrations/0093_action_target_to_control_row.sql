-- 0093 — verified-action target moves the linked CONTROL row, not the risk row
--
-- WHY. 0092 made risks.probability_* a DERIVED aggregate (MAX over the threat's
-- controls of COALESCE(judged row, threat inherent)). But apply_verified_action_target
-- (0090) still wrote risks.probability_* DIRECTLY on verify — a value the next
-- recompute would clobber. This is the "action ripple" flagged in
-- docs/threat-coverage-panel.md: an action improves specific CONTROL(s), so on
-- verify its target residual belongs on those controls' rows, and the risk
-- probability then derives from them.
--
-- CHANGE. On status → verified, for every linked risk × every linked control that
-- is part of that risk's threat coverage (control_threats), upsert
-- risk_control_probability = the action's target residual, CLAMPED to the threat
-- inherent (a control can only reduce — this also avoids the ≤-inherent ceiling
-- trigger raising). The recompute cascade then derives risks.probability_*, and
-- log_residual_change records the change with source='action_verified' (the
-- provenance configs are set as before).
--
-- CONSEQUENCE / LIMITATION. Under the derived model a verified action only moves
-- probability through the CONTROL rows it is attached to. An action that links
-- only components (no control) — or whose controls are not in the risk's
-- control_threats — records its target for audit but no longer moves probability;
-- the analyst adjusts the relevant control's residual on the Threat Coverage
-- panel. This is the honest weakest-link behaviour (a fix to one control cannot
-- pull the risk below what a weaker/missing control still allows). The
-- "target must be set to verify" contract is unchanged.

CREATE OR REPLACE FUNCTION public.apply_verified_action_target() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

  -- Push the target onto each linked control's per-risk row (clamped ≤ inherent).
  -- The recompute trigger on risk_control_probability then derives
  -- risks.probability_* = MAX over the threat's controls.
  INSERT INTO risk_control_probability
    (risk_id, control_id, probability_c, probability_i, probability_a, set_by, set_at)
  SELECT sar.risk_id, sac.control_id,
         LEAST(NEW.target_residual_p_c, t.probability_c),
         LEAST(NEW.target_residual_p_i, t.probability_i),
         LEAST(NEW.target_residual_p_a, t.probability_a),
         NEW.verified_by, now()
    FROM security_action_risks sar
    JOIN risks   r  ON r.id = sar.risk_id
    JOIN threats t  ON t.id = r.threat_id
    JOIN security_action_controls sac ON sac.action_id = NEW.id
    JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = sac.control_id
   WHERE sar.action_id = NEW.id
  ON CONFLICT (risk_id, control_id) DO UPDATE SET
    probability_c = EXCLUDED.probability_c,
    probability_i = EXCLUDED.probability_i,
    probability_a = EXCLUDED.probability_a,
    set_by        = EXCLUDED.set_by,
    set_at        = now();

  PERFORM set_config('riskapp.residual_source', '', true);
  PERFORM set_config('riskapp.residual_source_action_id', '', true);
  PERFORM set_config('riskapp.residual_changed_by', '', true);

  RETURN NEW;
END;
$$;
