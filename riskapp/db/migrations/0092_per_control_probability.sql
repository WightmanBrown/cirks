-- 0092 — per-control residual probability; risk probability derived (MAX), capped
--        at the threat's inherent probability
--
-- WHY. A risk's current probability was a single free-hand lever
-- (risks.probability_c/i/a), pushed by verified actions. We move to a
-- control-centric model that mirrors how analysts actually reason on the
-- risk-detail Threat Coverage panel: for each control that should treat the
-- threat, they judge the probability of the attack succeeding *once that control
-- is considered*. The risk's probability is then DERIVED — the MAX across those
-- per-control judgements (weakest-link: the risk is only as good as its weakest
-- relevant control). See docs/threat-coverage-panel.md.
--
-- THE CEILING. A control can only ever REDUCE the threat's inherent likelihood,
-- never raise it. That inherent already lives on the threat
-- (threats.probability_c/i/a, per-C/I/A, default 3). So a control's judged
-- residual is constrained ≤ inherent, and any control that is MISSING, UNJUDGED
-- or INEFFECTIVE leaves the threat's inherent untouched — i.e. its effective
-- residual = inherent. The worst case (and the no-controls case) is therefore
-- exactly the threat's inherent probability, never a flat 5.
--
-- MODEL.
--   effective_residual(risk, control) = COALESCE(judged_row, threat_inherent)   -- per dimension
--   risks.probability_* = MAX over control_threats(risk.threat_id) of effective_residual
-- risks.probability_* is kept but becomes a TRIGGER-MAINTAINED derived cache (the
-- same shape risk_score/risk_c already are); the scoring trigger
-- (trg_fn_compute_cia_scores, 0090) is untouched and still reads it. The new
-- table stores only the JUDGED REDUCTIONS — an absent row means "= inherent".
--
-- BACKFILL. The per-control judgement is new data with no clean per-control
-- predecessor, so every existing risk recomputes to its threat's inherent
-- (empty table → every COALESCE falls through to inherent). Where an analyst had
-- hand-lowered a risk's probability below inherent, that single-lever value is
-- not attributable to a specific control and is intentionally dropped.
--
-- NOT IN THIS MIGRATION (deliberate scoping — see docs/threat-coverage-panel.md).
--   * apply_verified_action_target (0090) still writes risks.probability_*
--     directly on verify; under the derived model it should instead move its
--     linked control's row. That re-point (plus the action-target UI) is a
--     follow-on PR. Until it lands, a verified action's direct probability write
--     is transient and superseded by the next recompute.
--   * The risk-CREATION path is untouched: a freshly inserted risk keeps the
--     probability its creator supplied until the first control_threats / rcp /
--     threat-inherent change fires a recompute. Making a new risk derive to
--     inherent immediately belongs with the register-risk API update (that step
--     also updates the seed + tests together), so we do NOT add an AFTER INSERT
--     recompute here — that would reset every seeded risk on load and churn the
--     existing test/e2e baselines before the lever to lower probability exists.
--
-- MERGE ORDER. Because this makes probability DERIVED but the UI/API lever to
-- lower it (per-control judgements) arrives in later steps, do not ship 0092 to
-- main on its own — land it together with the API + Threat-Coverage-panel steps,
-- else risks collapse to their threat inherent with no way to reduce them.

-- ── Storage: judged reductions only, grain (risk, control) ──────────────────
CREATE TABLE public.risk_control_probability (
  risk_id       uuid NOT NULL REFERENCES public.risks(id)    ON DELETE CASCADE,
  control_id    uuid NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  probability_c smallint NOT NULL CHECK (probability_c BETWEEN 1 AND 5),
  probability_i smallint NOT NULL CHECK (probability_i BETWEEN 1 AND 5),
  probability_a smallint NOT NULL CHECK (probability_a BETWEEN 1 AND 5),
  set_by        uuid,
  set_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (risk_id, control_id)
);

COMMENT ON TABLE public.risk_control_probability IS
  'Per-(risk,control) residual attack probability once that control is considered. '
  'Stores judged REDUCTIONS only — an absent row means the control has not reduced '
  'the threat inherent (effective residual = threats.probability_*). Each value is '
  'constrained ≤ the threat inherent by trg_rcp_enforce_ceiling. The risk''s '
  'probability_* is MAX over control_threats of COALESCE(this, threat inherent).';

