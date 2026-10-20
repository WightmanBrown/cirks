-- SPDX-License-Identifier: Apache-2.0
-- Copyright (C) 2026 Wightman Brown Limited
-- =============================================================================
-- Deterministic E2E seed for riskapp_test.
-- Idempotent: truncates the churn tables then re-inserts curated fixtures with
-- FIXED UUIDs that the Playwright specs reference by constant
-- (see e2e/support/fixtures.js). Run via test/e2e/db/reset.mjs.
--
-- All users share password "Riskapp123" (bcrypt hash below, lifted from dev).
-- Trigger-computed columns on risks (risk_c/i/a, risk_score) are
-- intentionally omitted from INSERTs — trg_risks_compute_cia BEFORE INSERT sets
-- them from the linked system's impact + the risk's probability.
-- =============================================================================

BEGIN;

-- ── Reset ────────────────────────────────────────────────────────────────────
-- Dedicated test DB, so truncating broadly is safe. CASCADE clears junctions,
-- agenda items, attendees, audit rows, residual history, etc.
TRUNCATE
  org_config, departments, users, threats, systems, controls,
  risks, security_actions, security_action_risks, security_action_items,
  control_threats,
  exceptions, review_cycles, working_group_meetings,
  meeting_agenda_items, meeting_attendees,
  audit_log, refresh_tokens, risk_residual_history,
  capabilities, role_permissions, sod_rules
RESTART IDENTITY CASCADE;

-- ── org_config singleton ──────────────────────────────────────────────────────
INSERT INTO org_config (id, org_name, mandatory_action_score, setup_phase_active)
VALUES (true, 'E2E Test Org', 12, false);

-- ── departments ────────────────────────────────────────────────────────────────
INSERT INTO departments (id, name, description) VALUES
  ('22222222-0000-0000-0000-000000000001', 'IT', 'Information Technology');

