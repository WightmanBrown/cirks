-- 0154 — security actions fix components, and Target risk is derived from them
--        (owner, 2026-10-07; stage 2 of docs/system-security-view.md §7, part 2)
--
-- WHY. The owner: "we should stop fixing controls, you can't actually fix them,
-- you can only fix their components." Since v152 an objective's status on a
-- system follows its security solution, so completing a CONTROL item — which
-- marked the objective operational by hand — is undone by the next settle. The
-- work is always a part: record it, deploy it, repair it.
--
-- So an action built from the gap is made of COMPONENT items only (the
-- application stops offering control items), the control items still open are
-- withdrawn here, and Target risk, which was the MIN of the open control items'
-- typed targets, is derived instead.
--
-- TARGET RISK, DERIVED (owner: "go with the derived target"). An open component
-- item says a part of a security solution will be put right. When every part of
-- that solution that is not working on the system is covered by an open item on
-- the risk, the objectives the solution delivers will be in place — and what each
-- achieves on this risk is already recorded: the judged residual on the risk page
-- (risk_control_probability). The target is the MIN of those, per dimension, the
-- same sum as the current probability with the objectives-to-be added.
--   * Nobody types a target. The only number is the judgement on the risk page.
--   * An objective nobody has judged adds nothing — the register shows a dash and
--     the reason, where a typed number would have hidden that nobody had judged.
--   * When the item completes, the objective becomes operational (v152) and the
--     current risk moves to where the target was. Nothing to reconcile.
-- Measured before building: on Misty Isles no open control item carried a target
-- below the current risk, so the typed target was saying nothing; deriving it
-- loses no information.
--
-- "Every part … covered" is deliberate. A solution also missing a part on a
-- security system, or an organisation-wide part, will NOT be complete when the
-- per-system item lands, so it is not counted; such parts are fixed once, not
-- per risk (v137).

-- ── A solution's parts and their state, per system and objective ─────────────
-- The same reading as v_delivery_pattern_state (v149), exposed per PART so the
-- target can ask "is every broken part covered by an item?". Keep the two in
-- step: location decides where the state is read from.
CREATE VIEW v_solution_part_state AS
SELECT sc.system_id, sc.control_id, pp.pattern_id, pp.component_id, pp.location,
       CASE pp.location
         WHEN 'on_system' THEN (SELECT x.status::text FROM system_components x
                                 WHERE x.system_id = sc.system_id AND x.component_id = pp.component_id)
         WHEN 'service'   THEN (SELECT x.status::text FROM system_components x
                                 WHERE x.system_id = pp.service_system_id AND x.component_id = pp.component_id)
         ELSE (SELECT st.status FROM v_component_state st WHERE st.component_id = pp.component_id)
       END AS status
  FROM system_controls sc
  JOIN systems s ON s.id = sc.system_id AND s.is_active
  JOIN delivery_pattern_objectives o ON o.control_id = sc.control_id
  JOIN delivery_patterns p           ON p.id = o.pattern_id AND p.kind = 'parts'
  JOIN delivery_pattern_parts pp     ON pp.pattern_id = p.id
 WHERE sc.status <> 'not_applicable';

COMMENT ON VIEW v_solution_part_state IS
  'Each part of each security solution that delivers an objective recorded on a system, with its state read from where the part lives (v154; the per-part form of v_delivery_pattern_state). status NULL = not recorded where it should be.';

-- ── Target probability per risk ──────────────────────────────────────────────
CREATE VIEW v_risk_target_probability AS
WITH open_items AS (
  -- Component items still to be done on a live action for the risk.
  SELECT DISTINCT sar.risk_id, sai.system_id, sai.component_id
    FROM security_action_risks sar
    JOIN security_actions sa        ON sa.id = sar.action_id
    JOIN security_action_items sai  ON sai.action_id = sa.id
   WHERE sa.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
     AND sai.status NOT IN ('completed', 'withdrawn')
     AND sai.element_type = 'component'
), will_be_in_place AS (
  -- Objectives countering the risk's threat that are not working on the system
  -- today and WILL be once the open items land.
  SELECT r.id AS risk_id, ct.control_id
    FROM risks r
    JOIN control_threats ct ON ct.threat_id = r.threat_id
    JOIN controls c         ON c.id = ct.control_id AND c.delivery = 'system'
    JOIN system_controls sc ON sc.system_id = r.system_id AND sc.control_id = ct.control_id
                           AND sc.status NOT IN ('operational', 'not_applicable')
    -- the solution in USE for the objective here (v148): the one the system's
    -- record implies or someone chose, else the one in play. Not the delivery
    -- report's "in play", which needs the on-system part already recorded —
    -- exactly the part an item may be about to add.
    JOIN v_system_solutions_in_use d
      ON d.system_id = r.system_id AND d.control_id = ct.control_id
    JOIN delivery_patterns dp ON dp.id = d.pattern_id AND dp.kind = 'parts'
   WHERE r.is_active
     -- an open item on this risk is for a part of the solution in play …
     AND EXISTS (SELECT 1 FROM delivery_pattern_parts pp
                   JOIN open_items oi ON oi.component_id = pp.component_id
                                     AND oi.risk_id = r.id AND oi.system_id = r.system_id
                  WHERE pp.pattern_id = d.pattern_id AND pp.location = 'on_system')
     -- … and no part of it stays broken once those items are done.
     AND NOT EXISTS (
       SELECT 1 FROM v_solution_part_state ps
        WHERE ps.system_id = r.system_id AND ps.control_id = ct.control_id AND ps.pattern_id = d.pattern_id
          AND ps.status IS DISTINCT FROM 'operational'
          AND NOT (ps.location = 'on_system'
                   AND EXISTS (SELECT 1 FROM open_items oi
                                WHERE oi.risk_id = r.id AND oi.system_id = r.system_id
                                  AND oi.component_id = ps.component_id)))
)
SELECT w.risk_id,
       MIN(p.probability_c) AS tgt_p_c,
       MIN(p.probability_i) AS tgt_p_i,
       MIN(p.probability_a) AS tgt_p_a,
       COUNT(*)::int                                            AS objectives_to_be_in_place,
       COUNT(p.control_id)::int                                 AS objectives_judged
  FROM will_be_in_place w
  LEFT JOIN risk_control_probability p ON p.risk_id = w.risk_id AND p.control_id = w.control_id
 GROUP BY w.risk_id;

