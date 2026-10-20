-- v108 — a risk belongs to the DEPARTMENT that owns its system.
--
-- Decision 2026-09-08, docs/risk-ownership.md. Ownership is departmental, never
-- personal: the accountable person is the owning department's Information Asset
-- Owner, or the SIRO where a department has none. People join, move and leave;
-- accountability for a system does not move with them, so a stored pointer to a
-- person goes stale the moment somebody changes job.
--
-- That makes risks.assigned_to DERIVED, and this project does not store derived
-- values (the same rule retiring risks.risk_level). The column is dropped, along
-- with the reassign capability that existed only to correct it. A risk changes
-- owner when its SYSTEM changes department — which v106 already audits, so the
-- audit gap on risk ownership closes without any new trigger.
--
-- Where a department has two IAOs, BOTH are accountable: the model does not
-- invent a distinction the organisation has not made, so the owner is a set.

-- ── the derivation, defined once ─────────────────────────────────────────────
-- One row per department, so the per-risk cost is a join against ~12 rows rather
-- than a correlated subquery. Primary role only, consistent with how the
-- systems / assets / services list columns already derive their IAO.

CREATE OR REPLACE VIEW v_department_risk_owner AS
WITH iao AS (
  SELECT u.department_id,
         array_agg(u.id ORDER BY u.full_name)               AS user_ids,
         string_agg(u.full_name, ', ' ORDER BY u.full_name) AS names
    FROM users u
   WHERE u.role = 'information_asset_owner' AND u.is_active
   GROUP BY u.department_id
), siro AS (
  SELECT array_agg(u.id ORDER BY u.full_name)               AS user_ids,
         string_agg(u.full_name, ', ' ORDER BY u.full_name) AS names
    FROM users u
   WHERE u.role = 'siro' AND u.is_active
)
SELECT d.id                                  AS department_id,
       COALESCE(iao.user_ids, siro.user_ids) AS owner_user_ids,
       COALESCE(iao.names,    siro.names)    AS owner_names,
       (iao.user_ids IS NULL)                AS is_siro_fallback
  FROM departments d
  LEFT JOIN iao ON iao.department_id = d.id
  CROSS JOIN siro;

COMMENT ON VIEW v_department_risk_owner IS
  'Who is accountable for a department''s risks: its active IAO(s), else the SIRO(s). docs/risk-ownership.md';

-- ── dependent views ──────────────────────────────────────────────────────────
-- Three views referenced risks.assigned_to. Nothing in the application reads the
-- column off any of them (v_risk_register and v_risk_business_summary have no
-- code consumer at all; v_escalated_exceptions is selected with e.* but neither
-- the route nor the page touches the field), so it is replaced by the derived
-- owner rather than preserved.

DROP VIEW IF EXISTS v_escalated_exceptions;
CREATE VIEW v_escalated_exceptions AS
 SELECT e.id AS exception_id,
    e.risk_id,
    r.system_id,
    s.name AS system_name,
    s.department_id,
    d.name AS department_name,
    r.threat_id,
    t.name AS threat_name,
    r.risk_score,
    dro.owner_names AS owner_name,
    dro.is_siro_fallback,
    e.justification,
    e.accepted_by,
    u.full_name AS accepted_by_name,
    e.accepted_role,
    e.accepted_at,
    e.expires_at,
    e.review_cadence,
    e.escalated_at,
    CURRENT_DATE - e.expires_at AS days_overdue,
    CURRENT_DATE - e.accepted_at::date AS age_days
   FROM risk_exceptions e
     JOIN risks r ON r.id = e.risk_id
     JOIN systems s ON s.id = r.system_id
     JOIN departments d ON d.id = s.department_id
     JOIN threats t ON t.id = r.threat_id
     LEFT JOIN users u ON u.id = e.accepted_by
     LEFT JOIN v_department_risk_owner dro ON dro.department_id = s.department_id
  WHERE e.status = 'expired'::exception_status
  ORDER BY (CURRENT_DATE - e.expires_at) DESC;