-- ── users (one per role; password = Riskapp123) ─────────────────────────────────
INSERT INTO users (id, email, full_name, password_hash, role, department_id) VALUES
  ('11111111-0000-0000-0000-000000000001', 'admin@org.local',              'William Hodges',            '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'admin',                     '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002', 'ciso@org.local',               'Captain George Mainwaring', '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'ciso',                      '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000003', 'risk.analyst@org.local',       'Sergeant Arthur Wilson',    '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'risk_analyst',              '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000004', 'iam.it@org.local',             'Private Cheeseman',         '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'information_asset_manager', '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000005', 'business.user.it@org.local',   'Private Frank Pike',        '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'information_asset_owner',   '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000006', 'security.consultant@org.local','Private James Frazer',      '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'security_consultant',       '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000007', 'siro@org.local',               'Reverend Timothy Farthing', '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'siro',                      '22222222-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000008', 'meeting.secretary@org.local',  'Maurice Yeatman',           '$2b$12$RxbxTqpUGq4hbAR9fIyqiO7zILYYVkgfDSNY.42cGLzP93v0d6rwS', 'meeting_secretary',         '22222222-0000-0000-0000-000000000001');

-- Department head = the business user (accountable risk owner), per the ownership model.
UPDATE departments SET owner_user_id = '11111111-0000-0000-0000-000000000005'
WHERE id = '22222222-0000-0000-0000-000000000001';

-- ── threats ──────────────────────────────────────────────────────────────────
INSERT INTO threats (id, name, description, threat_category, source, probability_c, probability_i, probability_a) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Unpatched Software Exploit', 'Exploitation of known unpatched vulnerabilities', 'deliberate', 'external', 4, 4, 4),
  ('33333333-0000-0000-0000-000000000002', 'Phishing Attack',            'Credential theft via social engineering',         'deliberate', 'external', 3, 3, 2);

-- ── systems (impact_c/i/a set directly; drives risk scoring) ────────────────────
INSERT INTO systems (id, name, description, department_id, owner_user_id, probability_c, probability_i, probability_a, impact_c, impact_i, impact_a, impact_set_at) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Active Directory', 'Core identity service', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 3, 3, 3, 5, 4, 2, now()),
  ('44444444-0000-0000-0000-000000000002', 'HR System',        'HR records platform',    '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 3, 3, 3, 5, 4, 3, now());

-- ── information assets ─────────────────────────────────────────────────────────
-- One IT asset, managed by the IAM, exposed via the Active Directory system.
-- CIA set to (5,4,2) to match AD's manual impact so the system-impact recompute
-- trigger is a no-op and seeded risk scores are unaffected.
-- owner_user_id = the IAO (dept head); managed_by_user_id = the IAM (custodian).
INSERT INTO information_assets (id, name, description, department_id, confidentiality, integrity, availability, owner_user_id, managed_by_user_id) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'Active Directory Identity Store', 'Domain accounts, group membership and authentication data', '22222222-0000-0000-0000-000000000001', 5, 4, 2, '11111111-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000004');

INSERT INTO system_assets (system_id, asset_id, created_by) VALUES
  ('44444444-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004');

-- ── controls (CIRKS-native catalogue — no framework; standards mapped below) ──────
-- No status column: an objective's status is derived from its SoA entry and rating (v124).
INSERT INTO controls (id, title, description, control_type, created_by) VALUES
  ('55555555-0000-0000-0000-000000000001', 'MFA Enforcement',  'Multi-factor authentication on all privileged accounts', 'preventive', '11111111-0000-0000-0000-000000000003'),
  ('55555555-0000-0000-0000-000000000002', 'Patch Management', 'Timely OS and application patching',                      'corrective', '11111111-0000-0000-0000-000000000003');

-- ── standards registry + reference catalogues + mappings (v87) ────────────────────
INSERT INTO standards (code, name, version, publisher, is_active, is_enabled, license, sort_index, bundled) VALUES
  ('iso27001',    'ISO/IEC 27001',                  '2022',  'ISO',  TRUE, TRUE, 'Copyrighted (ISO) — paraphrased; reference only', 1, TRUE),
  ('cis_v8',      'CIS Critical Security Controls', 'v8',    'CIS',  TRUE, TRUE, 'CC BY-NC-SA 4.0 — import your own copy',          2, FALSE),
  ('nist_csf',    'NIST Cybersecurity Framework',   '2.0',   'NIST', TRUE, TRUE, 'Public domain (US Government work)',              3, TRUE),
  ('nist_800_53', 'NIST SP 800-53',                 'Rev 5', 'NIST', TRUE, TRUE, 'Public domain (US Government work)',              4, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO standard_controls (id, standard_id, ref_code, title, description, grouping, sort_index) VALUES
  ('5c000000-0000-0000-0000-000000000001', (SELECT id FROM standards WHERE code='iso27001'), 'REF.1', 'Secure authentication',      'Authentication controls incl. MFA', 'Technological', '008.005.000'),
  ('5c000000-0000-0000-0000-000000000002', (SELECT id FROM standards WHERE code='cis_v8'),   '7.3',   'Automated patch management', 'Timely patching',                   'CIS Control 7', '007.003.000');

INSERT INTO control_mappings (control_id, standard_control_id, coverage) VALUES
  ('55555555-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'full'),
  ('55555555-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', 'full');

-- The SoA is recorded against the CONTROL (v122); the ISO requirement REF.1 reads
-- as covered + implemented through its mapping to MFA Enforcement.
INSERT INTO soa_entries (control_id, applicable, implementation_status) VALUES
  ('55555555-0000-0000-0000-000000000001', TRUE, 'implemented');

-- ── risks ────────────────────────────────────────────────────────────────────
-- Unique (system, threat) WHERE is_active, so each risk uses a distinct pair.
-- Risk ownership is DERIVED from the system's department (v108) — there is no
-- owner column to seed. Frazer (...005) is the IAO for these departments, so he
-- is the accountable owner of these risks by derivation.
-- owner is information_asset_owner so CISO/SIRO can verify (SoD).
--
-- risk-01: PENDING (CISO validation flow). High/critical → mandatory action.
INSERT INTO risks (id, threat_id, system_id, probability_c, probability_i, probability_a, rationale, validation_status, identified_by) VALUES
  ('66666666-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 4, 3, 4, 'AD exposed to unpatched exploit — pending review', 'pending', '11111111-0000-0000-0000-000000000003');

-- risk-02: VALIDATED, treatment = mitigate (hosts in_progress + completed actions).
INSERT INTO risks (id, threat_id, system_id, probability_c, probability_i, probability_a, rationale, validation_status, validated_by, validated_at, treatment_decision, identified_by) VALUES
  ('66666666-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 3, 3, 2, 'AD phishing exposure', 'validated', '11111111-0000-0000-0000-000000000002', now(), 'mitigate', '11111111-0000-0000-0000-000000000003');

-- risk-03: VALIDATED, treatment = mitigate (hosts the proposed + planned + cancelled actions).
INSERT INTO risks (id, threat_id, system_id, probability_c, probability_i, probability_a, rationale, validation_status, validated_by, validated_at, treatment_decision, identified_by) VALUES
  ('66666666-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 4, 4, 3, 'HR system unpatched exploit exposure', 'validated', '11111111-0000-0000-0000-000000000002', now(), 'mitigate', '11111111-0000-0000-0000-000000000003');

-- risk-04: VALIDATED, treatment = accept (low score so acceptance is allowed). Hosts the active exception.
INSERT INTO risks (id, threat_id, system_id, probability_c, probability_i, probability_a, rationale, validation_status, validated_by, validated_at, treatment_decision, identified_by) VALUES
  ('66666666-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 2, 2, 2, 'HR phishing residual — accepted with review', 'validated', '11111111-0000-0000-0000-000000000002', now(), 'accept', '11111111-0000-0000-0000-000000000003');

-- ── control ↔ threat catalogue ─────────────────────────────────────────────────
-- A risk's mitigating controls are derived as system_controls ∩ control_threats,
-- and the coverage GAP (which drives action items) is the threat's controls that
-- are not operational on the system. Without these links the gap is empty and
-- there is nothing to build an action from.
INSERT INTO control_threats (control_id, threat_id, created_by) VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003');

-- ── security_actions (one per lifecycle state) ──────────────────────────────────
-- treatment_type stays 'mitigate' throughout: a gap-driven action only ever adds
-- or improves a control/component, so the verb is implicit.
-- Gap-driven model (v96/v97): an action is a CONTAINER OF ITEMS. Scope lives in
-- security_action_items (element x system), not the retired link tables, and the
-- lifecycle is proposed -> planned (CISO accept, stamping accepted_at/by +
-- security_action_risks.baseline_*) -> in_progress -> completed. There is no
-- 'verified' state: an action completes when its last item does.

-- proposed — the acceptance queue's subject. accepted_at NULL so accept can stamp it.
INSERT INTO security_actions (subject_type, origin, id, title, description, treatment_type, primary_owner_user_id, status, created_by) VALUES
  ('risk', 'risk_treatment', '77777777-0000-0000-0000-000000000001', 'Roll out MFA to HR system', 'Enforce MFA for all HR system access', 'mitigate', '11111111-0000-0000-0000-000000000003', 'proposed', '11111111-0000-0000-0000-000000000003');

-- planned (accepted, no item completed yet)
INSERT INTO security_actions (subject_type, origin, id, title, description, treatment_type, primary_owner_user_id, status, accepted_at, accepted_by, created_by) VALUES
  ('risk', 'risk_treatment', '77777777-0000-0000-0000-000000000002', 'Patch AD servers', 'Apply latest security patches to AD', 'mitigate', '11111111-0000-0000-0000-000000000005', 'planned', now(), '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003');

-- in_progress (accepted, some items done)
INSERT INTO security_actions (subject_type, origin, id, title, description, treatment_type, primary_owner_user_id, status, accepted_at, accepted_by, created_by) VALUES
  ('risk', 'risk_treatment', '77777777-0000-0000-0000-000000000003', 'Phishing awareness training', 'Quarterly anti-phishing training rollout', 'mitigate', '11111111-0000-0000-0000-000000000004', 'in_progress', now(), '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003');

-- Progress is an append-only note stream since 0116, not a column on the action.
INSERT INTO security_action_notes (action_id, item_id, author_user_id, note) VALUES
  ('77777777-0000-0000-0000-000000000003', NULL, '11111111-0000-0000-0000-000000000004', 'Module 1 delivered');

-- completed — terminal, and therefore ARCHIVED in the actions list (v97: with the
-- verify step gone, 'completed' is the end of the line, not a staging post).
INSERT INTO security_actions (subject_type, origin, id, title, description, treatment_type, primary_owner_user_id, status, accepted_at, accepted_by, completed_at, completed_by, created_by) VALUES
  ('risk', 'risk_treatment', '77777777-0000-0000-0000-000000000004', 'Email filtering upgrade', 'Deploy advanced email threat filtering', 'mitigate', '11111111-0000-0000-0000-000000000005', 'completed', now(), '11111111-0000-0000-0000-000000000002', now(), '11111111-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003');

-- cancelled — the other archived state, so the archive/active partition has two members.
INSERT INTO security_actions (subject_type, origin, id, title, description, treatment_type, primary_owner_user_id, status, created_by) VALUES
  ('risk', 'risk_treatment', '77777777-0000-0000-0000-000000000005', 'Network segmentation', 'Segment HR system onto isolated VLAN', 'mitigate', '11111111-0000-0000-0000-000000000005', 'cancelled', '11111111-0000-0000-0000-000000000003');

-- ── action ↔ risk links ─────────────────────────────────────────────────────────
-- baseline_* is the accept snapshot; only the accepted actions carry one.
INSERT INTO security_action_risks (action_id, risk_id) VALUES
  ('77777777-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000003'),
  ('77777777-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002'),
  ('77777777-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000003');

INSERT INTO security_action_risks (action_id, risk_id, baseline_risk_c, baseline_risk_i, baseline_risk_a, baseline_risk_score) VALUES
  ('77777777-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000003', 20, 16, 9, 20),
  ('77777777-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000002', 15, 12, 9, 15);

-- ── action items (the action's scope) ───────────────────────────────────────────
-- Control items carry a target probability; component items are status-only.
INSERT INTO security_action_items (id, action_id, system_id, element_type, control_id, change_kind, owner_user_id, target_p_c, target_p_i, target_p_a, status, comment) VALUES
  ('7a000000-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'control', '55555555-0000-0000-0000-000000000001', 'control_add',     '11111111-0000-0000-0000-000000000004', 2, 2, 2, 'pending',   'MFA not deployed on the HR system'),
  ('7a000000-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'control', '55555555-0000-0000-0000-000000000002', 'control_improve', '11111111-0000-0000-0000-000000000004', 2, 2, 2, 'pending',   'Patch cadence behind on AD'),
  ('7a000000-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'control', '55555555-0000-0000-0000-000000000001', 'control_improve', '11111111-0000-0000-0000-000000000004', 3, 3, 3, 'pending',   'Second item still open — keeps the action in_progress');

INSERT INTO security_action_items (id, action_id, system_id, element_type, control_id, change_kind, owner_user_id, target_p_c, target_p_i, target_p_a, status, completed_by, completed_at, comment) VALUES
  ('7a000000-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'control', '55555555-0000-0000-0000-000000000002', 'control_improve', '11111111-0000-0000-0000-000000000004', 2, 2, 2, 'completed', '11111111-0000-0000-0000-000000000002', now(), 'Delivered — flipped operational'),
  ('7a000000-0000-0000-0000-000000000005', '77777777-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000002', 'control', '55555555-0000-0000-0000-000000000002', 'control_add',     '11111111-0000-0000-0000-000000000004', 1, 1, 1, 'completed', '11111111-0000-0000-0000-000000000002', now(), 'Every item done — action completed');

-- ── risk exception (active acceptance on risk-04) ───────────────────────────────
INSERT INTO exceptions (subject_type, origin, id, risk_id, justification, accepted_by, accepted_role, expires_at, review_cadence, status) VALUES
  ('risk', 'risk_treatment', 'cccccccc-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000004', 'Residual phishing risk accepted pending budget cycle', '11111111-0000-0000-0000-000000000002', 'ciso', '2026-12-31', 'quarterly', 'active');

-- ── review cycles ────────────────────────────────────────────────────────────────
-- draft → available for the secretary "plan a meeting" flow.
-- Cycle windows are relative for the same reason as the meeting dates: the draft
-- cycle has to still be open around "today" for the plan-meeting flow to use it.
INSERT INTO review_cycles (id, name, description, status, start_date, end_date, created_by) VALUES
  ('88888888-0000-0000-0000-000000000001', 'E2E Draft Cycle',  'Draft cycle for plan-meeting flow', 'draft',  CURRENT_DATE - 90, CURRENT_DATE + 90, '11111111-0000-0000-0000-000000000002'),
  ('88888888-0000-0000-0000-000000000002', 'E2E Active Cycle', 'Active cycle with an open meeting', 'active', CURRENT_DATE - 90, CURRENT_DATE + 90, '11111111-0000-0000-0000-000000000002'),
  ('88888888-0000-0000-0000-000000000003', 'E2E Minutes Cycle','Cycle with a closed meeting awaiting minutes', 'active', CURRENT_DATE - 120, CURRENT_DATE - 30, '11111111-0000-0000-0000-000000000002');

-- ── working group meetings ───────────────────────────────────────────────────────
-- meeting-01: PLANNED + OPEN, linked to active cycle (pack view + kiosk tests).
INSERT INTO working_group_meetings (id, meeting_date, chaired_by, secretary_user_id, linked_cycle_id, planned_at, planned_by, quorate, section_timeboxes) VALUES
  ('99999999-0000-0000-0000-000000000001', CURRENT_DATE + 30, '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000002', now(), '11111111-0000-0000-0000-000000000008', true, '{}'::jsonb);

-- Meeting dates are RELATIVE to CURRENT_DATE, not literals: the "next meeting"
-- must stay in the future or GET /meetings/swg-summary returns no next_meeting
-- and the summary/iCal specs fail. Hardcoded 2026 dates silently expired once
-- the calendar caught up with them.
-- meeting-02: PLANNED + CLOSED, minutes not issued (issue-minutes test).
INSERT INTO working_group_meetings (id, meeting_date, chaired_by, secretary_user_id, linked_cycle_id, planned_at, planned_by, closed_at, closed_by, minutes_body, quorate, section_timeboxes) VALUES
  ('99999999-0000-0000-0000-000000000002', CURRENT_DATE - 30, '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000003', now(), '11111111-0000-0000-0000-000000000008', now(), '11111111-0000-0000-0000-000000000008', 'Draft minutes pending issue.', true, '{}'::jsonb);

-- meeting-03: MINUTES ISSUED (sealed) — gives the SWG summary widget its "latest minutes".
INSERT INTO working_group_meetings (id, meeting_date, chaired_by, secretary_user_id, linked_cycle_id, planned_at, planned_by, closed_at, closed_by, minutes_issued_at, minutes_issued_by, minutes_body, quorate, section_timeboxes) VALUES
  ('99999999-0000-0000-0000-000000000003', CURRENT_DATE - 60, '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000008', NULL, now(), '11111111-0000-0000-0000-000000000008', now(), '11111111-0000-0000-0000-000000000008', now(), '11111111-0000-0000-0000-000000000008',
   'SWG minutes — sealed record

1. Risk validation: AD unpatched exploit risk confirmed; treatment remains mitigate.
2. Action adoption: MFA rollout approved; owner and target date confirmed.
3. Verification: network segmentation accepted as complete.
4. AOB: none.

Next meeting scheduled for 15 June 2026.', true, '{}'::jsonb);

-- ── agenda items for meeting-01 ────────────────────────────────────────────────────
INSERT INTO meeting_agenda_items (id, meeting_id, source, category, entity_type, entity_id, title, order_index) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'auto', 'risk_validation', 'risk',            '66666666-0000-0000-0000-000000000001', 'Validate: AD unpatched exploit',  1),
  ('aaaaaaaa-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', 'auto', 'action_adoption',  'security_action', '77777777-0000-0000-0000-000000000001', 'Adopt: Roll out MFA to HR system', 2),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', 'auto', 'verification',     'security_action', '77777777-0000-0000-0000-000000000004', 'Verify: Email filtering upgrade', 3),
  ('aaaaaaaa-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000001', 'auto', 'exceptions',       'risk_exception',  'cccccccc-0000-0000-0000-000000000001', 'Review exception: HR phishing acceptance', 4);

-- ── attendees for meeting-01 ──────────────────────────────────────────────────────
INSERT INTO meeting_attendees (id, meeting_id, user_id, role_at_meeting, present) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'chair',  true),
  ('bbbbbbbb-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'member', true),
  ('bbbbbbbb-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000007', 'member', false);

-- ── agenda items for meeting-02 (closed, awaiting minutes) ──────────────────────────
-- Three items with decisions already recorded — so the closed meeting reads
-- realistically and the minutes editor's "Auto-fill from decisions" has content.
-- Decisions recorded by the chair (CISO). The exercise is to issue the minutes.
INSERT INTO meeting_agenda_items
  (id, meeting_id, source, category, entity_type, entity_id, title, order_index,
   discussed_at, discussed_by, decision_text, decision_recorded_at, decision_recorded_by) VALUES
  ('dddddddd-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000002', 'auto', 'risk_validation', 'risk',            '66666666-0000-0000-0000-000000000001', 'Validate: AD unpatched exploit', 1,
   now(), '11111111-0000-0000-0000-000000000002', 'Risk rating confirmed by the group; treatment remains mitigate with no change to residual targets.', now(), '11111111-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000002', 'auto', 'action_adoption',  'security_action', '77777777-0000-0000-0000-000000000002', 'Adopt: Patch AD servers', 2,
   now(), '11111111-0000-0000-0000-000000000002', 'Action adopted by the SWG; owner and target date confirmed.', now(), '11111111-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000002', 'auto', 'action_progress',  'security_action', '77777777-0000-0000-0000-000000000004', 'Progress: Email filtering upgrade', 3,
   now(), '11111111-0000-0000-0000-000000000002', 'All remediation items delivered; the action is complete and the controls are operational.', now(), '11111111-0000-0000-0000-000000000002');

-- ── attendees for meeting-02 (all present — the meeting happened) ────────────────────
INSERT INTO meeting_attendees (id, meeting_id, user_id, role_at_meeting, present) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'chair',     true),
  ('eeeeeeee-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000008', 'secretary', true),
  ('eeeeeeee-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'member',    true),
  ('eeeeeeee-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000007', 'member',    true);

COMMIT;

-- ── Configurable RBAC catalogue + grants (v63; reproduces current behaviour) ──
-- Source of truth: schema/v63_rbac_capabilities.sql. Regenerate via pg_dump if v63 changes.
INSERT INTO public.capabilities VALUES ('assets.read', 'assets', 'read', true, 'View information assets');
INSERT INTO public.capabilities VALUES ('assets.write', 'assets', 'write', true, 'Create/edit assets, ratings and links');
INSERT INTO public.capabilities VALUES ('assets.delete', 'assets', 'delete', true, 'Delete information assets');
INSERT INTO public.capabilities VALUES ('services.read', 'services', 'read', true, 'View business services');
INSERT INTO public.capabilities VALUES ('services.write', 'services', 'write', true, 'Create/edit services and links');
INSERT INTO public.capabilities VALUES ('services.delete', 'services', 'delete', true, 'Delete business services');
INSERT INTO public.capabilities VALUES ('services.adopt', 'services', 'adopt', true, 'Adopt/un-adopt a shared service');
INSERT INTO public.capabilities VALUES ('services.transfer', 'services', 'transfer', false, 'Transfer service ownership');
INSERT INTO public.capabilities VALUES ('systems.read', 'systems', 'read', true, 'View systems');
INSERT INTO public.capabilities VALUES ('systems.write', 'systems', 'write', true, 'Create/edit systems and links');
INSERT INTO public.capabilities VALUES ('systems.delete', 'systems', 'delete', true, 'Delete systems');
INSERT INTO public.capabilities VALUES ('components.read', 'components', 'read', false, 'View PPITF component library');
INSERT INTO public.capabilities VALUES ('components.write', 'components', 'write', false, 'Create/edit components and relationships');
INSERT INTO public.capabilities VALUES ('controls.read', 'controls', 'read', false, 'View control catalogue');
INSERT INTO public.capabilities VALUES ('controls.write', 'controls', 'write', false, 'Create/edit controls and linkages');
INSERT INTO public.capabilities VALUES ('architecture.write', 'architecture', 'write', false, 'Edit the systems architecture template (which components answer each group) and the system architecture patterns');
INSERT INTO public.capabilities VALUES ('controls.import', 'controls', 'import', false, 'Bulk-import controls');
INSERT INTO public.capabilities VALUES ('scopes.manage', 'scopes', 'manage', false, 'Create scopes and decide which systems are in them');
INSERT INTO public.capabilities VALUES ('findings.act', 'findings', 'act', true, 'Raise a security action against an assurance finding (own department for IAM/IAO)');
INSERT INTO public.capabilities VALUES ('findings.read', 'findings', 'read', true, 'View derived assurance findings (own department for IAM/IAO)');
INSERT INTO public.capabilities VALUES ('suppliers.read', 'suppliers', 'read', true, 'View suppliers and the relationships with them');
INSERT INTO public.capabilities VALUES ('suppliers.write', 'suppliers', 'write', true, 'Record suppliers and relationships (own department for IAM/IAO)');
INSERT INTO public.capabilities VALUES ('threats.read', 'threats', 'read', false, 'View threat catalogue');
INSERT INTO public.capabilities VALUES ('threats.write', 'threats', 'write', false, 'Create/edit threats');
INSERT INTO public.capabilities VALUES ('bil.read', 'bil', 'read', false, 'View BIL reference + impact tables');
INSERT INTO public.capabilities VALUES ('bil.write', 'bil', 'write', true, 'Create/edit impact tables and levels');
INSERT INTO public.capabilities VALUES ('bil.publish', 'bil', 'publish', true, 'Publish an impact table (scope enforced in controller)');
INSERT INTO public.capabilities VALUES ('bil.mandatory', 'bil', 'mandatory', false, 'Flag an impact table mandatory');
INSERT INTO public.capabilities VALUES ('graph.read', 'graph', 'read', false, 'View control/system graphs');
INSERT INTO public.capabilities VALUES ('knowledge.enrich', 'knowledge', 'enrich', false, 'Resolve an IP or hostname to the systems it belongs to');
INSERT INTO public.capabilities VALUES ('knowledge.query', 'knowledge', 'query', false, 'Look up a host/IP to its system(s) and their risk/impact (SOC enrichment)');
INSERT INTO public.capabilities VALUES ('risks.read', 'risks', 'read', true, 'View risks');
INSERT INTO public.capabilities VALUES ('risks.write', 'risks', 'write', true, 'Create/edit risks, treatment, links');
INSERT INTO public.capabilities VALUES ('risks.delete', 'risks', 'delete', true, 'Delete risks');
INSERT INTO public.capabilities VALUES ('risks.validate', 'risks', 'validate', true, 'Validate/return a risk (CISO governance)');
INSERT INTO public.capabilities VALUES ('governance.review', 'governance', 'review', false, 'CISO governance queues (pending, SAP)');
INSERT INTO public.capabilities VALUES ('siro.review', 'siro', 'review', false, 'SIRO review (cycles, actions, org tables)');
INSERT INTO public.capabilities VALUES ('probability_signals.read', 'operations', 'read', false, 'View probability signals');
INSERT INTO public.capabilities VALUES ('risk_trends.read', 'operations', 'read', true, 'View own risk trends');
INSERT INTO public.capabilities VALUES ('risk_heatmap.read', 'operations', 'read', true, 'View the risk heatmap (controller-scoped)');
INSERT INTO public.capabilities VALUES ('actions.read', 'actions', 'read', true, 'View action queues/stats');
INSERT INTO public.capabilities VALUES ('actions.adopt_queue', 'actions', 'read', false, 'View the proposed-action acceptance queue');
INSERT INTO public.capabilities VALUES ('actions.org_view', 'actions', 'read', false, 'View org-wide in-progress actions');
INSERT INTO public.capabilities VALUES ('actions.progress', 'actions', 'write', false, 'Update action progress notes');
INSERT INTO public.capabilities VALUES ('actions.write', 'actions', 'write', true, 'Build actions from the gap and edit their items');
INSERT INTO public.capabilities VALUES ('actions.adopt', 'actions', 'adopt', true, 'Accept a proposed action (SWG)');
INSERT INTO public.capabilities VALUES ('actions.complete', 'actions', 'complete', true, 'Mark an action complete');
INSERT INTO public.capabilities VALUES ('exceptions.read', 'exceptions', 'read', true, 'View risk exceptions');
INSERT INTO public.capabilities VALUES ('exceptions.accept', 'exceptions', 'accept', true, 'Accept/renew a risk exception');
INSERT INTO public.capabilities VALUES ('exceptions.revoke', 'exceptions', 'revoke', true, 'Revoke a risk exception');
INSERT INTO public.capabilities VALUES ('meetings.read', 'meetings', 'read', false, 'View meetings list/detail');
INSERT INTO public.capabilities VALUES ('meetings.read_pack', 'meetings', 'read', false, 'View meeting pack/agenda/attachments');
INSERT INTO public.capabilities VALUES ('meetings.write', 'meetings', 'write', false, 'Plan/edit/close meetings, agenda, minutes');
INSERT INTO public.capabilities VALUES ('meetings.issue', 'meetings', 'issue', false, 'Issue meeting minutes');
INSERT INTO public.capabilities VALUES ('meetings.attendees', 'meetings', 'attendees', false, 'Manage meeting attendees');
INSERT INTO public.capabilities VALUES ('meetings.decide', 'meetings', 'decide', false, 'Record agenda-item decisions');
INSERT INTO public.capabilities VALUES ('departments.write', 'departments', 'write', false, 'Create/edit/delete departments');
INSERT INTO public.capabilities VALUES ('users.read', 'users', 'read', false, 'List users');
INSERT INTO public.capabilities VALUES ('admin.manage', 'admin', 'manage', false, 'Administer users/roles/setup');
INSERT INTO public.role_permissions VALUES ('admin', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'assets.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'assets.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'assets.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'assets.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'assets.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'assets.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'assets.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'assets.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'services.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'services.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'services.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'services.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'services.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'services.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'services.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'services.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'services.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'services.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'services.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'services.adopt', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'services.adopt', 'own_dept');
INSERT INTO public.role_permissions VALUES ('ciso', 'services.adopt', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'services.adopt', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'services.transfer', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'services.transfer', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'systems.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'systems.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'systems.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'systems.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'systems.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'systems.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'systems.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'systems.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'systems.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'components.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'components.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'components.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'components.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'controls.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'architecture.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'architecture.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'architecture.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'controls.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'controls.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'controls.import', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'scopes.manage', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'scopes.manage', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'scopes.manage', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'findings.act', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'findings.act', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'findings.act', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'findings.act', 'own_dept');
INSERT INTO public.role_permissions VALUES ('admin', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'findings.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'findings.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'suppliers.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'suppliers.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'suppliers.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'suppliers.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'suppliers.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'suppliers.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'suppliers.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'suppliers.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'suppliers.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'threats.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'threats.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'threats.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'threats.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'bil.write', 'own_dept');
INSERT INTO public.role_permissions VALUES ('admin', 'bil.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'bil.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'bil.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'bil.publish', 'own_dept');
INSERT INTO public.role_permissions VALUES ('admin', 'bil.publish', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'bil.publish', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'bil.publish', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'bil.mandatory', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'bil.mandatory', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'bil.mandatory', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_integration', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('soc_analyst', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'architecture.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'components.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'assets.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'bil.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'components.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'controls.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'findings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'graph.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'services.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'suppliers.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'systems.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'threats.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_architect', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'knowledge.enrich', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'knowledge.query', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'risks.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'risks.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('admin', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'risks.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'risks.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'risks.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'risks.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'risks.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'risks.delete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'risks.validate', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'governance.review', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'siro.review', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'probability_signals.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'risk_trends.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'risk_trends.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'risk_heatmap.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'risk_heatmap.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'risk_heatmap.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'actions.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'actions.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('siro', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.adopt_queue', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'actions.adopt_queue', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.adopt_queue', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.org_view', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.org_view', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'actions.org_view', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.progress', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'actions.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.adopt', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.adopt', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'actions.complete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'actions.complete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'actions.complete', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'actions.complete', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'actions.complete', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'exceptions.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'exceptions.read', 'own_dept');
INSERT INTO public.role_permissions VALUES ('siro', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'exceptions.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'exceptions.accept', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'exceptions.accept', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'exceptions.accept', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'exceptions.revoke', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'exceptions.revoke', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'exceptions.revoke', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'meetings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'meetings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'meetings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'meetings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_owner', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.read_pack', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.issue', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'meetings.attendees', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.attendees', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'meetings.decide', 'all_depts');
INSERT INTO public.role_permissions VALUES ('siro', 'meetings.decide', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'meetings.decide', 'all_depts');
INSERT INTO public.role_permissions VALUES ('meeting_secretary', 'meetings.decide', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'departments.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'departments.write', 'all_depts');
INSERT INTO public.role_permissions VALUES ('risk_analyst', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('information_asset_manager', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('security_consultant', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('ciso', 'users.read', 'all_depts');
INSERT INTO public.role_permissions VALUES ('admin', 'admin.manage', 'all_depts');

-- ── SoD rules (v65; all disabled by default) ──
INSERT INTO public.sod_rules VALUES ('risk.validate', 'A risk may not be validated by the person who identified it', false);
INSERT INTO public.sod_rules VALUES ('action.complete', 'An action may not be marked complete by the person who created it', false);
INSERT INTO public.sod_rules VALUES ('exception.accept', 'A risk exception may not be accepted by the risk owner (the owning department''s IAO)', false);
INSERT INTO public.sod_rules VALUES ('impact_table.publish', 'An impact table may not be published by its creator (maker-checker)', false);
INSERT INTO public.sod_rules VALUES ('role.grant', 'A user may not grant a role to themselves', false);
