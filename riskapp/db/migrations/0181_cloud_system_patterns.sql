-- v181: two more system patterns, for the cloud service models (owner, 2026-11-18).
--
-- S1 was "Application on servers we run", on premises or in our own cloud
-- tenancy. Applications now follow the terms people know: S1 on premises,
-- S7 on cloud infrastructure (IaaS), S8 on a cloud platform (PaaS), S2 software
-- as a service (SaaS). Who answers for each layer is what changes the questions:
-- on IaaS and PaaS the cloud provider is a required supplier (supplier
-- assurance reads it), and on PaaS there is no operating system of ours to ask
-- about. This reverses decision 2 of 2026-11-10 (Azure servers as a variant of
-- S1): the question only they need, the cloud provider, now exists.
--
-- The codes S1-S6 are kept: systems, triggers, the audit log and the dataset
-- store them. No system is moved; a person chooses (the S1 systems hosted in
-- Azure were listed for the owner on 2026-11-18).

ALTER TABLE systems DROP CONSTRAINT chk_system_pattern;
ALTER TABLE systems ADD CONSTRAINT chk_system_pattern
  CHECK (system_pattern IN ('S1','S2','S3','S4','S5','S6','S7','S8'));

ALTER TABLE architecture_rule_pattern_triggers DROP CONSTRAINT chk_rule_pattern_trigger;
ALTER TABLE architecture_rule_pattern_triggers ADD CONSTRAINT chk_rule_pattern_trigger
  CHECK (system_pattern IN ('S1','S2','S3','S4','S5','S6','S7','S8'));

COMMENT ON COLUMN systems.system_pattern IS
  'The system pattern this system follows (S1-S8, src/lib/systemPatterns.js). NULL = not stated: the system is asked nothing, and a business system is named in the component-record finding.';

CREATE OR REPLACE FUNCTION system_pattern_slots(p text)
RETURNS TABLE (slot_key text, label text, required boolean, fill text, sort_index int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT v.slot_key, v.label, v.required, v.fill, v.sort_index::int FROM (VALUES
    ('S1','application','The application',false,'explicit',1), ('S1','operating_system','Operating system',true,'role',2),
    ('S1','users','Who uses it',false,'role',3), ('S1','support_team','Support team',false,'role',4),
    ('S1','sign_in','Sign-in',true,'role',5), ('S1','hosting','Where it runs',true,'role',6), ('S1','network','Network',true,'role',7),
    ('S7','application','The application',false,'explicit',1), ('S7','operating_system','Operating system',true,'role',2),
    ('S7','users','Who uses it',false,'role',3), ('S7','support_team','Support team',false,'role',4),
    ('S7','sign_in','Sign-in',true,'role',5), ('S7','supplier','Cloud provider',true,'supplier',6),
    ('S7','hosting','Cloud region',true,'role',7), ('S7','network','Cloud network',true,'role',8),
    ('S8','application','The application',false,'explicit',1), ('S8','platform','Platform service',false,'explicit',2),
    ('S8','users','Who uses it',false,'role',3), ('S8','support_team','Support team',false,'role',4),
    ('S8','sign_in','Sign-in',true,'role',5), ('S8','supplier','Platform provider',true,'supplier',6),
    ('S8','hosting','Cloud region',true,'role',7), ('S8','network','Reached over',true,'role',8),
    ('S2','service','The service',false,'explicit',1), ('S2','administrators','Who administers our settings',false,'explicit',2),
    ('S2','users','Who uses it',false,'role',3), ('S2','supplier','Supplier',true,'supplier',4),
    ('S2','sign_in','Sign-in',true,'role',5), ('S2','network','Reached over',true,'role',6),
    ('S3','control_system','Control system',false,'explicit',1), ('S3','operating_system','Computer it runs on',false,'role',2),
    ('S3','support_team','Who maintains it',false,'role',3), ('S3','users','Operators',false,'role',4),
    ('S3','sign_in','Accounts',true,'role',5), ('S3','network','Isolated network',true,'role',6), ('S3','hosting','Where it is',true,'role',7),
    ('S4','operating_system','Device and operating system',true,'role',1), ('S4','applications','Applications',false,'explicit',2),
    ('S4','support_team','Support team',false,'role',3), ('S4','users','Who uses it',false,'role',4),
    ('S4','sign_in','Sign-in',true,'role',5), ('S4','hosting','Where it is used',true,'role',6), ('S4','network','Network',true,'role',7),
    ('S5','equipment','Network equipment',false,'explicit',1), ('S5','operating_system','Network operating system',true,'role',2),
    ('S5','support_team','Who runs it',false,'role',3), ('S5','management','Managed from',false,'explicit',4), ('S5','hosting','Sites',true,'role',5),
    ('S6','document','The document',false,'explicit',1), ('S6','owner','Owner',false,'explicit',2),
    ('S6','users','Who uses it',false,'role',3), ('S6','hosting','Where copies are kept',true,'role',4), ('S6','copy_register','Copy register',false,'explicit',5)
  ) AS v(pattern, slot_key, label, required, fill, sort_index)
  WHERE v.pattern = p
$$;

COMMENT ON FUNCTION system_pattern_slots(text) IS
  'The slots of a system pattern (v178, S7 and S8 added in v181): key, label, required, how it is filled (role | explicit | supplier). A copy of src/lib/systemPatterns.js.';