CREATE INDEX idx_rcp_control ON public.risk_control_probability (control_id);

-- ── Ceiling: a control cannot raise probability above the threat inherent ───
CREATE FUNCTION public.trg_fn_rcp_enforce_ceiling() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_c smallint; v_i smallint; v_a smallint;
BEGIN
  SELECT t.probability_c, t.probability_i, t.probability_a
    INTO v_c, v_i, v_a
    FROM public.risks r
    JOIN public.threats t ON t.id = r.threat_id
   WHERE r.id = NEW.risk_id;

  IF v_c IS NULL THEN
    RAISE EXCEPTION 'risk_control_probability: risk % has no threat', NEW.risk_id;
  END IF;

  IF NEW.probability_c > v_c OR NEW.probability_i > v_i OR NEW.probability_a > v_a THEN
    RAISE EXCEPTION
      'A control cannot raise probability above the threat inherent (C/I/A ceiling %/%/%); got %/%/%.',
      v_c, v_i, v_a, NEW.probability_c, NEW.probability_i, NEW.probability_a;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Derived aggregate: recompute one risk's probability from its control rows ─
CREATE FUNCTION public.fn_rcp_recompute_risk(p_risk_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- MAX over every control linked to the risk's threat of that control's
  -- effective residual (its judged row, else the threat inherent). A threat
  -- with no linked controls still yields exactly one row (LEFT JOINs are NULL),
  -- so the aggregate falls through to the inherent. Guarded by IS DISTINCT so a
  -- no-op change writes nothing (no needless history / score churn).
  UPDATE public.risks r SET
    probability_c = sub.p_c,
    probability_i = sub.p_i,
    probability_a = sub.p_a
  FROM (
    SELECT
      MAX(COALESCE(rcp.probability_c, t.probability_c))::smallint AS p_c,
      MAX(COALESCE(rcp.probability_i, t.probability_i))::smallint AS p_i,
      MAX(COALESCE(rcp.probability_a, t.probability_a))::smallint AS p_a
    FROM public.risks rr
    JOIN public.threats t ON t.id = rr.threat_id
    LEFT JOIN public.control_threats ct ON ct.threat_id = t.id
    LEFT JOIN public.risk_control_probability rcp
           ON rcp.risk_id = rr.id AND rcp.control_id = ct.control_id
    WHERE rr.id = p_risk_id
  ) sub
  WHERE r.id = p_risk_id
    AND (r.probability_c IS DISTINCT FROM sub.p_c
      OR r.probability_i IS DISTINCT FROM sub.p_i
      OR r.probability_a IS DISTINCT FROM sub.p_a);
END;
$$;

CREATE FUNCTION public.fn_rcp_recompute_for_threat(p_threat_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks WHERE threat_id = p_threat_id LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;

-- ── Trigger glue ────────────────────────────────────────────────────────────
-- A per-control row changed → recompute its risk.
CREATE FUNCTION public.trg_fn_rcp_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_rcp_recompute_risk(OLD.risk_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_rcp_recompute_risk(NEW.risk_id);
  RETURN NEW;
END;
$$;

-- The threat's control set changed (link added/removed) → recompute its risks.
CREATE FUNCTION public.trg_fn_control_threats_recompute() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_rcp_recompute_for_threat(OLD.threat_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_rcp_recompute_for_threat(NEW.threat_id);
  RETURN NEW;
END;
$$;

-- The ceiling moved (threat inherent edited) → recompute its risks.
CREATE FUNCTION public.trg_fn_threat_inherent_recompute() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM public.fn_rcp_recompute_for_threat(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rcp_enforce_ceiling
  BEFORE INSERT OR UPDATE ON public.risk_control_probability
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rcp_enforce_ceiling();

CREATE TRIGGER trg_rcp_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.risk_control_probability
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rcp_changed();

CREATE TRIGGER trg_control_threats_recompute
  AFTER INSERT OR DELETE ON public.control_threats
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_control_threats_recompute();

CREATE TRIGGER trg_threat_inherent_recompute
  AFTER UPDATE OF probability_c, probability_i, probability_a ON public.threats
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_threat_inherent_recompute();

-- ── Backfill: every risk recomputes to its threat inherent (empty table) ────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;
