-- 0124 — a control objective's status is DERIVED, never stored
--
-- WHY. `controls.status` summarised facts held elsewhere — whether the objective
-- is adopted (soa_entries.applicable) and whether its maturity has been rated
-- (controls.effectiveness) — and was kept in step by writes in five places
-- (PATCH /soa, the rating endpoint, create, import, and a DB function). Measured
-- on CIRKS-test 2026-09-22 it was consistent, but its WORDS were not:
--   • 'under_review' meant both "adopted, maturity not yet assessed" (32 rows) and
--     "nobody has decided yet" (the default for a new objective);
--   • 'planned' collided with the SoA's implementation status 'planned';
--   • 'ineffective' had never been set (0 rows), and 'planned' neither.
-- A status that restates other facts belongs in a derivation, not a column
-- (the no-stored-derived-data rule), and a derivation can carry honest words.
--
-- The four states, decided with the owner 2026-09-22:
--   not_decided    — no SoA entry yet
--   not_applicable — judged not applicable in the SoA
--   not_assessed   — adopted, maturity not yet rated
--   adopted        — adopted and rated
-- "Ineffective" is retired: an ineffective control is a maturity rating of 1, or a
-- degraded deployment on a system, and both are already recorded.
--
-- WHAT. v_control_status is the single derivation. The five views that read the
-- old column are rebuilt on it (none is read by the application; they are kept
-- working rather than left to break). Two functions that wrote the column are
-- dropped: mark_control_ineffective (the manual path being retired) and
-- fork_control, which has been broken since v87 dropped the `framework` columns it
-- still inserts into. Nothing calls either. Then the column and its enum go.

CREATE VIEW v_control_status AS
SELECT c.id AS control_id,
       CASE
         WHEN se.control_id IS NULL THEN 'not_decided'
         WHEN NOT se.applicable     THEN 'not_applicable'
         WHEN c.effectiveness IS NULL THEN 'not_assessed'
         ELSE 'adopted'
       END::text AS status
FROM controls c
LEFT JOIN soa_entries se ON se.control_id = c.id;

COMMENT ON VIEW v_control_status IS
  'A control objective''s status, derived from its SoA entry and maturity rating: not_decided | not_applicable | not_assessed | adopted. Never stored (v124).';

DROP VIEW v_active_control_set;
DROP VIEW v_control_gap_analysis;
DROP VIEW v_control_risk_exposure;
DROP VIEW v_onboarding_readiness;
DROP VIEW v_risk_business_summary;

CREATE VIEW v_active_control_set AS
 SELECT cs.id AS set_id,
    cs.name AS set_name,
    cs.version,
    cs.effective_from,
    cs.approved_at,
    c.id AS control_id,
    COALESCE(csc.local_override_name, c.title) AS effective_title,
    COALESCE(csc.local_override_description, c.description) AS effective_description,
    c.control_type,
    vcs.status AS control_status,
    csc.is_mandatory,
    s.code AS standard_code,
    s.name AS standard_name
   FROM control_sets cs
     JOIN control_set_controls csc ON csc.control_set_id = cs.id
     JOIN controls c ON c.id = csc.control_id
     JOIN v_control_status vcs ON vcs.control_id = c.id
     LEFT JOIN standards s ON s.id = c.origin_standard_id
  WHERE cs.status = 'active'::control_set_status;

CREATE VIEW v_control_gap_analysis AS
 WITH RECURSIVE component_chain AS (
         SELECT ccl.control_id,
            cc.id AS component_id,
            cc.name AS component_name,
            cc.component_type,
            cc.status AS component_status,
            cc.last_verified_at,
            1 AS depth,
            ARRAY[cc.id] AS path,
            NULL::character varying AS via_relationship
           FROM control_component_links ccl
             JOIN control_components cc ON cc.id = ccl.component_id
        UNION ALL
         SELECT chain_1.control_id,
            cc.id,
            cc.name,
            cc.component_type,
            cc.status,
            cc.last_verified_at,
            chain_1.depth + 1,
            chain_1.path || cc.id,
            ccr.relationship_type
           FROM component_chain chain_1
             JOIN control_component_relationships ccr ON ccr.source_component_id = chain_1.component_id
             JOIN control_components cc ON cc.id = ccr.target_component_id
          WHERE NOT (cc.id = ANY (chain_1.path)) AND chain_1.depth < 5
        )
 SELECT c.id AS control_id,
    c.title AS control_title,
    vcs.status AS control_status,
    c.effectiveness AS control_effectiveness,
    chain.component_id,
    chain.component_name,
    chain.component_type,
    chain.component_status,
    chain.last_verified_at,
    chain.depth,
    chain.via_relationship
   FROM controls c
     JOIN v_control_status vcs ON vcs.control_id = c.id
     JOIN component_chain chain ON chain.control_id = c.id
  WHERE chain.component_status = ANY (ARRAY['degraded'::component_status, 'planned'::component_status, 'decommissioned'::component_status, 'unknown'::component_status]);

