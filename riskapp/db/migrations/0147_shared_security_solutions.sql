-- 0147 — security solutions are shared: one solution delivers many objectives
--        (docs/system-security-view.md §4.1, step 1; owner, 2026-10-01)
--
-- WHY. A delivery pattern (v145) belonged to one control objective. But a real
-- solution delivers several: CrowdStrike EDR monitors, logs, correlates, prevents
-- unauthorised software and eradicates — six objectives — so the library held six
-- copies of it with identical parts, and the Misty Isles 65 pattern rows were
-- really 20 solutions. The next step lets the security architecture require a
-- solution of a system, and an IAM choose one for an objective; both are
-- decisions about the SOLUTION, made once, not once per objective. Owner:
-- "choose per solution, not per objective", and the UI name is "security
-- solution" (the table keeps its name).
--
-- THE CHANGE. delivery_patterns loses control_id; delivery_pattern_objectives
-- says which objectives each solution delivers. Every view that reads patterns
-- joins through it and returns exactly the columns it did, so nothing that reads
-- them changes.
--
-- MERGING. Patterns with the same name, kind and part list become one solution
-- delivering all their objectives (the oldest row is kept, so its id survives).
-- Same-named patterns whose parts DIFFER are not the same solution; they are kept
-- apart and numbered "Name (2)", "Name (3)" so names stay unique and someone can
-- decide later. On CIRKS-test every name had exactly one part list.
--
-- "Provided by the supplier" becomes ONE solution: what it means does not depend
-- on the objective (met by the supplier's current evidence covering it, v144).
--
-- No behaviour change: the same patterns are in play on the same systems, with
-- the same parts, as before.

CREATE TABLE delivery_pattern_objectives (
  pattern_id  UUID NOT NULL REFERENCES delivery_patterns(id) ON DELETE CASCADE,
  control_id  UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  PRIMARY KEY (pattern_id, control_id)
);
CREATE INDEX idx_dpo_control ON delivery_pattern_objectives (control_id);

COMMENT ON TABLE delivery_pattern_objectives IS
  'The control objectives a security solution (delivery pattern) delivers (v147). One solution, many objectives.';

INSERT INTO delivery_pattern_objectives (pattern_id, control_id)
SELECT id, control_id FROM delivery_patterns;

-- ── Merge identical patterns ──────────────────────────────────────────────────
CREATE TEMP TABLE _dp_sig ON COMMIT DROP AS
SELECT p.id, p.kind, lower(btrim(p.name)) AS lname, p.created_at,
       COALESCE((SELECT string_agg(pp.component_id::text || '|' || pp.location || '|' || COALESCE(pp.service_system_id::text, ''),
                                   ',' ORDER BY pp.component_id, pp.location, pp.service_system_id)
                   FROM delivery_pattern_parts pp WHERE pp.pattern_id = p.id), '') AS parts
  FROM delivery_patterns p;

-- The supplier pattern means the same everywhere: one group, whatever its name.
UPDATE _dp_sig SET lname = '<supplier>', parts = '' WHERE kind = 'supplier';

CREATE TEMP TABLE _dp_keep ON COMMIT DROP AS
SELECT id, first_value(id) OVER (PARTITION BY kind, lname, parts ORDER BY created_at, id) AS keep_id
  FROM _dp_sig;

INSERT INTO delivery_pattern_objectives (pattern_id, control_id)
SELECT k.keep_id, o.control_id
  FROM _dp_keep k JOIN delivery_pattern_objectives o ON o.pattern_id = k.id
 WHERE k.id <> k.keep_id
ON CONFLICT DO NOTHING;

DELETE FROM delivery_patterns p USING _dp_keep k WHERE p.id = k.id AND k.id <> k.keep_id;

-- Same name, different parts: number all but the oldest.
WITH clash AS (
  SELECT p.id, p.name,
         row_number() OVER (PARTITION BY lower(btrim(p.name)) ORDER BY p.created_at, p.id) AS n
    FROM delivery_patterns p
)
UPDATE delivery_patterns p SET name = btrim(c.name) || ' (' || c.n || ')', updated_at = now()
  FROM clash c WHERE c.id = p.id AND c.n > 1;

-- ── Views: join through delivery_pattern_objectives, same columns as before ────
CREATE OR REPLACE VIEW v_delivery_pattern_state AS
WITH dep AS (
  SELECT syc.system_id, syc.control_id
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, '') IN ('system', '')
    JOIN systems s  ON s.id = syc.system_id AND s.is_active
   WHERE syc.status <> 'not_applicable'
), parts AS (
  SELECT d.system_id, d.control_id, p.id AS pattern_id, pp.component_id, pp.location, cc.name AS component_name,
         CASE pp.location
           WHEN 'on_system' THEN (SELECT x.status::text FROM system_components x
                                   WHERE x.system_id = d.system_id AND x.component_id = pp.component_id)
           WHEN 'service'   THEN (SELECT x.status::text FROM system_components x
                                   WHERE x.system_id = pp.service_system_id AND x.component_id = pp.component_id)
           ELSE (SELECT st.status FROM v_component_state st WHERE st.component_id = pp.component_id)
         END AS raw_status
    FROM dep d
    JOIN delivery_pattern_objectives o ON o.control_id = d.control_id
    JOIN delivery_patterns p       ON p.id = o.pattern_id AND p.kind = 'parts'
    JOIN delivery_pattern_parts pp ON pp.pattern_id = p.id
    JOIN control_components cc     ON cc.id = pp.component_id
), part_rollup AS (
  SELECT system_id, control_id, pattern_id,
         COUNT(*)::int                                                          AS parts_total,
         COUNT(*) FILTER (WHERE raw_status = 'operational')::int                AS parts_ok,
         array_agg(component_name ORDER BY component_name) FILTER (WHERE raw_status = 'degraded') AS degraded_parts,
         array_agg(component_name ORDER BY component_name)
           FILTER (WHERE raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))  AS missing_parts,
         array_agg(component_id ORDER BY component_name)
           FILTER (WHERE location = 'on_system' AND (raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))) AS missing_on_system_ids,
         array_agg(component_name ORDER BY component_name)
           FILTER (WHERE location = 'on_system' AND (raw_status IS NULL OR raw_status NOT IN ('operational', 'degraded'))) AS missing_on_system_names,
         COUNT(*) FILTER (WHERE location = 'on_system')::int                    AS on_system_parts,
         COUNT(*) FILTER (WHERE location = 'on_system' AND raw_status IS NOT NULL)::int AS on_system_recorded
    FROM parts GROUP BY system_id, control_id, pattern_id
), supplier AS (
  SELECT d.system_id, d.control_id, p.id AS pattern_id,
         EXISTS (SELECT 1 FROM supplier_relationships sr
                  WHERE sr.system_id = d.system_id AND sr.status IN ('active', 'exiting')
                    AND sr.relationship_type IN ('service_provider', 'contracted_service')) AS has_supplier,
         EXISTS (SELECT 1 FROM supplier_relationships sr
                   JOIN v_supplier_objective_coverage cov ON cov.relationship_id = sr.id AND cov.control_id = d.control_id AND cov.met
                  WHERE sr.system_id = d.system_id AND sr.status IN ('active', 'exiting')
                    AND sr.relationship_type IN ('service_provider', 'contracted_service')) AS evidenced
    FROM dep d
    JOIN delivery_pattern_objectives o ON o.control_id = d.control_id
    JOIN delivery_patterns p ON p.id = o.pattern_id AND p.kind = 'supplier'
)
SELECT r.system_id, r.control_id, r.pattern_id, p.name AS pattern_name, 'parts'::text AS kind,
       (r.on_system_parts = 0 OR r.on_system_recorded > 0)                       AS in_play,
       CASE WHEN r.missing_parts IS NOT NULL THEN 'incomplete'
            WHEN r.degraded_parts IS NOT NULL THEN 'degraded'
            ELSE 'complete' END                                                  AS state,
       r.parts_total, r.parts_ok, r.degraded_parts, r.missing_parts,
       r.missing_on_system_ids, r.missing_on_system_names, r.on_system_recorded
  FROM part_rollup r JOIN delivery_patterns p ON p.id = r.pattern_id
