-- SPDX-License-Identifier: Apache-2.0
-- Copyright (C) 2026 Wightman Brown Limited
-- Least-privilege application DB role (hardening H-01).
--
-- Run as the database OWNER (the role that owns the migrated schema), via:
--   psql "<owner-url>" -v approle=cirks_app -v apppw='…' -f db/grant-app-role.sql
--
-- Creates/refreshes a LOGIN role that can run the app's DML + stored functions
-- but CANNOT issue DDL (no CREATE/ALTER/DROP) — so a compromised app process
-- can't alter the schema. Migrations keep running as the owner. Idempotent;
-- the ALTER DEFAULT PRIVILEGES lines extend the grants to objects a future
-- migration creates (as the owner).
--
-- Note: psql does NOT interpolate :vars inside DO $$…$$ blocks, so the dynamic
-- DDL (role name + password, current database) is built with format() and run
-- via \gexec instead.

-- ⚠ ROLE-LEVEL EFFECTS ARE CLUSTER-WIDE, NOT PER-DATABASE.
-- This script does `ALTER ROLE … PASSWORD`, `CONNECTION LIMIT` and
-- `ALTER ROLE … SET statement_timeout`. A role is a property of the CLUSTER, so
-- running this against a scratch database on a cluster that also hosts the live
-- one RESETS THE LIVE APP'S PASSWORD and its limits. It cost two minutes of
-- "new connections would fail" on CIRKS-test on 2026-09-25 (the pool's open
-- connections masked it; the password came back from /proc/1/environ in the app
-- container). Rehearse it on a SEPARATE cluster, or not at all — the entrypoint
-- runs it on every boot with the right password, so it is self-healing there.

\set ON_ERROR_STOP on

-- 1. Create the role if it doesn't exist, then (re)set its password each run.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'approle', :'apppw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'approle')
\gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'approle', :'apppw') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'approle') \gexec

-- 2. Schema usage + DML on existing objects (no DDL, no TRUNCATE, no ownership).
GRANT USAGE ON SCHEMA public TO :"approle";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO :"approle";

-- 2a. …except the credential columns (H-17). The blanket grant above covers
-- every column, so the table-level SELECT on `users` is withdrawn and replaced
-- with a column list that omits password_hash and totp_secret. An attacker with
-- the app's credentials — which a compromised container hands over — then gets
-- no bcrypt hashes, which is what would otherwise turn a CIRKS breach into a
-- breach of whatever else those passwords open.
--
-- The list is BUILT FROM THE CATALOGUE rather than written out, so a column
-- added by a future migration is granted automatically and only the two named
-- exclusions stay withheld. The entrypoint runs this after every migrate, so it
-- self-heals on the next boot.
--
-- INSERT and UPDATE stay at table level: setting a password needs the UPDATE
-- privilege on the column, not SELECT, so admin create-user and reset-password
-- are unaffected.
REVOKE SELECT ON users FROM :"approle";
SELECT format('GRANT SELECT (%s) ON users TO %I',
              (SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
                 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'users'
                  AND column_name NOT IN ('password_hash', 'totp_secret')),
              :'approle')
\gexec

-- The password comparison now happens inside the database (migration 0112), so
-- the app needs EXECUTE on the definer function it can no longer do by hand.
SELECT format('GRANT EXECUTE ON FUNCTION verify_user_credentials(TEXT, TEXT) TO %I', :'approle') \gexec

-- 2b. The same for API-key hashes (migration 0132, H-17 part 2). They are
-- SHA-256 of a 192-bit random secret, so reading one yields nothing replayable
-- — this is blast radius, not credential recovery: an attacker who can read
-- every hash can confirm a key they already hold is live and enumerate the
-- estate. Column list built from the catalogue, as above, so a future column is
-- granted automatically and only key_hash stays withheld.
REVOKE SELECT ON api_keys FROM :"approle";
SELECT format('GRANT SELECT (%s) ON api_keys TO %I',
              (SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
                 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'api_keys'
                  AND column_name NOT IN ('key_hash')),
              :'approle')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION verify_api_key(TEXT) TO %I', :'approle') \gexec

-- `refresh_tokens` is deliberately left readable: the app rotates tokens and
-- revokes families across the whole table, and the stored value is an
-- unreversible hash of a random token. See migration 0132 and H-17.

-- 2c. Limits on the role itself (H-17). Measured on CIRKS-test over 15,137
-- requests: p99 45 ms, p99.9 204 ms, slowest ever 1,301 ms (a withdrawal
-- preview, which does the work and rolls it back). 15 s is ten times the worst
-- legitimate statement and still ends a runaway one. The connection cap is the
-- pool's default of 10 plus headroom for a second process; the schema owner,
-- which migrations and this script run as, is unaffected by both.
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'approle', '15s') \gexec
SELECT format('ALTER ROLE %I CONNECTION LIMIT 25', :'approle') \gexec
GRANT USAGE, SELECT, UPDATE         ON ALL SEQUENCES  IN SCHEMA public TO :"approle";
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO :"approle";

-- 3. Same grants for objects created later by the owner (future migrations).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO :"approle";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE         ON SEQUENCES  TO :"approle";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS  TO :"approle";
