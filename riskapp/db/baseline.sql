--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10 (Ubuntu 17.10-0ubuntu0.25.10.1)
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-0ubuntu0.25.10.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: access_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.access_type AS ENUM (
    'read',
    'write',
    'admin',
    'physical',
    'remote',
    'support'
);


--
-- Name: action_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.action_plan_status AS ENUM (
    'draft',
    'active',
    'under_review',
    'closed'
);


--
-- Name: asset_register_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_register_status AS ENUM (
    'draft',
    'submitted',
    'ciso_approved',
    'ciso_rejected',
    'superseded'
);


--
-- Name: attachment_scan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attachment_scan_status AS ENUM (
    'pending',
    'clean',
    'infected',
    'skipped'
);


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
    'create',
    'update',
    'delete',
    'login',
    'logout',
    'export',
    'view_sensitive',
    'propose_change',
    'apply_change',
    'reject_change',
    'seed_ratings',
    'adjust_impact',
    'lock_calibration',
    'generate_agenda',
    'level_impact_table',
    'accept_asset_register',
    'submit_impact_table',
    'approve_asset_register',
    'reject_asset_register',
    'rate_control',
    'import_controls',
    'link_control_threat',
    'link_control_tech',
    'mark_control_ineffective',
    'validate_risk',
    'return_risk',
    'resubmit_risk',
    'finalise_review_item',
    'siro_signoff_action',
    'signal_ready',
    'onboarding_handover',
    'mark_area_reviewed',
    'ciso_accept_handover',
    'siro_accept_handover',
    'update_threat_probability',
    'update_system_probability',
    'acknowledge_signal',
    'resolve_signal',
    'grant_additional_role',
    'revoke_additional_role',
    'switch_role',
    'create_standard',
    'create_control_set',
    'activate_control_set',
    'archive_control_set',
    'add_control_to_set',
    'remove_control_from_set',
    'fork_control',
    'apply_control',
    'change_application_status',
    'remove_application',
    'create_threat_set',
    'activate_threat_set',
    'add_threat_to_set',
    'remove_threat_from_set',
    'fork_threat',
    'plan_meeting',
    'close_meeting',
    'issue_minutes'
);


--
-- Name: calibration_cycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calibration_cycle_status AS ENUM (
    'draft',
    'in_progress',
    'levelling',
    'active',
    'superseded'
);


--
-- Name: cia_dimension; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cia_dimension AS ENUM (
    'confidentiality',
    'integrity',
    'availability'
);


--
-- Name: component_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.component_status AS ENUM (
    'operational',
    'degraded',
    'planned',
    'decommissioned',
    'unknown'
);


--
-- Name: component_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.component_type AS ENUM (
    'people',
    'process',
    'information',
    'technology',
    'facility'
);


--
-- Name: control_application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_application_status AS ENUM (
    'planned',
    'implemented',
    'verified',
    'lapsed'
);


--
-- Name: control_framework; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_framework AS ENUM (
    'cis_v8',
    'iso27001',
    'nist_csf',
    'custom'
);


--
-- Name: control_set_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_set_status AS ENUM (
    'draft',
    'active',
    'archived',
    'superseded'
);


--
-- Name: control_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_status AS ENUM (
    'active',
    'ineffective',
    'not_applicable',
    'under_review',
    'planned'
);


--
-- Name: control_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_type AS ENUM (
    'preventive',
    'detective',
    'corrective',
    'deterrent'
);


--
-- Name: cycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cycle_status AS ENUM (
    'draft',
    'active',
    'under_review',
    'completed',
    'archived'
);


--
-- Name: effect_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.effect_mode AS ENUM (
    'relative',
    'absolute'
);


--
-- Name: effect_target; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.effect_target AS ENUM (
    'probability',
    'impact_c',
    'impact_i',
    'impact_a'
);


--
-- Name: exception_cadence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.exception_cadence AS ENUM (
    'monthly',
    'quarterly',
    'annual'
);


--
-- Name: exception_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.exception_status AS ENUM (
    'active',
    'expired',
    'renewed',
    'revoked'
);


--
-- Name: impact_derivation_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.impact_derivation_method AS ENUM (
    'max',
    'average',
    'weighted'
);


--
-- Name: impact_table_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.impact_table_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'revision_requested',
    'levelled',
    'locked'
);


--
-- Name: meeting_item_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_item_source AS ENUM (
    'auto',
    'pinned'
);


--
-- Name: org_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_type AS ENUM (
    'government',
    'business',
    'not_for_profit'
);


--
-- Name: people_group_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.people_group_type AS ENUM (
    'internal',
    'external'
);


--
-- Name: proposal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proposal_status AS ENUM (
    'draft',
    'submitted',
    'pending',
    'applied',
    'rejected'
);


--
-- Name: proposed_change_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proposed_change_type AS ENUM (
    'impact_level'
);


--
-- Name: rating_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rating_method AS ENUM (
    'manual',
    'ai_seeded',
    'ciso_override'
);


--
-- Name: reconciliation_resolution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_resolution AS ENUM (
    'accepted',
    'adjusted',
    'deferred'
);


--
-- Name: residual_change_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.residual_change_source AS ENUM (
    'action_verified',
    'direct_edit',
    'corrective_action'
);


--
-- Name: review_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_decision AS ENUM (
    'accept',
    'treat',
    'transfer',
    'avoid',
    'defer',
    'escalate'
);


--
-- Name: risk_treatment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_treatment AS ENUM (
    'avoid',
    'mitigate',
    'transfer',
    'accept'
);


--
-- Name: risk_validation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_validation_status AS ENUM (
    'pending',
    'returned',
    'validated'
);


--
-- Name: signal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.signal_status AS ENUM (
    'open',
    'acknowledged',
    'applied',
    'dismissed'
);


--
-- Name: swg_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.swg_decision AS ENUM (
    'approved',
    'rejected',
    'deferred'
);


--
-- Name: system_object_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.system_object_type AS ENUM (
    'hardware',
    'software',
    'network',
    'people_group',
    'process',
    'facility',
    'information_asset'
);


--
-- Name: threat_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.threat_category AS ENUM (
    'accidental',
    'deliberate',
    'environmental'
);


--
-- Name: threat_set_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.threat_set_status AS ENUM (
    'draft',
    'active',
    'archived',
    'superseded'
);


--
-- Name: threat_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.threat_source AS ENUM (
    'internal',
    'external',
    'natural'
);


--
-- Name: treatment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.treatment_status AS ENUM (
    'proposed',
    'planned',
    'in_progress',
    'completed',
    'deferred',
    'cancelled',
    'verified',
    'rejected'
);


--
-- Name: treatment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.treatment_type AS ENUM (
    'mitigate',
    'accept',
    'transfer',
    'avoid'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'ciso',
    'risk_analyst',
    'information_asset_manager',
    'information_asset_owner',
    'security_consultant',
    'siro',
    'meeting_secretary',
    'ai_agent',
    'soc_analyst'
);


--
-- Name: verification_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_result AS ENUM (
    'pass',
    'fail'
);


--
-- Name: accept_asset_register(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_asset_register(p_version_id uuid, p_acting_user uuid, p_narrative text DEFAULT 'Asset register accepted by Information Asset Owner.'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255);
  v_status asset_register_status; v_dept_id UUID; v_ver_num INTEGER;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_acting_user AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'accept_asset_register: user % not found', p_acting_user; END IF;
  IF v_role != 'information_asset_owner' THEN RAISE EXCEPTION 'accept_asset_register: Information Asset Owner only (role: %)', v_role; END IF;
  SELECT status, department_id, version_number INTO v_status, v_dept_id, v_ver_num
    FROM asset_register_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'accept_asset_register: version % not found', p_version_id; END IF;
  IF v_status != 'draft' THEN RAISE EXCEPTION 'accept_asset_register: must be draft (current: %)', v_status; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_acting_user AND department_id = v_dept_id) THEN
    RAISE EXCEPTION 'accept_asset_register: user not in department %', v_dept_id; END IF;
  UPDATE asset_register_versions SET status = 'submitted', accepted_by = p_acting_user,
    accepted_at = now(), updated_at = now() WHERE id = p_version_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_acting_user, v_role, v_name, 'asset_register_versions', p_version_id, 'accept_asset_register',
    p_narrative || ' Dept: ' || v_dept_id::TEXT || ', Version: ' || v_ver_num::TEXT);
END;
$$;


