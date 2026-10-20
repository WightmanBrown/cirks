-- 0148 — the security architecture: what a system should have, and why
--        (docs/system-security-view.md §4.2–§4.6, step 2; owner, 2026-10-01)
--
-- WHY. A system_controls row says both that an objective is wanted on a system
-- and whether it is there, and nothing records why it is wanted. The owner's
-- answer: a system wants a security solution for one of two reasons —
--   1. the ARCHITECTURE: "a Windows host on the MIG network uses CrowdStrike EDR".
--      A rule on single components, never on a system "type" (decision 2);
--   2. a THREAT: a threat identified on the system makes the objectives that
--      counter it wanted (derived, control_threats), and where the architecture
--      does not already deliver one, someone CHOOSES a solution for the
--      objective (decision 6 — never for the threat).
-- And the architecture says what every system must record about itself so the
-- rules can work at all: at least one member of each membership group (network
-- zone, hosting, operating system, sign-in, support team, user group). A system
-- that records nothing must not read as wanting nothing (§8, dragon 3): each
-- unanswered group is a gap in its own right.
--
-- THE CHANGE.
--   architecture_rules (+ _triggers)  a solution required where ANY trigger
--                                     component is recorded on a system (an OR
--                                     list, never AND), citing a published
--                                     policy/standard/procedure (v139), so each
--                                     rule inherits its owner, approval and review.
--   membership_groups (+ _members, _triggers)
--                                     what a system must record; no triggers =
--                                     every system.
--   system_builds (+ _components)     a set of components applied to a system as
--                                     a COPY (decision 3); nothing links back.
--   system_solution_choices           the solution chosen for an objective on a
--                                     system; counts for every objective the
--                                     solution delivers (§4.5).
-- Views, nothing stored: v_system_wanted_solutions, v_system_wanted_objectives,
-- v_system_membership_gaps, v_system_solutions_in_use; the component-record
-- finding (v138) grows from one reason to four.
--
-- REPORT ONLY (§8, dragon 6): no status and no score reads any of this.
--
-- With no rules, groups or choices defined, the only change anyone sees is that
-- objectives a threat calls for, and that the library has a solution for, are
-- counted as needing a choice. That is deliberate — the honest state of a system
-- whose architecture is not written down — and the dataset step (Misty Isles
-- rules) is what absorbs most of them.

-- ── The rules ─────────────────────────────────────────────────────────────────
CREATE TABLE architecture_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id   UUID NOT NULL REFERENCES delivery_patterns(id),
  standard_id  UUID NOT NULL REFERENCES control_components(id),
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_architecture_rule UNIQUE (pattern_id, standard_id)
);
COMMENT ON TABLE architecture_rules IS
  'The security architecture (v148): a security solution required of every system that records ANY of the rule''s trigger components. Cites the published document it comes from.';

