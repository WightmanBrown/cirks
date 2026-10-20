-- 0152 — a control objective's status on a system follows its security solution
--        (owner, 2026-10-07; step 4 of docs/system-security-view.md, stage 1)
--
-- WHY. Since v145 the security solutions have REPORTED how an objective is
-- delivered on each system, beside a status somebody set by hand, and named the
-- disagreements. The owner's ruling: deriving the status from the completeness
-- and state of the solution's parts "is a proper reflection of the missing or
-- degraded state", and it is easier to understand than two answers side by side.
--
-- MEASURED FIRST, as step 4 required (Misty Isles, 228 active risks), by applying
-- the rule to a copy and comparing every score:
--   * status follows the solution where one is in place on the system ..... 1 score rises
--   * and reads missing where the objective has solutions but none is in
--     place on the system (owner: yes) ..................................... 3 scores rise,
--     the largest by 8, one crossing the mandatory-action score of 12.
-- 39 objectives were marked operational by hand over an incomplete solution; the
-- scores barely move because MIN over the deployed controls means another
-- control was already setting them.
--
-- THE RULE (this migration: objectives that HAVE a security solution).
--   complete ................. operational
--   a part degraded .......... degraded
--   a part missing ........... missing
--   no solution in place ..... missing
-- Scope needs nothing new: each part already reads its state from where it lives
-- (v145/v149) — on the system (that system only), on a security system (every
-- system relying on it), or once for the organisation (every system).
--
-- An exclusion (`not_applicable`, with its reason) stays a person's judgement and
-- is never overwritten. Only objectives delivered per system (`delivery =
-- 'system'`, stated) are derived: one whose delivery mode is not stated is left
-- alone, as the owner ruled for v129.
--
-- ALSO: an objective IMPLIED on a system by a security solution is recorded
-- there automatically, so it has a status at all. Before, adopting a pattern left
-- a dozen objectives implied and unrecorded, and the finding open until someone
-- recorded each.
--
-- AUDITED. Every status the rule changes, and every objective it records,
-- writes an audit_log row with no user, naming the solution and the part that
-- caused it. That is why the status stays a stored column maintained by
-- `settle_system_security()` rather than becoming a view: risk scores are
-- themselves stored and recomputed by the trigger on system_controls, and a
-- change with no moment cannot be audited (the v150 argument).
--
-- NOT IN THIS MIGRATION (stage 2, owner's second ruling): an objective with NO
-- security solution in the library also reads missing — "no solution means no
-- security objective". Measured: 363 rows across 24 objectives, 33 of 228 scores
-- rise, risks at or above the mandatory-action score go from 55 to 79. It waits
-- on what still writes this column by hand (completing a control action item,
-- the coverage panel) — see docs/system-security-view.md §7.

-- ── Objectives a security solution implies, recorded ─────────────────────────
CREATE OR REPLACE FUNCTION record_implied_objectives(p_system_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH implied AS (
    SELECT w.system_id, w.control_id, s.name AS system_name, c.title AS control_title,
           (SELECT string_agg(p.name, ', ' ORDER BY p.name)
              FROM delivery_patterns p WHERE p.id = ANY(w.pattern_ids)) AS pattern_names
      FROM v_system_wanted_objectives w
      JOIN systems s  ON s.id = w.system_id AND s.is_active
      JOIN controls c ON c.id = w.control_id AND c.delivery = 'system'
     WHERE NOT w.recorded
       AND w.state <> 'needs_solution'          -- implied by a solution, not merely called for by a threat
       AND (p_system_id IS NULL OR w.system_id = p_system_id)
  ), added AS (
    INSERT INTO system_controls (system_id, control_id, provenance, created_by)
    SELECT system_id, control_id, 'recorded', NULL FROM implied
    ON CONFLICT (system_id, control_id) DO NOTHING
    RETURNING system_id, control_id
  )
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative, changes)
  SELECT NULL, 'create', 'system_security', i.system_id, i.system_name,
         format('%s: "%s" recorded on the system because %s, which this system''s record implies, delivers it. Nobody recorded it by hand.',
                i.system_name, i.control_title, COALESCE(i.pattern_names, 'a security solution')),
         jsonb_build_object('reason', 'implied_by_security_solution', 'control_id', i.control_id)
    FROM implied i JOIN added a ON a.system_id = i.system_id AND a.control_id = i.control_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── The status follows the solution ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION derive_control_statuses(p_system_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH target AS (
    SELECT sc.id, sc.system_id, sc.control_id, sc.status AS old_status,
           s.name AS system_name, c.title AS control_title,
           d.delivery, d.pattern_name, d.missing_parts, d.degraded_parts,
           (CASE d.delivery WHEN 'complete' THEN 'operational'
                            WHEN 'degraded' THEN 'degraded'
                            ELSE 'missing' END)::system_element_status AS derived
      FROM system_controls sc
      JOIN systems s  ON s.id = sc.system_id AND s.is_active
      JOIN controls c ON c.id = sc.control_id AND c.delivery = 'system'
      -- delivery IS NOT NULL = the objective has at least one security solution
      JOIN v_system_control_delivery d
        ON d.system_id = sc.system_id AND d.control_id = sc.control_id AND d.delivery IS NOT NULL
     WHERE sc.status <> 'not_applicable'
       AND (p_system_id IS NULL OR sc.system_id = p_system_id)
  ), changed AS (
    UPDATE system_controls sc
       SET status = t.derived, updated_at = now()
      FROM target t
     WHERE sc.id = t.id AND sc.status <> t.derived
    RETURNING sc.id
  )
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label,
                         field_name, old_value, new_value, human_narrative, changes)
  SELECT NULL, 'update', 'system_security', t.system_id, t.system_name,
         'status', t.old_status::text, t.derived::text,
         format('%s: "%s" is now %s (was %s) because its status follows its security solution: %s.',
                t.system_name, t.control_title, t.derived, t.old_status,
                CASE t.delivery
                  WHEN 'complete' THEN format('"%s" is complete', t.pattern_name)
                  WHEN 'degraded' THEN format('"%s" has a degraded part (%s)', t.pattern_name, array_to_string(t.degraded_parts, ', '))
                  WHEN 'incomplete' THEN format('"%s" is missing %s', t.pattern_name,
                                                COALESCE(NULLIF(array_to_string(t.missing_parts, ', '), ''), 'a part'))
                  ELSE 'none of the security solutions that deliver it is in place on this system'
                END),
         jsonb_build_object('reason', 'follows_security_solution', 'control_id', t.control_id, 'delivery', t.delivery)
    FROM target t JOIN changed ch ON ch.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── One call that brings a system's security record up to date ───────────────
-- Recording an implied objective can make a solution's delivery readable; a
-- solution counted as chosen (v150) can imply further objectives. So the three
-- run in turn until nothing changes — a handful of passes at most.
CREATE OR REPLACE FUNCTION settle_system_security(p_system_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  total  INTEGER := 0;
  round  INTEGER;
  passes INTEGER := 0;
BEGIN
  LOOP
    round := record_implied_objectives(p_system_id)
           + settle_in_place_solutions(p_system_id)
           + derive_control_statuses(p_system_id);
    total  := total + round;
    passes := passes + 1;
    EXIT WHEN round = 0 OR passes >= 6;
  END LOOP;
  RETURN total;
END;
$$;

COMMENT ON FUNCTION settle_system_security(UUID) IS
  'Brings a system''s security record (or every system''s) up to date (v152): records objectives a security solution implies, counts a complete in-place solution as chosen (v150), and sets each objective''s status from its solution. Every change is audited with its reason. Idempotent; returns how many changes it made.';
COMMENT ON FUNCTION derive_control_statuses(UUID) IS
  'Sets system_controls.status from the security solution in play (v152): complete → operational, degraded → degraded, otherwise missing. Only objectives with a security solution and delivery = system; never an exclusion. Audited.';
COMMENT ON FUNCTION record_implied_objectives(UUID) IS
  'Records on a system each objective a security solution there implies (v152). Audited.';
COMMENT ON COLUMN system_controls.status IS
  'The objective''s state on this system. Since v152 it FOLLOWS the security solution where the objective has one (settle_system_security) and cannot be set by hand; not_applicable (with exclusion_reason) remains a person''s judgement. Objectives with no security solution are still set by hand until stage 2.';

-- What is already true on this installation.
SELECT settle_system_security();