--
-- Name: activate_control_set(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_control_set(p_control_set_id uuid, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_actor_role  user_role;
  v_actor_name  VARCHAR;
  v_set_name    VARCHAR;
  v_set_status  control_set_status;
  v_prev_id     UUID;
BEGIN
  SELECT role, full_name INTO v_actor_role, v_actor_name
    FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_control_set: actor % not found', p_actor_id;
  END IF;
  IF v_actor_role NOT IN ('ciso', 'security_consultant', 'risk_analyst') THEN
    RAISE EXCEPTION 'activate_control_set: role % not permitted', v_actor_role;
  END IF;

  SELECT name, status INTO v_set_name, v_set_status
    FROM control_sets WHERE id = p_control_set_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_control_set: set % not found', p_control_set_id;
  END IF;
  IF v_set_status <> 'draft' THEN
    RAISE EXCEPTION 'activate_control_set: set % is %, only draft sets may be activated',
      v_set_name, v_set_status;
  END IF;

  -- Archive previous active set, if any.
  SELECT id INTO v_prev_id FROM control_sets WHERE status = 'active';
  IF FOUND THEN
    UPDATE control_sets
       SET status = 'archived',
           effective_to = now(),
           updated_at = now()
     WHERE id = v_prev_id;

    INSERT INTO audit_log (
      user_id, user_role, user_name,
      entity_type, entity_id, entity_label,
      action, human_narrative
    ) VALUES (
      p_actor_id, v_actor_role, v_actor_name,
      'control_sets', v_prev_id, NULL,
      'archive_control_set',
      format('Control set %s archived as %s is being activated.', v_prev_id, v_set_name)
    );
  END IF;

  UPDATE control_sets
     SET status = 'active',
         effective_from = now(),
         approved_by = p_actor_id,
         approved_at = now(),
         updated_at = now()
   WHERE id = p_control_set_id;

  INSERT INTO audit_log (
    user_id, user_role, user_name,
    entity_type, entity_id, entity_label,
    action, human_narrative
  ) VALUES (
    p_actor_id, v_actor_role, v_actor_name,
    'control_sets', p_control_set_id, v_set_name,
    'activate_control_set',
    format('Control set "%s" activated by %s.', v_set_name, v_actor_name)
  );
END;
$$;


--
-- Name: FUNCTION activate_control_set(p_control_set_id uuid, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.activate_control_set(p_control_set_id uuid, p_actor_id uuid) IS 'Promote draft control_set to active. Archives the previous active set atomically. Audit-logged. Actor: ciso, security_consultant, risk_analyst.';


--
-- Name: activate_threat_set(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_threat_set(p_threat_set_id uuid, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_actor_role  user_role;
  v_actor_name  VARCHAR;
  v_set_name    VARCHAR;
  v_set_status  threat_set_status;
  v_prev_id     UUID;
BEGIN
  SELECT role, full_name INTO v_actor_role, v_actor_name
    FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_threat_set: actor % not found', p_actor_id;
  END IF;
  IF v_actor_role NOT IN ('ciso', 'security_consultant', 'risk_analyst') THEN
    RAISE EXCEPTION 'activate_threat_set: role % not permitted', v_actor_role;
  END IF;

  SELECT name, status INTO v_set_name, v_set_status
    FROM threat_sets WHERE id = p_threat_set_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_threat_set: set % not found', p_threat_set_id;
  END IF;
  IF v_set_status <> 'draft' THEN
    RAISE EXCEPTION 'activate_threat_set: set % is %, only draft sets may be activated',
      v_set_name, v_set_status;
  END IF;

  SELECT id INTO v_prev_id FROM threat_sets WHERE status = 'active';
  IF FOUND THEN
    UPDATE threat_sets
       SET status = 'archived', effective_to = now(), updated_at = now()
     WHERE id = v_prev_id;
  END IF;

  UPDATE threat_sets
     SET status = 'active', effective_from = now(),
         approved_by = p_actor_id, approved_at = now(), updated_at = now()
   WHERE id = p_threat_set_id;

  INSERT INTO audit_log (
    user_id, user_role, user_name,
    entity_type, entity_id, entity_label,
    action, human_narrative
  ) VALUES (
    p_actor_id, v_actor_role, v_actor_name,
    'threat_sets', p_threat_set_id, v_set_name,
    'activate_threat_set',
    format('Threat set "%s" activated by %s.', v_set_name, v_actor_name)
  );
END;
$$;


--
-- Name: apply_verified_action_target(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_verified_action_target() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status <> 'verified' OR OLD.status = 'verified' THEN
    RETURN NEW;
  END IF;
  IF NEW.target_residual_p_c IS NULL THEN
    RAISE EXCEPTION 'Cannot verify an action without a target residual.';
  END IF;

  -- Tell the risk-side history trigger that we''re driving this change.
  PERFORM set_config('riskapp.residual_source', 'action_verified', true);
  PERFORM set_config('riskapp.residual_source_action_id', NEW.id::text, true);
  PERFORM set_config('riskapp.residual_changed_by', NEW.verified_by::text, true);

  FOR r IN
    SELECT risk_id FROM security_action_risks WHERE action_id = NEW.id
  LOOP
    UPDATE risks SET
      probability_c    = NEW.target_residual_p_c,
      probability_i    = NEW.target_residual_p_i,
      probability_a    = NEW.target_residual_p_a,
      residual_impact_c = NEW.target_residual_imp_c,
      residual_impact_i = NEW.target_residual_imp_i,
      residual_impact_a = NEW.target_residual_imp_a
    WHERE id = r.risk_id;
  END LOOP;

  -- Clear the GUCs so a later direct edit in the same transaction isn''t mis-labelled.
  PERFORM set_config('riskapp.residual_source', '', true);
  PERFORM set_config('riskapp.residual_source_action_id', '', true);
  PERFORM set_config('riskapp.residual_changed_by', '', true);

  RETURN NEW;
END;
$$;


--
-- Name: approve_review_cycle(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_review_cycle(p_cycle_id uuid, p_acting_user uuid, p_narrative text DEFAULT 'Review cycle approved and completed by SIRO.'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role        user_role;
  v_name        VARCHAR(255);
  v_status      cycle_status;
  v_unfinalised INTEGER;
BEGIN
  SELECT role, full_name INTO v_role, v_name
    FROM users WHERE id = p_acting_user AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_review_cycle: user % not found', p_acting_user;
  END IF;

  SELECT status INTO v_status FROM review_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_review_cycle: cycle % not found', p_cycle_id;
  END IF;
  IF v_status != 'under_review' THEN
    RAISE EXCEPTION 'approve_review_cycle: must be under_review (current: %)', v_status;
  END IF;

  SELECT COUNT(*) INTO v_unfinalised
    FROM risk_review_items
   WHERE cycle_id = p_cycle_id AND finalised_notes IS NULL;
  IF v_unfinalised > 0 THEN
    RAISE EXCEPTION 'approve_review_cycle: % item(s) have no finalised notes', v_unfinalised;
  END IF;

  UPDATE review_cycles
     SET status      = 'completed',
         approved_by = p_acting_user,
         approved_at = now(),
         updated_at  = now()
   WHERE id = p_cycle_id;

  -- Clear both impact-changed flags so the "values changed" warning quietens
  -- after the SIRO formally signs off on the cycle.
  UPDATE systems            SET impact_changed_in_cycle = FALSE;
  UPDATE information_assets SET impact_changed_in_cycle = FALSE;

  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_acting_user, v_role, v_name, 'review_cycles', p_cycle_id, 'update', p_narrative);
END;
$$;


--
-- Name: check_technology_nesting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_technology_nesting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.object_type NOT IN ('hardware', 'software') THEN
      RAISE EXCEPTION 'Only hardware/software objects can have a parent_id (object: %, type: %)',
        NEW.name, NEW.object_type;
    END IF;
    IF (SELECT parent_id FROM system_objects WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Object % is already a child and cannot be a parent (one level only)',
        NEW.parent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: ciso_accept_handover(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ciso_accept_handover(p_handover_id uuid, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actor_role user_role; v_rec onboarding_handover%ROWTYPE; v_missing TEXT[] := '{}';
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role != 'ciso' THEN RAISE EXCEPTION 'ciso_accept_handover: CISO only (role: %)', v_actor_role; END IF;
  IF p_notes IS NULL OR trim(p_notes) = '' THEN RAISE EXCEPTION 'ciso_accept_handover: notes mandatory'; END IF;
  SELECT * INTO v_rec FROM onboarding_handover WHERE id = p_handover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ciso_accept_handover: record % not found', p_handover_id; END IF;
  IF v_rec.ciso_accepted THEN RAISE EXCEPTION 'ciso_accept_handover: already accepted'; END IF;
  IF NOT v_rec.threats_reviewed      THEN v_missing := v_missing || 'threats';       END IF;
  IF NOT v_rec.controls_reviewed     THEN v_missing := v_missing || 'controls';      END IF;
  IF NOT v_rec.impact_tables_reviewed THEN v_missing := v_missing || 'impact_tables'; END IF;
  IF NOT v_rec.assets_reviewed       THEN v_missing := v_missing || 'assets';        END IF;
  IF NOT v_rec.risks_reviewed        THEN v_missing := v_missing || 'risks';         END IF;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'ciso_accept_handover: areas not yet reviewed: %', array_to_string(v_missing, ', '); END IF;
  UPDATE onboarding_handover SET ciso_accepted = TRUE, ciso_accepted_by = p_actor_id,
    ciso_accepted_at = NOW(), ciso_acceptance_notes = p_notes WHERE id = p_handover_id;
  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, human_narrative)
  VALUES (p_actor_id, 'ciso', 'ciso_accept_handover', 'onboarding_handover', p_handover_id,
    format('CISO accepted handover. All 5 areas reviewed. Notes: %s', p_notes));
END;
$$;


--
-- Name: ciso_adjust_impact_level(uuid, smallint, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ciso_adjust_impact_level(p_definition_id uuid, p_new_level smallint, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR;
  v_table_id UUID; v_cycle_id UUID; v_cycle_status calibration_cycle_status;
  v_dept_name TEXT; v_dimension cia_dimension;
  v_old_level SMALLINT; v_orig_level SMALLINT;
BEGIN
  IF p_notes IS NULL OR trim(p_notes) = '' THEN RAISE EXCEPTION 'ciso_adjust_impact_level: notes mandatory'; END IF;
  IF p_new_level NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'ciso_adjust_impact_level: level must be 1–5'; END IF;
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ciso_adjust_impact_level: actor % not found', p_actor_id; END IF;
  IF v_role != 'ciso' THEN RAISE EXCEPTION 'ciso_adjust_impact_level: CISO only (role: %)', v_role; END IF;
  SELECT ild.table_id, ild.cia_dimension, ild.level, ild.original_level,
         dit.cycle_id, icc.status, d.name
    INTO v_table_id, v_dimension, v_old_level, v_orig_level, v_cycle_id, v_cycle_status, v_dept_name
    FROM impact_level_definitions ild
    JOIN department_impact_tables dit ON dit.id = ild.table_id
    JOIN impact_calibration_cycles icc ON icc.id = dit.cycle_id
    JOIN departments d ON d.id = dit.department_id
   WHERE ild.id = p_definition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ciso_adjust_impact_level: definition % not found', p_definition_id; END IF;
  IF v_cycle_status != 'levelling' THEN
    RAISE EXCEPTION 'ciso_adjust_impact_level: cycle must be levelling (current: %)', v_cycle_status; END IF;
  IF v_orig_level IS NULL THEN v_orig_level := v_old_level; END IF;
  UPDATE impact_level_definitions SET level = p_new_level, original_level = v_orig_level,
    levelling_notes = p_notes, updated_at = now() WHERE id = p_definition_id;
  UPDATE department_impact_tables SET levelled_by = p_actor_id, levelled_at = now(),
    updated_at = now() WHERE id = v_table_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action,
    field_name, old_value, new_value, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'impact_level_definitions', p_definition_id, 'adjust_impact',
    'level', v_old_level::TEXT, p_new_level::TEXT,
    format('CISO %s adjusted impact level for dept "%s", dim %s: %s→%s. Original: %s. Notes: %s',
           v_name, v_dept_name, v_dimension, v_old_level, p_new_level, v_orig_level, p_notes));
END;
$$;


--
-- Name: ciso_approve_asset_register(uuid, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ciso_approve_asset_register(p_version_id uuid, p_decision boolean, p_notes text, p_acting_user uuid) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255);
  v_status asset_register_status; v_dept_id UUID; v_ver_num INTEGER;
  v_new_draft_id UUID;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_acting_user AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ciso_approve_asset_register: user % not found', p_acting_user; END IF;
  IF v_role != 'ciso' THEN RAISE EXCEPTION 'ciso_approve_asset_register: CISO only (role: %)', v_role; END IF;
  SELECT status, department_id, version_number INTO v_status, v_dept_id, v_ver_num
    FROM asset_register_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ciso_approve_asset_register: version % not found', p_version_id; END IF;
  IF v_status != 'submitted' THEN RAISE EXCEPTION 'ciso_approve_asset_register: must be submitted (current: %)', v_status; END IF;
  IF p_decision THEN
    UPDATE asset_register_versions SET status = 'superseded', updated_at = now()
     WHERE department_id = v_dept_id AND status = 'ciso_approved';
    UPDATE asset_register_versions SET status = 'ciso_approved', ciso_reviewed_by = p_acting_user,
      ciso_reviewed_at = now(), ciso_notes = p_notes, updated_at = now() WHERE id = p_version_id;
    INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
    VALUES (p_acting_user, v_role, v_name, 'asset_register_versions', p_version_id, 'approve_asset_register',
      'CISO approved register v' || v_ver_num::TEXT || ' for dept ' || v_dept_id::TEXT);
    RETURN NULL;
  ELSE
    UPDATE asset_register_versions SET status = 'ciso_rejected', ciso_reviewed_by = p_acting_user,
      ciso_reviewed_at = now(), ciso_notes = p_notes, updated_at = now() WHERE id = p_version_id;
    INSERT INTO asset_register_versions (department_id, version_number, status, based_on_version_id, created_by)
    VALUES (v_dept_id, v_ver_num + 1, 'draft', p_version_id, p_acting_user) RETURNING id INTO v_new_draft_id;
    INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
    VALUES (p_acting_user, v_role, v_name, 'asset_register_versions', p_version_id, 'reject_asset_register',
      'CISO rejected register v' || v_ver_num::TEXT || '. New draft v' || (v_ver_num+1)::TEXT || ' created.');
    RETURN v_new_draft_id;
  END IF;
END;
$$;


--
-- Name: derive_summary_score(smallint, smallint, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_summary_score(p_rc smallint, p_ri smallint, p_ra smallint) RETURNS smallint
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_method impact_derivation_method;
  v_wc NUMERIC; v_wi NUMERIC; v_wa NUMERIC; v_score NUMERIC;
BEGIN
  SELECT impact_method, weight_confidentiality, weight_integrity, weight_availability
    INTO v_method, v_wc, v_wi, v_wa FROM org_config LIMIT 1;
  v_score := CASE v_method
    WHEN 'max'      THEN GREATEST(p_rc, p_ri, p_ra)
    WHEN 'average'  THEN ROUND((p_rc + p_ri + p_ra)::NUMERIC / 3)
    WHEN 'weighted' THEN ROUND(p_rc * v_wc + p_ri * v_wi + p_ra * v_wa)
  END;
  RETURN GREATEST(1, LEAST(25, v_score::SMALLINT));
END;
$$;


--
-- Name: enforce_action_required_threshold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_action_required_threshold() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_threshold SMALLINT;
BEGIN
  IF COALESCE(NEW.no_action_required, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  SELECT mandatory_action_score INTO v_threshold FROM org_config LIMIT 1;

  IF NEW.risk_score >= v_threshold THEN
    RAISE EXCEPTION
      'Risks scoring % cannot be marked "no action required" (org threshold: %).',
      NEW.risk_score, v_threshold
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_target_locked(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_target_locked() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.target_locked_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.target_residual_p_c   IS DISTINCT FROM OLD.target_residual_p_c
  OR NEW.target_residual_p_i   IS DISTINCT FROM OLD.target_residual_p_i
  OR NEW.target_residual_p_a   IS DISTINCT FROM OLD.target_residual_p_a
  OR NEW.target_residual_imp_c IS DISTINCT FROM OLD.target_residual_imp_c
  OR NEW.target_residual_imp_i IS DISTINCT FROM OLD.target_residual_imp_i
  OR NEW.target_residual_imp_a IS DISTINCT FROM OLD.target_residual_imp_a THEN
    RAISE EXCEPTION
      'Action target residual is locked after SWG adoption and cannot be changed. '
      'Cancel the action and propose a corrective one to revise.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: expire_overdue_exceptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_overdue_exceptions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id, e.risk_id, e.expires_at, t.name AS threat_name, s.name AS system_name
    FROM   risk_exceptions e
    JOIN   risks   rk ON rk.id = e.risk_id
    JOIN   systems s  ON s.id  = rk.system_id
    JOIN   threats t  ON t.id  = rk.threat_id
    WHERE  e.status = 'active'
      AND  e.expires_at < CURRENT_DATE
  LOOP
    UPDATE risk_exceptions
       SET status       = 'expired',
           escalated_at = COALESCE(escalated_at, now()),
           updated_at   = now()
     WHERE id = r.id;

    INSERT INTO audit_log
      (entity_type, entity_id, action, human_narrative)
    VALUES
      ('risk_exceptions', r.id, 'update',
       format('Exception on risk for "%s" (%s) auto-expired on review date %s and escalated for breach review.',
              r.threat_name, r.system_name, r.expires_at));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION expire_overdue_exceptions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.expire_overdue_exceptions() IS 'Sweep: move active exceptions past expires_at into expired + stamp escalated_at + audit-log. Idempotent. Called at app startup, daily, and lazily on reads. The risk stays treatment_decision=accept (lapses into breach, does not revert).';


--
-- Name: finalise_review_item(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalise_review_item(p_item_id uuid, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255);
  v_cycle_id UUID; v_cycle_status cycle_status;
  v_risk_id UUID; v_risk_label VARCHAR; v_already_done BOOLEAN;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'finalise_review_item: actor % not found', p_actor_id; END IF;
  IF v_role != 'ciso' THEN RAISE EXCEPTION 'finalise_review_item: CISO only (role: %)', v_role; END IF;
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'finalise_review_item: notes mandatory'; END IF;
  SELECT rri.cycle_id, rri.risk_id, (rri.finalised_at IS NOT NULL), rc.status
    INTO v_cycle_id, v_risk_id, v_already_done, v_cycle_status
    FROM risk_review_items rri JOIN review_cycles rc ON rc.id = rri.cycle_id WHERE rri.id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'finalise_review_item: item % not found', p_item_id; END IF;
  IF v_cycle_status != 'under_review' THEN
    RAISE EXCEPTION 'finalise_review_item: cycle must be under_review (current: %)', v_cycle_status; END IF;
  IF v_already_done THEN RAISE EXCEPTION 'finalise_review_item: item % already finalised', p_item_id; END IF;
  SELECT format('%s / %s', ia.name, t.name) INTO v_risk_label
    FROM risks r JOIN information_assets ia ON ia.id = r.asset_id JOIN threats t ON t.id = r.threat_id
   WHERE r.id = v_risk_id;
  UPDATE risk_review_items SET finalised_notes = p_notes, finalised_by = p_actor_id,
    finalised_at = now() WHERE id = p_item_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, entity_label, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'risk_review_items', p_item_id, v_risk_label, 'finalise_review_item',
    format('Review item finalised by CISO %s. Risk: %s.', v_name, v_risk_label));
END;
$$;


--
-- Name: fn_calculate_residual_risk(uuid, public.control_application_status[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calculate_residual_risk(p_risk_id uuid, p_status_filter public.control_application_status[] DEFAULT NULL::public.control_application_status[]) RETURNS TABLE(baseline_probability_c smallint, baseline_probability_i smallint, baseline_probability_a smallint, baseline_impact_c smallint, baseline_impact_i smallint, baseline_impact_a smallint, residual_probability_c smallint, residual_probability_i smallint, residual_probability_a smallint, residual_impact_c smallint, residual_impact_i smallint, residual_impact_a smallint)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  r_record         RECORD;
  v_status_filter  control_application_status[];
BEGIN
  -- Default status filter: anything not lapsed.
  v_status_filter := COALESCE(
    p_status_filter,
    ARRAY['planned','implemented','verified']::control_application_status[]
  );

  SELECT r.system_id, r.threat_id, r.asset_id,
         r.probability_c, r.probability_i, r.probability_a,
         a.confidentiality, a.integrity, a.availability
    INTO r_record
    FROM risks r
    JOIN information_assets a ON a.id = r.asset_id
   WHERE r.id = p_risk_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_calculate_residual_risk: risk % not found', p_risk_id;
  END IF;

  baseline_probability_c := r_record.probability_c;
  baseline_probability_i := r_record.probability_i;
  baseline_probability_a := r_record.probability_a;
  baseline_impact_c      := r_record.confidentiality;
  baseline_impact_i      := r_record.integrity;
  baseline_impact_a      := r_record.availability;

  -- Build the set of effects in scope. Three sources contribute:
  --   (a) v_control_application_resolved rows whose system_id = risk.system_id
  --   (b) Threat-targeted applications whose target_threat_id = risk.threat_id
  --   (c) Asset-targeted applications routed through the resolved view
  --       (information_asset target reaches system_objects, but only those
  --       belonging to the risk's system are relevant — already filtered by (a)).
  WITH effects AS (
    SELECT effect_target, effect_mode, effect_value
      FROM v_control_application_resolved v
     WHERE v.system_id = r_record.system_id
       AND v.status = ANY (v_status_filter)
    UNION ALL
    SELECT ca.effect_target, ca.effect_mode, ca.effect_value
      FROM control_applications ca
     WHERE ca.target_threat_id = r_record.threat_id
       AND ca.status = ANY (v_status_filter)
  ),
  per_channel AS (
    SELECT
      effect_target,
      COALESCE(SUM(CASE WHEN effect_mode = 'absolute' THEN effect_value END), 0)::INT
        AS abs_total,
      COALESCE(
        (
          SELECT EXP(SUM(LN(GREATEST(1.0 - CASE effect_value
                                                 WHEN 1 THEN 0.10
                                                 WHEN 2 THEN 0.25
                                                 WHEN 3 THEN 0.50
                                                 WHEN 4 THEN 0.75
                                                 WHEN 5 THEN 0.90
                                              END, 0.0001))))
            FROM effects e2
           WHERE e2.effect_mode = 'relative'
             AND e2.effect_target = e.effect_target
        ),
        1.0
      )::NUMERIC AS rel_factor
    FROM effects e
    GROUP BY effect_target
  )
  SELECT
    GREATEST(0, LEAST(baseline_probability_c,
      ROUND(((baseline_probability_c - COALESCE(MAX(CASE WHEN effect_target='probability' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='probability' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT,
    GREATEST(0, LEAST(baseline_probability_i,
      ROUND(((baseline_probability_i - COALESCE(MAX(CASE WHEN effect_target='probability' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='probability' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT,
    GREATEST(0, LEAST(baseline_probability_a,
      ROUND(((baseline_probability_a - COALESCE(MAX(CASE WHEN effect_target='probability' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='probability' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT,
    GREATEST(0, LEAST(baseline_impact_c,
      ROUND(((baseline_impact_c - COALESCE(MAX(CASE WHEN effect_target='impact_c' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='impact_c' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT,
    GREATEST(0, LEAST(baseline_impact_i,
      ROUND(((baseline_impact_i - COALESCE(MAX(CASE WHEN effect_target='impact_i' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='impact_i' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT,
    GREATEST(0, LEAST(baseline_impact_a,
      ROUND(((baseline_impact_a - COALESCE(MAX(CASE WHEN effect_target='impact_a' THEN abs_total END),0))
             * COALESCE(MAX(CASE WHEN effect_target='impact_a' THEN rel_factor END),1.0))::NUMERIC)))::SMALLINT
  INTO residual_probability_c, residual_probability_i, residual_probability_a,
       residual_impact_c,      residual_impact_i,      residual_impact_a
  FROM per_channel;

  -- If no effects rows at all, the per_channel CTE yielded zero rows and the
  -- residual columns are NULL — fall back to baselines.
  residual_probability_c := COALESCE(residual_probability_c, baseline_probability_c);
  residual_probability_i := COALESCE(residual_probability_i, baseline_probability_i);
  residual_probability_a := COALESCE(residual_probability_a, baseline_probability_a);
  residual_impact_c      := COALESCE(residual_impact_c,      baseline_impact_c);
  residual_impact_i      := COALESCE(residual_impact_i,      baseline_impact_i);
  residual_impact_a      := COALESCE(residual_impact_a,      baseline_impact_a);

  RETURN NEXT;
END;
$$;


--
-- Name: FUNCTION fn_calculate_residual_risk(p_risk_id uuid, p_status_filter public.control_application_status[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calculate_residual_risk(p_risk_id uuid, p_status_filter public.control_application_status[]) IS 'Aggregates control_applications affecting a risk and returns baseline + residual values per CIA channel. p_status_filter selects which applications count (default = planned, implemented, verified — i.e. everything not lapsed). Pass {implemented, verified} for current residual, or include planned for target/what-if residual.';


--
-- Name: fn_onboarding_handover_revoke_sudo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_onboarding_handover_revoke_sudo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_sc_count  INTEGER;
  v_narrative TEXT;
BEGIN
  IF NEW.ciso_accepted = TRUE
     AND NEW.siro_accepted = TRUE
     AND NOT (OLD.ciso_accepted = TRUE AND OLD.siro_accepted = TRUE)
  THEN
    UPDATE users SET sudo_enabled = FALSE
     WHERE role = 'security_consultant' AND sudo_enabled = TRUE;
    GET DIAGNOSTICS v_sc_count = ROW_COUNT;
    UPDATE org_config SET setup_phase_active = FALSE, setup_completed_at = NOW();
    v_narrative := format(
      'Onboarding handover completed. CISO accepted by %s at %s. SIRO accepted by %s at %s. '
      'sudo_enabled revoked on %s security_consultant account(s). System now operational.',
      NEW.ciso_accepted_by, NEW.ciso_accepted_at,
      NEW.siro_accepted_by, NEW.siro_accepted_at,
      v_sc_count
    );
    INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, human_narrative)
    VALUES (NEW.siro_accepted_by, 'siro', 'onboarding_handover', 'onboarding_handover', NEW.id, v_narrative);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fork_control(uuid, character varying, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fork_control(p_parent_control_id uuid, p_new_title character varying, p_new_description text, p_actor_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_parent      RECORD;
  v_new_id      UUID;
  v_actor_role  user_role;
  v_actor_name  VARCHAR;
BEGIN
  SELECT role, full_name INTO v_actor_role, v_actor_name
    FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fork_control: actor % not found', p_actor_id;
  END IF;
  IF v_actor_role NOT IN ('ciso', 'security_consultant', 'risk_analyst') THEN
    RAISE EXCEPTION 'fork_control: role % not permitted', v_actor_role;
  END IF;

  SELECT * INTO v_parent FROM controls WHERE id = p_parent_control_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fork_control: parent control % not found', p_parent_control_id;
  END IF;

  INSERT INTO controls (
    framework, framework_ref, reference_code,
    title, description,
    control_type, status, is_baseline,
    origin_standard_id, parent_control_id,
    created_by
  ) VALUES (
    v_parent.framework, v_parent.framework_ref, v_parent.reference_code,
    p_new_title, p_new_description,
    v_parent.control_type, 'under_review', FALSE,
    v_parent.origin_standard_id, v_parent.id,
    p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO audit_log (
    user_id, user_role, user_name,
    entity_type, entity_id, entity_label,
    action, human_narrative
  ) VALUES (
    p_actor_id, v_actor_role, v_actor_name,
    'controls', v_new_id, p_new_title,
    'fork_control',
    format('Control "%s" forked from %s by %s.', p_new_title, v_parent.title, v_actor_name)
  );

  RETURN v_new_id;
END;
$$;


--
-- Name: freeze_review_cycle(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.freeze_review_cycle(p_cycle_id uuid, p_acting_user uuid, p_narrative text DEFAULT 'Review cycle frozen by CISO ahead of working group meeting.'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255); v_status cycle_status;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_acting_user AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'freeze_review_cycle: user % not found', p_acting_user; END IF;
  IF v_role != 'ciso' THEN RAISE EXCEPTION 'freeze_review_cycle: CISO only (role: %)', v_role; END IF;
  SELECT status INTO v_status FROM review_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'freeze_review_cycle: cycle % not found', p_cycle_id; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'freeze_review_cycle: must be active (current: %)', v_status; END IF;
  UPDATE review_cycles SET status = 'under_review', frozen_by = p_acting_user,
    frozen_at = now(), updated_at = now() WHERE id = p_cycle_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_acting_user, v_role, v_name, 'review_cycles', p_cycle_id, 'update', p_narrative);
END;
$$;


--
-- Name: get_location_probability_score(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_location_probability_score(p_location_id uuid) RETURNS smallint
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE v_score SMALLINT;
BEGIN
  SELECT MAX(so.base_probability_score) INTO v_score
    FROM location_objects lo
    JOIN system_objects so ON so.id = lo.object_id
   WHERE lo.location_id = p_location_id AND so.is_active = TRUE;
  RETURN COALESCE(v_score, 0);
END;
$$;


--
-- Name: FUNCTION get_location_probability_score(p_location_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_location_probability_score(p_location_id uuid) IS 'Returns the highest base_probability_score across all active objects placed at a location. Returns 0 if no active objects are present.';


--
-- Name: get_system_probability_score(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_system_probability_score(p_system_id uuid) RETURNS smallint
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE v_score SMALLINT;
BEGIN
  SELECT MAX(base_probability_score) INTO v_score
    FROM system_objects
   WHERE system_id = p_system_id AND is_active = TRUE;
  RETURN COALESCE(v_score, 0);
END;
$$;


--
-- Name: FUNCTION get_system_probability_score(p_system_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_system_probability_score(p_system_id uuid) IS 'Returns the highest base_probability_score across all active objects in a system. Returns 0 if the system has no active objects.';


--
-- Name: go_operational(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.go_operational(p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_active BOOLEAN;
  v_role   user_role;
  v_name   VARCHAR;
BEGIN
  SELECT setup_phase_active INTO v_active FROM org_config LIMIT 1;
  IF v_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'go_operational: organisation is already operational';
  END IF;

  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id;

  UPDATE org_config
     SET setup_phase_active = FALSE,
         setup_completed_at = now(),
         updated_at         = now();

  INSERT INTO audit_log
    (user_id, user_role, user_name, entity_type, action, human_narrative)
  VALUES
    (p_actor_id, v_role, v_name, 'org_config', 'update',
     format('Organisation moved from setup to OPERATIONAL by %s. Security-consultant '
            'exception authority now matches risk_analyst.', COALESCE(v_name, 'unknown')));
END;
$$;


--
-- Name: FUNCTION go_operational(p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.go_operational(p_actor_id uuid) IS 'One-way setup→operational transition. Sets setup_phase_active=FALSE + setup_completed_at. Raises if already operational. Consultant-only at the route.';


--
-- Name: grant_additional_role(uuid, public.user_role, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_actor_role  user_role;
  v_actor_name  VARCHAR;
  v_target_email VARCHAR;
  v_target_name  VARCHAR;
  v_primary_role user_role;
BEGIN
  -- Validate actor is an active admin
  SELECT role, full_name
    INTO v_actor_role, v_actor_name
    FROM users
   WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_additional_role: actor % not found', p_actor_id;
  END IF;
  IF v_actor_role != 'admin' THEN
    RAISE EXCEPTION 'grant_additional_role: admin only (actor role: %)', v_actor_role;
  END IF;

  -- Validate target user exists
  SELECT email, full_name, role
    INTO v_target_email, v_target_name, v_primary_role
    FROM users
   WHERE id = p_user_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_additional_role: target user % not found', p_user_id;
  END IF;

  -- Block if role matches primary role
  IF p_role = v_primary_role THEN
    RAISE EXCEPTION
      'grant_additional_role: user % already holds % as their primary role',
      v_target_email, p_role;
  END IF;

  -- Block if already granted
  IF EXISTS (
    SELECT 1 FROM user_roles
     WHERE user_id = p_user_id AND role = p_role
  ) THEN
    RAISE EXCEPTION
      'grant_additional_role: user % already holds additional role %',
      v_target_email, p_role;
  END IF;

  -- Insert the additional role
  INSERT INTO user_roles (user_id, role, granted_by)
  VALUES (p_user_id, p_role, p_actor_id);

  -- Audit
  INSERT INTO audit_log (
    user_id, user_role, user_name,
    entity_type, entity_id, entity_label,
    action, human_narrative
  ) VALUES (
    p_actor_id, v_actor_role, v_actor_name,
    'users', p_user_id, v_target_email,
    'grant_additional_role',
    format(
      'Admin %s granted additional role "%s" to user %s (%s).',
      v_actor_name, p_role, v_target_name, v_target_email
    )
  );
END;
$$;


--
-- Name: FUNCTION grant_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.grant_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid) IS 'Grants an additional role to a user. Admin only. Blocked if the role is already the user''s primary role or already granted. Writes to audit_log.';


--
-- Name: lock_calibration_cycle(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_calibration_cycle(p_cycle_id uuid, p_acting_user uuid, p_narrative text DEFAULT 'Impact calibration cycle locked by CISO.'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255);
  v_cycle_status calibration_cycle_status;
  v_table RECORD; v_risk RECORD; v_prev_cycle_id UUID;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_acting_user AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lock_calibration_cycle: user % not found', p_acting_user; END IF;
  IF v_role != 'ciso' THEN RAISE EXCEPTION 'lock_calibration_cycle: CISO only (role: %)', v_role; END IF;
  SELECT status INTO v_cycle_status FROM impact_calibration_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lock_calibration_cycle: cycle % not found', p_cycle_id; END IF;
  IF v_cycle_status != 'levelling' THEN
    RAISE EXCEPTION 'lock_calibration_cycle: must be levelling (current: %)', v_cycle_status; END IF;
  UPDATE impact_calibration_cycles SET status = 'superseded', updated_at = now() WHERE status = 'active';
  UPDATE impact_calibration_cycles SET status = 'active', locked_by = p_acting_user,
    locked_at = now(), updated_at = now() WHERE id = p_cycle_id;
  FOR v_table IN SELECT id, department_id FROM department_impact_tables WHERE cycle_id = p_cycle_id
  LOOP
    UPDATE department_impact_tables SET status = 'locked', locked_at = now(), updated_at = now()
    WHERE id = v_table.id;
    SELECT dit.id INTO v_prev_cycle_id
      FROM department_impact_tables dit
      JOIN impact_calibration_cycles icc ON icc.id = dit.cycle_id
     WHERE dit.department_id = v_table.department_id AND icc.status = 'superseded'
     ORDER BY dit.locked_at DESC NULLS LAST LIMIT 1;
    IF v_prev_cycle_id IS NOT NULL THEN
      FOR v_risk IN
        SELECT r.id, r.risk_score
          FROM risks r JOIN information_assets ia ON ia.id = r.asset_id
         WHERE ia.department_id = v_table.department_id
           AND r.is_active = TRUE AND r.validation_status = 'validated'
      LOOP
        INSERT INTO impact_reconciliation_items (
          cycle_id, risk_id, old_table_version_id, new_table_version_id,
          old_score, new_score
        ) VALUES (
          p_cycle_id, v_risk.id, v_prev_cycle_id, v_table.id,
          v_risk.risk_score, v_risk.risk_score
        ) ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_acting_user, v_role, v_name, 'impact_calibration_cycles', p_cycle_id, 'lock_calibration', p_narrative);
END;
$$;


--
-- Name: log_residual_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_residual_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_source         residual_change_source := 'direct_edit';
  v_source_action  UUID;
  v_changed_by     UUID;
  v_src_cfg        TEXT;
  v_act_cfg        TEXT;
  v_by_cfg         TEXT;
BEGIN
  IF (NEW.probability_c    IS NOT DISTINCT FROM OLD.probability_c
   AND NEW.probability_i    IS NOT DISTINCT FROM OLD.probability_i
   AND NEW.probability_a    IS NOT DISTINCT FROM OLD.probability_a
   AND NEW.residual_impact_c IS NOT DISTINCT FROM OLD.residual_impact_c
   AND NEW.residual_impact_i IS NOT DISTINCT FROM OLD.residual_impact_i
   AND NEW.residual_impact_a IS NOT DISTINCT FROM OLD.residual_impact_a) THEN
    RETURN NEW;
  END IF;

  v_src_cfg := current_setting('riskapp.residual_source', true);
  v_act_cfg := current_setting('riskapp.residual_source_action_id', true);
  v_by_cfg  := current_setting('riskapp.residual_changed_by', true);

  IF v_src_cfg IS NOT NULL AND v_src_cfg <> '' THEN
    v_source := v_src_cfg::residual_change_source;
  END IF;
  IF v_act_cfg IS NOT NULL AND v_act_cfg <> '' THEN
    v_source_action := v_act_cfg::uuid;
  END IF;
  IF v_by_cfg IS NOT NULL AND v_by_cfg <> '' THEN
    v_changed_by := v_by_cfg::uuid;
  END IF;

  INSERT INTO risk_residual_history (
    risk_id, changed_by, source, source_action_id,
    prev_probability_c, prev_probability_i, prev_probability_a,
    prev_residual_imp_c, prev_residual_imp_i, prev_residual_imp_a,
    new_probability_c, new_probability_i, new_probability_a,
    new_residual_imp_c, new_residual_imp_i, new_residual_imp_a
  ) VALUES (
    NEW.id, v_changed_by, v_source, v_source_action,
    OLD.probability_c, OLD.probability_i, OLD.probability_a,
    OLD.residual_impact_c, OLD.residual_impact_i, OLD.residual_impact_a,
    NEW.probability_c, NEW.probability_i, NEW.probability_a,
    NEW.residual_impact_c, NEW.residual_impact_i, NEW.residual_impact_a
  );

  RETURN NEW;
END;
$$;


--
-- Name: mark_area_reviewed(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_area_reviewed(p_handover_id uuid, p_area text, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v_actor_role user_role;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role != 'ciso' THEN RAISE EXCEPTION 'mark_area_reviewed: CISO only (role: %)', v_actor_role; END IF;
  IF p_notes IS NULL OR trim(p_notes) = '' THEN RAISE EXCEPTION 'mark_area_reviewed: notes mandatory for area %', p_area; END IF;
  IF p_area = 'threats' THEN
    UPDATE onboarding_handover SET threats_reviewed = TRUE, threats_reviewed_at = NOW(), threats_review_notes = p_notes WHERE id = p_handover_id AND ciso_accepted = FALSE;
  ELSIF p_area = 'controls' THEN
    UPDATE onboarding_handover SET controls_reviewed = TRUE, controls_reviewed_at = NOW(), controls_review_notes = p_notes WHERE id = p_handover_id AND ciso_accepted = FALSE;
  ELSIF p_area = 'impact_tables' THEN
    UPDATE onboarding_handover SET impact_tables_reviewed = TRUE, impact_tables_reviewed_at = NOW(), impact_tables_review_notes = p_notes WHERE id = p_handover_id AND ciso_accepted = FALSE;
  ELSIF p_area = 'assets' THEN
    UPDATE onboarding_handover SET assets_reviewed = TRUE, assets_reviewed_at = NOW(), assets_review_notes = p_notes WHERE id = p_handover_id AND ciso_accepted = FALSE;
  ELSIF p_area = 'risks' THEN
    UPDATE onboarding_handover SET risks_reviewed = TRUE, risks_reviewed_at = NOW(), risks_review_notes = p_notes WHERE id = p_handover_id AND ciso_accepted = FALSE;
  ELSE
    RAISE EXCEPTION 'mark_area_reviewed: unknown area %. Valid: threats, controls, impact_tables, assets, risks', p_area;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'mark_area_reviewed: handover % not found or already accepted', p_handover_id; END IF;
  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, human_narrative)
  VALUES (p_actor_id, 'ciso', 'mark_area_reviewed', 'onboarding_handover', p_handover_id,
    format('CISO marked area "%s" reviewed. Notes: %s', p_area, p_notes));
END;
$$;


--
-- Name: mark_control_ineffective(uuid, smallint, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_control_ineffective(p_control_id uuid, p_effectiveness smallint, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_control_title VARCHAR; v_actor_name VARCHAR; v_actor_role user_role;
BEGIN
  SELECT full_name, role INTO v_actor_name, v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role NOT IN ('risk_analyst', 'ciso') THEN
    RAISE EXCEPTION 'Only risk_analyst or ciso may mark controls ineffective'; END IF;
  IF p_effectiveness IS NULL OR p_effectiveness NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'effectiveness must be 1–5'; END IF;
  IF p_notes IS NULL OR p_notes = '' THEN
    RAISE EXCEPTION 'effectiveness_notes mandatory'; END IF;
  SELECT title INTO v_control_title FROM controls WHERE id = p_control_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Control % not found', p_control_id; END IF;
  UPDATE controls SET status = 'ineffective', effectiveness = p_effectiveness,
    effectiveness_notes = p_notes, rated_by = p_actor_id, rated_at = now(), updated_at = now()
  WHERE id = p_control_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_actor_id, v_actor_role, v_actor_name, 'controls', p_control_id, 'mark_control_ineffective',
    format('Control "%s" marked ineffective by %s. Effectiveness: %s/5. Notes: %s',
           v_control_title, v_actor_name, p_effectiveness, p_notes));
END;
$$;


--
-- Name: probability_tier(smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.probability_tier(p_score smallint) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN CASE
    WHEN p_score IS NULL THEN NULL
    WHEN p_score <= 1    THEN 'low'
    WHEN p_score <= 2    THEN 'low-moderate'
    WHEN p_score <= 3    THEN 'moderate'
    WHEN p_score <= 4    THEN 'elevated'
    ELSE                      'high'
  END;
END;
$$;


--
-- Name: FUNCTION probability_tier(p_score smallint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.probability_tier(p_score smallint) IS 'Classifies a 1–5 probability score into a descriptive tier. Used for system_objects.base_probability_score and location-level aggregations. Must not be confused with risk_level_from_score(), which operates on 1–25 risk scores.';


--
-- Name: probability_tier(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.probability_tier(p_score integer) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT probability_tier(p_score::SMALLINT);
$$;


--
-- Name: recompute_service_impact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_service_impact(p_service_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_new_c SMALLINT;
  v_new_i SMALLINT;
  v_new_a SMALLINT;
BEGIN
  SELECT MAX(ia.confidentiality), MAX(ia.integrity), MAX(ia.availability)
    INTO v_new_c, v_new_i, v_new_a
  FROM business_service_assets bsa
  JOIN information_assets ia ON ia.id = bsa.asset_id AND ia.is_active = TRUE
  WHERE bsa.service_id = p_service_id;

  UPDATE business_services SET
    confidentiality = v_new_c,
    integrity       = v_new_i,
    availability    = v_new_a
  WHERE id = p_service_id;
END;
$$;


--
-- Name: recompute_system_impact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_system_impact(p_system_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_old_c SMALLINT;
  v_old_i SMALLINT;
  v_old_a SMALLINT;
  v_new_c SMALLINT;
  v_new_i SMALLINT;
  v_new_a SMALLINT;
BEGIN
  SELECT impact_c, impact_i, impact_a
    INTO v_old_c, v_old_i, v_old_a
  FROM systems WHERE id = p_system_id;

  SELECT MAX(ia.confidentiality), MAX(ia.integrity), MAX(ia.availability)
    INTO v_new_c, v_new_i, v_new_a
  FROM system_assets sa
  JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
  WHERE sa.system_id = p_system_id;

  UPDATE systems SET
    impact_c       = v_new_c,
    impact_i       = v_new_i,
    impact_a       = v_new_a,
    impact_set_at  = now(),
    impact_changed_in_cycle = CASE
      WHEN v_old_c IS DISTINCT FROM v_new_c
        OR v_old_i IS DISTINCT FROM v_new_i
        OR v_old_a IS DISTINCT FROM v_new_a
      THEN TRUE
      ELSE impact_changed_in_cycle
    END
  WHERE id = p_system_id;
END;
$$;


--
-- Name: resubmit_risk(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resubmit_risk(p_risk_id uuid, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR; v_cur_status risk_validation_status;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resubmit_risk: actor % not found', p_actor_id; END IF;
  SELECT validation_status INTO v_cur_status FROM risks WHERE id = p_risk_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'resubmit_risk: risk % not found', p_risk_id; END IF;
  IF v_cur_status != 'returned' THEN
    RAISE EXCEPTION 'resubmit_risk: must be returned (current: %)', v_cur_status; END IF;
  UPDATE risks SET validation_status = 'pending', validated_by = NULL,
    validated_at = NULL, updated_at = now() WHERE id = p_risk_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'risks', p_risk_id, 'resubmit_risk',
    format('Risk resubmitted for validation by %s.', v_name));
END;
$$;


--
-- Name: return_risk(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.return_risk(p_risk_id uuid, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role   user_role;
  v_name   VARCHAR;
  v_asset  VARCHAR;
  v_threat VARCHAR;
BEGIN
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'return_risk: validation_notes mandatory';
  END IF;

  SELECT role, full_name INTO v_role, v_name
    FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_risk: actor % not found', p_actor_id;
  END IF;

  SELECT COALESCE(ia.name, '(no asset)'), t.name
    INTO v_asset, v_threat
    FROM risks r
    LEFT JOIN information_assets ia ON ia.id = r.asset_id
    JOIN threats t ON t.id = r.threat_id
   WHERE r.id = p_risk_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_risk: risk % not found', p_risk_id;
  END IF;

  UPDATE risks
     SET validation_status = 'returned', validation_notes = p_notes,
         validated_by = p_actor_id, validated_at = now(), updated_at = now()
   WHERE id = p_risk_id;

  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'risks', p_risk_id, 'return_risk',
    format('Risk returned by %s (%s). Notes: %s. Asset: %s, Threat: %s.',
           v_name, v_role, p_notes, v_asset, v_threat));
END;
$$;


--
-- Name: revoke_additional_role(uuid, public.user_role, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_actor_role   user_role;
  v_actor_name   VARCHAR;
  v_target_email VARCHAR;
  v_target_name  VARCHAR;
  v_primary_role user_role;
BEGIN
  -- Validate actor is an active admin
  SELECT role, full_name
    INTO v_actor_role, v_actor_name
    FROM users
   WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_additional_role: actor % not found', p_actor_id;
  END IF;
  IF v_actor_role != 'admin' THEN
    RAISE EXCEPTION 'revoke_additional_role: admin only (actor role: %)', v_actor_role;
  END IF;

  -- Validate target user exists
  SELECT email, full_name, role
    INTO v_target_email, v_target_name, v_primary_role
    FROM users
   WHERE id = p_user_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_additional_role: target user % not found', p_user_id;
  END IF;

  -- Block attempt to revoke primary role via this function
  IF p_role = v_primary_role THEN
    RAISE EXCEPTION
      'revoke_additional_role: cannot revoke primary role "%" from user %. '
      'Change the user''s primary role directly.',
      p_role, v_target_email;
  END IF;

  -- Check the additional role actually exists
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
     WHERE user_id = p_user_id AND role = p_role
  ) THEN
    RAISE EXCEPTION
      'revoke_additional_role: user % does not hold additional role %',
      v_target_email, p_role;
  END IF;

  -- Remove the additional role
  DELETE FROM user_roles
   WHERE user_id = p_user_id AND role = p_role;

  -- Audit
  INSERT INTO audit_log (
    user_id, user_role, user_name,
    entity_type, entity_id, entity_label,
    action, human_narrative
  ) VALUES (
    p_actor_id, v_actor_role, v_actor_name,
    'users', p_user_id, v_target_email,
    'revoke_additional_role',
    format(
      'Admin %s revoked additional role "%s" from user %s (%s).',
      v_actor_name, p_role, v_target_name, v_target_email
    )
  );
END;
$$;


--
-- Name: FUNCTION revoke_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.revoke_additional_role(p_user_id uuid, p_role public.user_role, p_actor_id uuid) IS 'Revokes an additional role from a user. Admin only. Cannot revoke the user''s primary role. Writes to audit_log.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: signal_cycle_ready(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signal_cycle_ready(p_cycle_id uuid, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR; v_cycle_name VARCHAR;
  v_status cycle_status; v_already_set BOOLEAN;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signal_cycle_ready: actor % not found', p_actor_id; END IF;
  IF v_role != 'risk_analyst' THEN RAISE EXCEPTION 'signal_cycle_ready: risk_analyst only (role: %)', v_role; END IF;
  SELECT name, status, analyst_ready INTO v_cycle_name, v_status, v_already_set
    FROM review_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'signal_cycle_ready: cycle % not found', p_cycle_id; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'signal_cycle_ready: must be active (current: %)', v_status; END IF;
  IF v_already_set THEN RAISE NOTICE 'signal_cycle_ready: already set — updating timestamp'; END IF;
  UPDATE review_cycles SET analyst_ready = TRUE, analyst_ready_at = now(),
    analyst_ready_by = p_actor_id, updated_at = now() WHERE id = p_cycle_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, entity_label, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'review_cycles', p_cycle_id, v_cycle_name, 'signal_ready',
    format('Analyst %s signalled cycle "%s" ready to freeze.', v_name, v_cycle_name));
END;
$$;


--
-- Name: siro_accept_handover(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.siro_accept_handover(p_handover_id uuid, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actor_role user_role; v_rec onboarding_handover%ROWTYPE;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role != 'siro' THEN RAISE EXCEPTION 'siro_accept_handover: SIRO only (role: %)', v_actor_role; END IF;
  IF p_notes IS NULL OR trim(p_notes) = '' THEN RAISE EXCEPTION 'siro_accept_handover: notes mandatory'; END IF;
  SELECT * INTO v_rec FROM onboarding_handover WHERE id = p_handover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'siro_accept_handover: record % not found', p_handover_id; END IF;
  IF v_rec.siro_accepted THEN RAISE EXCEPTION 'siro_accept_handover: already accepted'; END IF;
  IF NOT v_rec.ciso_accepted THEN RAISE EXCEPTION 'siro_accept_handover: CISO must accept first'; END IF;
  UPDATE onboarding_handover SET siro_accepted = TRUE, siro_accepted_by = p_actor_id,
    siro_accepted_at = NOW(), siro_acceptance_notes = p_notes WHERE id = p_handover_id;
  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, human_narrative)
  VALUES (p_actor_id, 'siro', 'siro_accept_handover', 'onboarding_handover', p_handover_id,
    format('SIRO accepted handover. System transitions to operational phase. Notes: %s', p_notes));
END;
$$;


--
-- Name: siro_sign_off_action(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.siro_sign_off_action(p_action_id uuid, p_notes text, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role user_role; v_name VARCHAR(255);
  v_action_title VARCHAR(255); v_action_status treatment_status;
  v_requires_signoff BOOLEAN; v_already_signed BOOLEAN; v_cycle_id UUID;
BEGIN
  SELECT role, full_name INTO v_role, v_name FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'siro_sign_off_action: actor % not found', p_actor_id; END IF;
  IF v_role != 'siro' THEN RAISE EXCEPTION 'siro_sign_off_action: SIRO only (role: %)', v_role; END IF;
  IF p_notes IS NULL OR trim(p_notes) = '' THEN RAISE EXCEPTION 'siro_sign_off_action: notes mandatory'; END IF;
  SELECT sa.title, sa.status, sa.requires_siro_signoff,
         (sa.siro_signoff_by IS NOT NULL), sap.cycle_id
    INTO v_action_title, v_action_status, v_requires_signoff, v_already_signed, v_cycle_id
    FROM security_actions sa JOIN security_action_plans sap ON sap.id = sa.plan_id WHERE sa.id = p_action_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'siro_sign_off_action: action % not found', p_action_id; END IF;
  IF NOT v_requires_signoff THEN RAISE EXCEPTION 'siro_sign_off_action: requires_siro_signoff is FALSE'; END IF;
  IF v_action_status != 'completed' THEN
    RAISE EXCEPTION 'siro_sign_off_action: action must be completed (current: %)', v_action_status; END IF;
  IF v_already_signed THEN RAISE EXCEPTION 'siro_sign_off_action: already signed off'; END IF;
  UPDATE security_actions SET siro_signoff_by = p_actor_id, siro_signoff_at = now(),
    siro_signoff_notes = p_notes, updated_at = now() WHERE id = p_action_id;
  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, entity_label, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'security_actions', p_action_id, v_action_title, 'siro_signoff_action',
    format('Action "%s" signed off by SIRO %s.', v_action_title, v_name));
END;
$$;


--
-- Name: sod_action_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_action_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.completed_by IS NOT NULL
     AND NEW.completed_by = NEW.created_by
     AND sod_enabled('action.complete') THEN
    RAISE EXCEPTION 'SoD[action.complete]: an action cannot be completed by the person who created it';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: sod_action_verify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_action_verify() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'verified'
     AND OLD.status IS DISTINCT FROM 'verified'
     AND NEW.verified_by IS NOT NULL
     AND NEW.verified_by = NEW.completed_by
     AND sod_enabled('action.verify') THEN
    RAISE EXCEPTION 'SoD[action.verify]: an action cannot be verified by the person who completed it';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: sod_enabled(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_enabled(p_key text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE((SELECT enabled FROM sod_rules WHERE key = p_key), FALSE);
$$;


--
-- Name: sod_exception_accept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_exception_accept() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_owner UUID;
BEGIN
  IF NEW.accepted_by IS NOT NULL AND sod_enabled('exception.accept') THEN
    SELECT assigned_to INTO v_owner FROM risks WHERE id = NEW.risk_id;
    IF v_owner IS NOT NULL AND v_owner = NEW.accepted_by THEN
      RAISE EXCEPTION 'SoD[exception.accept]: the risk owner cannot accept an exception on their own risk';
    END IF;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: sod_impact_table_publish(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_impact_table_publish() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.published_at IS NOT NULL
     AND OLD.published_at IS NULL
     AND NEW.published_by IS NOT NULL
     AND NEW.published_by = NEW.created_by
     AND sod_enabled('impact_table.publish') THEN
    RAISE EXCEPTION 'SoD[impact_table.publish]: an impact table cannot be published by its creator';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: sod_risk_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_risk_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.validation_status = 'validated'
     AND OLD.validation_status IS DISTINCT FROM 'validated'
     AND NEW.validated_by IS NOT NULL
     AND NEW.validated_by = NEW.identified_by
     AND sod_enabled('risk.validate') THEN
    RAISE EXCEPTION 'SoD[risk.validate]: a risk cannot be validated by the person who identified it';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: sod_role_grant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sod_role_grant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.granted_by IS NOT NULL
     AND NEW.granted_by = NEW.user_id
     AND sod_enabled('role.grant') THEN
    RAISE EXCEPTION 'SoD[role.grant]: a user cannot grant a role to themselves';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: trg_fn_cascade_from_asset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_cascade_from_asset() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  rec RECORD;
  v_rc SMALLINT; v_ri SMALLINT; v_ra SMALLINT; v_summary SMALLINT;
BEGIN
  IF NEW.confidentiality IS DISTINCT FROM OLD.confidentiality OR
     NEW.integrity       IS DISTINCT FROM OLD.integrity       OR
     NEW.availability    IS DISTINCT FROM OLD.availability
  THEN
    FOR rec IN
      SELECT r.id, r.probability_c, r.probability_i, r.probability_a
        FROM risks r
       WHERE r.asset_id          = NEW.id
         AND r.is_active         = TRUE
         AND r.validation_status = 'validated'
    LOOP
      v_rc := GREATEST(1, LEAST(25, NEW.confidentiality * rec.probability_c));
      v_ri := GREATEST(1, LEAST(25, NEW.integrity       * rec.probability_i));
      v_ra := GREATEST(1, LEAST(25, NEW.availability    * rec.probability_a));
      v_summary := derive_summary_score(v_rc, v_ri, v_ra);
      UPDATE risks SET
        risk_c     = v_rc,
        risk_i     = v_ri,
        risk_a     = v_ra,
        risk_score = v_summary,
        updated_at = now()
      WHERE id = rec.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_cascade_system_cia_to_risks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_cascade_system_cia_to_risks() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD.impact_c IS DISTINCT FROM NEW.impact_c
   OR OLD.impact_i IS DISTINCT FROM NEW.impact_i
   OR OLD.impact_a IS DISTINCT FROM NEW.impact_a) THEN
    UPDATE risks SET probability_c = probability_c WHERE system_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: trg_fn_check_data_object_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_check_data_object_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_type system_object_type;
BEGIN
  SELECT object_type INTO v_type FROM system_objects WHERE id = NEW.object_id;
  IF v_type NOT IN ('hardware', 'software') THEN
    RAISE EXCEPTION
      'asset_data_object_links: object_id % has type %, but only hardware or software objects may be linked.',
      NEW.object_id, v_type;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_check_system_object_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_check_system_object_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.role_code IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM component_roles
     WHERE category = NEW.object_type
       AND code     = NEW.role_code
       AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION
      'system_objects.role_code: % is not a valid active role for category %',
      NEW.role_code, NEW.object_type;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_compute_cia_scores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_compute_cia_scores() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_c SMALLINT; v_i SMALLINT; v_a SMALLINT;
  v_rc SMALLINT; v_ri SMALLINT; v_ra SMALLINT; v_summary SMALLINT;
BEGIN
  SELECT impact_c, impact_i, impact_a INTO v_c, v_i, v_a
    FROM systems WHERE id = NEW.system_id;

  v_c := COALESCE(NEW.residual_impact_c, v_c, 1);
  v_i := COALESCE(NEW.residual_impact_i, v_i, 1);
  v_a := COALESCE(NEW.residual_impact_a, v_a, 1);

  v_rc := GREATEST(1, LEAST(25, v_c * NEW.probability_c));
  v_ri := GREATEST(1, LEAST(25, v_i * NEW.probability_i));
  v_ra := GREATEST(1, LEAST(25, v_a * NEW.probability_a));
  v_summary := derive_summary_score(v_rc, v_ri, v_ra);

  NEW.risk_c     := v_rc;
  NEW.risk_i     := v_ri;
  NEW.risk_a     := v_ra;
  NEW.risk_score := v_summary;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_create_sap_on_cycle_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_create_sap_on_cycle_active() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'draft' THEN
    INSERT INTO security_action_plans (cycle_id, title, status, created_by)
    VALUES (
      NEW.id,
      'Security Action Plan — ' || NEW.name,
      'draft',
      NEW.created_by
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_sync_eol_from_catalogue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sync_eol_from_catalogue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.catalogue_id IS NOT NULL THEN
    IF (SELECT is_end_of_life FROM technology_catalogue WHERE id = NEW.catalogue_id) THEN
      NEW.is_end_of_life := TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_system_probability_signal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_system_probability_signal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  rec          RECORD;
  v_signal_id  UUID;
BEGIN
  IF NEW.probability_c IS DISTINCT FROM OLD.probability_c OR
     NEW.probability_i IS DISTINCT FROM OLD.probability_i OR
     NEW.probability_a IS DISTINCT FROM OLD.probability_a
  THEN
    FOR rec IN
      SELECT r.id AS risk_id, r.probability_c, r.probability_i, r.probability_a
        FROM risks r
       WHERE r.system_id         = NEW.id
         AND r.is_active         = TRUE
         AND r.validation_status = 'validated'
    LOOP
      -- Check for existing open signal that could be merged into
      SELECT id INTO v_signal_id
        FROM risk_probability_signals
       WHERE risk_id = rec.risk_id AND status = 'open' AND threat_id IS NOT NULL
       LIMIT 1;

      IF v_signal_id IS NOT NULL THEN
        -- Merge: add system columns to the existing threat signal
        UPDATE risk_probability_signals SET
          system_id                 = NEW.id,
          system_probability_c_before = OLD.probability_c,
          system_probability_i_before = OLD.probability_i,
          system_probability_a_before = OLD.probability_a,
          system_probability_c_after  = NEW.probability_c,
          system_probability_i_after  = NEW.probability_i,
          system_probability_a_after  = NEW.probability_a,
          updated_at                = now()
        WHERE id = v_signal_id;
      ELSE
        -- Insert new system-only signal
        INSERT INTO risk_probability_signals (
          risk_id, system_id,
          system_probability_c_before, system_probability_i_before, system_probability_a_before,
          system_probability_c_after,  system_probability_i_after,  system_probability_a_after,
          risk_probability_c_current, risk_probability_i_current, risk_probability_a_current
        ) VALUES (
          rec.risk_id, NEW.id,
          OLD.probability_c, OLD.probability_i, OLD.probability_a,
          NEW.probability_c, NEW.probability_i, NEW.probability_a,
          rec.probability_c, rec.probability_i, rec.probability_a
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_tech_cat_eol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_tech_cat_eol() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.is_end_of_life := (NEW.end_of_life_date IS NOT NULL AND NEW.end_of_life_date <= CURRENT_DATE);
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_threat_probability_signal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_threat_probability_signal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  rec          RECORD;
  v_signal_id  UUID;
BEGIN
  IF NEW.probability_c IS DISTINCT FROM OLD.probability_c OR
     NEW.probability_i IS DISTINCT FROM OLD.probability_i OR
     NEW.probability_a IS DISTINCT FROM OLD.probability_a
  THEN
    FOR rec IN
      SELECT r.id AS risk_id, r.probability_c, r.probability_i, r.probability_a
        FROM risks r
       WHERE r.threat_id         = NEW.id
         AND r.is_active         = TRUE
         AND r.validation_status = 'validated'
    LOOP
      -- Check for an existing open signal that could be merged into
      SELECT id INTO v_signal_id
        FROM risk_probability_signals
       WHERE risk_id = rec.risk_id AND status = 'open' AND system_id IS NOT NULL
       LIMIT 1;

      IF v_signal_id IS NOT NULL THEN
        -- Merge: add threat columns to the existing system signal
        UPDATE risk_probability_signals SET
          threat_id                 = NEW.id,
          threat_probability_c_before = OLD.probability_c,
          threat_probability_i_before = OLD.probability_i,
          threat_probability_a_before = OLD.probability_a,
          threat_probability_c_after  = NEW.probability_c,
          threat_probability_i_after  = NEW.probability_i,
          threat_probability_a_after  = NEW.probability_a,
          updated_at                = now()
        WHERE id = v_signal_id;
      ELSE
        -- Insert new threat-only signal
        INSERT INTO risk_probability_signals (
          risk_id, threat_id,
          threat_probability_c_before, threat_probability_i_before, threat_probability_a_before,
          threat_probability_c_after,  threat_probability_i_after,  threat_probability_a_after,
          risk_probability_c_current, risk_probability_i_current, risk_probability_a_current
        ) VALUES (
          rec.risk_id, NEW.id,
          OLD.probability_c, OLD.probability_i, OLD.probability_a,
          NEW.probability_c, NEW.probability_i, NEW.probability_a,
          rec.probability_c, rec.probability_i, rec.probability_a
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_info_asset_cia_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_info_asset_cia_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_sys UUID;
BEGIN
  IF NEW.confidentiality IS DISTINCT FROM OLD.confidentiality
     OR NEW.integrity    IS DISTINCT FROM OLD.integrity
     OR NEW.availability IS DISTINCT FROM OLD.availability THEN
    FOR v_sys IN SELECT system_id FROM system_assets WHERE asset_id = NEW.id LOOP
      PERFORM recompute_system_impact(v_sys);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_info_asset_cia_change_svc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_info_asset_cia_change_svc() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_svc UUID;
BEGIN
  IF NEW.confidentiality IS DISTINCT FROM OLD.confidentiality
     OR NEW.integrity     IS DISTINCT FROM OLD.integrity
     OR NEW.availability  IS DISTINCT FROM OLD.availability
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active THEN
    FOR v_svc IN SELECT service_id FROM business_service_assets WHERE asset_id = NEW.id LOOP
      PERFORM recompute_service_impact(v_svc);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_svc_info_asset_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_svc_info_asset_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_service_impact(OLD.service_id);
    RETURN OLD;
  ELSE
    PERFORM recompute_service_impact(NEW.service_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: trg_system_assets_impact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_system_assets_impact() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_system_impact(OLD.system_id);
    RETURN OLD;
  ELSE
    PERFORM recompute_system_impact(NEW.system_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: validate_risk(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_risk(p_risk_id uuid, p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_role       user_role;
  v_name       VARCHAR;
  v_asset      VARCHAR;
  v_threat     VARCHAR;
  v_cur_status risk_validation_status;
BEGIN
  SELECT role, full_name INTO v_role, v_name
    FROM users WHERE id = p_actor_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'validate_risk: actor % not found', p_actor_id;
  END IF;

  SELECT r.validation_status, COALESCE(ia.name, '(no asset)'), t.name
    INTO v_cur_status, v_asset, v_threat
    FROM risks r
    LEFT JOIN information_assets ia ON ia.id = r.asset_id
    JOIN threats t ON t.id = r.threat_id
   WHERE r.id = p_risk_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'validate_risk: risk % not found', p_risk_id;
  END IF;
  IF v_cur_status = 'validated' THEN
    RAISE EXCEPTION 'validate_risk: already validated';
  END IF;

  UPDATE risks
     SET validation_status = 'validated', validated_by = p_actor_id,
         validated_at = now(), updated_at = now()
   WHERE id = p_risk_id;

  INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
  VALUES (p_actor_id, v_role, v_name, 'risks', p_risk_id, 'validate_risk',
    format('Risk validated by %s (%s). Asset: %s, Threat: %s.', v_name, v_role, v_asset, v_threat));
END;
$$;


--
-- Name: FUNCTION validate_risk(p_risk_id uuid, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_risk(p_risk_id uuid, p_actor_id uuid) IS 'CISO only. Validates a pending or returned risk. Requires a system_assets row for (system_id, asset_id) — the asset must be structurally declared as present in the system. Logs to audit_log with human_narrative.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    role text DEFAULT 'soc_analyst'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: api_request_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_request_log (
    id bigint NOT NULL,
    user_id uuid,
    role text,
    method character varying(10) NOT NULL,
    endpoint text NOT NULL,
    status_code smallint NOT NULL,
    duration_ms integer,
    ip_address inet,
    user_agent text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE api_request_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_request_log IS 'API-layer request log. Layer 2 of the three-layer audit strategy. Append-only. Captures all API traffic including read-only calls that do not generate audit_log entries.';


--
-- Name: api_request_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_request_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_request_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_request_log_id_seq OWNED BY public.api_request_log.id;


--
-- Name: asset_data_object_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_data_object_links (
    asset_id uuid NOT NULL,
    object_id uuid NOT NULL,
    relationship_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_impact_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_impact_ratings (
    asset_id uuid NOT NULL,
    impact_table_id integer NOT NULL,
    rated_level smallint,
    c_level smallint,
    i_level smallint,
    a_level smallint,
    c_dropped boolean DEFAULT false NOT NULL,
    i_dropped boolean DEFAULT false NOT NULL,
    a_dropped boolean DEFAULT false NOT NULL,
    rated_by uuid,
    rated_at timestamp with time zone,
    CONSTRAINT asset_impact_ratings_a_level_check CHECK (((a_level >= 1) AND (a_level <= 5))),
    CONSTRAINT asset_impact_ratings_c_level_check CHECK (((c_level >= 1) AND (c_level <= 5))),
    CONSTRAINT asset_impact_ratings_i_level_check CHECK (((i_level >= 1) AND (i_level <= 5))),
    CONSTRAINT asset_impact_ratings_rated_level_check CHECK (((rated_level >= 1) AND (rated_level <= 5)))
);


--
-- Name: asset_register_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_register_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    status public.asset_register_status DEFAULT 'draft'::public.asset_register_status NOT NULL,
    accepted_by uuid,
    accepted_at timestamp with time zone,
    snapshot_path text,
    snapshot_generated_at timestamp with time zone,
    ciso_reviewed_by uuid,
    ciso_reviewed_at timestamp with time zone,
    ciso_notes text,
    based_on_version_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_role public.user_role,
    user_name character varying(255),
    effective_role public.user_role,
    acting_as_note text,
    entity_type character varying(100) NOT NULL,
    entity_id uuid,
    entity_label character varying(255),
    action public.audit_action NOT NULL,
    field_name character varying(100),
    old_value text,
    new_value text,
    changes jsonb,
    proposal_id uuid,
    ai_session_id character varying(255),
    human_narrative text NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bil_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bil_categories (
    id integer NOT NULL,
    name text NOT NULL,
    org_type public.org_type DEFAULT 'government'::public.org_type NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: bil_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bil_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bil_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bil_categories_id_seq OWNED BY public.bil_categories.id;


--
-- Name: bil_reference_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bil_reference_levels (
    id integer NOT NULL,
    subcategory_id integer NOT NULL,
    level smallint NOT NULL,
    description text NOT NULL,
    CONSTRAINT bil_reference_levels_level_check CHECK (((level >= 1) AND (level <= 5)))
);


--
-- Name: bil_reference_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bil_reference_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bil_reference_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bil_reference_levels_id_seq OWNED BY public.bil_reference_levels.id;


--
-- Name: bil_subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bil_subcategories (
    id integer NOT NULL,
    category_id integer NOT NULL,
    name text NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: bil_subcategories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bil_subcategories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bil_subcategories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bil_subcategories_id_seq OWNED BY public.bil_subcategories.id;


--
-- Name: business_service_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_service_assets (
    service_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    relationship_notes text,
    identified_by_ai boolean DEFAULT false NOT NULL,
    ai_session_id character varying(255),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_service_impact_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_service_impact_tables (
    service_id uuid NOT NULL,
    impact_table_id integer NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid
);


--
-- Name: business_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid NOT NULL,
    confidentiality smallint,
    integrity smallint,
    availability smallint,
    rating_rationale text,
    ai_session_id character varying(255),
    rated_by uuid,
    rated_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    owner_department_id uuid,
    managed_by_user_id uuid,
    CONSTRAINT business_services_availability_check CHECK (((availability >= 1) AND (availability <= 5))),
    CONSTRAINT business_services_confidentiality_check CHECK (((confidentiality >= 1) AND (confidentiality <= 5))),
    CONSTRAINT business_services_integrity_check CHECK (((integrity >= 1) AND (integrity <= 5)))
);


--
-- Name: capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capabilities (
    key text NOT NULL,
    resource text NOT NULL,
    action text NOT NULL,
    dept_scopable boolean DEFAULT true NOT NULL,
    description text NOT NULL
);


--
-- Name: component_ip_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_ip_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    ip_address inet NOT NULL,
    label character varying(100),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: component_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_roles (
    category public.system_object_type NOT NULL,
    code character varying(64) NOT NULL,
    label character varying(255) NOT NULL,
    description text,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE component_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.component_roles IS 'Controlled vocabulary for the role a system_object plays within its parent system. Roles are category-specific (e.g. people roles differ from technology roles). Add new roles by inserting a row; no schema change required.';


--
-- Name: control_component_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_component_links (
    control_id uuid NOT NULL,
    component_id uuid NOT NULL,
    role character varying(200),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN control_component_links.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.control_component_links.role IS 'How this component contributes to this specific control. Lets one component serve multiple distinct roles across different controls (e.g. a firewall as boundary control AND segmentation control).';


--
-- Name: control_component_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_component_relationships (
    source_component_id uuid NOT NULL,
    target_component_id uuid NOT NULL,
    relationship_type character varying(50) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_component_relationships_check CHECK ((source_component_id <> target_component_id))
);


--
-- Name: TABLE control_component_relationships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.control_component_relationships IS 'Component-to-component edges. Typical relationship_type values: "operated_by" (Technology operated by People), "depends_on" (Process depends on Information), "documented_by" (Technology documented by Information). Free-form to allow new edge types without schema change.';


--
-- Name: control_component_systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_component_systems (
    component_id uuid NOT NULL,
    system_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE control_component_systems; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.control_component_systems IS 'Maps Technology/Facility components to the systems they run on or are realised by. A component may span many systems; a system may host many components.';


--
-- Name: control_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_type public.component_type NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    status public.component_status DEFAULT 'unknown'::public.component_status NOT NULL,
    last_verified_at timestamp with time zone,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_department_id uuid,
    is_host boolean DEFAULT false NOT NULL,
    hostname character varying(255),
    CONSTRAINT chk_host_is_technology CHECK (((is_host = false) OR (component_type = 'technology'::public.component_type)))
);


--
-- Name: TABLE control_components; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.control_components IS 'PPITF components that implement controls. People-type rows represent organisational groups (e.g. "SOC Team"), not riskapp users.';


--
-- Name: COLUMN control_components.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.control_components.status IS 'Operational state of this component. Separate from control effectiveness: a component can be degraded (e.g. expired licence, vacancy in team) before the control rating is reassessed.';


--
-- Name: COLUMN control_components.last_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.control_components.last_verified_at IS 'When this component was last confirmed operational. Drives staleness reporting (e.g. "components not verified in 6 months").';


--
-- Name: control_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    control_id uuid NOT NULL,
    standard_control_id uuid NOT NULL,
    coverage character varying(10) DEFAULT 'full'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT control_mappings_coverage_check CHECK (((coverage)::text = ANY ((ARRAY['full'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: control_set_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_set_controls (
    control_set_id uuid NOT NULL,
    control_id uuid NOT NULL,
    local_override_name character varying(500),
    local_override_description text,
    is_mandatory boolean DEFAULT false NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE control_set_controls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.control_set_controls IS 'Membership of a control in a control_set, with optional local overrides for org-specific tailoring. Forking the catalogue entry (controls.parent_control_id) is the alternative when the override is substantive.';


--
-- Name: control_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    version character varying(64) DEFAULT 'v1'::character varying NOT NULL,
    status public.control_set_status DEFAULT 'draft'::public.control_set_status NOT NULL,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE control_sets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.control_sets IS 'A named, versioned bundle of controls in scope for the organisation. Lifecycle: draft -> active -> archived/superseded. Exactly one set is active at any time. Activation is governed by activate_control_set().';


--
-- Name: control_technology_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_technology_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    control_id uuid NOT NULL,
    system_object_id uuid NOT NULL,
    deployment_coverage smallint,
    coverage_notes text,
    linked_by uuid,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_technology_objects_deployment_coverage_check CHECK (((deployment_coverage >= 0) AND (deployment_coverage <= 100)))
);


--
-- Name: control_threats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_threats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    control_id uuid NOT NULL,
    threat_id uuid NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    control_type public.control_type DEFAULT 'preventive'::public.control_type NOT NULL,
    effectiveness smallint,
    effectiveness_notes text,
    status public.control_status DEFAULT 'under_review'::public.control_status NOT NULL,
    is_baseline boolean DEFAULT false NOT NULL,
    rated_by uuid,
    rated_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin_standard_id uuid,
    parent_control_id uuid,
    reference_code character varying(100),
    max_maturity smallint,
    max_maturity_reason text,
    owner_user_id uuid,
    CONSTRAINT chk_controls_max_maturity CHECK (((max_maturity IS NULL) OR ((max_maturity >= 1) AND (max_maturity <= 5)))),
    CONSTRAINT chk_effectiveness_notes CHECK (((effectiveness IS NULL) OR ((effectiveness_notes IS NOT NULL) AND (effectiveness_notes <> ''::text)))),
    CONSTRAINT controls_effectiveness_check CHECK (((effectiveness >= 1) AND (effectiveness <= 5)))
);


--
-- Name: COLUMN controls.origin_standard_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.origin_standard_id IS 'The standard this control was derived from. NULL = custom. Replaces the role of the framework enum for new rows; back-fill existing rows by matching standards.code = controls.framework::text.';


--
-- Name: COLUMN controls.parent_control_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.parent_control_id IS 'If this control is a fork of a catalogue entry (custom-edited), points to the original. NULL means this row is the canonical catalogue entry.';


--
-- Name: COLUMN controls.reference_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.reference_code IS 'Standard-specific reference (e.g. A.5.1 for ISO27001). May duplicate framework_ref on legacy rows; preferred field going forward.';


--
-- Name: COLUMN controls.max_maturity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.max_maturity IS 'Ceiling (1-5) on system_controls.maturity for this control; NULL = no ceiling. Enforced at the maturity-rating endpoints.';


--
-- Name: COLUMN controls.max_maturity_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.max_maturity_reason IS 'Why the control cannot be rated above max_maturity (set by the responsible owner).';


--
-- Name: COLUMN controls.owner_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.controls.owner_user_id IS 'User responsible for this control; may set its maturity ceiling without full controls.write.';


--
-- Name: data_object_attrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_object_attrs (
    object_id uuid NOT NULL,
    data_classification character varying(100),
    data_format character varying(100),
    estimated_volume character varying(100),
    retention_period character varying(100),
    contains_pii boolean DEFAULT false NOT NULL,
    contains_phi boolean DEFAULT false NOT NULL,
    encrypted_at_rest boolean DEFAULT false NOT NULL,
    encrypted_in_transit boolean DEFAULT false NOT NULL,
    regulatory_scope text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_impact_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_impact_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    department_id uuid NOT NULL,
    status public.impact_table_status DEFAULT 'draft'::public.impact_table_status NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    submitted_by uuid,
    submitted_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    revision_requested_by uuid,
    revision_requested_at timestamp with time zone,
    revision_notes text,
    levelled_by uuid,
    levelled_at timestamp with time zone,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_service_adoptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_service_adoptions (
    department_id uuid NOT NULL,
    service_id uuid NOT NULL,
    adopted_at timestamp with time zone DEFAULT now() NOT NULL,
    adopted_by uuid
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: facility_object_attrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_object_attrs (
    object_id uuid NOT NULL,
    facility_type character varying(100),
    location character varying(255),
    is_owned boolean DEFAULT true NOT NULL,
    has_physical_access_control boolean DEFAULT false NOT NULL,
    has_cctv boolean DEFAULT false NOT NULL,
    has_fire_suppression boolean DEFAULT false NOT NULL,
    has_ups boolean DEFAULT false NOT NULL,
    tier_rating character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: help_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_content (
    help_key text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    title text,
    body text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: help_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_keys (
    help_key text NOT NULL,
    placement text DEFAULT 'top'::text NOT NULL,
    page_hint text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT help_keys_placement_check CHECK ((placement = ANY (ARRAY['top'::text, 'bottom'::text, 'left'::text, 'right'::text, 'auto'::text])))
);


--
-- Name: impact_calibration_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_calibration_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.calibration_cycle_status DEFAULT 'draft'::public.calibration_cycle_status NOT NULL,
    created_by uuid,
    locked_by uuid,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: impact_level_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_level_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    cia_dimension public.cia_dimension NOT NULL,
    level smallint NOT NULL,
    scenario_description text DEFAULT 'No scenario defined.'::text NOT NULL,
    original_level smallint,
    levelling_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impact_level_definitions_level_check CHECK (((level >= 1) AND (level <= 5)))
);


--
-- Name: impact_reconciliation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_reconciliation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    old_table_version_id uuid,
    new_table_version_id uuid,
    old_score numeric(5,2) NOT NULL,
    new_score numeric(5,2) NOT NULL,
    resolution public.reconciliation_resolution,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: impact_table_bil_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_table_bil_levels (
    impact_table_id integer NOT NULL,
    level smallint NOT NULL,
    statement text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impact_table_bil_levels_level_check CHECK (((level >= 1) AND (level <= 5)))
);


--
-- Name: impact_table_cia_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_table_cia_levels (
    impact_table_id integer NOT NULL,
    level smallint NOT NULL,
    dimension character(1) NOT NULL,
    statement text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impact_table_cia_levels_dimension_check CHECK ((dimension = ANY (ARRAY['c'::bpchar, 'i'::bpchar, 'a'::bpchar]))),
    CONSTRAINT impact_table_cia_levels_level_check CHECK (((level >= 1) AND (level <= 5)))
);


--
-- Name: impact_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_tables (
    id integer NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    department_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    mandatory boolean DEFAULT false NOT NULL,
    published_by uuid,
    description text,
    CONSTRAINT impact_tables_scope_check CHECK ((scope = ANY (ARRAY['organisation'::text, 'department'::text]))),
    CONSTRAINT mandatory_only_org CHECK (((NOT mandatory) OR (scope = 'organisation'::text))),
    CONSTRAINT mandatory_requires_publish CHECK (((NOT mandatory) OR (published_at IS NOT NULL))),
    CONSTRAINT scope_dept_check CHECK ((((scope = 'organisation'::text) AND (department_id IS NULL)) OR ((scope = 'department'::text) AND (department_id IS NOT NULL))))
);


--
-- Name: impact_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.impact_tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: impact_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.impact_tables_id_seq OWNED BY public.impact_tables.id;


--
-- Name: information_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.information_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid NOT NULL,
    confidentiality smallint DEFAULT 3 NOT NULL,
    integrity smallint DEFAULT 3 NOT NULL,
    availability smallint DEFAULT 3 NOT NULL,
    rating_method public.rating_method DEFAULT 'manual'::public.rating_method NOT NULL,
    ai_session_id character varying(255),
    ciso_levelled_at timestamp with time zone,
    ciso_levelled_by uuid,
    rated_by uuid,
    rated_at timestamp with time zone,
    rating_notes text,
    owner_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    managed_by_user_id uuid,
    impact_changed_in_cycle boolean DEFAULT false NOT NULL,
    CONSTRAINT information_assets_availability_check CHECK (((availability >= 1) AND (availability <= 5))),
    CONSTRAINT information_assets_confidentiality_check CHECK (((confidentiality >= 1) AND (confidentiality <= 5))),
    CONSTRAINT information_assets_integrity_check CHECK (((integrity >= 1) AND (integrity <= 5)))
);


--
-- Name: COLUMN information_assets.owner_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.information_assets.owner_user_id IS 'Information Asset Owner (IAO): accountable owner — the department head.';


--
-- Name: COLUMN information_assets.managed_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.information_assets.managed_by_user_id IS 'Information Asset Manager (IAM): day-to-day custodian acting for the IAO.';


--
-- Name: location_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_objects (
    location_id uuid NOT NULL,
    object_id uuid NOT NULL,
    placement_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    location_type character varying(100),
    address text,
    department_id uuid,
    parent_id uuid,
    owner_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_agenda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_agenda_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    source public.meeting_item_source DEFAULT 'auto'::public.meeting_item_source NOT NULL,
    category text NOT NULL,
    entity_type text,
    entity_id uuid,
    title text,
    notes text,
    suggested_timebox_min smallint,
    order_index integer DEFAULT 0 NOT NULL,
    raised_by uuid,
    discussed_at timestamp with time zone,
    discussed_by uuid,
    decision_text text,
    decision_recorded_at timestamp with time zone,
    decision_recorded_by uuid,
    secretary_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    attached_to_agenda_item_id uuid,
    file_path text NOT NULL,
    label text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    scan_status public.attachment_scan_status DEFAULT 'skipped'::public.attachment_scan_status NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_attendees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_attendees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    user_id uuid,
    named_name text,
    role_at_meeting text DEFAULT 'member'::text NOT NULL,
    presenting_agenda_item_id uuid,
    present boolean DEFAULT false NOT NULL,
    last_viewed_pack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_attendee_identity CHECK ((((user_id IS NOT NULL) AND (named_name IS NULL)) OR ((user_id IS NULL) AND (named_name IS NOT NULL))))
);


--
-- Name: object_access_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_access_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    people_object_id uuid NOT NULL,
    target_system_id uuid,
    target_object_id uuid,
    access_type public.access_type DEFAULT 'read'::public.access_type NOT NULL,
    access_notes text,
    granted_at date,
    expires_at date,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_target_exclusive CHECK (((((target_system_id IS NOT NULL))::integer + ((target_object_id IS NOT NULL))::integer) = 1))
);


--
-- Name: onboarding_handover; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_handover (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    completed_by uuid NOT NULL,
    handover_date date NOT NULL,
    system_summary text NOT NULL,
    threats_reviewed boolean DEFAULT false NOT NULL,
    threats_reviewed_at timestamp with time zone,
    threats_review_notes text,
    controls_reviewed boolean DEFAULT false NOT NULL,
    controls_reviewed_at timestamp with time zone,
    controls_review_notes text,
    impact_tables_reviewed boolean DEFAULT false NOT NULL,
    impact_tables_reviewed_at timestamp with time zone,
    impact_tables_review_notes text,
    assets_reviewed boolean DEFAULT false NOT NULL,
    assets_reviewed_at timestamp with time zone,
    assets_review_notes text,
    risks_reviewed boolean DEFAULT false NOT NULL,
    risks_reviewed_at timestamp with time zone,
    risks_review_notes text,
    ciso_accepted boolean DEFAULT false NOT NULL,
    ciso_accepted_by uuid,
    ciso_accepted_at timestamp with time zone,
    ciso_acceptance_notes text,
    siro_accepted boolean DEFAULT false NOT NULL,
    siro_accepted_by uuid,
    siro_accepted_at timestamp with time zone,
    siro_acceptance_notes text,
    known_gaps text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_assets_notes_when_reviewed CHECK (((assets_reviewed = false) OR ((assets_review_notes IS NOT NULL) AND (assets_review_notes <> ''::text)))),
    CONSTRAINT chk_ciso_notes_when_accepted CHECK (((ciso_accepted = false) OR ((ciso_acceptance_notes IS NOT NULL) AND (ciso_acceptance_notes <> ''::text)))),
    CONSTRAINT chk_controls_notes_when_reviewed CHECK (((controls_reviewed = false) OR ((controls_review_notes IS NOT NULL) AND (controls_review_notes <> ''::text)))),
    CONSTRAINT chk_impact_tables_notes_when_reviewed CHECK (((impact_tables_reviewed = false) OR ((impact_tables_review_notes IS NOT NULL) AND (impact_tables_review_notes <> ''::text)))),
    CONSTRAINT chk_risks_notes_when_reviewed CHECK (((risks_reviewed = false) OR ((risks_review_notes IS NOT NULL) AND (risks_review_notes <> ''::text)))),
    CONSTRAINT chk_siro_notes_when_accepted CHECK (((siro_accepted = false) OR ((siro_acceptance_notes IS NOT NULL) AND (siro_acceptance_notes <> ''::text)))),
    CONSTRAINT chk_siro_requires_ciso CHECK (((siro_accepted = false) OR (ciso_accepted = true))),
    CONSTRAINT chk_threats_notes_when_reviewed CHECK (((threats_reviewed = false) OR ((threats_review_notes IS NOT NULL) AND (threats_review_notes <> ''::text))))
);


--
-- Name: org_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_config (
    id boolean DEFAULT true NOT NULL,
    org_name character varying(255) DEFAULT 'My Organisation'::character varying NOT NULL,
    unified_probability boolean DEFAULT true NOT NULL,
    impact_method public.impact_derivation_method DEFAULT 'max'::public.impact_derivation_method NOT NULL,
    weight_confidentiality numeric(4,3) DEFAULT 0.333 NOT NULL,
    weight_integrity numeric(4,3) DEFAULT 0.333 NOT NULL,
    weight_availability numeric(4,3) DEFAULT 0.334 NOT NULL,
    threshold_medium smallint DEFAULT 5 NOT NULL,
    threshold_high smallint DEFAULT 11 NOT NULL,
    threshold_critical smallint DEFAULT 19 NOT NULL,
    meeting_target_interval_days smallint DEFAULT 90 NOT NULL,
    meeting_max_interval_days smallint DEFAULT 120 NOT NULL,
    setup_phase_active boolean DEFAULT true NOT NULL,
    setup_completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_type public.org_type DEFAULT 'government'::public.org_type NOT NULL,
    max_exception_age_days integer DEFAULT 365 NOT NULL,
    department_isolation boolean DEFAULT false NOT NULL,
    threshold_catastrophic smallint DEFAULT 24 NOT NULL,
    mandatory_action_score smallint DEFAULT 12 NOT NULL,
    exception_accept_analyst_max smallint DEFAULT 11 NOT NULL,
    exception_accept_owner_max smallint DEFAULT 19 NOT NULL,
    CONSTRAINT chk_meeting_cadence CHECK ((meeting_target_interval_days < meeting_max_interval_days)),
    CONSTRAINT org_config_exception_accept_analyst_max_check CHECK (((exception_accept_analyst_max >= 1) AND (exception_accept_analyst_max <= 25))),
    CONSTRAINT org_config_exception_accept_owner_max_check CHECK (((exception_accept_owner_max >= 1) AND (exception_accept_owner_max <= 25))),
    CONSTRAINT org_config_mandatory_action_score_check CHECK (((mandatory_action_score >= 1) AND (mandatory_action_score <= 25))),
    CONSTRAINT org_config_max_exception_age_days_check CHECK ((max_exception_age_days > 0)),
    CONSTRAINT org_config_threshold_catastrophic_check CHECK (((threshold_catastrophic >= 1) AND (threshold_catastrophic <= 24))),
    CONSTRAINT org_config_threshold_critical_check CHECK (((threshold_critical >= 1) AND (threshold_critical <= 25))),
    CONSTRAINT org_config_threshold_high_check CHECK (((threshold_high >= 1) AND (threshold_high <= 24))),
    CONSTRAINT org_config_threshold_medium_check CHECK (((threshold_medium >= 1) AND (threshold_medium <= 24))),
    CONSTRAINT org_config_weight_availability_check CHECK (((weight_availability >= (0)::numeric) AND (weight_availability <= (1)::numeric))),
    CONSTRAINT org_config_weight_confidentiality_check CHECK (((weight_confidentiality >= (0)::numeric) AND (weight_confidentiality <= (1)::numeric))),
    CONSTRAINT org_config_weight_integrity_check CHECK (((weight_integrity >= (0)::numeric) AND (weight_integrity <= (1)::numeric))),
    CONSTRAINT singleton CHECK ((id = true))
);


--
-- Name: COLUMN org_config.max_exception_age_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_config.max_exception_age_days IS 'Maximum number of days an active exception may exist before it is considered escalated to SIRO review. Default 365 (one year). Reported in exception stats as siro_escalated_count.';


--
-- Name: people_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    group_type public.people_group_type DEFAULT 'external'::public.people_group_type NOT NULL,
    contract_reference character varying(255),
    contract_start date,
    contract_end date,
    service_description text,
    last_audit_date date,
    last_audit_outcome character varying(100),
    next_audit_due date,
    risk_notes text,
    primary_contact_name character varying(255),
    primary_contact_email character varying(255),
    relationship_owner uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: people_object_attrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people_object_attrs (
    object_id uuid NOT NULL,
    people_type character varying(100),
    headcount_approx integer,
    has_security_clearance boolean DEFAULT false NOT NULL,
    clearance_level character varying(100),
    has_nda boolean DEFAULT false NOT NULL,
    privileged_access boolean DEFAULT false NOT NULL,
    remote_access_allowed boolean DEFAULT false NOT NULL,
    people_group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: process_object_attrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_object_attrs (
    object_id uuid NOT NULL,
    process_type character varying(100),
    is_safety_critical boolean DEFAULT false NOT NULL,
    is_regulatory_mandated boolean DEFAULT false NOT NULL,
    has_documented_procedure boolean DEFAULT false NOT NULL,
    frequency character varying(100),
    recovery_time_objective character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: process_service_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_service_links (
    process_id uuid NOT NULL,
    service_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: process_system_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_system_links (
    process_id uuid NOT NULL,
    system_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid NOT NULL,
    owner_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposed_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposed_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    field_name character varying(100) NOT NULL,
    current_value text NOT NULL,
    proposed_value text NOT NULL,
    value_type character varying(30) DEFAULT 'smallint'::character varying NOT NULL,
    justification text,
    status public.proposal_status DEFAULT 'draft'::public.proposal_status NOT NULL,
    proposed_by uuid NOT NULL,
    proposed_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_at timestamp with time zone,
    change_summary text NOT NULL,
    change_type public.proposed_change_type DEFAULT 'impact_level'::public.proposed_change_type NOT NULL,
    control_id uuid,
    rejection_notes text,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    CONSTRAINT justification_required_on_submit CHECK (((status = 'draft'::public.proposal_status) OR ((justification IS NOT NULL) AND (length(TRIM(BOTH FROM justification)) >= 20))))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    family_id uuid NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by uuid,
    user_agent text,
    ip_address inet
);


--
-- Name: review_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.cycle_status DEFAULT 'draft'::public.cycle_status NOT NULL,
    start_date date NOT NULL,
    end_date date,
    frozen_at timestamp with time zone,
    frozen_by uuid,
    snapshot_path text,
    snapshot_generated_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    analyst_ready boolean DEFAULT false NOT NULL,
    analyst_ready_at timestamp with time zone,
    analyst_ready_by uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: risk_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_components (
    risk_id uuid NOT NULL,
    component_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: risk_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    risk_id uuid NOT NULL,
    justification text NOT NULL,
    accepted_by uuid NOT NULL,
    accepted_role public.user_role NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at date NOT NULL,
    review_cadence public.exception_cadence NOT NULL,
    status public.exception_status DEFAULT 'active'::public.exception_status NOT NULL,
    last_reviewed_cycle_id uuid,
    escalated_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_expiry_future CHECK ((expires_at >= (accepted_at)::date)),
    CONSTRAINT chk_revoked_consistency CHECK (((status = 'revoked'::public.exception_status) = (revoked_at IS NOT NULL)))
);


--
-- Name: TABLE risk_exceptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.risk_exceptions IS 'Time-bounded record of an accept decision. Reviewed on the chosen cadence; auto-escalates to the CISO if not renewed or revoked by expires_at.';


--
-- Name: risk_probability_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_probability_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    risk_id uuid NOT NULL,
    threat_id uuid,
    system_id uuid,
    threat_probability_c_before smallint,
    threat_probability_i_before smallint,
    threat_probability_a_before smallint,
    threat_probability_c_after smallint,
    threat_probability_i_after smallint,
    threat_probability_a_after smallint,
    system_probability_c_before smallint,
    system_probability_i_before smallint,
    system_probability_a_before smallint,
    system_probability_c_after smallint,
    system_probability_i_after smallint,
    system_probability_a_after smallint,
    risk_probability_c_current smallint NOT NULL,
    risk_probability_i_current smallint NOT NULL,
    risk_probability_a_current smallint NOT NULL,
    status public.signal_status DEFAULT 'open'::public.signal_status NOT NULL,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_at_least_one_source CHECK (((threat_id IS NOT NULL) OR (system_id IS NOT NULL))),
    CONSTRAINT chk_resolution_notes CHECK (((status = ANY (ARRAY['open'::public.signal_status, 'acknowledged'::public.signal_status])) OR ((resolution_notes IS NOT NULL) AND (TRIM(BOTH FROM resolution_notes) <> ''::text)))),
    CONSTRAINT risk_probability_signals_risk_probability_a_current_check CHECK (((risk_probability_a_current >= 1) AND (risk_probability_a_current <= 5))),
    CONSTRAINT risk_probability_signals_risk_probability_c_current_check CHECK (((risk_probability_c_current >= 1) AND (risk_probability_c_current <= 5))),
    CONSTRAINT risk_probability_signals_risk_probability_i_current_check CHECK (((risk_probability_i_current >= 1) AND (risk_probability_i_current <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_a_after_check CHECK (((system_probability_a_after >= 1) AND (system_probability_a_after <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_a_before_check CHECK (((system_probability_a_before >= 1) AND (system_probability_a_before <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_c_after_check CHECK (((system_probability_c_after >= 1) AND (system_probability_c_after <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_c_before_check CHECK (((system_probability_c_before >= 1) AND (system_probability_c_before <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_i_after_check CHECK (((system_probability_i_after >= 1) AND (system_probability_i_after <= 5))),
    CONSTRAINT risk_probability_signals_system_probability_i_before_check CHECK (((system_probability_i_before >= 1) AND (system_probability_i_before <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_a_after_check CHECK (((threat_probability_a_after >= 1) AND (threat_probability_a_after <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_a_before_check CHECK (((threat_probability_a_before >= 1) AND (threat_probability_a_before <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_c_after_check CHECK (((threat_probability_c_after >= 1) AND (threat_probability_c_after <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_c_before_check CHECK (((threat_probability_c_before >= 1) AND (threat_probability_c_before <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_i_after_check CHECK (((threat_probability_i_after >= 1) AND (threat_probability_i_after <= 5))),
    CONSTRAINT risk_probability_signals_threat_probability_i_before_check CHECK (((threat_probability_i_before >= 1) AND (threat_probability_i_before <= 5)))
);


--
-- Name: risk_residual_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_residual_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    risk_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    source public.residual_change_source NOT NULL,
    source_action_id uuid,
    prev_probability_c smallint,
    prev_probability_i smallint,
    prev_probability_a smallint,
    prev_residual_imp_c smallint,
    prev_residual_imp_i smallint,
    prev_residual_imp_a smallint,
    new_probability_c smallint,
    new_probability_i smallint,
    new_probability_a smallint,
    new_residual_imp_c smallint,
    new_residual_imp_i smallint,
    new_residual_imp_a smallint,
    notes text
);


--
-- Name: TABLE risk_residual_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.risk_residual_history IS 'Append-only log of every change to a risk''s residual probability/impact. Each row identifies the source — a verified action, a direct analyst edit, or a corrective action — preserving full audit traceability.';


--
-- Name: risk_review_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_review_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    review_decision public.review_decision,
    notes text,
    draft_notes text,
    finalised_notes text,
    finalised_at timestamp with time zone,
    finalised_by uuid,
    swg_risk_decision public.swg_decision,
    swg_risk_decision_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_risk_rejection_notes CHECK (((swg_risk_decision IS DISTINCT FROM 'rejected'::public.swg_decision) OR ((swg_risk_decision_notes IS NOT NULL) AND (TRIM(BOTH FROM swg_risk_decision_notes) <> ''::text))))
);


--
-- Name: risk_treatments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_treatments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    risk_id uuid NOT NULL,
    treatment_type public.treatment_type NOT NULL,
    description text NOT NULL,
    addresses_c boolean DEFAULT true NOT NULL,
    addresses_i boolean DEFAULT true NOT NULL,
    addresses_a boolean DEFAULT true NOT NULL,
    status public.treatment_status DEFAULT 'planned'::public.treatment_status NOT NULL,
    owner_user_id uuid,
    target_date date,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    threat_id uuid NOT NULL,
    system_id uuid NOT NULL,
    probability_c smallint NOT NULL,
    probability_i smallint NOT NULL,
    probability_a smallint NOT NULL,
    risk_c smallint NOT NULL,
    risk_i smallint NOT NULL,
    risk_a smallint NOT NULL,
    risk_score smallint NOT NULL,
    rationale text NOT NULL,
    validation_status public.risk_validation_status DEFAULT 'pending'::public.risk_validation_status NOT NULL,
    validation_notes text,
    validated_by uuid,
    validated_at timestamp with time zone,
    impact_table_version_id uuid,
    impact_adjusted_notes text,
    impact_adjusted_by uuid,
    impact_adjusted_at timestamp with time zone,
    identified_by uuid,
    assigned_to uuid NOT NULL,
    review_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inherent_probability_c smallint,
    inherent_probability_i smallint,
    inherent_probability_a smallint,
    residual_impact_c smallint,
    residual_impact_i smallint,
    residual_impact_a smallint,
    inherent_impact_rationale text,
    inherent_probability_rationale text,
    residual_impact_rationale text,
    residual_probability_rationale text,
    treatment_decision public.risk_treatment,
    no_action_required boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_rationale_not_empty CHECK ((TRIM(BOTH FROM rationale) <> ''::text)),
    CONSTRAINT risks_inherent_probability_a_check CHECK (((inherent_probability_a >= 1) AND (inherent_probability_a <= 5))),
    CONSTRAINT risks_inherent_probability_c_check CHECK (((inherent_probability_c >= 1) AND (inherent_probability_c <= 5))),
    CONSTRAINT risks_inherent_probability_i_check CHECK (((inherent_probability_i >= 1) AND (inherent_probability_i <= 5))),
    CONSTRAINT risks_probability_a_check CHECK (((probability_a >= 1) AND (probability_a <= 5))),
    CONSTRAINT risks_probability_c_check CHECK (((probability_c >= 1) AND (probability_c <= 5))),
    CONSTRAINT risks_probability_i_check CHECK (((probability_i >= 1) AND (probability_i <= 5))),
    CONSTRAINT risks_residual_impact_a_check CHECK (((residual_impact_a >= 1) AND (residual_impact_a <= 5))),
    CONSTRAINT risks_residual_impact_c_check CHECK (((residual_impact_c >= 1) AND (residual_impact_c <= 5))),
    CONSTRAINT risks_residual_impact_i_check CHECK (((residual_impact_i >= 1) AND (residual_impact_i <= 5))),
    CONSTRAINT risks_risk_a_check CHECK (((risk_a >= 1) AND (risk_a <= 25))),
    CONSTRAINT risks_risk_c_check CHECK (((risk_c >= 1) AND (risk_c <= 25))),
    CONSTRAINT risks_risk_i_check CHECK (((risk_i >= 1) AND (risk_i <= 25))),
    CONSTRAINT risks_risk_score_check CHECK (((risk_score >= 1) AND (risk_score <= 25)))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role text NOT NULL,
    capability_key text NOT NULL,
    scope text DEFAULT 'all_depts'::text NOT NULL,
    CONSTRAINT role_permissions_scope_check CHECK ((scope = ANY (ARRAY['all_depts'::text, 'own_dept'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(50) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    description text
);


--
-- Name: security_action_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_action_components (
    action_id uuid NOT NULL,
    component_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE security_action_components; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.security_action_components IS 'Components that a security action targets (e.g. "harden this firewall"). Complements security_action_controls; an action may attach either or both.';


--
-- Name: security_action_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_action_controls (
    action_id uuid NOT NULL,
    control_id uuid NOT NULL,
    maturity_target smallint,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT security_action_controls_maturity_target_check CHECK (((maturity_target >= 1) AND (maturity_target <= 5)))
);


--
-- Name: security_action_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_action_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    summary text,
    status public.action_plan_status DEFAULT 'draft'::public.action_plan_status NOT NULL,
    frozen_at timestamp with time zone,
    frozen_by uuid,
    snapshot_path text,
    snapshot_generated_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_action_risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_action_risks (
    action_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    treatment_type public.treatment_type NOT NULL,
    primary_owner_user_id uuid NOT NULL,
    primary_owner_role_title character varying(255),
    status public.treatment_status DEFAULT 'planned'::public.treatment_status NOT NULL,
    swg_decision public.swg_decision,
    swg_decision_notes text,
    originated_cycle_id uuid,
    target_cycle_id uuid,
    target_date date,
    completed_at timestamp with time zone,
    progress_notes text,
    requires_siro_signoff boolean DEFAULT false NOT NULL,
    siro_signoff_by uuid,
    siro_signoff_at timestamp with time zone,
    siro_signoff_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_residual_p_c smallint,
    target_residual_p_i smallint,
    target_residual_p_a smallint,
    target_residual_imp_c smallint,
    target_residual_imp_i smallint,
    target_residual_imp_a smallint,
    target_locked_at timestamp with time zone,
    completed_by uuid,
    verified_at timestamp with time zone,
    verified_by uuid,
    verification_result public.verification_result,
    verification_notes text,
    CONSTRAINT chk_fail_requires_notes CHECK (((verification_result IS DISTINCT FROM 'fail'::public.verification_result) OR ((verification_notes IS NOT NULL) AND (TRIM(BOTH FROM verification_notes) <> ''::text)))),
    CONSTRAINT chk_rejection_notes CHECK (((swg_decision IS DISTINCT FROM 'rejected'::public.swg_decision) OR ((swg_decision_notes IS NOT NULL) AND (TRIM(BOTH FROM swg_decision_notes) <> ''::text)))),
    CONSTRAINT chk_siro_signoff_notes CHECK (((siro_signoff_by IS NULL) OR ((siro_signoff_notes IS NOT NULL) AND (TRIM(BOTH FROM siro_signoff_notes) <> ''::text)))),
    CONSTRAINT chk_verifier_not_owner CHECK (((verified_by IS NULL) OR (verified_by <> primary_owner_user_id))),
    CONSTRAINT security_actions_target_residual_imp_a_check CHECK (((target_residual_imp_a >= 1) AND (target_residual_imp_a <= 5))),
    CONSTRAINT security_actions_target_residual_imp_c_check CHECK (((target_residual_imp_c >= 1) AND (target_residual_imp_c <= 5))),
    CONSTRAINT security_actions_target_residual_imp_i_check CHECK (((target_residual_imp_i >= 1) AND (target_residual_imp_i <= 5))),
    CONSTRAINT security_actions_target_residual_p_a_check CHECK (((target_residual_p_a >= 1) AND (target_residual_p_a <= 5))),
    CONSTRAINT security_actions_target_residual_p_c_check CHECK (((target_residual_p_c >= 1) AND (target_residual_p_c <= 5))),
    CONSTRAINT security_actions_target_residual_p_i_check CHECK (((target_residual_p_i >= 1) AND (target_residual_p_i <= 5)))
);


--
-- Name: COLUMN security_actions.target_residual_p_c; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.security_actions.target_residual_p_c IS 'Promised residual probability (C) after this action verifies. Locked at SWG adoption.';


--
-- Name: COLUMN security_actions.target_locked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.security_actions.target_locked_at IS 'Timestamp when SWG adopted the action and locked target_residual_*. NULL while proposed.';


--
-- Name: service_impact_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_impact_ratings (
    id integer NOT NULL,
    service_id uuid NOT NULL,
    impact_table_id integer NOT NULL,
    rated_level smallint NOT NULL,
    rated_by uuid NOT NULL,
    rated_at timestamp with time zone DEFAULT now() NOT NULL,
    c_level smallint,
    i_level smallint,
    a_level smallint,
    c_dropped boolean DEFAULT false NOT NULL,
    i_dropped boolean DEFAULT false NOT NULL,
    a_dropped boolean DEFAULT false NOT NULL,
    CONSTRAINT service_impact_ratings_a_level_check CHECK (((a_level >= 1) AND (a_level <= 5))),
    CONSTRAINT service_impact_ratings_c_level_check CHECK (((c_level >= 1) AND (c_level <= 5))),
    CONSTRAINT service_impact_ratings_i_level_check CHECK (((i_level >= 1) AND (i_level <= 5))),
    CONSTRAINT service_impact_ratings_rated_level_check CHECK (((rated_level >= 1) AND (rated_level <= 5)))
);


--
-- Name: service_impact_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_impact_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_impact_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_impact_ratings_id_seq OWNED BY public.service_impact_ratings.id;


--
-- Name: soa_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soa_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    control_id uuid NOT NULL,
    applicable boolean DEFAULT true NOT NULL,
    drivers text[] DEFAULT '{}'::text[] NOT NULL,
    justification text,
    implementation_status character varying(20) DEFAULT 'not_implemented'::character varying NOT NULL,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT chk_soa_drivers CHECK ((drivers <@ ARRAY['risk'::text, 'legal'::text, 'regulatory'::text, 'contractual'::text, 'business'::text])),
    CONSTRAINT soa_entries_implementation_status_check CHECK (((implementation_status)::text = ANY ((ARRAY['not_implemented'::character varying, 'planned'::character varying, 'partial'::character varying, 'implemented'::character varying])::text[])))
);


--
-- Name: soa_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soa_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_no integer NOT NULL,
    snapshot jsonb NOT NULL,
    control_count integer NOT NULL,
    applicable_count integer NOT NULL,
    note text,
    approved_by uuid,
    approved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sod_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sod_rules (
    key text NOT NULL,
    description text NOT NULL,
    enabled boolean DEFAULT false NOT NULL
);


--
-- Name: standard_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standard_controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    standard_id uuid NOT NULL,
    ref_code character varying(40) NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    "grouping" character varying(120),
    implementation_group smallint,
    sort_index character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT standard_controls_implementation_group_check CHECK (((implementation_group IS NULL) OR ((implementation_group >= 1) AND (implementation_group <= 3))))
);


--
-- Name: standard_soa_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standard_soa_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    standard_control_id uuid NOT NULL,
    applicable boolean DEFAULT true NOT NULL,
    drivers text[] DEFAULT '{}'::text[] NOT NULL,
    justification text,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    implementation_status character varying(20) DEFAULT 'not_implemented'::character varying NOT NULL,
    CONSTRAINT chk_std_soa_drivers CHECK ((drivers <@ ARRAY['risk'::text, 'legal'::text, 'regulatory'::text, 'contractual'::text, 'business'::text])),
    CONSTRAINT standard_soa_entries_implementation_status_check CHECK (((implementation_status)::text = ANY ((ARRAY['not_implemented'::character varying, 'planned'::character varying, 'partial'::character varying, 'implemented'::character varying])::text[])))
);


--
-- Name: standards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    version character varying(64),
    publisher character varying(150),
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    license text,
    sort_index smallint DEFAULT 0 NOT NULL,
    bundled boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE standards; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.standards IS 'Catalogue of source standards (ISO27001, NIST CSF etc.). controls.origin_standard_id and threats.origin_standard_id reference this. The legacy controls.framework enum remains as a denormalised cache for existing rows — new rows should use origin_standard_id.';


--
-- Name: system_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_assets (
    system_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE system_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_assets IS 'Structural declaration that an information asset is present in a system. Business-level fact set by IAM or risk_analyst. Independent of risks and asset_data_object_links. A system_assets row is required before a risk against this (system_id, asset_id) pair can be validated.';


--
-- Name: system_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_components (
    system_id uuid NOT NULL,
    component_id uuid NOT NULL,
    role text,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    system_id uuid NOT NULL,
    control_id uuid NOT NULL,
    maturity smallint,
    provenance character varying(20) DEFAULT 'recorded'::character varying NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_controls_maturity_check CHECK (((maturity >= 1) AND (maturity <= 5))),
    CONSTRAINT system_controls_provenance_check CHECK (((provenance)::text = ANY ((ARRAY['recorded'::character varying, 'verified_action'::character varying])::text[])))
);


--
-- Name: system_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    system_id uuid NOT NULL,
    object_type public.system_object_type NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    base_probability_score smallint DEFAULT 3 NOT NULL,
    parent_id uuid,
    people_group_id uuid,
    process_ref_id uuid,
    location_ref_id uuid,
    asset_ref_id uuid,
    assessed_by uuid,
    assessed_at timestamp with time zone,
    assessment_notes text,
    serial_number character varying(255),
    asset_tag character varying(255),
    external_asset_ref character varying(255),
    ip_address inet,
    cidr_prefix cidr,
    protocol character varying(50),
    port integer,
    version character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_code character varying(64),
    CONSTRAINT system_objects_base_risk_score_check CHECK (((base_probability_score >= 1) AND (base_probability_score <= 5))),
    CONSTRAINT system_objects_port_check CHECK (((port >= 1) AND (port <= 65535)))
);


--
-- Name: COLUMN system_objects.role_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_objects.role_code IS 'Optional component_roles.code matching system_objects.object_type. Validated by trg_system_objects_check_role.';


--
-- Name: system_threats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_threats (
    system_id uuid NOT NULL,
    threat_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.systems (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid NOT NULL,
    owner_user_id uuid,
    probability_c smallint,
    probability_i smallint,
    probability_a smallint,
    probability_notes text,
    probability_set_by uuid,
    probability_set_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    impact_c smallint,
    impact_i smallint,
    impact_a smallint,
    impact_set_at timestamp with time zone,
    impact_changed_in_cycle boolean DEFAULT false NOT NULL,
    managed_by_user_id uuid,
    is_shared boolean DEFAULT false NOT NULL,
    CONSTRAINT systems_impact_a_check CHECK (((impact_a >= 1) AND (impact_a <= 5))),
    CONSTRAINT systems_impact_c_check CHECK (((impact_c >= 1) AND (impact_c <= 5))),
    CONSTRAINT systems_impact_i_check CHECK (((impact_i >= 1) AND (impact_i <= 5))),
    CONSTRAINT systems_probability_a_check CHECK (((probability_a >= 1) AND (probability_a <= 5))),
    CONSTRAINT systems_probability_c_check CHECK (((probability_c >= 1) AND (probability_c <= 5))),
    CONSTRAINT systems_probability_i_check CHECK (((probability_i >= 1) AND (probability_i <= 5)))
);


--
-- Name: technology_catalogue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technology_catalogue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    vendor character varying(150) NOT NULL,
    version character varying(100),
    category character varying(100),
    description text,
    release_date date,
    end_of_life_date date,
    is_end_of_life boolean DEFAULT false NOT NULL,
    known_cve_count integer DEFAULT 0 NOT NULL,
    highest_cvss_score numeric(3,1),
    cve_reference_url text,
    last_reviewed_at timestamp with time zone,
    reviewed_by uuid,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT technology_catalogue_highest_cvss_score_check CHECK (((highest_cvss_score IS NULL) OR ((highest_cvss_score >= (0)::numeric) AND (highest_cvss_score <= (10)::numeric))))
);


--
-- Name: technology_object_attrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technology_object_attrs (
    object_id uuid NOT NULL,
    technology_type character varying(100),
    vendor character varying(150),
    version character varying(100),
    is_end_of_life boolean DEFAULT false NOT NULL,
    is_patched_current boolean DEFAULT false NOT NULL,
    is_internet_facing boolean DEFAULT false NOT NULL,
    has_mfa boolean DEFAULT false NOT NULL,
    hosting_model character varying(100),
    cloud_provider character varying(100),
    last_pen_tested date,
    catalogue_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: threat_set_threats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threat_set_threats (
    threat_set_id uuid NOT NULL,
    threat_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: threat_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threat_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    version character varying(64) DEFAULT 'v1'::character varying NOT NULL,
    status public.threat_set_status DEFAULT 'draft'::public.threat_set_status NOT NULL,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE threat_sets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.threat_sets IS 'Named, versioned bundle of threats in scope. Mirrors control_sets. Exactly one threat_set is active at a time.';


--
-- Name: threats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    threat_category public.threat_category NOT NULL,
    source public.threat_source DEFAULT 'external'::public.threat_source NOT NULL,
    probability_c smallint DEFAULT 3 NOT NULL,
    probability_i smallint DEFAULT 3 NOT NULL,
    probability_a smallint DEFAULT 3 NOT NULL,
    probability_set_by uuid,
    probability_set_at timestamp with time zone,
    probability_notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin_standard_id uuid,
    parent_threat_id uuid,
    reference_code character varying(100),
    default_baseline_probability smallint,
    CONSTRAINT threats_default_baseline_probability_check CHECK (((default_baseline_probability IS NULL) OR ((default_baseline_probability >= 1) AND (default_baseline_probability <= 5)))),
    CONSTRAINT threats_probability_a_check CHECK (((probability_a >= 1) AND (probability_a <= 5))),
    CONSTRAINT threats_probability_c_check CHECK (((probability_c >= 1) AND (probability_c <= 5))),
    CONSTRAINT threats_probability_i_check CHECK (((probability_i >= 1) AND (probability_i <= 5)))
);


--
-- Name: COLUMN threats.origin_standard_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.threats.origin_standard_id IS 'The standard this threat was derived from. NULL = custom.';


--
-- Name: COLUMN threats.parent_threat_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.threats.parent_threat_id IS 'If this threat is a fork of a catalogue entry, points to the original.';


--
-- Name: COLUMN threats.default_baseline_probability; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.threats.default_baseline_probability IS 'Catalogue-level baseline probability (1..5). Overridable per instantiation on threat_components.baseline_probability.';


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role public.user_role NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_roles IS 'Additional roles granted to a user by an admin. Does not include the user''s primary role (stored in users.role). A user with no rows here holds only their primary role.';


--
-- Name: COLUMN user_roles.granted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.granted_by IS 'Admin user who granted this role. Denormalised for audit convenience.';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    password_hash text NOT NULL,
    role public.user_role DEFAULT 'information_asset_owner'::public.user_role NOT NULL,
    department_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    sudo_enabled boolean DEFAULT false NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    totp_enabled boolean DEFAULT false NOT NULL,
    totp_secret text,
    dashboard_layout jsonb,
    view_mode character varying(8) DEFAULT 'business'::character varying NOT NULL,
    CONSTRAINT users_view_mode_check CHECK (((view_mode)::text = ANY ((ARRAY['business'::character varying, 'expert'::character varying])::text[])))
);


--
-- Name: COLUMN users.totp_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.totp_enabled IS 'When TRUE, login requires a valid TOTP code. Configurable per user.';


--
-- Name: COLUMN users.totp_secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.totp_secret IS 'Base32-encoded TOTP secret (RFC 6238). NULL when totp_enabled = FALSE.';


--
-- Name: COLUMN users.dashboard_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.dashboard_layout IS 'User-customised dashboard widget layout (react-grid-layout positions, keyed by responsive breakpoint). NULL means use the role default. Heights are auto-fit to content and not persisted.';


--
-- Name: v_active_control_set; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_control_set AS
 SELECT cs.id AS set_id,
    cs.name AS set_name,
    cs.version,
    cs.effective_from,
    cs.approved_at,
    c.id AS control_id,
    COALESCE(csc.local_override_name, c.title) AS effective_title,
    COALESCE(csc.local_override_description, c.description) AS effective_description,
    c.control_type,
    c.status AS control_status,
    csc.is_mandatory,
    s.code AS standard_code,
    s.name AS standard_name
   FROM (((public.control_sets cs
     JOIN public.control_set_controls csc ON ((csc.control_set_id = cs.id)))
     JOIN public.controls c ON ((c.id = csc.control_id)))
     LEFT JOIN public.standards s ON ((s.id = c.origin_standard_id)))
  WHERE (cs.status = 'active'::public.control_set_status);


--
-- Name: VIEW v_active_control_set; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_active_control_set IS 'The currently active control set with its controls, applying any local overrides. Empty if no set is active.';


--
-- Name: v_active_exceptions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_exceptions AS
 SELECT e.id AS exception_id,
    e.risk_id,
    r.system_id,
    s.name AS system_name,
    s.department_id,
    r.threat_id,
    t.name AS threat_name,
    r.risk_score,
    e.justification,
    e.accepted_by,
    u.full_name AS accepted_by_name,
    e.accepted_role,
    e.accepted_at,
    e.expires_at,
    e.review_cadence,
    (e.expires_at - CURRENT_DATE) AS days_until_expiry,
        CASE
            WHEN (e.expires_at < CURRENT_DATE) THEN 'overdue'::text
            WHEN (e.expires_at <= (CURRENT_DATE + '30 days'::interval)) THEN 'due_soon'::text
            ELSE 'ok'::text
        END AS expiry_status,
    e.escalated_at,
    (CURRENT_DATE - (e.accepted_at)::date) AS age_days,
    ((CURRENT_DATE - (e.accepted_at)::date) >= oc.max_exception_age_days) AS is_stale
   FROM (((((public.risk_exceptions e
     JOIN public.risks r ON ((r.id = e.risk_id)))
     JOIN public.systems s ON ((s.id = r.system_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.users u ON ((u.id = e.accepted_by)))
     CROSS JOIN public.org_config oc)
  WHERE (e.status = 'active'::public.exception_status);


--
-- Name: VIEW v_active_exceptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_active_exceptions IS 'Active exception records joined with risk/system/threat context. Includes age_days, escalated_at, and is_stale (age >= org max_exception_age_days). Expiry-overdue is the primary breach signal (see v_escalated_exceptions); is_stale is the secondary age-based warning.';


--
-- Name: v_asset_register_current; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_asset_register_current AS
 SELECT d.id AS department_id,
    d.name AS department_name,
    approved.id AS approved_version_id,
    approved.version_number AS approved_version_number,
    approved.accepted_at,
    approved.ciso_reviewed_at AS approved_at,
    u_acc.full_name AS accepted_by,
    u_ciso.full_name AS approved_by,
    approved.snapshot_path,
    draft.id AS draft_version_id,
    draft.version_number AS draft_version_number,
    draft.status AS draft_status,
    draft.created_at AS draft_created_at
   FROM ((((public.departments d
     LEFT JOIN public.asset_register_versions approved ON (((approved.department_id = d.id) AND (approved.status = 'ciso_approved'::public.asset_register_status))))
     LEFT JOIN public.asset_register_versions draft ON (((draft.department_id = d.id) AND (draft.status = ANY (ARRAY['draft'::public.asset_register_status, 'submitted'::public.asset_register_status, 'ciso_rejected'::public.asset_register_status])))))
     LEFT JOIN public.users u_acc ON ((u_acc.id = approved.accepted_by)))
     LEFT JOIN public.users u_ciso ON ((u_ciso.id = approved.ciso_reviewed_by)))
  ORDER BY d.name;


--
-- Name: v_audit_trail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_audit_trail AS
 SELECT created_at,
    user_name,
    user_role,
    effective_role,
    acting_as_note,
    action,
    entity_type,
    entity_label,
    human_narrative,
    ai_session_id,
    proposal_id
   FROM public.audit_log al
  ORDER BY created_at DESC;


--
-- Name: v_control_gap_analysis; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_control_gap_analysis AS
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
           FROM (public.control_component_links ccl
             JOIN public.control_components cc ON ((cc.id = ccl.component_id)))
        UNION ALL
         SELECT chain_1.control_id,
            cc.id,
            cc.name,
            cc.component_type,
            cc.status,
            cc.last_verified_at,
            (chain_1.depth + 1),
            (chain_1.path || cc.id),
            ccr.relationship_type
           FROM ((component_chain chain_1
             JOIN public.control_component_relationships ccr ON ((ccr.source_component_id = chain_1.component_id)))
             JOIN public.control_components cc ON ((cc.id = ccr.target_component_id)))
          WHERE ((NOT (cc.id = ANY (chain_1.path))) AND (chain_1.depth < 5))
        )
 SELECT c.id AS control_id,
    c.title AS control_title,
    c.status AS control_status,
    c.effectiveness AS control_effectiveness,
    chain.component_id,
    chain.component_name,
    chain.component_type,
    chain.component_status,
    chain.last_verified_at,
    chain.depth,
    chain.via_relationship
   FROM (public.controls c
     JOIN component_chain chain ON ((chain.control_id = c.id)))
  WHERE (chain.component_status = ANY (ARRAY['degraded'::public.component_status, 'planned'::public.component_status, 'decommissioned'::public.component_status, 'unknown'::public.component_status]));


--
-- Name: v_control_risk_exposure; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_control_risk_exposure AS
 SELECT c.id AS control_id,
    c.title AS control_title,
    c.control_type,
    c.status AS control_status,
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
           FROM public.risks r2
          WHERE ((r2.threat_id = ct.threat_id) AND (r2.is_active = true) AND (r2.validation_status = ANY (ARRAY['pending'::public.risk_validation_status, 'returned'::public.risk_validation_status])))) AS unvalidated_warning_count
   FROM ((((((public.controls c
     JOIN public.control_threats ct ON ((ct.control_id = c.id)))
     JOIN public.threats t ON ((t.id = ct.threat_id)))
     JOIN public.risks r ON (((r.threat_id = t.id) AND (r.is_active = true) AND (r.validation_status = 'validated'::public.risk_validation_status))))
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)));


--
-- Name: v_escalated_exceptions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_escalated_exceptions AS
 SELECT e.id AS exception_id,
    e.risk_id,
    r.system_id,
    s.name AS system_name,
    s.department_id,
    d.name AS department_name,
    r.threat_id,
    t.name AS threat_name,
    r.risk_score,
    r.assigned_to,
    ao.full_name AS owner_name,
    e.justification,
    e.accepted_by,
    u.full_name AS accepted_by_name,
    e.accepted_role,
    e.accepted_at,
    e.expires_at,
    e.review_cadence,
    e.escalated_at,
    (CURRENT_DATE - e.expires_at) AS days_overdue,
    (CURRENT_DATE - (e.accepted_at)::date) AS age_days
   FROM ((((((public.risk_exceptions e
     JOIN public.risks r ON ((r.id = e.risk_id)))
     JOIN public.systems s ON ((s.id = r.system_id)))
     JOIN public.departments d ON ((d.id = s.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.users u ON ((u.id = e.accepted_by)))
     LEFT JOIN public.users ao ON ((ao.id = r.assigned_to)))
  WHERE (e.status = 'expired'::public.exception_status)
  ORDER BY (CURRENT_DATE - e.expires_at) DESC;


--
-- Name: VIEW v_escalated_exceptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_escalated_exceptions IS 'Expired exceptions (review date lapsed without renew/revoke) — the CISO breach queue and the SIRO in-contravention-of-policy panel. The underlying risk is still treatment_decision=accept until a human renews or revokes.';


--
-- Name: v_impact_reconciliation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_impact_reconciliation AS
 SELECT iri.id AS item_id,
    icc.name AS cycle_name,
    d.name AS department,
    ia.name AS asset_name,
    t.name AS threat_name,
    iri.old_score,
    iri.new_score,
    iri.resolution,
    iri.resolution_notes,
    u_res.full_name AS resolved_by,
    iri.resolved_at,
    iri.created_at AS flagged_at
   FROM (((((((public.impact_reconciliation_items iri
     JOIN public.impact_calibration_cycles icc ON ((icc.id = iri.cycle_id)))
     JOIN public.risks r ON ((r.id = iri.risk_id)))
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     LEFT JOIN public.users u_res ON ((u_res.id = iri.resolved_by)))
  ORDER BY iri.resolution NULLS FIRST, d.name, ia.name;


--
-- Name: v_location_risk_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_location_risk_summary AS
 SELECT loc.id AS location_id,
    loc.name AS location_name,
    loc.location_type,
    loc.address,
    COALESCE(parent.name, '—'::character varying) AS parent_location,
    d.name AS department,
    count(lo.object_id) AS total_objects,
    max(so.base_probability_score) AS location_probability_score,
    public.probability_tier((COALESCE((max(so.base_probability_score))::integer, 1))::smallint) AS location_probability_tier
   FROM ((((public.locations loc
     LEFT JOIN public.locations parent ON ((parent.id = loc.parent_id)))
     LEFT JOIN public.departments d ON ((d.id = loc.department_id)))
     LEFT JOIN public.location_objects lo ON ((lo.location_id = loc.id)))
     LEFT JOIN public.system_objects so ON (((so.id = lo.object_id) AND (so.is_active = true))))
  WHERE (loc.is_active = true)
  GROUP BY loc.id, loc.name, loc.location_type, loc.address, parent.name, d.name
  ORDER BY (max(so.base_probability_score)) DESC NULLS LAST;


--
-- Name: v_onboarding_readiness; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_onboarding_readiness AS
 WITH threat_stats AS (
         SELECT count(*) AS threat_count,
            count(*) FILTER (WHERE ((threats.probability_c IS NOT NULL) AND (threats.probability_i IS NOT NULL) AND (threats.probability_a IS NOT NULL))) AS threats_with_probability
           FROM public.threats
        ), control_stats AS (
         SELECT count(*) AS control_count,
            count(*) FILTER (WHERE (c.status = 'active'::public.control_status)) AS controls_active,
            count(*) FILTER (WHERE ((c.effectiveness IS NULL) AND (c.status = 'active'::public.control_status))) AS controls_unrated,
            count(DISTINCT ct.control_id) AS controls_with_threat_links
           FROM (public.controls c
             LEFT JOIN public.control_threats ct ON ((ct.control_id = c.id)))
        ), dept_stats AS (
         SELECT count(*) AS dept_count
           FROM public.departments
        ), asset_stats AS (
         SELECT count(*) AS asset_count,
            count(*) FILTER (WHERE ((information_assets.confidentiality IS NOT NULL) AND (information_assets.integrity IS NOT NULL) AND (information_assets.availability IS NOT NULL))) AS assets_fully_rated
           FROM public.information_assets
          WHERE (information_assets.is_active = true)
        ), system_stats AS (
         SELECT count(*) AS system_count
           FROM public.systems
        ), risk_stats AS (
         SELECT count(*) AS risk_count,
            count(*) FILTER (WHERE (risks.validation_status = 'validated'::public.risk_validation_status)) AS risks_validated,
            count(*) FILTER (WHERE (risks.validation_status = 'pending'::public.risk_validation_status)) AS risks_pending
           FROM public.risks
          WHERE (risks.is_active = true)
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
           FROM public.onboarding_handover
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
    (((((COALESCE(h.threats_reviewed, false))::integer + (COALESCE(h.controls_reviewed, false))::integer) + (COALESCE(h.impact_tables_reviewed, false))::integer) + (COALESCE(h.assets_reviewed, false))::integer) + (COALESCE(h.risks_reviewed, false))::integer) AS areas_reviewed_count,
    (COALESCE(h.threats_reviewed, false) AND COALESCE(h.controls_reviewed, false) AND COALESCE(h.impact_tables_reviewed, false) AND COALESCE(h.assets_reviewed, false) AND COALESCE(h.risks_reviewed, false)) AS all_areas_reviewed,
    COALESCE(h.ciso_accepted, false) AS ciso_accepted,
    h.ciso_accepted_at,
    COALESCE(h.siro_accepted, false) AS siro_accepted,
    h.siro_accepted_at,
    h.known_gaps,
    h.id AS handover_id
   FROM (((((((public.org_config oc
     CROSS JOIN threat_stats ts)
     CROSS JOIN control_stats cs)
     CROSS JOIN dept_stats ds)
     CROSS JOIN asset_stats ast)
     CROSS JOIN system_stats syst)
     CROSS JOIN risk_stats rs)
     LEFT JOIN handover h ON (true));


--
-- Name: v_pending_risks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pending_risks AS
 SELECT r.id AS risk_id,
    d.id AS department_id,
    d.name AS department,
    ia.id AS asset_id,
    ia.name AS asset_name,
    sys.name AS system_name,
    t.name AS threat_name,
    t.threat_category,
    r.rationale,
    r.validation_status,
    r.validation_notes,
    u_val.full_name AS last_actioned_by,
    r.validated_at AS last_actioned_at,
    u_id.full_name AS identified_by,
    r.created_at AS identified_at
   FROM ((((((public.risks r
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     LEFT JOIN public.users u_id ON ((u_id.id = r.identified_by)))
     LEFT JOIN public.users u_val ON ((u_val.id = r.validated_by)))
  WHERE ((r.is_active = true) AND (r.validation_status = ANY (ARRAY['pending'::public.risk_validation_status, 'returned'::public.risk_validation_status])))
  ORDER BY r.validation_status, d.name, r.created_at DESC;


--
-- Name: v_risk_business_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_risk_business_summary AS
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
           FROM public.risk_probability_signals rps
          WHERE ((rps.risk_id = r.id) AND (rps.status = 'open'::public.signal_status)))) AS has_open_signal,
    count(DISTINCT sa.id) FILTER (WHERE (sa.status <> ALL (ARRAY['completed'::public.treatment_status, 'cancelled'::public.treatment_status]))) AS active_action_count,
    u_as.full_name AS assigned_to,
    r.review_date,
    ((r.asset_id IS NULL) OR (EXISTS ( SELECT 1
           FROM public.system_assets sa2
          WHERE ((sa2.system_id = r.system_id) AND (sa2.asset_id = r.asset_id))))) AS system_asset_confirmed,
        CASE
            WHEN (ia.id IS NULL) THEN NULL::text
            ELSE ( SELECT string_agg((s2.name)::text, ', '::text ORDER BY (s2.name)::text) AS string_agg
               FROM (public.system_assets sa3
                 JOIN public.systems s2 ON ((s2.id = sa3.system_id)))
              WHERE ((sa3.asset_id = ia.id) AND (s2.is_active = true)))
        END AS all_hosting_systems
   FROM (((((((((public.risks r
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     LEFT JOIN public.control_threats ct ON ((ct.threat_id = t.id)))
     LEFT JOIN public.controls c ON (((c.id = ct.control_id) AND (c.status <> 'not_applicable'::public.control_status))))
     LEFT JOIN public.security_action_risks sar ON ((sar.risk_id = r.id)))
     LEFT JOIN public.security_actions sa ON ((sa.id = sar.action_id)))
     LEFT JOIN public.users u_as ON ((u_as.id = r.assigned_to)))
  WHERE ((r.is_active = true) AND (r.validation_status = 'validated'::public.risk_validation_status))
  GROUP BY r.id, d.name, sys.name, sys.description, ia.name, ia.description, ia.id, t.name, t.threat_category, r.risk_score, r.risk_c, r.risk_i, r.risk_a, sys.impact_c, sys.impact_i, sys.impact_a, r.probability_c, r.probability_i, r.probability_a, r.rationale, r.validation_status, u_as.full_name, r.review_date, r.asset_id, r.system_id
  ORDER BY r.risk_score DESC, sys.name, ia.name;


--
-- Name: v_risk_probability_signals_open; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_risk_probability_signals_open AS
 SELECT rps.id AS signal_id,
    rps.risk_id,
    d.name AS department,
    sys.name AS system_name,
    ia.name AS asset_name,
    t.name AS threat_name,
    r.risk_score,
    rps.risk_probability_c_current,
    rps.risk_probability_i_current,
    rps.risk_probability_a_current,
    rps.threat_id,
    thr.name AS threat_source_name,
    rps.threat_probability_c_before,
    rps.threat_probability_i_before,
    rps.threat_probability_a_before,
    rps.threat_probability_c_after,
    rps.threat_probability_i_after,
    rps.threat_probability_a_after,
    rps.system_id AS signal_system_id,
    rps.system_probability_c_before,
    rps.system_probability_i_before,
    rps.system_probability_a_before,
    rps.system_probability_c_after,
    rps.system_probability_i_after,
    rps.system_probability_a_after,
    rps.status,
    rps.created_at AS signal_created_at,
        CASE
            WHEN (GREATEST((sys.impact_c * COALESCE(rps.threat_probability_c_after, rps.system_probability_c_after, r.probability_c)), (sys.impact_i * COALESCE(rps.threat_probability_i_after, rps.system_probability_i_after, r.probability_i)), (sys.impact_a * COALESCE(rps.threat_probability_a_after, rps.system_probability_a_after, r.probability_a))) > r.risk_score) THEN true
            ELSE false
        END AS would_increase_score
   FROM ((((((public.risk_probability_signals rps
     JOIN public.risks r ON ((r.id = rps.risk_id)))
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     LEFT JOIN public.threats thr ON ((thr.id = rps.threat_id)))
  WHERE (rps.status = 'open'::public.signal_status)
  ORDER BY r.risk_score DESC, rps.created_at;


--
-- Name: v_risk_register; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_risk_register AS
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
    u_as.full_name AS assigned_to,
    r.review_date,
    r.created_at,
    r.updated_at,
    ((r.asset_id IS NULL) OR (EXISTS ( SELECT 1
           FROM public.system_assets sa
          WHERE ((sa.system_id = r.system_id) AND (sa.asset_id = r.asset_id))))) AS system_asset_confirmed
   FROM ((((((((public.risks r
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     CROSS JOIN public.org_config oc)
     LEFT JOIN public.users u_id ON ((u_id.id = r.identified_by)))
     LEFT JOIN public.users u_as ON ((u_as.id = r.assigned_to)))
     LEFT JOIN public.users u_val ON ((u_val.id = r.validated_by)))
  WHERE (r.is_active = true)
  ORDER BY r.validation_status, r.risk_score DESC;


--
-- Name: working_group_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.working_group_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_date date NOT NULL,
    agenda_generated_at timestamp with time zone,
    agenda_path text,
    minutes_path text,
    chaired_by uuid,
    secretary_user_id uuid,
    linked_cycle_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    planned_at timestamp with time zone,
    planned_by uuid,
    closed_at timestamp with time zone,
    closed_by uuid,
    minutes_issued_at timestamp with time zone,
    minutes_issued_by uuid,
    minutes_body text,
    quorate boolean,
    quorate_notes text,
    section_timeboxes jsonb DEFAULT '{}'::jsonb NOT NULL,
    target_duration_min smallint DEFAULT 90 NOT NULL
);


--
-- Name: v_sap_minutes_output; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_sap_minutes_output AS
 SELECT rc.id AS cycle_id,
    rc.name AS cycle_name,
    wgm.meeting_date,
    wgm.id AS meeting_id,
    u_chair.full_name AS chaired_by,
    u_sec.full_name AS secretary,
    'risk'::text AS section,
    1 AS sort_order,
    r.id AS item_id,
    ia.name AS asset_name,
    d.name AS department,
    sys.name AS system_name,
    t.name AS threat_name,
    r.risk_score,
    rri.swg_risk_decision AS swg_decision,
    rri.swg_risk_decision_notes AS swg_decision_notes,
    rri.draft_notes,
    rri.finalised_notes,
    rri.finalised_at,
    u_fin.full_name AS finalised_by,
    NULL::character varying(255) AS action_title,
    NULL::text AS action_description,
    NULL::character varying(255) AS action_owner,
    NULL::public.treatment_type AS treatment_type,
    NULL::public.treatment_status AS action_status,
    NULL::boolean AS requires_siro_signoff,
    NULL::character varying(255) AS siro_signoff_by,
    NULL::timestamp with time zone AS siro_signoff_at,
    NULL::text AS siro_signoff_notes
   FROM ((((((((((public.risk_review_items rri
     JOIN public.review_cycles rc ON ((rc.id = rri.cycle_id)))
     JOIN public.risks r ON ((r.id = rri.risk_id)))
     JOIN public.systems sys ON ((sys.id = r.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN public.threats t ON ((t.id = r.threat_id)))
     LEFT JOIN public.information_assets ia ON ((ia.id = r.asset_id)))
     LEFT JOIN public.working_group_meetings wgm ON ((wgm.linked_cycle_id = rc.id)))
     LEFT JOIN public.users u_chair ON ((u_chair.id = wgm.chaired_by)))
     LEFT JOIN public.users u_sec ON ((u_sec.id = wgm.secretary_user_id)))
     LEFT JOIN public.users u_fin ON ((u_fin.id = rri.finalised_by)))
UNION ALL
 SELECT rc.id AS cycle_id,
    rc.name AS cycle_name,
    wgm.meeting_date,
    wgm.id AS meeting_id,
    u_chair.full_name AS chaired_by,
    u_sec.full_name AS secretary,
    'action'::text AS section,
    2 AS sort_order,
    sa.id AS item_id,
    NULL::character varying(255) AS asset_name,
    NULL::character varying(255) AS department,
    NULL::character varying(255) AS system_name,
    NULL::character varying(255) AS threat_name,
    NULL::smallint AS risk_score,
    sa.swg_decision,
    sa.swg_decision_notes,
    NULL::text AS draft_notes,
    NULL::text AS finalised_notes,
    NULL::timestamp with time zone AS finalised_at,
    NULL::character varying(255) AS finalised_by,
    sa.title AS action_title,
    sa.description AS action_description,
    u_owner.full_name AS action_owner,
    sa.treatment_type,
    sa.status AS action_status,
    sa.requires_siro_signoff,
    u_siro.full_name AS siro_signoff_by,
    sa.siro_signoff_at,
    sa.siro_signoff_notes
   FROM (((((((public.security_actions sa
     JOIN public.security_action_plans sap ON ((sap.id = sa.plan_id)))
     JOIN public.review_cycles rc ON ((rc.id = sap.cycle_id)))
     LEFT JOIN public.working_group_meetings wgm ON ((wgm.linked_cycle_id = rc.id)))
     LEFT JOIN public.users u_chair ON ((u_chair.id = wgm.chaired_by)))
     LEFT JOIN public.users u_sec ON ((u_sec.id = wgm.secretary_user_id)))
     LEFT JOIN public.users u_owner ON ((u_owner.id = sa.primary_owner_user_id)))
     LEFT JOIN public.users u_siro ON ((u_siro.id = sa.siro_signoff_by)));


--
-- Name: v_security_action_plan_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_security_action_plan_summary AS
SELECT
    NULL::uuid AS plan_id,
    NULL::character varying(255) AS cycle_name,
    NULL::public.cycle_status AS cycle_status,
    NULL::character varying(255) AS plan_title,
    NULL::public.action_plan_status AS plan_status,
    NULL::timestamp with time zone AS frozen_at,
    NULL::timestamp with time zone AS approved_at,
    NULL::bigint AS total_actions,
    NULL::bigint AS completed_actions,
    NULL::bigint AS in_progress_actions,
    NULL::bigint AS planned_actions,
    NULL::bigint AS deferred_actions,
    NULL::bigint AS rejected_actions,
    NULL::bigint AS overdue_actions,
    NULL::bigint AS siro_signoff_required,
    NULL::bigint AS siro_signoff_completed,
    NULL::bigint AS siro_signoff_outstanding,
    NULL::character varying(255) AS frozen_by,
    NULL::character varying(255) AS approved_by;


--
-- Name: v_system_risk_drilldown; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_system_risk_drilldown AS
 WITH system_max AS (
         SELECT system_objects.system_id,
            max(system_objects.base_probability_score) AS max_score
           FROM public.system_objects
          WHERE (system_objects.is_active = true)
          GROUP BY system_objects.system_id
        )
 SELECT sys.id AS system_id,
    d.name AS department,
    sys.name AS system_name,
    sys.probability_c AS system_prob_c_suggestion,
    sys.probability_i AS system_prob_i_suggestion,
    sys.probability_a AS system_prob_a_suggestion,
    sm.max_score AS system_object_max_probability_score,
    public.probability_tier(sm.max_score) AS system_probability_tier,
    so.id AS object_id,
    so.object_type,
    so.name AS object_name,
    so.base_probability_score,
    public.probability_tier(so.base_probability_score) AS object_probability_tier,
    rank() OVER (PARTITION BY so.system_id ORDER BY so.base_probability_score DESC) AS risk_rank,
        CASE
            WHEN (so.base_probability_score = sm.max_score) THEN true
            ELSE false
        END AS is_primary_risk_driver,
    so.assessment_notes,
    so.assessed_at,
    u.full_name AS assessed_by
   FROM ((((public.system_objects so
     JOIN public.systems sys ON ((sys.id = so.system_id)))
     JOIN public.departments d ON ((d.id = sys.department_id)))
     JOIN system_max sm ON ((sm.system_id = so.system_id)))
     LEFT JOIN public.users u ON ((u.id = so.assessed_by)))
  WHERE ((so.is_active = true) AND (sys.is_active = true))
  ORDER BY sys.name, so.base_probability_score DESC;


--
-- Name: v_system_risk_grid; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_system_risk_grid AS
 WITH worst_asset AS (
         SELECT DISTINCT ON (s_1.id) s_1.id AS system_id,
            ia.id AS information_asset_id,
            ia.name AS information_asset_name,
            ia.confidentiality,
            ia.integrity,
            ia.availability
           FROM ((public.systems s_1
             JOIN public.system_assets sa ON ((sa.system_id = s_1.id)))
             JOIN public.information_assets ia ON (((ia.id = sa.asset_id) AND (ia.is_active = true))))
          ORDER BY s_1.id, GREATEST(COALESCE((ia.confidentiality)::integer, 0), COALESCE((ia.integrity)::integer, 0), COALESCE((ia.availability)::integer, 0)) DESC NULLS LAST, ia.name
        )
 SELECT s.id AS system_id,
    s.name AS system_name,
    wa.information_asset_id,
    wa.information_asset_name,
    s.impact_c AS confidentiality,
    s.impact_i AS integrity,
    s.impact_a AS availability,
    t.id AS threat_id,
    t.name AS threat_name,
    r.id AS risk_id,
    r.probability_c,
    r.probability_i,
    r.probability_a,
    r.risk_score,
    r.validation_status
   FROM ((((public.systems s
     JOIN public.system_threats st ON ((st.system_id = s.id)))
     JOIN public.threats t ON ((t.id = st.threat_id)))
     LEFT JOIN worst_asset wa ON ((wa.system_id = s.id)))
     LEFT JOIN public.risks r ON (((r.system_id = s.id) AND (r.threat_id = t.id) AND (r.is_active = true))))
  WHERE (s.is_active = true);


--
-- Name: v_user_roles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_roles AS
 SELECT u.id AS user_id,
    u.email,
    u.full_name,
    u.role,
    'primary'::text AS source
   FROM public.users u
  WHERE (u.is_active = true)
UNION ALL
 SELECT u.id AS user_id,
    u.email,
    u.full_name,
    ur.role,
    'additional'::text AS source
   FROM (public.user_roles ur
     JOIN public.users u ON ((u.id = ur.user_id)))
  WHERE (u.is_active = true);


--
-- Name: VIEW v_user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_user_roles IS 'All roles held by each active user — primary (from users.role) and additional (from user_roles). Use this view to build the login role switcher.';


--
-- Name: api_request_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_log ALTER COLUMN id SET DEFAULT nextval('public.api_request_log_id_seq'::regclass);


--
-- Name: bil_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_categories ALTER COLUMN id SET DEFAULT nextval('public.bil_categories_id_seq'::regclass);


--
-- Name: bil_reference_levels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_reference_levels ALTER COLUMN id SET DEFAULT nextval('public.bil_reference_levels_id_seq'::regclass);


--
-- Name: bil_subcategories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_subcategories ALTER COLUMN id SET DEFAULT nextval('public.bil_subcategories_id_seq'::regclass);


--
-- Name: impact_tables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_tables ALTER COLUMN id SET DEFAULT nextval('public.impact_tables_id_seq'::regclass);


--
-- Name: service_impact_ratings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings ALTER COLUMN id SET DEFAULT nextval('public.service_impact_ratings_id_seq'::regclass);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_request_log api_request_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_log
    ADD CONSTRAINT api_request_log_pkey PRIMARY KEY (id);


--
-- Name: asset_data_object_links asset_data_object_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_data_object_links
    ADD CONSTRAINT asset_data_object_links_pkey PRIMARY KEY (asset_id, object_id);


--
-- Name: asset_impact_ratings asset_impact_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_impact_ratings
    ADD CONSTRAINT asset_impact_ratings_pkey PRIMARY KEY (asset_id, impact_table_id);


--
-- Name: asset_register_versions asset_register_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bil_categories bil_categories_org_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_categories
    ADD CONSTRAINT bil_categories_org_type_name_key UNIQUE (org_type, name);


--
-- Name: bil_categories bil_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_categories
    ADD CONSTRAINT bil_categories_pkey PRIMARY KEY (id);


--
-- Name: bil_reference_levels bil_reference_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_reference_levels
    ADD CONSTRAINT bil_reference_levels_pkey PRIMARY KEY (id);


--
-- Name: bil_reference_levels bil_reference_levels_subcategory_id_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_reference_levels
    ADD CONSTRAINT bil_reference_levels_subcategory_id_level_key UNIQUE (subcategory_id, level);


--
-- Name: bil_subcategories bil_subcategories_category_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_subcategories
    ADD CONSTRAINT bil_subcategories_category_id_name_key UNIQUE (category_id, name);


--
-- Name: bil_subcategories bil_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_subcategories
    ADD CONSTRAINT bil_subcategories_pkey PRIMARY KEY (id);


--
-- Name: business_service_assets business_service_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_assets
    ADD CONSTRAINT business_service_assets_pkey PRIMARY KEY (service_id, asset_id);


--
-- Name: business_service_impact_tables business_service_impact_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_impact_tables
    ADD CONSTRAINT business_service_impact_tables_pkey PRIMARY KEY (service_id, impact_table_id);


--
-- Name: business_services business_services_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_department_id_name_key UNIQUE (department_id, name);


--
-- Name: business_services business_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_pkey PRIMARY KEY (id);


--
-- Name: capabilities capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (key);


--
-- Name: component_ip_addresses component_ip_addresses_component_id_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_ip_addresses
    ADD CONSTRAINT component_ip_addresses_component_id_ip_address_key UNIQUE (component_id, ip_address);


--
-- Name: component_ip_addresses component_ip_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_ip_addresses
    ADD CONSTRAINT component_ip_addresses_pkey PRIMARY KEY (id);


--
-- Name: component_roles component_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_roles
    ADD CONSTRAINT component_roles_pkey PRIMARY KEY (category, code);


--
-- Name: control_component_links control_component_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_links
    ADD CONSTRAINT control_component_links_pkey PRIMARY KEY (control_id, component_id);


--
-- Name: control_component_relationships control_component_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_relationships
    ADD CONSTRAINT control_component_relationships_pkey PRIMARY KEY (source_component_id, target_component_id, relationship_type);


--
-- Name: control_component_systems control_component_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_systems
    ADD CONSTRAINT control_component_systems_pkey PRIMARY KEY (component_id, system_id);


--
-- Name: control_components control_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_components
    ADD CONSTRAINT control_components_pkey PRIMARY KEY (id);


--
-- Name: control_mappings control_mappings_control_id_standard_control_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_mappings
    ADD CONSTRAINT control_mappings_control_id_standard_control_id_key UNIQUE (control_id, standard_control_id);


--
-- Name: control_mappings control_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_mappings
    ADD CONSTRAINT control_mappings_pkey PRIMARY KEY (id);


--
-- Name: control_set_controls control_set_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_set_controls
    ADD CONSTRAINT control_set_controls_pkey PRIMARY KEY (control_set_id, control_id);


--
-- Name: control_sets control_sets_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sets
    ADD CONSTRAINT control_sets_name_version_key UNIQUE (name, version);


--
-- Name: control_sets control_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sets
    ADD CONSTRAINT control_sets_pkey PRIMARY KEY (id);


--
-- Name: control_technology_objects control_technology_objects_control_id_system_object_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_technology_objects
    ADD CONSTRAINT control_technology_objects_control_id_system_object_id_key UNIQUE (control_id, system_object_id);


--
-- Name: control_technology_objects control_technology_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_technology_objects
    ADD CONSTRAINT control_technology_objects_pkey PRIMARY KEY (id);


--
-- Name: control_threats control_threats_control_id_threat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_threats
    ADD CONSTRAINT control_threats_control_id_threat_id_key UNIQUE (control_id, threat_id);


--
-- Name: control_threats control_threats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_threats
    ADD CONSTRAINT control_threats_pkey PRIMARY KEY (id);


--
-- Name: controls controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_pkey PRIMARY KEY (id);


--
-- Name: data_object_attrs data_object_attrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_object_attrs
    ADD CONSTRAINT data_object_attrs_pkey PRIMARY KEY (object_id);


--
-- Name: department_impact_tables department_impact_tables_cycle_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_cycle_id_department_id_key UNIQUE (cycle_id, department_id);


--
-- Name: department_impact_tables department_impact_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_pkey PRIMARY KEY (id);


--
-- Name: department_service_adoptions department_service_adoptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_service_adoptions
    ADD CONSTRAINT department_service_adoptions_pkey PRIMARY KEY (department_id, service_id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: facility_object_attrs facility_object_attrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_object_attrs
    ADD CONSTRAINT facility_object_attrs_pkey PRIMARY KEY (object_id);


--
-- Name: help_content help_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_content
    ADD CONSTRAINT help_content_pkey PRIMARY KEY (help_key, locale);


--
-- Name: help_keys help_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_keys
    ADD CONSTRAINT help_keys_pkey PRIMARY KEY (help_key);


--
-- Name: impact_calibration_cycles impact_calibration_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_calibration_cycles
    ADD CONSTRAINT impact_calibration_cycles_pkey PRIMARY KEY (id);


--
-- Name: impact_level_definitions impact_level_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_level_definitions
    ADD CONSTRAINT impact_level_definitions_pkey PRIMARY KEY (id);


--
-- Name: impact_level_definitions impact_level_definitions_table_id_cia_dimension_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_level_definitions
    ADD CONSTRAINT impact_level_definitions_table_id_cia_dimension_level_key UNIQUE (table_id, cia_dimension, level);


--
-- Name: impact_reconciliation_items impact_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: impact_table_bil_levels impact_table_bil_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_bil_levels
    ADD CONSTRAINT impact_table_bil_levels_pkey PRIMARY KEY (impact_table_id, level);


--
-- Name: impact_table_cia_levels impact_table_cia_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_cia_levels
    ADD CONSTRAINT impact_table_cia_levels_pkey PRIMARY KEY (impact_table_id, level, dimension);


--
-- Name: impact_tables impact_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_tables
    ADD CONSTRAINT impact_tables_pkey PRIMARY KEY (id);


--
-- Name: information_assets information_assets_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_department_id_name_key UNIQUE (department_id, name);


--
-- Name: information_assets information_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_pkey PRIMARY KEY (id);


--
-- Name: location_objects location_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_objects
    ADD CONSTRAINT location_objects_pkey PRIMARY KEY (location_id, object_id);


--
-- Name: locations locations_name_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_name_department_id_key UNIQUE (name, department_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: meeting_agenda_items meeting_agenda_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_pkey PRIMARY KEY (id);


--
-- Name: meeting_attachments meeting_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attachments
    ADD CONSTRAINT meeting_attachments_pkey PRIMARY KEY (id);


--
-- Name: meeting_attendees meeting_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_pkey PRIMARY KEY (id);


--
-- Name: object_access_links object_access_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_access_links
    ADD CONSTRAINT object_access_links_pkey PRIMARY KEY (id);


--
-- Name: onboarding_handover onboarding_handover_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_handover
    ADD CONSTRAINT onboarding_handover_pkey PRIMARY KEY (id);


--
-- Name: org_config org_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_config
    ADD CONSTRAINT org_config_pkey PRIMARY KEY (id);


--
-- Name: people_groups people_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_groups
    ADD CONSTRAINT people_groups_name_key UNIQUE (name);


--
-- Name: people_groups people_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_groups
    ADD CONSTRAINT people_groups_pkey PRIMARY KEY (id);


--
-- Name: people_object_attrs people_object_attrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_object_attrs
    ADD CONSTRAINT people_object_attrs_pkey PRIMARY KEY (object_id);


--
-- Name: process_object_attrs process_object_attrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_object_attrs
    ADD CONSTRAINT process_object_attrs_pkey PRIMARY KEY (object_id);


--
-- Name: process_service_links process_service_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_service_links
    ADD CONSTRAINT process_service_links_pkey PRIMARY KEY (process_id, service_id);


--
-- Name: process_system_links process_system_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_system_links
    ADD CONSTRAINT process_system_links_pkey PRIMARY KEY (process_id, system_id);


--
-- Name: processes processes_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_department_id_name_key UNIQUE (department_id, name);


--
-- Name: processes processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- Name: proposed_changes proposed_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposed_changes
    ADD CONSTRAINT proposed_changes_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: review_cycles review_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_cycles
    ADD CONSTRAINT review_cycles_pkey PRIMARY KEY (id);


--
-- Name: risk_components risk_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_components
    ADD CONSTRAINT risk_components_pkey PRIMARY KEY (risk_id, component_id);


--
-- Name: risk_exceptions risk_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_exceptions
    ADD CONSTRAINT risk_exceptions_pkey PRIMARY KEY (id);


--
-- Name: risk_probability_signals risk_probability_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_probability_signals
    ADD CONSTRAINT risk_probability_signals_pkey PRIMARY KEY (id);


--
-- Name: risk_residual_history risk_residual_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_residual_history
    ADD CONSTRAINT risk_residual_history_pkey PRIMARY KEY (id);


--
-- Name: risk_review_items risk_review_items_cycle_id_risk_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_cycle_id_risk_id_key UNIQUE (cycle_id, risk_id);


--
-- Name: risk_review_items risk_review_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_pkey PRIMARY KEY (id);


--
-- Name: risk_treatments risk_treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_treatments
    ADD CONSTRAINT risk_treatments_pkey PRIMARY KEY (id);


--
-- Name: risks risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, capability_key);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: security_action_components security_action_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_components
    ADD CONSTRAINT security_action_components_pkey PRIMARY KEY (action_id, component_id);


--
-- Name: security_action_controls security_action_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_controls
    ADD CONSTRAINT security_action_controls_pkey PRIMARY KEY (action_id, control_id);


--
-- Name: security_action_plans security_action_plans_cycle_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_cycle_id_key UNIQUE (cycle_id);


--
-- Name: security_action_plans security_action_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_pkey PRIMARY KEY (id);


--
-- Name: security_action_risks security_action_risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_risks
    ADD CONSTRAINT security_action_risks_pkey PRIMARY KEY (action_id, risk_id);


--
-- Name: security_actions security_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_pkey PRIMARY KEY (id);


--
-- Name: service_impact_ratings service_impact_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings
    ADD CONSTRAINT service_impact_ratings_pkey PRIMARY KEY (id);


--
-- Name: service_impact_ratings service_impact_ratings_service_id_impact_table_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings
    ADD CONSTRAINT service_impact_ratings_service_id_impact_table_id_key UNIQUE (service_id, impact_table_id);


--
-- Name: soa_entries soa_entries_control_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_entries
    ADD CONSTRAINT soa_entries_control_id_key UNIQUE (control_id);


--
-- Name: soa_entries soa_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_entries
    ADD CONSTRAINT soa_entries_pkey PRIMARY KEY (id);


--
-- Name: soa_versions soa_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_versions
    ADD CONSTRAINT soa_versions_pkey PRIMARY KEY (id);


--
-- Name: soa_versions soa_versions_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_versions
    ADD CONSTRAINT soa_versions_version_no_key UNIQUE (version_no);


--
-- Name: sod_rules sod_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sod_rules
    ADD CONSTRAINT sod_rules_pkey PRIMARY KEY (key);


--
-- Name: standard_controls standard_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_controls
    ADD CONSTRAINT standard_controls_pkey PRIMARY KEY (id);


--
-- Name: standard_controls standard_controls_standard_id_ref_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_controls
    ADD CONSTRAINT standard_controls_standard_id_ref_code_key UNIQUE (standard_id, ref_code);


--
-- Name: standard_soa_entries standard_soa_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_soa_entries
    ADD CONSTRAINT standard_soa_entries_pkey PRIMARY KEY (id);


--
-- Name: standard_soa_entries standard_soa_entries_standard_control_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_soa_entries
    ADD CONSTRAINT standard_soa_entries_standard_control_id_key UNIQUE (standard_control_id);


--
-- Name: standards standards_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standards
    ADD CONSTRAINT standards_code_key UNIQUE (code);


--
-- Name: standards standards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standards
    ADD CONSTRAINT standards_pkey PRIMARY KEY (id);


--
-- Name: system_assets system_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_assets
    ADD CONSTRAINT system_assets_pkey PRIMARY KEY (system_id, asset_id);


--
-- Name: system_components system_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_components
    ADD CONSTRAINT system_components_pkey PRIMARY KEY (system_id, component_id);


--
-- Name: system_controls system_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_controls
    ADD CONSTRAINT system_controls_pkey PRIMARY KEY (id);


--
-- Name: system_controls system_controls_system_id_control_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_controls
    ADD CONSTRAINT system_controls_system_id_control_id_key UNIQUE (system_id, control_id);


--
-- Name: system_objects system_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_pkey PRIMARY KEY (id);


--
-- Name: system_objects system_objects_system_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_system_id_name_key UNIQUE (system_id, name);


--
-- Name: system_threats system_threats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_threats
    ADD CONSTRAINT system_threats_pkey PRIMARY KEY (system_id, threat_id);


--
-- Name: systems systems_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_department_id_name_key UNIQUE (department_id, name);


--
-- Name: systems systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_pkey PRIMARY KEY (id);


--
-- Name: technology_catalogue technology_catalogue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_catalogue
    ADD CONSTRAINT technology_catalogue_pkey PRIMARY KEY (id);


--
-- Name: technology_catalogue technology_catalogue_vendor_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_catalogue
    ADD CONSTRAINT technology_catalogue_vendor_name_version_key UNIQUE (vendor, name, version);


--
-- Name: technology_object_attrs technology_object_attrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_object_attrs
    ADD CONSTRAINT technology_object_attrs_pkey PRIMARY KEY (object_id);


--
-- Name: threat_set_threats threat_set_threats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_set_threats
    ADD CONSTRAINT threat_set_threats_pkey PRIMARY KEY (threat_set_id, threat_id);


--
-- Name: threat_sets threat_sets_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_sets
    ADD CONSTRAINT threat_sets_name_version_key UNIQUE (name, version);


--
-- Name: threat_sets threat_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_sets
    ADD CONSTRAINT threat_sets_pkey PRIMARY KEY (id);


--
-- Name: threats threats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threats
    ADD CONSTRAINT threats_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: working_group_meetings working_group_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_pkey PRIMARY KEY (id);


--
-- Name: idx_access_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_active ON public.object_access_links USING btree (is_active);


--
-- Name: idx_access_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_object ON public.object_access_links USING btree (target_object_id);


--
-- Name: idx_access_people; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_people ON public.object_access_links USING btree (people_object_id);


--
-- Name: idx_access_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_system ON public.object_access_links USING btree (target_system_id);


--
-- Name: idx_air_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_air_asset ON public.asset_impact_ratings USING btree (asset_id);


--
-- Name: idx_api_keys_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix);


--
-- Name: idx_arl_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_endpoint ON public.api_request_log USING btree (endpoint);


--
-- Name: idx_arl_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_requested_at ON public.api_request_log USING btree (requested_at DESC);


--
-- Name: idx_arl_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_user_id ON public.api_request_log USING btree (user_id);


--
-- Name: idx_arv_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arv_department ON public.asset_register_versions USING btree (department_id);


--
-- Name: idx_arv_one_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arv_one_approved ON public.asset_register_versions USING btree (department_id) WHERE (status = 'ciso_approved'::public.asset_register_status);


--
-- Name: idx_arv_one_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arv_one_draft ON public.asset_register_versions USING btree (department_id) WHERE (status = 'draft'::public.asset_register_status);


--
-- Name: idx_arv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arv_status ON public.asset_register_versions USING btree (status);


--
-- Name: idx_assets_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_active ON public.information_assets USING btree (is_active);


--
-- Name: idx_assets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_department ON public.information_assets USING btree (department_id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_log USING btree (action);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_bil_ref_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bil_ref_subcategory ON public.bil_reference_levels USING btree (subcategory_id);


--
-- Name: idx_bil_subcats_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bil_subcats_category ON public.bil_subcategories USING btree (category_id);


--
-- Name: idx_bsa_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsa_asset ON public.business_service_assets USING btree (asset_id);


--
-- Name: idx_bsa_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsa_service ON public.business_service_assets USING btree (service_id);


--
-- Name: idx_ccl_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccl_component ON public.control_component_links USING btree (component_id);


--
-- Name: idx_ccr_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccr_target ON public.control_component_relationships USING btree (target_component_id);


--
-- Name: idx_ccr_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccr_type ON public.control_component_relationships USING btree (relationship_type);


--
-- Name: idx_ccs_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccs_system ON public.control_component_systems USING btree (system_id);


--
-- Name: idx_component_ip_addresses_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_ip_addresses_component ON public.component_ip_addresses USING btree (component_id);


--
-- Name: idx_component_ip_addresses_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_ip_addresses_ip ON public.component_ip_addresses USING gist (ip_address inet_ops);


--
-- Name: idx_components_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_components_status ON public.control_components USING btree (status);


--
-- Name: idx_components_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_components_type ON public.control_components USING btree (component_type);


--
-- Name: idx_control_mappings_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_control_mappings_control ON public.control_mappings USING btree (control_id);


--
-- Name: idx_control_mappings_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_control_mappings_standard ON public.control_mappings USING btree (standard_control_id);


--
-- Name: idx_control_sets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_control_sets_status ON public.control_sets USING btree (status);


--
-- Name: idx_controls_effectiveness; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_controls_effectiveness ON public.controls USING btree (effectiveness) WHERE (effectiveness IS NOT NULL);


--
-- Name: idx_controls_is_baseline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_controls_is_baseline ON public.controls USING btree (is_baseline);


--
-- Name: idx_controls_origin_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_controls_origin_standard ON public.controls USING btree (origin_standard_id);


--
-- Name: idx_controls_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_controls_parent ON public.controls USING btree (parent_control_id);


--
-- Name: idx_controls_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_controls_status ON public.controls USING btree (status);


--
-- Name: idx_csc_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csc_control ON public.control_set_controls USING btree (control_id);


--
-- Name: idx_csc_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csc_set ON public.control_set_controls USING btree (control_set_id);


--
-- Name: idx_ct_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ct_control ON public.control_threats USING btree (control_id);


--
-- Name: idx_ct_threat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ct_threat ON public.control_threats USING btree (threat_id);


--
-- Name: idx_cto_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cto_control ON public.control_technology_objects USING btree (control_id);


--
-- Name: idx_cto_sysobj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cto_sysobj ON public.control_technology_objects USING btree (system_object_id);


--
-- Name: idx_dept_adoptions_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dept_adoptions_dept ON public.department_service_adoptions USING btree (department_id);


--
-- Name: idx_dept_adoptions_svc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dept_adoptions_svc ON public.department_service_adoptions USING btree (service_id);


--
-- Name: idx_dit_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dit_cycle ON public.department_impact_tables USING btree (cycle_id);


--
-- Name: idx_dit_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dit_department ON public.department_impact_tables USING btree (department_id);


--
-- Name: idx_dit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dit_status ON public.department_impact_tables USING btree (status);


--
-- Name: idx_help_content_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_content_locale ON public.help_content USING btree (locale);


--
-- Name: idx_icc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_icc_status ON public.impact_calibration_cycles USING btree (status);


--
-- Name: idx_ild_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ild_table ON public.impact_level_definitions USING btree (table_id);


--
-- Name: idx_impact_tables_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_impact_tables_dept ON public.impact_tables USING btree (department_id);


--
-- Name: idx_iri_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iri_cycle ON public.impact_reconciliation_items USING btree (cycle_id);


--
-- Name: idx_iri_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iri_risk ON public.impact_reconciliation_items USING btree (risk_id);


--
-- Name: idx_iri_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iri_status ON public.impact_reconciliation_items USING btree (resolution);


--
-- Name: idx_itbl_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itbl_table ON public.impact_table_bil_levels USING btree (impact_table_id);


--
-- Name: idx_itcl_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itcl_table ON public.impact_table_cia_levels USING btree (impact_table_id);


--
-- Name: idx_location_objects_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_objects_location ON public.location_objects USING btree (location_id);


--
-- Name: idx_location_objects_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_objects_object ON public.location_objects USING btree (object_id);


--
-- Name: idx_locations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_active ON public.locations USING btree (is_active);


--
-- Name: idx_locations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_department ON public.locations USING btree (department_id);


--
-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_parent ON public.locations USING btree (parent_id);


--
-- Name: idx_magenda_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_magenda_meeting ON public.meeting_agenda_items USING btree (meeting_id);


--
-- Name: idx_magenda_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_magenda_order ON public.meeting_agenda_items USING btree (meeting_id, order_index);


--
-- Name: idx_mattach_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mattach_item ON public.meeting_attachments USING btree (attached_to_agenda_item_id) WHERE (attached_to_agenda_item_id IS NOT NULL);


--
-- Name: idx_mattach_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mattach_meeting ON public.meeting_attachments USING btree (meeting_id);


--
-- Name: idx_mattend_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mattend_meeting ON public.meeting_attendees USING btree (meeting_id);


--
-- Name: idx_mattend_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mattend_user ON public.meeting_attendees USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_objects_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_active ON public.system_objects USING btree (is_active);


--
-- Name: idx_objects_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_parent ON public.system_objects USING btree (parent_id);


--
-- Name: idx_objects_probability_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_probability_score ON public.system_objects USING btree (base_probability_score DESC);


--
-- Name: idx_objects_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_system ON public.system_objects USING btree (system_id);


--
-- Name: idx_objects_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_type ON public.system_objects USING btree (object_type);


--
-- Name: idx_pc_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_control ON public.proposed_changes USING btree (control_id) WHERE (control_id IS NOT NULL);


--
-- Name: idx_people_attrs_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_attrs_group ON public.people_object_attrs USING btree (people_group_id);


--
-- Name: idx_people_groups_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_groups_active ON public.people_groups USING btree (is_active);


--
-- Name: idx_people_groups_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_groups_type ON public.people_groups USING btree (group_type);


--
-- Name: idx_processes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processes_active ON public.processes USING btree (is_active);


--
-- Name: idx_processes_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processes_department ON public.processes USING btree (department_id);


--
-- Name: idx_proposals_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_entity ON public.proposed_changes USING btree (entity_type, entity_id);


--
-- Name: idx_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_status ON public.proposed_changes USING btree (status);


--
-- Name: idx_refresh_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active ON public.refresh_tokens USING btree (token_hash) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_family_id ON public.refresh_tokens USING btree (family_id);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_risk_components_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_components_component ON public.risk_components USING btree (component_id);


--
-- Name: idx_risk_components_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_components_risk ON public.risk_components USING btree (risk_id);


--
-- Name: idx_risk_exceptions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_exceptions_expires ON public.risk_exceptions USING btree (expires_at) WHERE (status = 'active'::public.exception_status);


--
-- Name: idx_risk_exceptions_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_risk_exceptions_one_active ON public.risk_exceptions USING btree (risk_id) WHERE (status = 'active'::public.exception_status);


--
-- Name: idx_risk_exceptions_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_exceptions_risk ON public.risk_exceptions USING btree (risk_id);


--
-- Name: idx_risk_exceptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_exceptions_status ON public.risk_exceptions USING btree (status);


--
-- Name: idx_risks_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_asset ON public.risks USING btree (asset_id);


--
-- Name: idx_risks_impact_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_impact_table ON public.risks USING btree (impact_table_version_id);


--
-- Name: idx_risks_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_score ON public.risks USING btree (risk_score DESC);


--
-- Name: idx_risks_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_system ON public.risks USING btree (system_id);


--
-- Name: idx_risks_threat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_threat ON public.risks USING btree (threat_id);


--
-- Name: idx_risks_validation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_validation_status ON public.risks USING btree (validation_status);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);


--
-- Name: idx_rps_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rps_open ON public.risk_probability_signals USING btree (risk_id) WHERE (status = 'open'::public.signal_status);


--
-- Name: idx_rps_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rps_risk ON public.risk_probability_signals USING btree (risk_id);


--
-- Name: idx_rps_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rps_system ON public.risk_probability_signals USING btree (system_id) WHERE (system_id IS NOT NULL);


--
-- Name: idx_rps_threat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rps_threat ON public.risk_probability_signals USING btree (threat_id) WHERE (threat_id IS NOT NULL);


--
-- Name: idx_rrh_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrh_action ON public.risk_residual_history USING btree (source_action_id) WHERE (source_action_id IS NOT NULL);


--
-- Name: idx_rrh_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrh_risk ON public.risk_residual_history USING btree (risk_id, changed_at DESC);


--
-- Name: idx_rrh_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrh_source ON public.risk_residual_history USING btree (source);


--
-- Name: idx_sa_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sa_owner ON public.security_actions USING btree (primary_owner_user_id);


--
-- Name: idx_sa_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sa_plan ON public.security_actions USING btree (plan_id);


--
-- Name: idx_sa_siro_signoff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sa_siro_signoff ON public.security_actions USING btree (requires_siro_signoff, siro_signoff_by) WHERE ((requires_siro_signoff = true) AND (siro_signoff_by IS NULL));


--
-- Name: idx_sa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sa_status ON public.security_actions USING btree (status);


--
-- Name: idx_sac_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sac_action ON public.security_action_components USING btree (action_id);


--
-- Name: idx_sac_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sac_component ON public.security_action_components USING btree (component_id);


--
-- Name: idx_sap_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sap_cycle ON public.security_action_plans USING btree (cycle_id);


--
-- Name: idx_sap_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sap_status ON public.security_action_plans USING btree (status);


--
-- Name: idx_sar_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sar_action ON public.security_action_risks USING btree (action_id);


--
-- Name: idx_sar_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sar_risk ON public.security_action_risks USING btree (risk_id);


--
-- Name: idx_service_impact_ratings_svc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_impact_ratings_svc ON public.service_impact_ratings USING btree (service_id);


--
-- Name: idx_services_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_department ON public.business_services USING btree (department_id);


--
-- Name: idx_services_shared; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_shared ON public.business_services USING btree (is_shared) WHERE (is_shared = true);


--
-- Name: idx_standard_controls_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standard_controls_standard ON public.standard_controls USING btree (standard_id);


--
-- Name: idx_standards_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standards_active ON public.standards USING btree (is_active);


--
-- Name: idx_system_assets_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_assets_asset ON public.system_assets USING btree (asset_id);


--
-- Name: idx_system_assets_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_assets_system ON public.system_assets USING btree (system_id);


--
-- Name: idx_system_components_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_components_component ON public.system_components USING btree (component_id);


--
-- Name: idx_system_components_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_components_system ON public.system_components USING btree (system_id);


--
-- Name: idx_system_controls_control; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_controls_control ON public.system_controls USING btree (control_id);


--
-- Name: idx_system_controls_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_controls_system ON public.system_controls USING btree (system_id);


--
-- Name: idx_system_threats_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_threats_system ON public.system_threats USING btree (system_id);


--
-- Name: idx_system_threats_threat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_threats_threat ON public.system_threats USING btree (threat_id);


--
-- Name: idx_systems_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_systems_active ON public.systems USING btree (is_active);


--
-- Name: idx_systems_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_systems_department ON public.systems USING btree (department_id);


--
-- Name: idx_tech_attrs_catalogue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_attrs_catalogue ON public.technology_object_attrs USING btree (catalogue_id);


--
-- Name: idx_tech_cat_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_cat_active ON public.technology_catalogue USING btree (is_active);


--
-- Name: idx_tech_cat_eol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_cat_eol ON public.technology_catalogue USING btree (is_end_of_life);


--
-- Name: idx_tech_cat_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_cat_vendor ON public.technology_catalogue USING btree (vendor);


--
-- Name: idx_threat_sets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threat_sets_status ON public.threat_sets USING btree (status);


--
-- Name: idx_threats_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threats_active ON public.threats USING btree (is_active);


--
-- Name: idx_threats_origin_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threats_origin_standard ON public.threats USING btree (origin_standard_id);


--
-- Name: idx_threats_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threats_parent ON public.threats USING btree (parent_threat_id);


--
-- Name: idx_tst_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tst_set ON public.threat_set_threats USING btree (threat_set_id);


--
-- Name: idx_tst_threat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tst_threat ON public.threat_set_threats USING btree (threat_id);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_users_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_department ON public.users USING btree (department_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_wgm_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wgm_date ON public.working_group_meetings USING btree (meeting_date);


--
-- Name: idx_wgm_one_open_per_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_wgm_one_open_per_cycle ON public.working_group_meetings USING btree (linked_cycle_id) WHERE ((closed_at IS NULL) AND (linked_cycle_id IS NOT NULL));


--
-- Name: risks_system_threat_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX risks_system_threat_unique_active ON public.risks USING btree (system_id, threat_id) WHERE (is_active = true);


--
-- Name: threats_name_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX threats_name_unique_active ON public.threats USING btree (name) WHERE (is_active = true);


--
-- Name: uniq_one_active_control_set; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_one_active_control_set ON public.control_sets USING btree ((true)) WHERE (status = 'active'::public.control_set_status);


--
-- Name: uniq_one_active_threat_set; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_one_active_threat_set ON public.threat_sets USING btree ((true)) WHERE (status = 'active'::public.threat_set_status);


--
-- Name: v_security_action_plan_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_security_action_plan_summary AS
 SELECT sap.id AS plan_id,
    rc.name AS cycle_name,
    rc.status AS cycle_status,
    sap.title AS plan_title,
    sap.status AS plan_status,
    sap.frozen_at,
    sap.approved_at,
    count(sa.id) AS total_actions,
    count(sa.id) FILTER (WHERE (sa.status = 'completed'::public.treatment_status)) AS completed_actions,
    count(sa.id) FILTER (WHERE (sa.status = 'in_progress'::public.treatment_status)) AS in_progress_actions,
    count(sa.id) FILTER (WHERE (sa.status = 'planned'::public.treatment_status)) AS planned_actions,
    count(sa.id) FILTER (WHERE (sa.status = 'deferred'::public.treatment_status)) AS deferred_actions,
    count(sa.id) FILTER (WHERE (sa.swg_decision = 'rejected'::public.swg_decision)) AS rejected_actions,
    count(sa.id) FILTER (WHERE ((sa.target_date < CURRENT_DATE) AND (sa.status <> ALL (ARRAY['completed'::public.treatment_status, 'cancelled'::public.treatment_status])))) AS overdue_actions,
    count(sa.id) FILTER (WHERE (sa.requires_siro_signoff = true)) AS siro_signoff_required,
    count(sa.id) FILTER (WHERE ((sa.requires_siro_signoff = true) AND (sa.siro_signoff_by IS NOT NULL))) AS siro_signoff_completed,
    count(sa.id) FILTER (WHERE ((sa.requires_siro_signoff = true) AND (sa.status = 'completed'::public.treatment_status) AND (sa.siro_signoff_by IS NULL))) AS siro_signoff_outstanding,
    u_frozen.full_name AS frozen_by,
    u_approved.full_name AS approved_by
   FROM ((((public.security_action_plans sap
     JOIN public.review_cycles rc ON ((rc.id = sap.cycle_id)))
     LEFT JOIN public.security_actions sa ON ((sa.plan_id = sap.id)))
     LEFT JOIN public.users u_frozen ON ((u_frozen.id = sap.frozen_by)))
     LEFT JOIN public.users u_approved ON ((u_approved.id = sap.approved_by)))
  GROUP BY sap.id, sap.title, sap.status, sap.frozen_at, sap.approved_at, rc.name, rc.status, u_frozen.full_name, u_approved.full_name
  ORDER BY rc.status, sap.created_at DESC;


--
-- Name: object_access_links trg_access_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_access_upd BEFORE UPDATE ON public.object_access_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_data_object_links trg_adol_check_object_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_adol_check_object_type BEFORE INSERT OR UPDATE OF object_id ON public.asset_data_object_links FOR EACH ROW EXECUTE FUNCTION public.trg_fn_check_data_object_type();


--
-- Name: security_actions trg_apply_verified_action_target; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_apply_verified_action_target AFTER UPDATE OF status ON public.security_actions FOR EACH ROW EXECUTE FUNCTION public.apply_verified_action_target();


--
-- Name: asset_register_versions trg_arv_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_arv_upd BEFORE UPDATE ON public.asset_register_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: information_assets trg_asset_cia_cascade; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_cia_cascade AFTER UPDATE OF confidentiality, integrity, availability ON public.information_assets FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cascade_from_asset();


--
-- Name: information_assets trg_assets_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assets_upd BEFORE UPDATE ON public.information_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: control_sets trg_control_sets_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_control_sets_upd BEFORE UPDATE ON public.control_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: controls trg_controls_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_controls_upd BEFORE UPDATE ON public.controls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: review_cycles trg_cycle_create_sap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cycle_create_sap AFTER UPDATE OF status ON public.review_cycles FOR EACH ROW EXECUTE FUNCTION public.trg_fn_create_sap_on_cycle_active();


--
-- Name: review_cycles trg_cycles_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cycles_upd BEFORE UPDATE ON public.review_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: data_object_attrs trg_data_attrs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_data_attrs_upd BEFORE UPDATE ON public.data_object_attrs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: departments trg_departments_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_departments_upd BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: department_impact_tables trg_dit_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dit_upd BEFORE UPDATE ON public.department_impact_tables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: security_actions trg_enforce_target_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_target_locked BEFORE UPDATE ON public.security_actions FOR EACH ROW EXECUTE FUNCTION public.enforce_target_locked();


--
-- Name: facility_object_attrs trg_facility_attrs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_facility_attrs_upd BEFORE UPDATE ON public.facility_object_attrs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: impact_calibration_cycles trg_icc_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_icc_upd BEFORE UPDATE ON public.impact_calibration_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: impact_level_definitions trg_ild_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ild_upd BEFORE UPDATE ON public.impact_level_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: impact_tables trg_impact_tables_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_impact_tables_upd BEFORE UPDATE ON public.impact_tables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: information_assets trg_info_asset_cia_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_info_asset_cia_upd AFTER UPDATE OF confidentiality, integrity, availability ON public.information_assets FOR EACH ROW EXECUTE FUNCTION public.trg_info_asset_cia_change();


--
-- Name: information_assets trg_info_asset_cia_upd_svc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_info_asset_cia_upd_svc AFTER UPDATE OF confidentiality, integrity, availability, is_active ON public.information_assets FOR EACH ROW EXECUTE FUNCTION public.trg_info_asset_cia_change_svc();


--
-- Name: locations trg_locations_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_locations_upd BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: risks trg_log_residual_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_residual_change AFTER UPDATE OF probability_c, probability_i, probability_a, residual_impact_c, residual_impact_i, residual_impact_a ON public.risks FOR EACH ROW EXECUTE FUNCTION public.log_residual_change();


--
-- Name: system_objects trg_objects_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_objects_upd BEFORE UPDATE ON public.system_objects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: onboarding_handover trg_onboarding_handover_revoke_sudo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_onboarding_handover_revoke_sudo AFTER UPDATE ON public.onboarding_handover FOR EACH ROW EXECUTE FUNCTION public.fn_onboarding_handover_revoke_sudo();


--
-- Name: org_config trg_org_config_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_config_upd BEFORE UPDATE ON public.org_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: people_object_attrs trg_people_attrs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_people_attrs_upd BEFORE UPDATE ON public.people_object_attrs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: people_groups trg_people_groups_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_people_groups_upd BEFORE UPDATE ON public.people_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: process_object_attrs trg_process_attrs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_process_attrs_upd BEFORE UPDATE ON public.process_object_attrs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: processes trg_processes_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_processes_upd BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: risks trg_risks_compute_cia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_risks_compute_cia BEFORE INSERT OR UPDATE OF system_id, probability_c, probability_i, probability_a ON public.risks FOR EACH ROW EXECUTE FUNCTION public.trg_fn_compute_cia_scores();


--
-- Name: risks trg_risks_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_risks_upd BEFORE UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: risk_probability_signals trg_rps_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rps_upd BEFORE UPDATE ON public.risk_probability_signals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: security_actions trg_sa_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sa_upd BEFORE UPDATE ON public.security_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: security_action_plans trg_sap_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sap_upd BEFORE UPDATE ON public.security_action_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: business_services trg_services_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_services_upd BEFORE UPDATE ON public.business_services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: standards trg_standards_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_standards_upd BEFORE UPDATE ON public.standards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: business_service_assets trg_svc_info_asset_aiud; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_svc_info_asset_aiud AFTER INSERT OR DELETE OR UPDATE ON public.business_service_assets FOR EACH ROW EXECUTE FUNCTION public.trg_svc_info_asset_change();


--
-- Name: system_assets trg_system_assets_impact_aiud; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_assets_impact_aiud AFTER INSERT OR DELETE OR UPDATE ON public.system_assets FOR EACH ROW EXECUTE FUNCTION public.trg_system_assets_impact();


--
-- Name: system_assets trg_system_assets_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_assets_upd BEFORE UPDATE ON public.system_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: system_objects trg_system_objects_check_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_objects_check_role BEFORE INSERT OR UPDATE OF role_code, object_type ON public.system_objects FOR EACH ROW EXECUTE FUNCTION public.trg_fn_check_system_object_role();


--
-- Name: systems trg_system_probability_signal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_probability_signal AFTER UPDATE OF probability_c, probability_i, probability_a ON public.systems FOR EACH ROW EXECUTE FUNCTION public.trg_fn_system_probability_signal();


--
-- Name: systems trg_systems_cascade_to_risks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_systems_cascade_to_risks AFTER UPDATE OF impact_c, impact_i, impact_a ON public.systems FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cascade_system_cia_to_risks();


--
-- Name: systems trg_systems_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_systems_upd BEFORE UPDATE ON public.systems FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: technology_object_attrs trg_tech_attrs_eol_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tech_attrs_eol_sync BEFORE INSERT OR UPDATE OF catalogue_id ON public.technology_object_attrs FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_eol_from_catalogue();


--
-- Name: technology_object_attrs trg_tech_attrs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tech_attrs_upd BEFORE UPDATE ON public.technology_object_attrs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: technology_catalogue trg_tech_cat_eol; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tech_cat_eol BEFORE INSERT OR UPDATE OF end_of_life_date ON public.technology_catalogue FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tech_cat_eol();


--
-- Name: technology_catalogue trg_tech_cat_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tech_cat_upd BEFORE UPDATE ON public.technology_catalogue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: system_objects trg_technology_nesting; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_technology_nesting BEFORE INSERT OR UPDATE OF parent_id ON public.system_objects FOR EACH ROW EXECUTE FUNCTION public.check_technology_nesting();


--
-- Name: threats trg_threat_probability_signal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_threat_probability_signal AFTER UPDATE OF probability_c, probability_i, probability_a ON public.threats FOR EACH ROW EXECUTE FUNCTION public.trg_fn_threat_probability_signal();


--
-- Name: threat_sets trg_threat_sets_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_threat_sets_upd BEFORE UPDATE ON public.threat_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: threats trg_threats_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_threats_upd BEFORE UPDATE ON public.threats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: risk_treatments trg_treatments_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_treatments_upd BEFORE UPDATE ON public.risk_treatments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_upd BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: working_group_meetings trg_wgm_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wgm_upd BEFORE UPDATE ON public.working_group_meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: risks z_enforce_action_required_threshold; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_enforce_action_required_threshold BEFORE INSERT OR UPDATE OF no_action_required, risk_score ON public.risks FOR EACH ROW EXECUTE FUNCTION public.enforce_action_required_threshold();


--
-- Name: security_actions z_sod_action_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_action_complete BEFORE UPDATE ON public.security_actions FOR EACH ROW EXECUTE FUNCTION public.sod_action_complete();


--
-- Name: security_actions z_sod_action_verify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_action_verify BEFORE UPDATE ON public.security_actions FOR EACH ROW EXECUTE FUNCTION public.sod_action_verify();


--
-- Name: risk_exceptions z_sod_exception_accept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_exception_accept BEFORE INSERT OR UPDATE ON public.risk_exceptions FOR EACH ROW EXECUTE FUNCTION public.sod_exception_accept();


--
-- Name: impact_tables z_sod_impact_table_publish; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_impact_table_publish BEFORE UPDATE ON public.impact_tables FOR EACH ROW EXECUTE FUNCTION public.sod_impact_table_publish();


--
-- Name: risks z_sod_risk_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_risk_validate BEFORE UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION public.sod_risk_validate();


--
-- Name: user_roles z_sod_role_grant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sod_role_grant BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sod_role_grant();


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: api_request_log api_request_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_log
    ADD CONSTRAINT api_request_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_data_object_links asset_data_object_links_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_data_object_links
    ADD CONSTRAINT asset_data_object_links_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.information_assets(id) ON DELETE CASCADE;


--
-- Name: asset_data_object_links asset_data_object_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_data_object_links
    ADD CONSTRAINT asset_data_object_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_data_object_links asset_data_object_links_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_data_object_links
    ADD CONSTRAINT asset_data_object_links_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: asset_impact_ratings asset_impact_ratings_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_impact_ratings
    ADD CONSTRAINT asset_impact_ratings_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.information_assets(id) ON DELETE CASCADE;


--
-- Name: asset_impact_ratings asset_impact_ratings_impact_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_impact_ratings
    ADD CONSTRAINT asset_impact_ratings_impact_table_id_fkey FOREIGN KEY (impact_table_id) REFERENCES public.impact_tables(id) ON DELETE CASCADE;


--
-- Name: asset_impact_ratings asset_impact_ratings_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_impact_ratings
    ADD CONSTRAINT asset_impact_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_register_versions asset_register_versions_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_register_versions asset_register_versions_based_on_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_based_on_version_id_fkey FOREIGN KEY (based_on_version_id) REFERENCES public.asset_register_versions(id) ON DELETE SET NULL;


--
-- Name: asset_register_versions asset_register_versions_ciso_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_ciso_reviewed_by_fkey FOREIGN KEY (ciso_reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_register_versions asset_register_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_register_versions asset_register_versions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_register_versions
    ADD CONSTRAINT asset_register_versions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: audit_log audit_log_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposed_changes(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bil_reference_levels bil_reference_levels_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_reference_levels
    ADD CONSTRAINT bil_reference_levels_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.bil_subcategories(id) ON DELETE CASCADE;


--
-- Name: bil_subcategories bil_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bil_subcategories
    ADD CONSTRAINT bil_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.bil_categories(id) ON DELETE CASCADE;


--
-- Name: business_service_assets business_service_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_assets
    ADD CONSTRAINT business_service_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.information_assets(id) ON DELETE CASCADE;


--
-- Name: business_service_assets business_service_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_assets
    ADD CONSTRAINT business_service_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_service_assets business_service_assets_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_assets
    ADD CONSTRAINT business_service_assets_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.business_services(id) ON DELETE CASCADE;


--
-- Name: business_service_impact_tables business_service_impact_tables_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_impact_tables
    ADD CONSTRAINT business_service_impact_tables_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: business_service_impact_tables business_service_impact_tables_impact_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_impact_tables
    ADD CONSTRAINT business_service_impact_tables_impact_table_id_fkey FOREIGN KEY (impact_table_id) REFERENCES public.impact_tables(id) ON DELETE CASCADE;


--
-- Name: business_service_impact_tables business_service_impact_tables_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_service_impact_tables
    ADD CONSTRAINT business_service_impact_tables_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.business_services(id) ON DELETE CASCADE;


--
-- Name: business_services business_services_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: business_services business_services_managed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_managed_by_user_id_fkey FOREIGN KEY (managed_by_user_id) REFERENCES public.users(id);


--
-- Name: business_services business_services_owner_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_owner_department_id_fkey FOREIGN KEY (owner_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: business_services business_services_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_services
    ADD CONSTRAINT business_services_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: component_ip_addresses component_ip_addresses_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_ip_addresses
    ADD CONSTRAINT component_ip_addresses_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: component_ip_addresses component_ip_addresses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_ip_addresses
    ADD CONSTRAINT component_ip_addresses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: control_component_links control_component_links_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_links
    ADD CONSTRAINT control_component_links_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: control_component_links control_component_links_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_links
    ADD CONSTRAINT control_component_links_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: control_component_links control_component_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_links
    ADD CONSTRAINT control_component_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: control_component_relationships control_component_relationships_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_relationships
    ADD CONSTRAINT control_component_relationships_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: control_component_relationships control_component_relationships_source_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_relationships
    ADD CONSTRAINT control_component_relationships_source_component_id_fkey FOREIGN KEY (source_component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: control_component_relationships control_component_relationships_target_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_relationships
    ADD CONSTRAINT control_component_relationships_target_component_id_fkey FOREIGN KEY (target_component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: control_component_systems control_component_systems_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_systems
    ADD CONSTRAINT control_component_systems_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: control_component_systems control_component_systems_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_systems
    ADD CONSTRAINT control_component_systems_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: control_component_systems control_component_systems_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_component_systems
    ADD CONSTRAINT control_component_systems_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: control_components control_components_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_components
    ADD CONSTRAINT control_components_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: control_components control_components_owner_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_components
    ADD CONSTRAINT control_components_owner_department_id_fkey FOREIGN KEY (owner_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: control_mappings control_mappings_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_mappings
    ADD CONSTRAINT control_mappings_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: control_mappings control_mappings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_mappings
    ADD CONSTRAINT control_mappings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_mappings control_mappings_standard_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_mappings
    ADD CONSTRAINT control_mappings_standard_control_id_fkey FOREIGN KEY (standard_control_id) REFERENCES public.standard_controls(id) ON DELETE CASCADE;


--
-- Name: control_set_controls control_set_controls_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_set_controls
    ADD CONSTRAINT control_set_controls_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_set_controls control_set_controls_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_set_controls
    ADD CONSTRAINT control_set_controls_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE RESTRICT;


--
-- Name: control_set_controls control_set_controls_control_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_set_controls
    ADD CONSTRAINT control_set_controls_control_set_id_fkey FOREIGN KEY (control_set_id) REFERENCES public.control_sets(id) ON DELETE CASCADE;


--
-- Name: control_sets control_sets_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sets
    ADD CONSTRAINT control_sets_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_sets control_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sets
    ADD CONSTRAINT control_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_technology_objects control_technology_objects_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_technology_objects
    ADD CONSTRAINT control_technology_objects_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: control_technology_objects control_technology_objects_linked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_technology_objects
    ADD CONSTRAINT control_technology_objects_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_technology_objects control_technology_objects_system_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_technology_objects
    ADD CONSTRAINT control_technology_objects_system_object_id_fkey FOREIGN KEY (system_object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: control_threats control_threats_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_threats
    ADD CONSTRAINT control_threats_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: control_threats control_threats_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_threats
    ADD CONSTRAINT control_threats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: control_threats control_threats_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_threats
    ADD CONSTRAINT control_threats_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES public.threats(id) ON DELETE CASCADE;


--
-- Name: controls controls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: controls controls_origin_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_origin_standard_id_fkey FOREIGN KEY (origin_standard_id) REFERENCES public.standards(id) ON DELETE SET NULL;


--
-- Name: controls controls_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: controls controls_parent_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_parent_control_id_fkey FOREIGN KEY (parent_control_id) REFERENCES public.controls(id) ON DELETE SET NULL;


--
-- Name: controls controls_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controls
    ADD CONSTRAINT controls_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: data_object_attrs data_object_attrs_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_object_attrs
    ADD CONSTRAINT data_object_attrs_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: department_impact_tables department_impact_tables_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: department_impact_tables department_impact_tables_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.impact_calibration_cycles(id) ON DELETE RESTRICT;


--
-- Name: department_impact_tables department_impact_tables_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: department_impact_tables department_impact_tables_levelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_levelled_by_fkey FOREIGN KEY (levelled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: department_impact_tables department_impact_tables_revision_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_revision_requested_by_fkey FOREIGN KEY (revision_requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: department_impact_tables department_impact_tables_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_impact_tables
    ADD CONSTRAINT department_impact_tables_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: department_service_adoptions department_service_adoptions_adopted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_service_adoptions
    ADD CONSTRAINT department_service_adoptions_adopted_by_fkey FOREIGN KEY (adopted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: department_service_adoptions department_service_adoptions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_service_adoptions
    ADD CONSTRAINT department_service_adoptions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_service_adoptions department_service_adoptions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_service_adoptions
    ADD CONSTRAINT department_service_adoptions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.business_services(id) ON DELETE CASCADE;


--
-- Name: facility_object_attrs facility_object_attrs_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_object_attrs
    ADD CONSTRAINT facility_object_attrs_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: departments fk_dept_owner; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_dept_owner FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_attendees fk_mattend_presenting_item; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT fk_mattend_presenting_item FOREIGN KEY (presenting_agenda_item_id) REFERENCES public.meeting_agenda_items(id) ON DELETE SET NULL NOT VALID;


--
-- Name: risks fk_risks_impact_table; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT fk_risks_impact_table FOREIGN KEY (impact_table_version_id) REFERENCES public.department_impact_tables(id) ON DELETE SET NULL;


--
-- Name: help_content help_content_help_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_content
    ADD CONSTRAINT help_content_help_key_fkey FOREIGN KEY (help_key) REFERENCES public.help_keys(help_key) ON DELETE CASCADE;


--
-- Name: help_content help_content_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_content
    ADD CONSTRAINT help_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_calibration_cycles impact_calibration_cycles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_calibration_cycles
    ADD CONSTRAINT impact_calibration_cycles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_calibration_cycles impact_calibration_cycles_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_calibration_cycles
    ADD CONSTRAINT impact_calibration_cycles_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_level_definitions impact_level_definitions_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_level_definitions
    ADD CONSTRAINT impact_level_definitions_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.department_impact_tables(id) ON DELETE CASCADE;


--
-- Name: impact_reconciliation_items impact_reconciliation_items_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.impact_calibration_cycles(id) ON DELETE RESTRICT;


--
-- Name: impact_reconciliation_items impact_reconciliation_items_new_table_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_new_table_version_id_fkey FOREIGN KEY (new_table_version_id) REFERENCES public.department_impact_tables(id) ON DELETE SET NULL;


--
-- Name: impact_reconciliation_items impact_reconciliation_items_old_table_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_old_table_version_id_fkey FOREIGN KEY (old_table_version_id) REFERENCES public.department_impact_tables(id) ON DELETE SET NULL;


--
-- Name: impact_reconciliation_items impact_reconciliation_items_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_reconciliation_items impact_reconciliation_items_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_reconciliation_items
    ADD CONSTRAINT impact_reconciliation_items_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: impact_table_bil_levels impact_table_bil_levels_impact_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_bil_levels
    ADD CONSTRAINT impact_table_bil_levels_impact_table_id_fkey FOREIGN KEY (impact_table_id) REFERENCES public.impact_tables(id) ON DELETE CASCADE;


--
-- Name: impact_table_bil_levels impact_table_bil_levels_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_bil_levels
    ADD CONSTRAINT impact_table_bil_levels_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_table_cia_levels impact_table_cia_levels_impact_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_cia_levels
    ADD CONSTRAINT impact_table_cia_levels_impact_table_id_fkey FOREIGN KEY (impact_table_id) REFERENCES public.impact_tables(id) ON DELETE CASCADE;


--
-- Name: impact_table_cia_levels impact_table_cia_levels_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_table_cia_levels
    ADD CONSTRAINT impact_table_cia_levels_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_tables impact_tables_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_tables
    ADD CONSTRAINT impact_tables_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: impact_tables impact_tables_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_tables
    ADD CONSTRAINT impact_tables_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: impact_tables impact_tables_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_tables
    ADD CONSTRAINT impact_tables_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: information_assets information_assets_ciso_levelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_ciso_levelled_by_fkey FOREIGN KEY (ciso_levelled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: information_assets information_assets_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: information_assets information_assets_managed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_managed_by_user_id_fkey FOREIGN KEY (managed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: information_assets information_assets_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: information_assets information_assets_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.information_assets
    ADD CONSTRAINT information_assets_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: location_objects location_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_objects
    ADD CONSTRAINT location_objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: location_objects location_objects_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_objects
    ADD CONSTRAINT location_objects_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_objects location_objects_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_objects
    ADD CONSTRAINT location_objects_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: locations locations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: locations locations_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: meeting_agenda_items meeting_agenda_items_decision_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_decision_recorded_by_fkey FOREIGN KEY (decision_recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_agenda_items meeting_agenda_items_discussed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_discussed_by_fkey FOREIGN KEY (discussed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_agenda_items meeting_agenda_items_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.working_group_meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_agenda_items meeting_agenda_items_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_attachments meeting_attachments_attached_to_agenda_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attachments
    ADD CONSTRAINT meeting_attachments_attached_to_agenda_item_id_fkey FOREIGN KEY (attached_to_agenda_item_id) REFERENCES public.meeting_agenda_items(id) ON DELETE SET NULL;


--
-- Name: meeting_attachments meeting_attachments_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attachments
    ADD CONSTRAINT meeting_attachments_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.working_group_meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_attachments meeting_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attachments
    ADD CONSTRAINT meeting_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_attendees meeting_attendees_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.working_group_meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_attendees meeting_attendees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: object_access_links object_access_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_access_links
    ADD CONSTRAINT object_access_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: object_access_links object_access_links_people_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_access_links
    ADD CONSTRAINT object_access_links_people_object_id_fkey FOREIGN KEY (people_object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: object_access_links object_access_links_target_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_access_links
    ADD CONSTRAINT object_access_links_target_object_id_fkey FOREIGN KEY (target_object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: object_access_links object_access_links_target_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_access_links
    ADD CONSTRAINT object_access_links_target_system_id_fkey FOREIGN KEY (target_system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: onboarding_handover onboarding_handover_ciso_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_handover
    ADD CONSTRAINT onboarding_handover_ciso_accepted_by_fkey FOREIGN KEY (ciso_accepted_by) REFERENCES public.users(id);


--
-- Name: onboarding_handover onboarding_handover_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_handover
    ADD CONSTRAINT onboarding_handover_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: onboarding_handover onboarding_handover_siro_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_handover
    ADD CONSTRAINT onboarding_handover_siro_accepted_by_fkey FOREIGN KEY (siro_accepted_by) REFERENCES public.users(id);


--
-- Name: people_groups people_groups_relationship_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_groups
    ADD CONSTRAINT people_groups_relationship_owner_fkey FOREIGN KEY (relationship_owner) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: people_object_attrs people_object_attrs_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_object_attrs
    ADD CONSTRAINT people_object_attrs_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: people_object_attrs people_object_attrs_people_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_object_attrs
    ADD CONSTRAINT people_object_attrs_people_group_id_fkey FOREIGN KEY (people_group_id) REFERENCES public.people_groups(id) ON DELETE SET NULL;


--
-- Name: process_object_attrs process_object_attrs_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_object_attrs
    ADD CONSTRAINT process_object_attrs_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: process_service_links process_service_links_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_service_links
    ADD CONSTRAINT process_service_links_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_service_links process_service_links_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_service_links
    ADD CONSTRAINT process_service_links_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.business_services(id) ON DELETE CASCADE;


--
-- Name: process_system_links process_system_links_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_system_links
    ADD CONSTRAINT process_system_links_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_system_links process_system_links_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_system_links
    ADD CONSTRAINT process_system_links_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: processes processes_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: processes processes_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: proposed_changes proposed_changes_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposed_changes
    ADD CONSTRAINT proposed_changes_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE SET NULL;


--
-- Name: proposed_changes proposed_changes_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposed_changes
    ADD CONSTRAINT proposed_changes_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: proposed_changes proposed_changes_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposed_changes
    ADD CONSTRAINT proposed_changes_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_replaced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.refresh_tokens(id) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: review_cycles review_cycles_analyst_ready_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_cycles
    ADD CONSTRAINT review_cycles_analyst_ready_by_fkey FOREIGN KEY (analyst_ready_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: review_cycles review_cycles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_cycles
    ADD CONSTRAINT review_cycles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: review_cycles review_cycles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_cycles
    ADD CONSTRAINT review_cycles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: review_cycles review_cycles_frozen_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_cycles
    ADD CONSTRAINT review_cycles_frozen_by_fkey FOREIGN KEY (frozen_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_components risk_components_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_components
    ADD CONSTRAINT risk_components_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_components risk_components_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_components
    ADD CONSTRAINT risk_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: risk_components risk_components_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_components
    ADD CONSTRAINT risk_components_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risk_exceptions risk_exceptions_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_exceptions
    ADD CONSTRAINT risk_exceptions_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: risk_exceptions risk_exceptions_last_reviewed_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_exceptions
    ADD CONSTRAINT risk_exceptions_last_reviewed_cycle_id_fkey FOREIGN KEY (last_reviewed_cycle_id) REFERENCES public.review_cycles(id) ON DELETE SET NULL;


--
-- Name: risk_exceptions risk_exceptions_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_exceptions
    ADD CONSTRAINT risk_exceptions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_exceptions risk_exceptions_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_exceptions
    ADD CONSTRAINT risk_exceptions_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risk_probability_signals risk_probability_signals_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_probability_signals
    ADD CONSTRAINT risk_probability_signals_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_probability_signals risk_probability_signals_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_probability_signals
    ADD CONSTRAINT risk_probability_signals_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risk_probability_signals risk_probability_signals_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_probability_signals
    ADD CONSTRAINT risk_probability_signals_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE SET NULL;


--
-- Name: risk_probability_signals risk_probability_signals_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_probability_signals
    ADD CONSTRAINT risk_probability_signals_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES public.threats(id) ON DELETE SET NULL;


--
-- Name: risk_residual_history risk_residual_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_residual_history
    ADD CONSTRAINT risk_residual_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_residual_history risk_residual_history_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_residual_history
    ADD CONSTRAINT risk_residual_history_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risk_residual_history risk_residual_history_source_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_residual_history
    ADD CONSTRAINT risk_residual_history_source_action_id_fkey FOREIGN KEY (source_action_id) REFERENCES public.security_actions(id) ON DELETE SET NULL;


--
-- Name: risk_review_items risk_review_items_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.review_cycles(id) ON DELETE CASCADE;


--
-- Name: risk_review_items risk_review_items_finalised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_finalised_by_fkey FOREIGN KEY (finalised_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_review_items risk_review_items_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_review_items risk_review_items_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_review_items
    ADD CONSTRAINT risk_review_items_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risk_treatments risk_treatments_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_treatments
    ADD CONSTRAINT risk_treatments_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risk_treatments risk_treatments_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_treatments
    ADD CONSTRAINT risk_treatments_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risks risks_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.information_assets(id) ON DELETE SET NULL;


--
-- Name: risks risks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risks risks_identified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_identified_by_fkey FOREIGN KEY (identified_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risks risks_impact_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_impact_adjusted_by_fkey FOREIGN KEY (impact_adjusted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: risks risks_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE RESTRICT;


--
-- Name: risks risks_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES public.threats(id) ON DELETE RESTRICT;


--
-- Name: risks risks_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_capability_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_capability_key_fkey FOREIGN KEY (capability_key) REFERENCES public.capabilities(key) ON DELETE CASCADE;


--
-- Name: security_action_components security_action_components_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_components
    ADD CONSTRAINT security_action_components_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.security_actions(id) ON DELETE CASCADE;


--
-- Name: security_action_components security_action_components_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_components
    ADD CONSTRAINT security_action_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: security_action_controls security_action_controls_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_controls
    ADD CONSTRAINT security_action_controls_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.security_actions(id) ON DELETE CASCADE;


--
-- Name: security_action_controls security_action_controls_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_controls
    ADD CONSTRAINT security_action_controls_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: security_action_plans security_action_plans_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_action_plans security_action_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_action_plans security_action_plans_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.review_cycles(id) ON DELETE RESTRICT;


--
-- Name: security_action_plans security_action_plans_frozen_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_plans
    ADD CONSTRAINT security_action_plans_frozen_by_fkey FOREIGN KEY (frozen_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_action_risks security_action_risks_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_risks
    ADD CONSTRAINT security_action_risks_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.security_actions(id) ON DELETE CASCADE;


--
-- Name: security_action_risks security_action_risks_risk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_action_risks
    ADD CONSTRAINT security_action_risks_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: security_actions security_actions_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_actions security_actions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_actions security_actions_originated_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_originated_cycle_id_fkey FOREIGN KEY (originated_cycle_id) REFERENCES public.review_cycles(id) ON DELETE RESTRICT;


--
-- Name: security_actions security_actions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.security_action_plans(id) ON DELETE RESTRICT;


--
-- Name: security_actions security_actions_primary_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_primary_owner_user_id_fkey FOREIGN KEY (primary_owner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: security_actions security_actions_siro_signoff_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_siro_signoff_by_fkey FOREIGN KEY (siro_signoff_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: security_actions security_actions_target_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_target_cycle_id_fkey FOREIGN KEY (target_cycle_id) REFERENCES public.review_cycles(id) ON DELETE SET NULL;


--
-- Name: security_actions security_actions_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_actions
    ADD CONSTRAINT security_actions_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: service_impact_ratings service_impact_ratings_impact_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings
    ADD CONSTRAINT service_impact_ratings_impact_table_id_fkey FOREIGN KEY (impact_table_id) REFERENCES public.impact_tables(id) ON DELETE CASCADE;


--
-- Name: service_impact_ratings service_impact_ratings_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings
    ADD CONSTRAINT service_impact_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id);


--
-- Name: service_impact_ratings service_impact_ratings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_impact_ratings
    ADD CONSTRAINT service_impact_ratings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.business_services(id) ON DELETE CASCADE;


--
-- Name: soa_entries soa_entries_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_entries
    ADD CONSTRAINT soa_entries_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: soa_entries soa_entries_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_entries
    ADD CONSTRAINT soa_entries_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: soa_entries soa_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_entries
    ADD CONSTRAINT soa_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: soa_versions soa_versions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soa_versions
    ADD CONSTRAINT soa_versions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: standard_controls standard_controls_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_controls
    ADD CONSTRAINT standard_controls_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.standards(id) ON DELETE CASCADE;


--
-- Name: standard_soa_entries standard_soa_entries_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_soa_entries
    ADD CONSTRAINT standard_soa_entries_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: standard_soa_entries standard_soa_entries_standard_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_soa_entries
    ADD CONSTRAINT standard_soa_entries_standard_control_id_fkey FOREIGN KEY (standard_control_id) REFERENCES public.standard_controls(id) ON DELETE CASCADE;


--
-- Name: standard_soa_entries standard_soa_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_soa_entries
    ADD CONSTRAINT standard_soa_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: standards standards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standards
    ADD CONSTRAINT standards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_assets system_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_assets
    ADD CONSTRAINT system_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.information_assets(id) ON DELETE CASCADE;


--
-- Name: system_assets system_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_assets
    ADD CONSTRAINT system_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_assets system_assets_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_assets
    ADD CONSTRAINT system_assets_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: system_components system_components_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_components
    ADD CONSTRAINT system_components_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_components system_components_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_components
    ADD CONSTRAINT system_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.control_components(id) ON DELETE CASCADE;


--
-- Name: system_components system_components_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_components
    ADD CONSTRAINT system_components_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: system_controls system_controls_control_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_controls
    ADD CONSTRAINT system_controls_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE;


--
-- Name: system_controls system_controls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_controls
    ADD CONSTRAINT system_controls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: system_controls system_controls_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_controls
    ADD CONSTRAINT system_controls_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: system_objects system_objects_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_asset_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_asset_ref_id_fkey FOREIGN KEY (asset_ref_id) REFERENCES public.information_assets(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_location_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_location_ref_id_fkey FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.system_objects(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_people_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_people_group_id_fkey FOREIGN KEY (people_group_id) REFERENCES public.people_groups(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_process_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_process_ref_id_fkey FOREIGN KEY (process_ref_id) REFERENCES public.processes(id) ON DELETE SET NULL;


--
-- Name: system_objects system_objects_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_objects
    ADD CONSTRAINT system_objects_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: system_threats system_threats_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_threats
    ADD CONSTRAINT system_threats_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_threats system_threats_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_threats
    ADD CONSTRAINT system_threats_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: system_threats system_threats_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_threats
    ADD CONSTRAINT system_threats_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES public.threats(id) ON DELETE CASCADE;


--
-- Name: systems systems_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: systems systems_managed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_managed_by_user_id_fkey FOREIGN KEY (managed_by_user_id) REFERENCES public.users(id);


--
-- Name: systems systems_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: systems systems_probability_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_probability_set_by_fkey FOREIGN KEY (probability_set_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: technology_catalogue technology_catalogue_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_catalogue
    ADD CONSTRAINT technology_catalogue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: technology_object_attrs technology_object_attrs_catalogue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_object_attrs
    ADD CONSTRAINT technology_object_attrs_catalogue_id_fkey FOREIGN KEY (catalogue_id) REFERENCES public.technology_catalogue(id) ON DELETE SET NULL;


--
-- Name: technology_object_attrs technology_object_attrs_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technology_object_attrs
    ADD CONSTRAINT technology_object_attrs_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.system_objects(id) ON DELETE CASCADE;


--
-- Name: threat_set_threats threat_set_threats_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_set_threats
    ADD CONSTRAINT threat_set_threats_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: threat_set_threats threat_set_threats_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_set_threats
    ADD CONSTRAINT threat_set_threats_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES public.threats(id) ON DELETE RESTRICT;


--
-- Name: threat_set_threats threat_set_threats_threat_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_set_threats
    ADD CONSTRAINT threat_set_threats_threat_set_id_fkey FOREIGN KEY (threat_set_id) REFERENCES public.threat_sets(id) ON DELETE CASCADE;


--
-- Name: threat_sets threat_sets_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_sets
    ADD CONSTRAINT threat_sets_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: threat_sets threat_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_sets
    ADD CONSTRAINT threat_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: threats threats_origin_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threats
    ADD CONSTRAINT threats_origin_standard_id_fkey FOREIGN KEY (origin_standard_id) REFERENCES public.standards(id) ON DELETE SET NULL;


--
-- Name: threats threats_parent_threat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threats
    ADD CONSTRAINT threats_parent_threat_id_fkey FOREIGN KEY (parent_threat_id) REFERENCES public.threats(id) ON DELETE SET NULL;


--
-- Name: threats threats_probability_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threats
    ADD CONSTRAINT threats_probability_set_by_fkey FOREIGN KEY (probability_set_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_chaired_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_chaired_by_fkey FOREIGN KEY (chaired_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_linked_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_linked_cycle_id_fkey FOREIGN KEY (linked_cycle_id) REFERENCES public.review_cycles(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_minutes_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_minutes_issued_by_fkey FOREIGN KEY (minutes_issued_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_planned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_planned_by_fkey FOREIGN KEY (planned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: working_group_meetings working_group_meetings_secretary_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_group_meetings
    ADD CONSTRAINT working_group_meetings_secretary_user_id_fkey FOREIGN KEY (secretary_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