CREATE TABLE architecture_rule_triggers (
  rule_id      UUID NOT NULL REFERENCES architecture_rules(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES control_components(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, component_id)
);
CREATE INDEX idx_art_component ON architecture_rule_triggers (component_id);
COMMENT ON TABLE architecture_rule_triggers IS
  'Any one of these components recorded on a system triggers the rule (an OR list, never AND — §8, dragon 1). A rule with no triggers applies to no system.';

-- ── What every system must record ─────────────────────────────────────────────
CREATE TABLE membership_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  standard_id  UUID NOT NULL REFERENCES control_components(id),
  notes        TEXT,
  sort_index   INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_membership_group_name ON membership_groups (lower(btrim(name)));
COMMENT ON TABLE membership_groups IS
  'What a system must say about itself (v148): it records at least one member of each group that applies to it. A group with no triggers applies to every system.';

CREATE TABLE membership_group_members (
  group_id     UUID NOT NULL REFERENCES membership_groups(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES control_components(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, component_id)
);
CREATE INDEX idx_mgm_component ON membership_group_members (component_id);

CREATE TABLE membership_group_triggers (
  group_id     UUID NOT NULL REFERENCES membership_groups(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES control_components(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, component_id)
);
COMMENT ON TABLE membership_group_triggers IS
  'Optional: the group applies only to a system recording any of these. The six owner groups have none — every system answers every group, with an explicit answer (Supplier-managed (SaaS)) rather than an exemption.';

-- A rule or group cites a document that can carry an architecture: a policy,
-- standard or procedure. A guideline is advisory (v139) and mandates nothing.
CREATE OR REPLACE FUNCTION fn_architecture_cites_document() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE k TEXT; t component_type;
BEGIN
  SELECT component_type, document_kind INTO t, k FROM control_components WHERE id = NEW.standard_id;
  IF t IS DISTINCT FROM 'information' OR k IS NULL OR k = 'guideline' THEN
    RAISE EXCEPTION 'the architecture must cite a policy, standard or procedure from Policies & documents'
      USING ERRCODE = 'check_violation', HINT = 'architecture_document';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_architecture_rule_document BEFORE INSERT OR UPDATE OF standard_id ON architecture_rules
  FOR EACH ROW EXECUTE FUNCTION fn_architecture_cites_document();
CREATE TRIGGER trg_membership_group_document BEFORE INSERT OR UPDATE OF standard_id ON membership_groups
  FOR EACH ROW EXECUTE FUNCTION fn_architecture_cites_document();

-- ── Builds: applied as a copy ─────────────────────────────────────────────────
CREATE TABLE system_builds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_system_build_name ON system_builds (lower(btrim(name)));
COMMENT ON TABLE system_builds IS
  'A set of components that live together (v148), applied to a system as a COPY into system_components. Changing a build changes nothing already applied (decision 3).';

CREATE TABLE system_build_components (
  build_id     UUID NOT NULL REFERENCES system_builds(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES control_components(id) ON DELETE CASCADE,
  PRIMARY KEY (build_id, component_id)
);

-- ── Choices ───────────────────────────────────────────────────────────────────
CREATE TABLE system_solution_choices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id    UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  control_id   UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  pattern_id   UUID NOT NULL REFERENCES delivery_patterns(id),
  notes        TEXT,
  chosen_by    UUID REFERENCES users(id),
  chosen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_solution_choice UNIQUE (system_id, control_id)
);
CREATE INDEX idx_ssc_pattern ON system_solution_choices (pattern_id);
COMMENT ON TABLE system_solution_choices IS
  'The security solution chosen for a control objective on a system (v148). Names the objective, never the threat — why it is wanted stays derived. Once chosen, the solution counts for every objective it delivers.';

CREATE OR REPLACE FUNCTION fn_solution_choice_delivers() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives
                  WHERE pattern_id = NEW.pattern_id AND control_id = NEW.control_id) THEN
    RAISE EXCEPTION 'that security solution does not deliver this control objective'
      USING ERRCODE = 'check_violation', HINT = 'choice_not_delivering';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_solution_choice_delivers BEFORE INSERT OR UPDATE ON system_solution_choices
  FOR EACH ROW EXECUTE FUNCTION fn_solution_choice_delivers();

-- A choice whose solution stops delivering its objective is withdrawn with the
-- link, not left standing as an answer to a question nobody can ask any more.
CREATE OR REPLACE FUNCTION fn_withdraw_orphaned_choices() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM system_solution_choices
   WHERE pattern_id = OLD.pattern_id AND control_id = OLD.control_id;
  RETURN OLD;
END $$;
CREATE TRIGGER trg_withdraw_orphaned_choices AFTER DELETE ON delivery_pattern_objectives
  FOR EACH ROW EXECUTE FUNCTION fn_withdraw_orphaned_choices();

-- ── Derived: what each system wants ───────────────────────────────────────────
-- An objective counts on a system only if it is delivered per system (v127) and
-- neither the SoA nor the system has excluded it.
CREATE OR REPLACE VIEW v_system_objective_excluded AS
SELECT s.id AS system_id, c.id AS control_id
  FROM systems s CROSS JOIN controls c
 WHERE COALESCE(c.delivery, '') NOT IN ('system', '')
    OR EXISTS (SELECT 1 FROM soa_entries se WHERE se.control_id = c.id AND NOT se.applicable)
    OR EXISTS (SELECT 1 FROM system_controls x
                WHERE x.system_id = s.id AND x.control_id = c.id AND x.status = 'not_applicable');

CREATE OR REPLACE VIEW v_system_wanted_solutions AS
SELECT s.id AS system_id, r.pattern_id, p.name AS pattern_name, 'architecture'::text AS reason,
       r.id AS rule_id, r.standard_id, doc.name AS standard_name,
       t.component_id AS trigger_component_id, cc.name AS trigger_component_name,
       NULL::uuid AS control_id
  FROM systems s
  JOIN system_components x ON x.system_id = s.id
  JOIN architecture_rule_triggers t ON t.component_id = x.component_id
  JOIN architecture_rules r ON r.id = t.rule_id
  JOIN delivery_patterns p ON p.id = r.pattern_id
  JOIN control_components doc ON doc.id = r.standard_id
  JOIN control_components cc ON cc.id = t.component_id
 WHERE s.is_active
UNION ALL
SELECT ch.system_id, ch.pattern_id, p.name, 'chosen', NULL, NULL, NULL, NULL, NULL, ch.control_id
  FROM system_solution_choices ch
  JOIN systems s ON s.id = ch.system_id AND s.is_active
  JOIN delivery_patterns p ON p.id = ch.pattern_id;

COMMENT ON VIEW v_system_wanted_solutions IS
  'Each security solution a system wants and why (v148): architecture (a recorded component triggers a rule) or chosen (for an objective). One row per reason.';

-- Per system and objective: is it wanted, how, and is it answered?
--   delivered       one wanted solution delivers it, or a choice is stored for it
--   conflict        two or more wanted solutions deliver it and nobody has chosen
--   needs_solution  a threat on the system calls for it, the library has a
--                   solution for it, and no wanted solution delivers it
-- An objective a threat calls for with NO solution in the library is not here:
-- it keeps the hand-set status list (§6.5).
CREATE OR REPLACE VIEW v_system_wanted_objectives AS
WITH wanted_sol AS (
  SELECT DISTINCT system_id, pattern_id FROM v_system_wanted_solutions
), by_solution AS (
  SELECT w.system_id, o.control_id, array_agg(DISTINCT w.pattern_id) AS pattern_ids
    FROM wanted_sol w JOIN delivery_pattern_objectives o ON o.pattern_id = w.pattern_id
   GROUP BY w.system_id, o.control_id
), by_threat AS (
  SELECT DISTINCT st.system_id, ct.control_id
    FROM system_threats st
    JOIN systems s ON s.id = st.system_id AND s.is_active
    JOIN control_threats ct ON ct.threat_id = st.threat_id
   WHERE EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = ct.control_id)
), chosen AS (
  -- Choose per SOLUTION, not per objective (decision 1): a solution chosen on a
  -- system settles every objective it delivers there, not only the one it was
  -- chosen for. Choosing Defender on an Azure server settles all six endpoint
  -- objectives at once.
  SELECT ch.system_id, o.control_id, array_agg(DISTINCT ch.pattern_id) AS pattern_ids
    FROM system_solution_choices ch
    JOIN delivery_pattern_objectives o ON o.pattern_id = ch.pattern_id
   GROUP BY ch.system_id, o.control_id
), pairs AS (
  SELECT system_id, control_id FROM by_solution UNION SELECT system_id, control_id FROM by_threat
)
SELECT pr.system_id, pr.control_id,
       (t.control_id IS NOT NULL)                                   AS for_threat,
       CASE WHEN ex.pattern_id IS NOT NULL THEN ARRAY[ex.pattern_id]
            WHEN c.pattern_ids IS NOT NULL THEN c.pattern_ids
            ELSE b.pattern_ids END                                  AS pattern_ids,
       COALESCE(ex.pattern_id,
                CASE WHEN cardinality(c.pattern_ids) = 1 THEN c.pattern_ids[1] END) AS chosen_pattern_id,
       -- An exact choice for this objective always settles it; otherwise one
       -- chosen solution delivering it does; two chosen ones that both deliver
       -- it are themselves a conflict, settled by choosing for this objective.
       CASE WHEN ex.pattern_id IS NOT NULL THEN 'delivered'
            WHEN cardinality(c.pattern_ids) = 1 THEN 'delivered'
            WHEN cardinality(c.pattern_ids) > 1 THEN 'conflict'
            WHEN cardinality(b.pattern_ids) > 1 THEN 'conflict'
            WHEN b.pattern_ids IS NOT NULL THEN 'delivered'
            ELSE 'needs_solution' END                               AS state,
       EXISTS (SELECT 1 FROM system_controls x
                WHERE x.system_id = pr.system_id AND x.control_id = pr.control_id) AS recorded
  FROM pairs pr
  LEFT JOIN by_solution b ON b.system_id = pr.system_id AND b.control_id = pr.control_id
  LEFT JOIN by_threat t   ON t.system_id = pr.system_id AND t.control_id = pr.control_id
  LEFT JOIN chosen c      ON c.system_id = pr.system_id AND c.control_id = pr.control_id
  LEFT JOIN system_solution_choices ex ON ex.system_id = pr.system_id AND ex.control_id = pr.control_id
 WHERE NOT EXISTS (SELECT 1 FROM v_system_objective_excluded e
                    WHERE e.system_id = pr.system_id AND e.control_id = pr.control_id);

COMMENT ON VIEW v_system_wanted_objectives IS
  'Per system and control objective (v148): wanted by a wanted solution and/or a threat; state delivered | conflict | needs_solution; recorded = a system_controls row exists. Report only. The solution in play (v_system_control_delivery) is a SUGGESTION for a choice, never an answer — read it separately.';

-- Membership groups a system has not answered: "no network zone recorded".
CREATE OR REPLACE VIEW v_system_membership_gaps AS
SELECT s.id AS system_id, g.id AS group_id, g.name AS group_name, g.sort_index
  FROM systems s
  JOIN membership_groups g ON TRUE
 WHERE s.is_active
   AND (NOT EXISTS (SELECT 1 FROM membership_group_triggers gt WHERE gt.group_id = g.id)
        OR EXISTS (SELECT 1 FROM membership_group_triggers gt
                     JOIN system_components x ON x.component_id = gt.component_id AND x.system_id = s.id
                    WHERE gt.group_id = g.id))
   AND NOT EXISTS (SELECT 1 FROM membership_group_members m
                     JOIN system_components x ON x.component_id = m.component_id AND x.system_id = s.id
                    WHERE m.group_id = g.id);

-- The solution(s) whose parts an objective needs on a system: a wanted one where
-- there is one (chosen, else architecture — both, while they conflict), else the
-- one in play (v145). The single rule the finding, the system page and the risk
-- page read, so they cannot disagree.
CREATE OR REPLACE VIEW v_system_solutions_in_use AS
WITH w AS MATERIALIZED (
  SELECT system_id, control_id, pattern_ids, chosen_pattern_id
    FROM v_system_wanted_objectives WHERE pattern_ids IS NOT NULL
), d AS MATERIALIZED (
  SELECT system_id, control_id, pattern_id FROM v_system_control_delivery WHERE pattern_id IS NOT NULL
)
SELECT w.system_id, w.control_id, unnest(w.pattern_ids) AS pattern_id,
       CASE WHEN w.chosen_pattern_id IS NOT NULL THEN 'chosen' ELSE 'architecture' END AS basis
  FROM w
UNION ALL
SELECT d.system_id, d.control_id, d.pattern_id, 'in_play'
  FROM d
 WHERE NOT EXISTS (SELECT 1 FROM w WHERE w.system_id = d.system_id AND w.control_id = d.control_id);

-- ── The component-record finding learns the architecture ─────────────────────
-- Four reasons, one finding (§5): a per-system part the system needs is not
-- recorded; a membership group is not answered; an objective the architecture
-- wants has no system_controls row; an objective needs a solution chosen (none
-- wanted delivers it, or two conflict). Same columns as v138, plus the reasons.
CREATE OR REPLACE VIEW v_system_component_findings AS
WITH legacy AS MATERIALIZED (
  SELECT DISTINCT syc.system_id, cc.id AS component_id, cc.name
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
    JOIN control_component_links ccl ON ccl.control_id = syc.control_id
    JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation = 'per_system'
   WHERE syc.status <> 'not_applicable'
     AND NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = syc.control_id)
), in_use AS MATERIALIZED (
  SELECT * FROM v_system_solutions_in_use
), patterned AS MATERIALIZED (
  SELECT DISTINCT u.system_id, pp.component_id, cc.name
    FROM in_use u
    JOIN delivery_pattern_parts pp ON pp.pattern_id = u.pattern_id AND pp.location = 'on_system'
    JOIN control_components cc ON cc.id = pp.component_id
), needed AS MATERIALIZED (
  SELECT * FROM legacy UNION SELECT * FROM patterned
), missing AS MATERIALIZED (
  SELECT n.system_id, count(*)::int AS n,
         array_agg(n.component_id ORDER BY n.name) AS ids, array_agg(n.name ORDER BY n.name) AS names
    FROM needed n
   WHERE NOT EXISTS (SELECT 1 FROM system_components x
                      WHERE x.system_id = n.system_id AND x.component_id = n.component_id)
   GROUP BY n.system_id
), groups AS MATERIALIZED (
  SELECT system_id, array_agg(group_name ORDER BY sort_index, group_name) AS names
    FROM v_system_membership_gaps GROUP BY system_id
), objectives AS MATERIALIZED (
  SELECT w.system_id,
         array_agg(COALESCE(c.reference_code || ' ', '') || c.title ORDER BY c.reference_code, c.title)
           FILTER (WHERE w.state <> 'needs_solution' AND NOT w.recorded)          AS unrecorded,
         count(*) FILTER (WHERE w.state = 'needs_solution')::int                  AS needs_solution,
         count(*) FILTER (WHERE w.state = 'conflict')::int                        AS conflicts
    FROM v_system_wanted_objectives w JOIN controls c ON c.id = w.control_id
   GROUP BY w.system_id
)
SELECT s.id AS system_id,
       s.name AS system_name,
       s.department_id,
       s.is_shared,
       s.owner_user_id,
       COALESCE(m.n, 0)                                   AS missing_count,
       COALESCE(m.ids, '{}')                              AS missing_component_ids,
       COALESCE(m.names, '{}')                            AS missing_component_names,
       ((SELECT count(*) FROM needed a WHERE a.system_id = s.id))::integer AS needed_count,
       COALESCE(g.names, '{}')                            AS missing_membership_names,
       COALESCE(o.unrecorded, '{}')                       AS unrecorded_objective_names,
       COALESCE(o.needs_solution, 0)                      AS needs_solution_count,
       COALESCE(o.conflicts, 0)                           AS conflict_count
  FROM systems s
  LEFT JOIN missing m    ON m.system_id = s.id
  LEFT JOIN groups g     ON g.system_id = s.id
  LEFT JOIN objectives o ON o.system_id = s.id
 WHERE s.is_active
   AND (m.n > 0 OR g.names IS NOT NULL OR o.unrecorded IS NOT NULL
        OR o.needs_solution > 0 OR o.conflicts > 0);

