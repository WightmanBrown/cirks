-- 0130 — what the Statement of Applicability contradicts: SoA findings, derived
--
-- WHY. The SoA says which controls apply and where. Nothing compared that
-- statement with what is actually deployed, so the two could disagree silently.
-- On CIRKS-test (2026-09-22) ID.RA-09 is marked NOT APPLICABLE — with no reason
-- recorded — yet it is in place on 12 systems and counts on 10 risks, each with a
-- judged residual: the register says the control does not apply while crediting
-- it with lowering risk. docs/statement-of-applicability.md §5,
-- docs/assurance-findings.md.
--
-- THE RULE (assurance-findings §3): derive the finding, store the response. A
-- finding is a query and closes itself when the fact changes; nothing here is
-- stored. Owner, 2026-09-22 (SoA step 6, first slice): derive and show only. Each
-- finding is resolved by an act that already exists — change the SoA decision or
-- its scope, record a reason, or remove the deployment. Deliberate hardening beyond
-- the baseline is not a separate response: a control you chose to implement
-- applies (driver: business), so the SoA should say so.
--
-- THREE TYPES.
--   deployed_where_not_applicable  a control recorded on a system where the SoA
--       says it does not apply — the objective is not applicable, or the system is
--       outside every scope it is narrowed to. Per (control, system). Only for
--       controls delivered on each system or not stated: v128 already ignores
--       per-system rows for organisation-wide and group controls.
--   not_applicable_counters_threat  a control marked not applicable that is still
--       linked to a threat — the SoA says it is not needed while the threat
--       catalogue says it treats something (security-action-scopes §(d)).
--   not_applicable_without_reason  not applicable, and no reason recorded. An
--       exclusion an auditor cannot read.
-- Deliberately NOT a type: "applicable but missing on a system at risk". That is
-- exactly partial · coverage on the derived status (v129); a second list of the
-- same fact would be two registers of one truth.
--
-- ORDER (§9 of assurance-findings: per type, never an invented score): by the
-- number of active risks the contradiction touches — a mirror deployment that
-- is holding risks down matters more than one that is not.

CREATE VIEW v_soa_findings AS
-- 1. Recorded on a system where it does not apply.
SELECT 'deployed_where_not_applicable'::text AS finding_type,
       sc.control_id, sc.system_id, sc.status::text AS system_status,
       CASE WHEN se.applicable THEN 'outside_scope' ELSE 'not_applicable' END AS why,
       (SELECT count(DISTINCT r.id) FROM risks r
          JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = sc.control_id
         WHERE r.system_id = sc.system_id AND r.is_active
           AND sc.status IN ('operational', 'degraded'))::int AS risks_affected
  FROM system_controls sc
  JOIN systems s      ON s.id = sc.system_id AND s.is_active
  JOIN controls c     ON c.id = sc.control_id AND COALESCE(c.delivery, 'system') = 'system'
  JOIN soa_entries se ON se.control_id = sc.control_id
 WHERE sc.status <> 'not_applicable'
   AND (NOT se.applicable
        OR NOT EXISTS (SELECT 1 FROM v_objective_expected_systems e
                        WHERE e.control_id = sc.control_id AND e.system_id = sc.system_id))
UNION ALL
-- 2. Not applicable, yet linked to a threat it treats.
SELECT 'not_applicable_counters_threat', se.control_id, NULL::uuid, NULL::text, NULL::text,
       (SELECT count(DISTINCT r.id) FROM risks r
          JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = se.control_id
         WHERE r.is_active)::int
  FROM soa_entries se
 WHERE NOT se.applicable
   AND EXISTS (SELECT 1 FROM control_threats ct WHERE ct.control_id = se.control_id)
UNION ALL
-- 3. Not applicable, with no reason.
SELECT 'not_applicable_without_reason', se.control_id, NULL::uuid, NULL::text, NULL::text, 0
  FROM soa_entries se
 WHERE NOT se.applicable AND COALESCE(btrim(se.justification), '') = '';

COMMENT ON VIEW v_soa_findings IS
  'SoA findings, derived (v130): deployed_where_not_applicable (per control × system), not_applicable_counters_threat, not_applicable_without_reason. Nothing stored; each closes itself when the fact changes. Missing-where-it-applies is v129 partial · coverage, deliberately not repeated here.';