COMMENT ON VIEW v_risk_target_probability IS
  'Target probability per risk, derived (v154): MIN per dimension of the judged residuals of the objectives the risk''s open component items will bring into place. NULL targets with objectives_to_be_in_place > 0 mean work is planned whose effect nobody has judged. The reader takes LEAST with the current probability.';

-- ── Withdraw the control items still open ────────────────────────────────────
-- Not withdrawn by a person, so withdrawn_by stays NULL and the note says what
-- happened (the v121 convention).
WITH open_control_items AS (
  SELECT sai.id, sai.action_id, c.title AS control, s.name AS system_name
    FROM security_action_items sai
    JOIN security_actions sa ON sa.id = sai.action_id
    JOIN systems  s ON s.id = sai.system_id
    JOIN controls c ON c.id = sai.control_id
   WHERE sai.element_type = 'control'
     AND sai.status IN ('pending', 'in_progress')
     AND sa.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
), withdrawn AS (
  UPDATE security_action_items sai
     SET status = 'withdrawn', withdrawn_at = now()
    FROM open_control_items o WHERE sai.id = o.id
  RETURNING sai.id
)
INSERT INTO security_action_notes (action_id, item_id, author_user_id, note)
SELECT o.action_id, o.id, NULL,
       format('Withdrawn when security actions changed to fix components only (v154). '
              || 'A control objective cannot be fixed directly: "%s" on %s follows its security solution, '
              || 'so the work is to put right that solution''s parts. Plan it from the risk''s coverage gap.',
              o.control, o.system_name)
  FROM open_control_items o WHERE o.id IN (SELECT id FROM withdrawn);

-- An action left with nothing to do and nothing done is cancelled, with the
-- reason on its notes; one with completed or component items carries on.
WITH emptied AS (
  SELECT sa.id
    FROM security_actions sa
   WHERE sa.status IN ('proposed', 'planned', 'in_progress')
     AND sa.origin = 'risk_treatment'
     AND EXISTS (SELECT 1 FROM security_action_items x WHERE x.action_id = sa.id)
     AND NOT EXISTS (SELECT 1 FROM security_action_items x
                      WHERE x.action_id = sa.id AND x.status <> 'withdrawn')
), cancelled AS (
  UPDATE security_actions sa SET status = 'cancelled'
    FROM emptied e WHERE sa.id = e.id
  RETURNING sa.id
)
INSERT INTO security_action_notes (action_id, item_id, author_user_id, note)
SELECT c.id, NULL, NULL,
       'Cancelled: every item on this action was to fix a control objective, and those items were withdrawn '
       || 'when security actions changed to fix components only (v154). Build a new action from the risk''s coverage gap.'
  FROM cancelled c;

-- An action whose remaining items were all withdrawn, but which had already
-- completed something, has nothing left to do: it is complete.
WITH finished AS (
  SELECT sa.id
    FROM security_actions sa
   WHERE sa.status IN ('planned', 'in_progress')
     AND sa.origin = 'risk_treatment'
     AND EXISTS (SELECT 1 FROM security_action_items x WHERE x.action_id = sa.id AND x.status = 'completed')
     AND NOT EXISTS (SELECT 1 FROM security_action_items x
                      WHERE x.action_id = sa.id AND x.status NOT IN ('completed', 'withdrawn'))
), done AS (
  UPDATE security_actions sa SET status = 'completed', completed_at = now()
    FROM finished f WHERE sa.id = f.id
  RETURNING sa.id
)
INSERT INTO security_action_notes (action_id, item_id, author_user_id, note)
SELECT d.id, NULL, NULL,
       'Completed: its remaining items were to fix control objectives and were withdrawn when security actions '
       || 'changed to fix components only (v154); the items already completed stand.'
  FROM done d;

COMMENT ON COLUMN security_action_items.target_p_c IS
  'Retired v154. The typed target of a CONTROL item; no new control items are created and Target risk is derived (v_risk_target_probability). Kept for the history of completed and withdrawn items.';