UNION ALL
SELECT s.system_id, s.control_id, s.pattern_id, p.name, 'supplier',
       s.has_supplier,
       CASE WHEN s.evidenced THEN 'complete' ELSE 'incomplete' END,
       0, 0, NULL, CASE WHEN s.evidenced THEN NULL ELSE ARRAY['current supplier evidence']::text[] END,
       NULL, NULL, CASE WHEN s.has_supplier THEN 1 ELSE 0 END
  FROM supplier s JOIN delivery_patterns p ON p.id = s.pattern_id;

-- The disagreement text the system and objective pages show uses the owner's
-- name for these, "security solution" (same columns, same logic as v145).
CREATE OR REPLACE VIEW v_system_control_delivery AS
WITH ranked AS (
  SELECT ps.*, row_number() OVER (
           PARTITION BY ps.system_id, ps.control_id
           ORDER BY ps.in_play DESC,
                    CASE ps.state WHEN 'complete' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END,
                    ps.on_system_recorded DESC, ps.parts_ok DESC, ps.pattern_name) AS rk
    FROM v_delivery_pattern_state ps
)
SELECT syc.system_id, syc.control_id, syc.status::text AS marked_status,
       -- A solution is named only when it is in play here.
       CASE WHEN r.in_play THEN r.pattern_id END   AS pattern_id,
       CASE WHEN r.in_play THEN r.pattern_name END AS pattern_name,
       CASE WHEN r.in_play THEN r.kind END         AS pattern_kind,
       CASE WHEN r.pattern_id IS NULL THEN NULL           -- the objective has no patterns
            WHEN NOT r.in_play THEN 'no_pattern_in_place'
            ELSE r.state END                              AS delivery,
       CASE WHEN r.in_play THEN r.degraded_parts END AS degraded_parts,
       CASE WHEN r.in_play THEN r.missing_parts END  AS missing_parts,
       CASE
         WHEN r.pattern_id IS NULL THEN NULL
         WHEN syc.status = 'operational' AND (NOT r.in_play OR r.state = 'incomplete')
           THEN 'marked operational, but no security solution is complete'
         WHEN syc.status = 'operational' AND r.state = 'degraded'
           THEN 'marked operational, but a part it relies on is degraded'
         WHEN syc.status = 'degraded' AND r.in_play AND r.state = 'complete'
           THEN 'marked degraded, but every part it relies on is working'
         WHEN syc.status IN ('missing', 'unknown') AND r.in_play AND r.state IN ('complete', 'degraded')
           THEN 'marked ' || syc.status::text || ', but a security solution is in place'
       END AS disagreement
  FROM system_controls syc
  JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, '') IN ('system', '')
  JOIN systems s  ON s.id = syc.system_id AND s.is_active
  LEFT JOIN ranked r ON r.system_id = syc.system_id AND r.control_id = syc.control_id AND r.rk = 1
 WHERE syc.status <> 'not_applicable';