DROP VIEW IF EXISTS v_risk_business_summary;
CREATE VIEW v_risk_business_summary AS
 SELECT r.id AS risk_id,
    d.name AS department,
    sys.name AS system_name,
    sys.description AS system_description,
    ia.name AS asset_name,
    ia.description AS asset_description,
    t.name AS threat_name,
    t.threat_category,
    r.risk_score,
    r.risk_c,
    r.risk_i,
    r.risk_a,
    sys.impact_c,
    sys.impact_i,
    sys.impact_a,
    r.probability_c,
    r.probability_i,
    r.probability_a,
    r.rationale,
    r.validation_status,
    count(DISTINCT c.id) AS control_count,
    min(c.effectiveness) AS lowest_control_effectiveness,
    (EXISTS ( SELECT 1
           FROM risk_probability_signals rps
          WHERE rps.risk_id = r.id AND rps.status = 'open'::signal_status)) AS has_open_signal,
    count(DISTINCT sa.id) FILTER (WHERE sa.status <> ALL (ARRAY['completed'::treatment_status, 'cancelled'::treatment_status])) AS active_action_count,
    dro.owner_names AS risk_owner,
    r.review_date,
    r.asset_id IS NULL OR (EXISTS ( SELECT 1
           FROM system_assets sa2
          WHERE sa2.system_id = r.system_id AND sa2.asset_id = r.asset_id)) AS system_asset_confirmed,
        CASE
            WHEN ia.id IS NULL THEN NULL::text
            ELSE ( SELECT string_agg(s2.name::text, ', '::text ORDER BY (s2.name::text)) AS string_agg
               FROM system_assets sa3
                 JOIN systems s2 ON s2.id = sa3.system_id
              WHERE sa3.asset_id = ia.id AND s2.is_active = true)
        END AS all_hosting_systems
   FROM risks r
     JOIN systems sys ON sys.id = r.system_id
     JOIN departments d ON d.id = sys.department_id
     JOIN threats t ON t.id = r.threat_id
     LEFT JOIN information_assets ia ON ia.id = r.asset_id
     LEFT JOIN control_threats ct ON ct.threat_id = t.id
     LEFT JOIN controls c ON c.id = ct.control_id AND c.status <> 'not_applicable'::control_status
     LEFT JOIN security_action_risks sar ON sar.risk_id = r.id
     LEFT JOIN security_actions sa ON sa.id = sar.action_id
     LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
  WHERE r.is_active = true AND r.validation_status = 'validated'::risk_validation_status
  GROUP BY r.id, d.name, sys.name, sys.description, ia.name, ia.description, ia.id, t.name, t.threat_category, r.risk_score, r.risk_c, r.risk_i, r.risk_a, sys.impact_c, sys.impact_i, sys.impact_a, r.probability_c, r.probability_i, r.probability_a, r.rationale, r.validation_status, dro.owner_names, r.review_date, r.asset_id, r.system_id
  ORDER BY r.risk_score DESC, sys.name, ia.name;

DROP VIEW IF EXISTS v_risk_register;
CREATE VIEW v_risk_register AS
 SELECT r.id AS risk_id,
    d.name AS department,
    ia.name AS asset_name,
    sys.name AS system_name,
    sys.id AS system_id,
    t.name AS threat_name,
    t.threat_category,
    sys.impact_c,
    sys.impact_i,
    sys.impact_a,
    r.probability_c,
    r.probability_i,
    r.probability_a,
    r.risk_c,
    r.risk_i,
    r.risk_a,
    r.risk_score,
    oc.impact_method AS summary_method,
    r.validation_status,
    r.validation_notes,
    u_val.full_name AS validated_by,
    r.validated_at,
    r.rationale,
    u_id.full_name AS identified_by,
    dro.owner_names AS risk_owner,
    r.review_date,
    r.created_at,
    r.updated_at,
    r.asset_id IS NULL OR (EXISTS ( SELECT 1
           FROM system_assets sa
          WHERE sa.system_id = r.system_id AND sa.asset_id = r.asset_id)) AS system_asset_confirmed
   FROM risks r
     JOIN systems sys ON sys.id = r.system_id
     JOIN departments d ON d.id = sys.department_id
     JOIN threats t ON t.id = r.threat_id
     LEFT JOIN information_assets ia ON ia.id = r.asset_id
     CROSS JOIN org_config oc
     LEFT JOIN users u_id ON u_id.id = r.identified_by
     LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
     LEFT JOIN users u_val ON u_val.id = r.validated_by
  WHERE r.is_active = true
  ORDER BY r.validation_status, r.risk_score DESC;

-- ── separation of duties ─────────────────────────────────────────────────────
-- The rule survives the move, now compared against the DERIVED owner. It is
-- structurally satisfied in the normal case, because acceptance is held only by
-- ciso/siro/admin (v107) and none of those owns a departmental risk — but it
-- still bites where one person holds both a governance role and a department's
-- IAO seat, which is exactly the small-organisation case the rule exists for.

CREATE OR REPLACE FUNCTION public.sod_exception_accept()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_owners UUID[];
BEGIN
  IF NEW.accepted_by IS NOT NULL AND sod_enabled('exception.accept') THEN
    SELECT dro.owner_user_ids INTO v_owners
      FROM risks r
      JOIN systems s ON s.id = r.system_id
      JOIN v_department_risk_owner dro ON dro.department_id = s.department_id
     WHERE r.id = NEW.risk_id;
    IF v_owners IS NOT NULL AND NEW.accepted_by = ANY (v_owners) THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the risk owner cannot accept an exception on their own risk';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- ── the column, and the capability that existed only to correct it ───────────

ALTER TABLE risks DROP COLUMN assigned_to;

DELETE FROM role_permissions WHERE capability_key = 'risks.reassign';
DELETE FROM capabilities     WHERE key            = 'risks.reassign';
