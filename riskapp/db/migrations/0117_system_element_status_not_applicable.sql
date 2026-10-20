-- migrate:no-transaction
-- 0117 — a fifth per-system element status: `not_applicable`
--
-- WHY. A control linked to a threat may still be inappropriate on a particular
-- system, and the model had no way to say so. The four existing states all mean
-- some flavour of "it should be here": operational, degraded, missing, unknown.
-- Excluding a control was therefore indistinguishable from never having got
-- round to it, so the coverage panel nagged about it for ever and the gap builder
-- kept offering it as remediation.
--
-- This migration only ADDS THE VALUE. Referencing a new enum value in the same
-- migration that creates it is refused by Postgres ("unsafe use of new value of
-- enum type") even under `-- migrate:no-transaction`, because the file is still
-- one implicit transaction unless the runner splits it — see the v113 incident
-- and db/splitStatements.js. Two migrations is the rule regardless; 0118 does
-- the work.

ALTER TYPE public.system_element_status ADD VALUE IF NOT EXISTS 'not_applicable';
