-- 0126 — scopes: WHERE a control objective applies
--
-- WHY. An SoA entry said only whether an objective applies — organisation-wide or
-- not at all. A standard such as PCI-DSS applies to the organisation, but only
-- within the cardholder data environment. Without a way to say so, every scoped
-- objective reads as a gap on every system outside its scope, and "deployed on 3 of
-- 51 systems" cannot be told apart from "deployed on 3 of the 3 systems it applies
-- to". docs/statement-of-applicability.md §4.2 and §8 step 2.
--
-- MODEL (decided with the owner 2026-09-22).
--   • A SCOPE is a named set of systems ("Cardholder data environment"). A system
--     may be in several scopes.
--   • The WHOLE ORGANISATION is every active system. It is not stored: it is the
--     default. An applicable objective with no scope rows applies organisation-wide;
--     rows NARROW it to the union of those scopes' systems. So nothing needs
--     backfilling, and there is no organisation row to keep in step with the
--     systems table.
--   • Drawing a scope — creating it, putting systems in it — is a governance
--     statement (moving a system into the PCI scope matters), so it needs a new
--     capability, scopes.manage, held by admin, ciso and siro. Saying which scopes
--     an objective applies in is part of the SoA decision (controls.write).
--
-- v_objective_expected_systems is the single derivation of "the systems this
-- objective should be on" — the denominator for derived implementation status and
-- for the mirror finding (a control deployed outside every scope it applies in).

CREATE TABLE scopes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(200) NOT NULL,
    description  text,
    created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_scope_name CHECK (btrim(name) <> '')
);
-- "Cardholder data environment" and "cardholder data environment " are one scope.
CREATE UNIQUE INDEX uq_scopes_name ON scopes (lower(btrim(name)));

COMMENT ON TABLE scopes IS
  'A named set of systems in which a control objective can apply (e.g. the cardholder data environment). The whole organisation is NOT a row: it is the default — every active system (v126).';

CREATE TABLE scope_systems (
    scope_id   uuid NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    system_id  uuid NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    added_by   uuid REFERENCES users(id) ON DELETE SET NULL,
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_id, system_id)
);
CREATE INDEX idx_scope_systems_system ON scope_systems (system_id);

-- The scopes an applicable objective is NARROWED to. No rows = organisation-wide.
-- A scope that objectives apply in cannot be deleted from under them (RESTRICT):
-- deleting it would silently widen each of them to the whole organisation.
CREATE TABLE soa_entry_scopes (
    control_id  uuid NOT NULL REFERENCES soa_entries(control_id) ON DELETE CASCADE,
    scope_id    uuid NOT NULL REFERENCES scopes(id) ON DELETE RESTRICT,
    PRIMARY KEY (control_id, scope_id)
);
CREATE INDEX idx_soa_entry_scopes_scope ON soa_entry_scopes (scope_id);

CREATE VIEW v_objective_expected_systems AS
SELECT se.control_id, s.id AS system_id
  FROM soa_entries se
  JOIN systems s ON s.is_active
 WHERE se.applicable
   AND NOT EXISTS (SELECT 1 FROM soa_entry_scopes x WHERE x.control_id = se.control_id)
UNION
SELECT se.control_id, ss.system_id
  FROM soa_entries se
  JOIN soa_entry_scopes x ON x.control_id = se.control_id
  JOIN scope_systems ss   ON ss.scope_id  = x.scope_id
  JOIN systems s          ON s.id = ss.system_id AND s.is_active
 WHERE se.applicable;

COMMENT ON VIEW v_objective_expected_systems IS
  'For each ADOPTED control objective, the systems it should be deployed on: every active system when it applies organisation-wide, else the union of its scopes'' active systems (v126).';

-- The capability. Catalogue row always; grants only on an existing install —
-- on a fresh one role_permissions is empty here and db/seed.js grants from
-- src/auth/capabilityDefaults.js (see CLAUDE.md, v109/v113).
INSERT INTO capabilities (key, resource, action, dept_scopable, description)
VALUES ('scopes.manage', 'scopes', 'manage', FALSE,
        'Create scopes and decide which systems are in them')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role::user_role, 'scopes.manage', 'all_depts'
  FROM (VALUES ('admin'), ('ciso'), ('siro')) AS r(role)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
