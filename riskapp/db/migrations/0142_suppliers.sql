-- 0142 — suppliers, and what each relationship with them touches
--        (docs/supplier-model.md, step 1)
--
-- WHY. CIRKS had no concept of a supplier: the training data expressed them as
-- components, inconsistently, and nothing recorded the contract, who was
-- accountable, or how critical the supplier was — most of what ISO 27001
-- A.5.19–5.23 and NIST CSF GV.SC ask about.
--
-- THE MODEL (owner's decisions, 2026-09-29):
--   * `suppliers` is the organisation — a name, nothing else. The TYPE sits on
--     the RELATIONSHIP, because one supplier can be several: Microsoft hosts a
--     SaaS (service_provider) and supplies software (product).
--   * `supplier_relationships` — one per thing we have with them: its type, the
--     CONTRACTING DEPARTMENT, what it touches, the contract and a status.
--   * What it touches follows from the type, and the database holds it to that:
--       onshore             a PEOPLE component (contractors are just a people
--                           component — decision 6)
--       contracted_service  the SYSTEM it operates, and optionally the people or
--                           process component that operates it
--       service_provider    the SYSTEM it hosts (a SaaS is a system — decision 3)
--       product             the TECHNOLOGY component it is the origin of
--   * OWNERSHIP is departmental and the person is DERIVED: the contracting
--     department's IAO, falling back to the SIRO (v_department_risk_owner) — the
--     v108 pattern, so it never goes stale when people move (decision 2).
--   * CRITICALITY is DERIVED from what the relationship touches: the highest
--     impact of the systems it hosts or operates, or of the systems carrying the
--     component. Typed-in criticality would drift from the systems it describes.
--
-- Contract terms and assurance reports (the evidence that an objective is met —
-- decision 5) and the per-type control sets are later steps.

CREATE TABLE suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  notes       TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One supplier, one row: "Microsoft" and "microsoft" are the same organisation.
CREATE UNIQUE INDEX uq_suppliers_name ON suppliers (lower(btrim(name)));

CREATE TABLE supplier_relationships (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  relationship_type  TEXT NOT NULL
    CHECK (relationship_type IN ('onshore', 'contracted_service', 'service_provider', 'product')),
  department_id      UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  system_id          UUID REFERENCES systems(id) ON DELETE RESTRICT,
  component_id       UUID REFERENCES control_components(id) ON DELETE RESTRICT,
  description        TEXT,
  contract_ref       TEXT,
  contract_url       TEXT CHECK (contract_url IS NULL OR contract_url ~* '^https?://'),
  contract_start     DATE,
  contract_end       DATE,
  -- No default: whether it is proposed, live, being exited or over is a fact
  -- someone states, not a guess the database makes.
  status             TEXT NOT NULL CHECK (status IN ('proposed', 'active', 'exiting', 'ended')),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_sr_contract_dates CHECK (contract_end IS NULL OR contract_start IS NULL OR contract_end >= contract_start),
  -- What each type touches (§2 of the design note).
  CONSTRAINT chk_sr_touches CHECK (
    (relationship_type = 'onshore'            AND component_id IS NOT NULL AND system_id IS NULL) OR
    (relationship_type = 'contracted_service' AND system_id    IS NOT NULL) OR
    (relationship_type = 'service_provider'   AND system_id    IS NOT NULL AND component_id IS NULL) OR
    (relationship_type = 'product'            AND component_id IS NOT NULL AND system_id IS NULL))
);
CREATE INDEX idx_sr_supplier  ON supplier_relationships (supplier_id);
CREATE INDEX idx_sr_system    ON supplier_relationships (system_id)    WHERE system_id IS NOT NULL;
CREATE INDEX idx_sr_component ON supplier_relationships (component_id) WHERE component_id IS NOT NULL;

COMMENT ON TABLE supplier_relationships IS
  'One thing we have with a supplier: its type, the contracting department (owner), what it touches, contract and status. v142, docs/supplier-model.md.';

-- The component must be of the kind the type implies. A CHECK cannot see
-- another table, so a trigger holds it — every path.
CREATE OR REPLACE FUNCTION fn_supplier_relationship_component_kind()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  kind TEXT;
BEGIN
  IF NEW.component_id IS NULL THEN RETURN NEW; END IF;
  SELECT component_type::text INTO kind FROM control_components WHERE id = NEW.component_id;
  IF NEW.relationship_type = 'onshore' AND kind <> 'people' THEN
    RAISE EXCEPTION 'onshore contractors are a people component (this one is %)', kind
      USING ERRCODE = 'check_violation', HINT = 'supplier_component_kind';
  ELSIF NEW.relationship_type = 'contracted_service' AND kind NOT IN ('people', 'process') THEN
    RAISE EXCEPTION 'a contracted-out service is operated by people or a process (this component is %)', kind
      USING ERRCODE = 'check_violation', HINT = 'supplier_component_kind';
  ELSIF NEW.relationship_type = 'product' AND kind <> 'technology' THEN
    RAISE EXCEPTION 'a product supplier supplies a technology component (this one is %)', kind
      USING ERRCODE = 'check_violation', HINT = 'supplier_component_kind';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_supplier_relationship_component_kind
  BEFORE INSERT OR UPDATE OF relationship_type, component_id ON supplier_relationships
  FOR EACH ROW EXECUTE FUNCTION fn_supplier_relationship_component_kind();

-- Who is accountable is the contracting DEPARTMENT, so moving a relationship
-- between departments is an accountability change — audited by the v106
-- trigger, as for systems, assets and services. Status and contract end ride
-- along: ending a relationship is the other decision worth attributing.
CREATE TRIGGER trg_audit_supplier_relationship
  AFTER UPDATE ON supplier_relationships
  FOR EACH ROW EXECUTE FUNCTION fn_audit_accountability('department_id', 'status', 'contract_end');

-- ── Derived: which systems a relationship touches, and so how critical it is ──
CREATE VIEW v_supplier_relationship_systems AS
  SELECT sr.id AS relationship_id, sr.system_id
    FROM supplier_relationships sr WHERE sr.system_id IS NOT NULL
UNION
  SELECT sr.id, p.system_id
    FROM supplier_relationships sr
    JOIN v_component_presence p ON p.component_id = sr.component_id
   WHERE sr.component_id IS NOT NULL;

COMMENT ON VIEW v_supplier_relationship_systems IS
  'The systems a supplier relationship touches: the system it hosts or operates, or every system carrying its component (v142).';

CREATE VIEW v_supplier_relationship_criticality AS
SELECT sr.id AS relationship_id,
       COUNT(s.id)::int              AS systems_touched,
       MAX(s.impact_c)               AS impact_c,
       MAX(s.impact_i)               AS impact_i,
       MAX(s.impact_a)               AS impact_a,
       GREATEST(MAX(s.impact_c), MAX(s.impact_i), MAX(s.impact_a)) AS max_impact
  FROM supplier_relationships sr
  LEFT JOIN v_supplier_relationship_systems rs ON rs.relationship_id = sr.id
  LEFT JOIN systems s ON s.id = rs.system_id AND s.is_active
 GROUP BY sr.id;

COMMENT ON VIEW v_supplier_relationship_criticality IS
  'How critical a supplier relationship is, derived: the highest impact of the active systems it touches (GV.SC-04). Never typed in (v142).';

-- ── The capabilities (four-file rule: also db/seed/capabilities.sql,
--    src/auth/capabilityDefaults.js, test/e2e/db/seed.sql) ────────────────────
-- suppliers.read: every role that holds exceptions.read (the whole SWG
-- audience), copying its scope. suppliers.write: the governance and analyst
-- roles org-wide, and the IAM/IAO for their own department — the contracting
-- department owns the relationship (decision 2).
INSERT INTO capabilities (key, resource, action, dept_scopable, description) VALUES
  ('suppliers.read',  'suppliers', 'read',  TRUE, 'View suppliers and the relationships with them'),
  ('suppliers.write', 'suppliers', 'write', TRUE, 'Record suppliers and relationships (own department for IAM/IAO)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT rp.role, 'suppliers.read', rp.scope
  FROM role_permissions rp WHERE rp.capability_key = 'exceptions.read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role, 'suppliers.write', r.scope
  FROM (VALUES ('admin', 'all_depts'), ('ciso', 'all_depts'), ('siro', 'all_depts'),
               ('risk_analyst', 'all_depts'), ('security_consultant', 'all_depts'),
               ('information_asset_manager', 'own_dept'), ('information_asset_owner', 'own_dept')) AS r(role, scope)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
