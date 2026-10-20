-- 0159 — an objective with NO security solution reads missing on a system
--        (owner, 2026-10-07 ruling; switched on 2026-10-15 — stage 2 step 4 of
--        docs/system-security-view.md)
--
-- WHY. v152 made an objective's status on a system follow its security solution,
-- but only for objectives that HAVE one; the rest were still set by hand. The
-- owner's ruling: "no solution means no security objective" — an objective that
-- nothing delivers cannot be operational, whatever was clicked. With v153 (the
-- finding that lists objectives with no solution) and v154 (actions fix
-- components, not objectives) the last things that wrote this column by hand are
-- gone, so the same function now covers every per-system objective.
--
-- MEASURED on a copy of Misty Isles (CIRKS-dev, 2026-10-15) before switching on:
-- see the ledger entry in docs/schema-history.md for the scores that move. Most
-- of the original gap (24 objectives, 363 rows) was closed by giving objectives
-- solutions (v153 proposal); what remains is the data-quality gap the owner
-- expected this to expose.
--
-- THE RULE, now for every objective delivered per system:
--   complete ........................ operational
--   a part degraded ................. degraded
--   a part missing .................. missing
--   no solution in place ............ missing
--   no security solution at all ..... missing          ← new
-- Unchanged: an exclusion (not_applicable, with its reason) stays a person's
-- judgement and is never overwritten; objectives whose delivery mode is not
-- stated, or delivered organisation-wide, are left alone (v129).
--
-- AUDITED as before, the narrative naming the reason.

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
      -- v159: LEFT, and no "delivery IS NOT NULL" — an objective with no security
      -- solution (delivery NULL) is derived too, as missing.
      LEFT JOIN v_system_control_delivery d
        ON d.system_id = sc.system_id AND d.control_id = sc.control_id
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
                CASE
                  WHEN t.delivery IS NULL THEN 'no security solution delivers this objective, so nothing can be in place'
                  WHEN t.delivery = 'complete' THEN format('"%s" is complete', t.pattern_name)
                  WHEN t.delivery = 'degraded' THEN format('"%s" has a degraded part (%s)', t.pattern_name, array_to_string(t.degraded_parts, ', '))
                  WHEN t.delivery = 'incomplete' THEN format('"%s" is missing %s', t.pattern_name,
                                                COALESCE(NULLIF(array_to_string(t.missing_parts, ', '), ''), 'a part'))
                  ELSE 'none of the security solutions that deliver it is in place on this system'
                END),
         jsonb_build_object('reason', CASE WHEN t.delivery IS NULL THEN 'no_security_solution'
                                           ELSE 'follows_security_solution' END,
                            'control_id', t.control_id, 'delivery', t.delivery)
    FROM target t JOIN changed ch ON ch.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION derive_control_statuses(UUID) IS
  'Sets system_controls.status from the security solution in play (v152; v159 every per-system objective): complete → operational, degraded → degraded, otherwise missing — including an objective no security solution delivers. Only delivery = system; never an exclusion. Audited.';
COMMENT ON COLUMN system_controls.status IS
  'The objective''s state on this system. For an objective delivered per system it FOLLOWS its security solution (settle_system_security; v152, v159) and cannot be set by hand — with no solution it reads missing. not_applicable (with exclusion_reason) remains a person''s judgement. Objectives delivered organisation-wide or with no stated delivery mode are set by hand.';

-- What is now true on this installation.
SELECT settle_system_security();
