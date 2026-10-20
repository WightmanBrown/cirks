-- 0145 — delivery patterns: the valid ways a control objective is delivered
--        (docs/control-delivery-patterns.md; owner, 2026-09-30)
--
-- WHY. A control objective's component list in the library is flat, and the
-- component-record rule (v138) reads it as "all of these, on every system the
-- control is deployed on". For objectives with more than one way of delivery it
-- is really a menu: PR.DS-02 lists a VPN, a secure radio, Signal and Starlink, so
-- a Teams SaaS was asked for Signal. And a flat list cannot stop incorrect mixes:
-- a Falcon agent reporting to a Defender console is not a working control.
--
-- THE MODEL (owner's framing, paper-tested on 107 CIRKS-test deployments):
--   * A DELIVERY PATTERN is one named, valid chain that achieves an objective.
--     Alternatives are BETWEEN patterns, never within one — so no mixes.
--   * A PART says WHERE it must be:
--       on_system     on the system itself (an agent, a client, a TLS setting);
--       service       on a named security SERVICE, which is a system in the
--                     register (the owner: "technology clusters are actually
--                     systems") — the part's state is its state on that
--                     service, so a degraded SOC or console is marked ONCE;
--       organisation  exists once for the organisation (a policy, the tenant).
--     Only the service parts the pattern relies on are named (owner, question 2):
--     a degraded patching tool on the backup service does not degrade backups.
--   * A pattern of kind SUPPLIER ("provided by the supplier") is met when a live
--     supplier relationship hosting or operating the system has current evidence
--     covering the objective (v144, decision 8).
--
-- REPORT, DON'T DECIDE. The paper exercise found 17 deployments hand-marked
-- degraded where no part is degraded, and 62 of 107 where hand-set status and
-- inventory disagree. So nothing here changes system_controls.status or any risk
-- score. The delivery state is shown beside the hand-set status, with the
-- disagreement named, and the component-record finding asks only for the
-- missing on-system parts of the pattern actually in play.
--
-- An objective with NO patterns keeps the old rule exactly: nothing changes until
-- someone writes a pattern for it.

CREATE TABLE delivery_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id  UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  kind        TEXT NOT NULL DEFAULT 'parts' CHECK (kind IN ('parts', 'supplier')),
  notes       TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_delivery_pattern_name ON delivery_patterns (control_id, lower(btrim(name)));
-- One "provided by the supplier" pattern per objective is enough.
CREATE UNIQUE INDEX uq_delivery_pattern_supplier ON delivery_patterns (control_id) WHERE kind = 'supplier';

CREATE TABLE delivery_pattern_parts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id         UUID NOT NULL REFERENCES delivery_patterns(id) ON DELETE CASCADE,
  component_id       UUID NOT NULL REFERENCES control_components(id) ON DELETE CASCADE,
  location           TEXT NOT NULL CHECK (location IN ('on_system', 'service', 'organisation')),
  service_system_id  UUID REFERENCES systems(id) ON DELETE RESTRICT,
  CONSTRAINT chk_dpp_service CHECK ((location = 'service') = (service_system_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_delivery_pattern_part
  ON delivery_pattern_parts (pattern_id, component_id, location, service_system_id) NULLS NOT DISTINCT;
CREATE INDEX idx_dpp_component ON delivery_pattern_parts (component_id);

COMMENT ON TABLE delivery_patterns IS
  'One named, valid way of delivering a control objective (v145). Alternatives are between patterns, never within one. kind=supplier: met by the supplier''s evidence.';
COMMENT ON TABLE delivery_pattern_parts IS
  'A part of a delivery pattern and where it must be: on the system, on a named security service (a system), or once for the organisation (v145).';

-- A supplier pattern has no parts; its evidence is the supplier's.
CREATE OR REPLACE FUNCTION fn_dpp_parts_pattern_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT kind FROM delivery_patterns WHERE id = NEW.pattern_id) = 'supplier' THEN
    RAISE EXCEPTION 'a "provided by the supplier" pattern has no parts: it is met by the supplier''s evidence'
      USING ERRCODE = 'check_violation', HINT = 'supplier_pattern_parts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dpp_parts_pattern_only
  BEFORE INSERT OR UPDATE OF pattern_id ON delivery_pattern_parts
  FOR EACH ROW EXECUTE FUNCTION fn_dpp_parts_pattern_only();

-- ── Each pattern's state on each system where its objective is deployed ────────
-- Part state: operational → ok, degraded → degraded, anything else (missing,
-- unknown, not recorded) → missing. A pattern is IN PLAY on a system when one of
-- its on-system parts is recorded there, or it has no on-system parts at all, or
-- (supplier kind) a live supplier relationship hosts or operates the system.
CREATE VIEW v_delivery_pattern_state AS
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
    JOIN delivery_patterns p       ON p.control_id = d.control_id AND p.kind = 'parts'
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
    FROM dep d JOIN delivery_patterns p ON p.control_id = d.control_id AND p.kind = 'supplier'
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

COMMENT ON VIEW v_delivery_pattern_state IS
  'Each delivery pattern''s state (complete / degraded / incomplete) on each system its objective is deployed on, with the parts missing or degraded, and whether it is in play there (v145). Report only.';

-- ── The control's delivery on each system: the best pattern in play ────────────
CREATE VIEW v_system_control_delivery AS
WITH ranked AS (
  SELECT ps.*, row_number() OVER (
           PARTITION BY ps.system_id, ps.control_id
           ORDER BY ps.in_play DESC,
                    CASE ps.state WHEN 'complete' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END,
                    ps.on_system_recorded DESC, ps.parts_ok DESC, ps.pattern_name) AS rk
    FROM v_delivery_pattern_state ps
)
SELECT syc.system_id, syc.control_id, syc.status::text AS marked_status,
       -- A pattern is named only when it is in play here.
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
           THEN 'marked operational, but no delivery pattern is complete'
         WHEN syc.status = 'operational' AND r.state = 'degraded'
           THEN 'marked operational, but a part it relies on is degraded'
         WHEN syc.status = 'degraded' AND r.in_play AND r.state = 'complete'
           THEN 'marked degraded, but every part it relies on is working'
         WHEN syc.status IN ('missing', 'unknown') AND r.in_play AND r.state IN ('complete', 'degraded')
           THEN 'marked ' || syc.status::text || ', but a delivery pattern is in place'
       END AS disagreement
  FROM system_controls syc
  JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, '') IN ('system', '')
  JOIN systems s  ON s.id = syc.system_id AND s.is_active
  LEFT JOIN ranked r ON r.system_id = syc.system_id AND r.control_id = syc.control_id AND r.rk = 1
 WHERE syc.status <> 'not_applicable';

COMMENT ON VIEW v_system_control_delivery IS
  'How each per-system control is actually delivered on each system — the best delivery pattern in play — beside its hand-set status, with any disagreement named (v145). Report only: no status or score reads it.';

-- ── The component-record finding asks for the pattern in play ─────────────────
-- For an objective WITH patterns, a system is asked only for the missing
-- on-system parts of the pattern in play there (none if a pattern is complete or
-- no pattern is in play — that is a delivery question, not a record gap). An
-- objective WITHOUT patterns keeps the v138 rule unchanged.
CREATE OR REPLACE VIEW v_system_component_findings AS
WITH legacy AS (
  SELECT DISTINCT syc.system_id, cc.id AS component_id, cc.name
    FROM system_controls syc
    JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
    JOIN control_component_links ccl ON ccl.control_id = syc.control_id
    JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation = 'per_system'
   WHERE syc.status <> 'not_applicable'
     AND NOT EXISTS (SELECT 1 FROM delivery_patterns dp WHERE dp.control_id = syc.control_id)
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