CREATE VIEW v_control_risk_exposure AS
 SELECT c.id AS control_id,
    c.title AS control_title,
    c.control_type,
    vcs.status AS control_status,
    c.effectiveness,
    c.effectiveness_notes,
    ct.threat_id,
    t.name AS threat_name,
    t.threat_category,
    r.id AS risk_id,
    r.asset_id,
    ia.name AS asset_name,
    d.name AS department_name,
    sys.id AS system_id,
    sys.name AS system_name,
    r.risk_score,
    r.risk_c,
    r.risk_i,
    r.risk_a,
    r.validation_status,
    c.effectiveness AS effective_effectiveness,
    NULL::text AS override_notes,
    NULL::uuid AS system_object_id,
    NULL::character varying AS system_object_name,
    NULL::smallint AS deployment_coverage,
    NULL::text AS coverage_notes,
    NULL::date AS eol_date,
    NULL::boolean AS is_eol,
    'threat_linkage'::text AS exposure_path,
    ( SELECT count(*) AS count
           FROM risks r2
          WHERE r2.threat_id = ct.threat_id AND r2.is_active = true AND (r2.validation_status = ANY (ARRAY['pending'::risk_validation_status, 'returned'::risk_validation_status]))) AS unvalidated_warning_count
   FROM controls c
     JOIN v_control_status vcs ON vcs.control_id = c.id
     JOIN control_threats ct ON ct.control_id = c.id
     JOIN threats t ON t.id = ct.threat_id
     JOIN risks r ON r.threat_id = t.id AND r.is_active = true AND r.validation_status = 'validated'::risk_validation_status
     JOIN systems sys ON sys.id = r.system_id
     JOIN departments d ON d.id = sys.department_id
     LEFT JOIN information_assets ia ON ia.id = r.asset_id;

