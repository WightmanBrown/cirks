-- 0150 — a security solution that is complete in place counts as chosen, and
--        the audit trail says that was the reason (owner, 2026-10-06)
--
-- WHY. v148 made the solution in play on a system a SUGGESTION: an objective a
-- threat calls for stayed "needs a security solution chosen" until a person
-- confirmed it. The owner met the result on Case Management System: the system
-- page said no solution was chosen for "Incidents are contained" while the
-- objective's own page showed it Delivered there by CrowdStrike host
-- containment. Both were right by their own rule, and the pair read as a bug.
--
-- Measured on Misty Isles before deciding: 116 objectives undecided across 39
-- systems — 46 with a complete solution already in place, 27 with one in place
-- but incomplete, 43 with nothing. Asking a person to confirm what is already
-- fully delivered is paperwork; the other 70 are the real decisions.
--
-- THE RULE. Where an objective needs a solution chosen and the solution in play
-- for it on that system is COMPLETE (v_system_control_delivery), that solution
-- counts as chosen. An incomplete one does not: it stays a suggestion, because
-- "we have half of it" is exactly the case a person should look at. A conflict
-- between two REQUIRED solutions is untouched — that is a disagreement between
-- rules, and only a person settles it.
--
-- WHY A STORED ROW, when the state could simply be derived. The owner asked for
-- an audit record showing this was the reason. A derived state has no moment and
-- no record; a stored choice has both. So the choice is written, marked
-- `source = 'in_place'` with no `chosen_by`, and an audit_log row names the
-- system, the objective, the solution and the reason. It then behaves as any
-- choice does: it stands if the solution later degrades (the gap shows against a
-- chosen solution, which is the honest reading), and a person can replace it.
--
-- WHEN. `settle_in_place_solutions()` is called here, for what is already true,
-- and by the API wherever a system's wanted objectives are read (the system
-- page, its security view, the findings list, the SWG agenda). Completeness can
-- change by a dozen routes — a component's state, a part added to a solution, a
-- threat identified — so a trigger per route would miss one; reading is the one
-- place they all pass through. The exception expiry sweep works the same way.
--
-- One objective at a time: a choice settles every objective its solution
-- delivers on that system (v148 decision 1), so each insert can settle others,
-- and the next candidate is read fresh.
--
-- Report only, as before: no status and no risk score reads a choice.

ALTER TABLE system_solution_choices
  ADD COLUMN source TEXT NOT NULL DEFAULT 'person'
    CONSTRAINT chk_solution_choice_source CHECK (source IN ('person', 'in_place'));

COMMENT ON COLUMN system_solution_choices.source IS
  'How the choice came about (v150): person = someone chose it; in_place = counted as chosen because the solution was complete in place on the system (chosen_by is NULL, and audit_log records the reason). Every row before v150 was made by a person.';

-- A choice made by nobody must say so, and one made by a person is not in_place.
ALTER TABLE system_solution_choices
  ADD CONSTRAINT chk_solution_choice_in_place_has_no_person
    CHECK (source <> 'in_place' OR chosen_by IS NULL);

CREATE OR REPLACE FUNCTION settle_in_place_solutions(p_system_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  r       RECORD;
  settled INTEGER := 0;
BEGIN
  LOOP
    SELECT w.system_id, w.control_id, d.pattern_id,
           s.name AS system_name, c.title AS control_title, d.pattern_name
      INTO r
      FROM v_system_wanted_objectives w
      JOIN v_system_control_delivery d
        ON d.system_id = w.system_id AND d.control_id = w.control_id
      JOIN systems s  ON s.id = w.system_id
      JOIN controls c ON c.id = w.control_id
     WHERE w.state = 'needs_solution'
       AND d.delivery = 'complete'
       AND d.pattern_id IS NOT NULL
       AND (p_system_id IS NULL OR w.system_id = p_system_id)
     ORDER BY s.name, c.title
     LIMIT 1;
    EXIT WHEN NOT FOUND;

    INSERT INTO system_solution_choices (system_id, control_id, pattern_id, notes, chosen_by, source)
    VALUES (r.system_id, r.control_id, r.pattern_id,
            'Counted as chosen because it is complete in place on this system.', NULL, 'in_place')
    ON CONFLICT (system_id, control_id) DO NOTHING;
    -- A row we could not insert would be offered again for ever.
    EXIT WHEN NOT FOUND;

    INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative, changes)
    VALUES (NULL, 'create', 'system_security', r.system_id, r.system_name,
            format('%s: "%s" counted as chosen for "%s" because it is complete in place on the system. Nobody was asked to choose.',
                   r.system_name, r.pattern_name, r.control_title),
            jsonb_build_object('reason', 'complete_in_place', 'control_id', r.control_id, 'pattern_id', r.pattern_id));

    settled := settled + 1;
  END LOOP;
  RETURN settled;
END;
$$;

COMMENT ON FUNCTION settle_in_place_solutions(UUID) IS
  'Counts a complete in-place security solution as chosen for each objective that needs one (v150), on one system or all. Writes the choice (source in_place) and an audit_log row giving the reason. Idempotent; returns how many it settled.';

-- What is already true on this installation.
SELECT settle_in_place_solutions();