-- An action raised from the finding completes only when nothing it names remains
-- (v134: done means fixed). It used to look only at the missing components.
CREATE OR REPLACE FUNCTION fn_component_record_outstanding(p_system UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(concat_ws('; ',
           CASE WHEN f.missing_count > 0 THEN 'no record of: ' || array_to_string(f.missing_component_names, ', ') END,
           CASE WHEN cardinality(f.missing_membership_names) > 0
                THEN 'nothing recorded for: ' || array_to_string(f.missing_membership_names, ', ') END,
           CASE WHEN cardinality(f.unrecorded_objective_names) > 0
                THEN 'wanted but not recorded: ' || array_to_string(f.unrecorded_objective_names, ', ') END,
           CASE WHEN f.needs_solution_count > 0
                THEN f.needs_solution_count || ' objective(s) needing a security solution chosen' END,
           CASE WHEN f.conflict_count > 0
                THEN f.conflict_count || ' objective(s) with conflicting security solutions' END), '')
    FROM v_system_component_findings f WHERE f.system_id = p_system
$$;

CREATE OR REPLACE FUNCTION fn_sa_finding_resolved_before_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[];
  overdue TEXT;
  outstanding TEXT;
BEGIN
  IF NEW.origin = 'rating_incomplete' THEN
    SELECT f.missing_table_names INTO missing
      FROM v_asset_rating_findings f WHERE f.asset_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'the asset is still not rated against: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'component_record' THEN
    outstanding := fn_component_record_outstanding(NEW.subject_id);
    IF outstanding IS NOT NULL THEN
      RAISE EXCEPTION 'the system''s record is still incomplete — %', outstanding
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'document_review' THEN
    SELECT f.next_review INTO overdue
      FROM v_document_review_findings f WHERE f.component_id = NEW.subject_id;
    IF overdue IS NOT NULL THEN
      RAISE EXCEPTION 'the document is still past its review date (%) — record the review and its next date', overdue
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  ELSIF NEW.origin = 'supplier_assurance' THEN
    SELECT f.unmet_refs INTO missing
      FROM v_supplier_assurance_findings f WHERE f.relationship_id = NEW.subject_id;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'no current evidence yet covers: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation', HINT = 'finding_unresolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