-- controls_active / controls_unrated keep their names; they now mean "adopted and
-- rated" and "adopted, maturity not yet rated". Under the old column the second
-- was structurally zero ('active' required a rating), so it never measured anything.
CREATE VIEW v_onboarding_readiness AS
 WITH threat_stats AS (
         SELECT count(*) AS threat_count,
            count(*) FILTER (WHERE threats.probability_c IS NOT NULL AND threats.probability_i IS NOT NULL AND threats.probability_a IS NOT NULL) AS threats_with_probability
           FROM threats
        ), control_stats AS (
         SELECT count(*) AS control_count,
            count(*) FILTER (WHERE vcs.status = 'adopted') AS controls_active,
            count(*) FILTER (WHERE vcs.status = 'not_assessed') AS controls_unrated,
            count(DISTINCT ct.control_id) AS controls_with_threat_links
           FROM controls c
             JOIN v_control_status vcs ON vcs.control_id = c.id
             LEFT JOIN control_threats ct ON ct.control_id = c.id
        ), dept_stats AS (
         SELECT count(*) AS dept_count
           FROM departments
        ), asset_stats AS (
         SELECT count(*) AS asset_count,
            count(*) FILTER (WHERE information_assets.confidentiality IS NOT NULL AND information_assets.integrity IS NOT NULL AND information_assets.availability IS NOT NULL) AS assets_fully_rated
           FROM information_assets
          WHERE information_assets.is_active = true
        ), system_stats AS (
         SELECT count(*) AS system_count
           FROM systems
        ), risk_stats AS (
         SELECT count(*) AS risk_count,
            count(*) FILTER (WHERE risks.validation_status = 'validated'::risk_validation_status) AS risks_validated,
            count(*) FILTER (WHERE risks.validation_status = 'pending'::risk_validation_status) AS risks_pending
           FROM risks
          WHERE risks.is_active = true
        ), handover AS (
         SELECT onboarding_handover.id,
            onboarding_handover.completed_by,
            onboarding_handover.handover_date,
            onboarding_handover.system_summary,
            onboarding_handover.threats_reviewed,
            onboarding_handover.threats_reviewed_at,
            onboarding_handover.threats_review_notes,
            onboarding_handover.controls_reviewed,
            onboarding_handover.controls_reviewed_at,
            onboarding_handover.controls_review_notes,
            onboarding_handover.impact_tables_reviewed,
            onboarding_handover.impact_tables_reviewed_at,
            onboarding_handover.impact_tables_review_notes,
            onboarding_handover.assets_reviewed,
            onboarding_handover.assets_reviewed_at,
            onboarding_handover.assets_review_notes,
            onboarding_handover.risks_reviewed,
            onboarding_handover.risks_reviewed_at,
            onboarding_handover.risks_review_notes,
            onboarding_handover.ciso_accepted,
            onboarding_handover.ciso_accepted_by,
            onboarding_handover.ciso_accepted_at,
            onboarding_handover.ciso_acceptance_notes,
            onboarding_handover.siro_accepted,
            onboarding_handover.siro_accepted_by,
            onboarding_handover.siro_accepted_at,
            onboarding_handover.siro_acceptance_notes,
            onboarding_handover.known_gaps,
            onboarding_handover.created_at
           FROM onboarding_handover
          ORDER BY onboarding_handover.created_at DESC
         LIMIT 1
        )
 SELECT oc.setup_phase_active,
    oc.setup_completed_at,
    ts.threat_count,
    ts.threats_with_probability,
    cs.control_count,
    cs.controls_active,
    cs.controls_unrated,
    cs.controls_with_threat_links,
    ds.dept_count,
    ast.asset_count,
    ast.assets_fully_rated,
    syst.system_count,
    rs.risk_count,
    rs.risks_validated,
    rs.risks_pending,
    COALESCE(h.threats_reviewed, false) AS threats_reviewed,
    COALESCE(h.controls_reviewed, false) AS controls_reviewed,
    COALESCE(h.impact_tables_reviewed, false) AS impact_tables_reviewed,
    COALESCE(h.assets_reviewed, false) AS assets_reviewed,
    COALESCE(h.risks_reviewed, false) AS risks_reviewed,
    COALESCE(h.threats_reviewed, false)::integer + COALESCE(h.controls_reviewed, false)::integer + COALESCE(h.impact_tables_reviewed, false)::integer + COALESCE(h.assets_reviewed, false)::integer + COALESCE(h.risks_reviewed, false)::integer AS areas_reviewed_count,
    COALESCE(h.threats_reviewed, false) AND COALESCE(h.controls_reviewed, false) AND COALESCE(h.impact_tables_reviewed, false) AND COALESCE(h.assets_reviewed, false) AND COALESCE(h.risks_reviewed, false) AS all_areas_reviewed,
    COALESCE(h.ciso_accepted, false) AS ciso_accepted,
    h.ciso_accepted_at,
    COALESCE(h.siro_accepted, false) AS siro_accepted,
    h.siro_accepted_at,
    h.known_gaps,
    h.id AS handover_id
   FROM org_config oc
     CROSS JOIN threat_stats ts
     CROSS JOIN control_stats cs
     CROSS JOIN dept_stats ds
     CROSS JOIN asset_stats ast
     CROSS JOIN system_stats syst
     CROSS JOIN risk_stats rs
     LEFT JOIN handover h ON true;

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
     LEFT JOIN controls c ON c.id = ct.control_id
       AND NOT EXISTS (SELECT 1 FROM soa_entries se WHERE se.control_id = c.id AND NOT se.applicable)
     LEFT JOIN security_action_risks sar ON sar.risk_id = r.id
     LEFT JOIN security_actions sa ON sa.id = sar.action_id
     LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
  WHERE r.is_active = true AND r.validation_status = 'validated'::risk_validation_status
  GROUP BY r.id, d.name, sys.name, sys.description, ia.name, ia.description, ia.id, t.name, t.threat_category, r.risk_score, r.risk_c, r.risk_i, r.risk_a, sys.impact_c, sys.impact_i, sys.impact_a, r.probability_c, r.probability_i, r.probability_a, r.rationale, r.validation_status, dro.owner_names, r.review_date, r.asset_id, r.system_id
  ORDER BY r.risk_score DESC, sys.name, ia.name;

DROP FUNCTION mark_control_ineffective(uuid, smallint, text, uuid);
DROP FUNCTION fork_control(uuid, character varying, text, uuid);

ALTER TABLE controls DROP COLUMN status;
DROP TYPE control_status;