CREATE OR REPLACE VIEW v_system_component_findings AS
WITH legacy AS (
  SELECT DISTINCT syc.system_id, cc.id AS component_id, cc.name
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
    JOIN control_component_links ccl ON ccl.control_id = syc.control_id
    JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation = 'per_system'
   WHERE syc.status <> 'not_applicable'
     AND NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = syc.control_id)
), patterned AS (
  SELECT DISTINCT d.system_id, pp.component_id, cc.name
    FROM v_system_control_delivery d
    JOIN delivery_pattern_parts pp ON pp.pattern_id = d.pattern_id AND pp.location = 'on_system'
    JOIN control_components cc ON cc.id = pp.component_id
   WHERE d.delivery IN ('complete', 'degraded', 'incomplete')
), needed AS (
  SELECT * FROM legacy UNION SELECT * FROM patterned
)
SELECT s.id AS system_id,
       s.name AS system_name,
       s.department_id,
       s.is_shared,
       s.owner_user_id,
       count(*)::integer AS missing_count,
       array_agg(n.component_id ORDER BY n.name) AS missing_component_ids,
       array_agg(n.name ORDER BY n.name) AS missing_component_names,
       ((SELECT count(*) FROM needed a WHERE a.system_id = s.id))::integer AS needed_count
  FROM needed n
  JOIN systems s ON s.id = n.system_id AND s.is_active
 WHERE NOT EXISTS (SELECT 1 FROM system_components x
                    WHERE x.system_id = n.system_id AND x.component_id = n.component_id)
 GROUP BY s.id;

CREATE OR REPLACE VIEW v_supplier_relationship_objectives AS
SELECT relationship_id, control_id,
       array_agg(source ORDER BY source = 'all', source = 'delivered_here', source) AS sources
  FROM (
    SELECT sr.id AS relationship_id, sto.control_id, sto.applies_to AS source
      FROM supplier_relationships sr
      JOIN supplier_type_objectives sto ON sto.applies_to = 'all' OR sto.applies_to = sr.relationship_type
    UNION
    SELECT sr.id, syc.control_id, 'delivered_here'
      FROM supplier_relationships sr
      JOIN system_controls syc ON syc.system_id = sr.system_id AND syc.status <> 'not_applicable'
     WHERE sr.relationship_type IN ('service_provider', 'contracted_service')
       AND EXISTS (SELECT 1 FROM delivery_pattern_objectives o JOIN delivery_patterns dp ON dp.id = o.pattern_id
                    WHERE o.control_id = syc.control_id AND dp.kind = 'supplier')
       AND NOT EXISTS (
         SELECT 1 FROM delivery_pattern_objectives o JOIN delivery_patterns own ON own.id = o.pattern_id
          WHERE o.control_id = syc.control_id AND own.kind = 'parts'
            AND (NOT EXISTS (SELECT 1 FROM delivery_pattern_parts pp
                              WHERE pp.pattern_id = own.id AND pp.location = 'on_system')
                 OR EXISTS (SELECT 1 FROM delivery_pattern_parts pp
                              JOIN system_components x ON x.component_id = pp.component_id AND x.system_id = syc.system_id
                             WHERE pp.pattern_id = own.id AND pp.location = 'on_system')))
  ) x
 GROUP BY relationship_id, control_id;

-- ── The column goes; names are unique across the library ──────────────────────
DROP INDEX uq_delivery_pattern_name;
DROP INDEX uq_delivery_pattern_supplier;
ALTER TABLE delivery_patterns DROP COLUMN control_id;

CREATE UNIQUE INDEX uq_delivery_pattern_name ON delivery_patterns (lower(btrim(name)));
-- One "provided by the supplier" solution for the whole library.
CREATE UNIQUE INDEX uq_delivery_pattern_supplier ON delivery_patterns ((kind)) WHERE kind = 'supplier';

COMMENT ON TABLE delivery_patterns IS
  'A security solution: one named, valid way of delivering one or more control objectives (v145; shared across objectives since v147 — see delivery_pattern_objectives). Alternatives are between solutions, never within one. kind=supplier: met by the supplier''s evidence.';
