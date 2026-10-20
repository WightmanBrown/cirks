-- 0158 — retire component-to-component relationships (owner, 2026-10-13)
--
-- `control_component_relationships` (v29) linked one component to another with a
-- type — operated_by, depends_on, documented_by, … — and `v_control_gap_analysis`
-- (v30) followed those links up to five steps to find a non-working component
-- behind a control. That was the first attempt at "what does this control depend
-- on, and is it working?".
--
-- Security solutions (v145, shared since v147) answer that question now: a
-- solution IS the statement of dependence — these components, in these places,
-- must be working — and since v152 an objective's status follows it. By
-- 2026-10-13 nothing that decides a status, a finding or a score read a
-- relationship; the only screen that created one had been removed as defunct;
-- the gap-analysis view was queried by no code; and Misty Isles held 2 rows
-- across 206 components.
--
-- The owner's golden rule, the same day: ONLY MODEL THINGS THAT HELP ANSWER A
-- SECURITY QUESTION. These links described how things relate without changing
-- any security answer, so they go — with the system page's Graph tab, which
-- drew them (see docs/modelling-patterns.md, "The line").
--
-- NOT LOST SILENTLY: each relationship that exists is written to the audit log
-- before the table is dropped, so an installation that used them can see what
-- they were and re-express any that matter as parts of a security solution.

INSERT INTO audit_log (entity_type, entity_id, entity_label, action, changes, human_narrative)
SELECT 'control_components', r.source_component_id, src.name, 'delete',
       jsonb_build_object(
         'retired', 'component_relationship',
         'source', src.name, 'source_type', src.component_type,
         'relationship_type', r.relationship_type,
         'target', tgt.name, 'target_type', tgt.component_type,
         'recorded_at', r.created_at, 'migration', '0158'),
       format('Component relationship retired with the feature (v158): "%s" %s "%s". If it matters, record both as parts of a security solution.',
              src.name, replace(r.relationship_type, '_', ' '), tgt.name)
  FROM control_component_relationships r
  JOIN control_components src ON src.id = r.source_component_id
  JOIN control_components tgt ON tgt.id = r.target_component_id;

DROP VIEW IF EXISTS v_control_gap_analysis;
DROP TABLE control_component_relationships;
