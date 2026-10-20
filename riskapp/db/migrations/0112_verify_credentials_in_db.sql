-- v112 — the application role stops being able to read credential material (H-17).
--
-- From docs/threat-container-compromise.md. An attacker with code execution in
-- the container holds DATABASE_URL, so SQL access is theirs. Today that yields
-- every bcrypt hash in `users`, which is what turns a CIRKS breach into a breach
-- of whatever else those passwords open — the worst outcome available, and the
-- one worth removing first.
--
-- The comparison moves INTO the database, behind a SECURITY DEFINER function
-- owned by the schema owner. The app role may EXECUTE it and gets back a
-- yes/no plus the fields login needs; it never sees a hash. Column-level SELECT
-- on password_hash and totp_secret is then withdrawn in db/grant-app-role.sql,
-- which is the only place that knows the role's configurable name.
--
-- pgcrypto is already installed. One incompatibility had to be dealt with and
-- is worth understanding before anyone "tidies" it: node-bcrypt writes $2b$
-- hashes, and pgcrypto's crypt() implements $2a$ — it returns FALSE for a $2b$
-- hash rather than erroring, which would have failed every login silently.
--
-- $2a$ and $2b$ are the SAME algorithm. The prefix was bumped to mark a fix to
-- a length-handling bug in the original C implementation, which only bites for
-- passwords of 256 bytes or more. So the comparison rewrites the prefix, and
-- the application now caps passwords at 128 characters (routes/admin/index.js)
-- so the divergent case cannot arise — a password node could set but the
-- database could not verify would lock the account out.
--
-- Verified against every seeded user: correct password true, wrong password
-- false. No rehash and no migration of existing passwords.
--
-- ENUMERATION RESISTANCE IS PRESERVED, and this is the fiddly part. The old
-- code compared against a sentinel hash when the email was unknown, so an
-- unknown account cost the same as a known one (203ms vs 194ms, measured in the
-- 2026-08-17 review). A function that returned early on a missing row would
-- throw that away and hand back a user-enumeration oracle. So the no-user branch
-- performs a real bcrypt at the same cost before returning nothing.
--
-- WRITES ARE UNAFFECTED. Setting a password is an UPDATE, which needs the UPDATE
-- privilege on the column, not SELECT. Admin create-user, reset-password and
-- reset-TOTP keep working untouched.

CREATE OR REPLACE FUNCTION verify_user_credentials(p_email TEXT, p_password TEXT)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  full_name       TEXT,
  role            user_role,
  is_active       BOOLEAN,
  department_id   UUID,
  department_name TEXT,
  totp_enabled    BOOLEAN,
  password_ok     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned search_path: a SECURITY DEFINER function runs as the owner, so an
-- attacker able to prepend a schema could otherwise shadow crypt() and have the
-- owner execute it.
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT u.password_hash INTO v_hash
    FROM users u
   WHERE lower(u.email) = lower(btrim(p_email));

  IF v_hash IS NULL THEN
    -- Real work, discarded: an unknown email must cost what a known one costs.
    -- gen_salt('bf', 12) matches the application's SALT_ROUNDS.
    PERFORM crypt(p_password, gen_salt('bf', 12));
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.email::TEXT,
         u.full_name::TEXT,
         u.role,
         u.is_active,
         u.department_id,
         d.name::TEXT,
         u.totp_enabled,
         -- $2b$ -> $2a$: same algorithm, see the note above.
         (crypt(p_password, replace(u.password_hash, '$2b$', '$2a$'))
            = replace(u.password_hash, '$2b$', '$2a$')) AS password_ok
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
   WHERE lower(u.email) = lower(btrim(p_email));
END;
$$;

COMMENT ON FUNCTION verify_user_credentials(TEXT, TEXT) IS
  'Verify a password without disclosing the hash (H-17). SECURITY DEFINER: the app role holds EXECUTE but not SELECT on users.password_hash. Constant-cost for an unknown email.';

-- EXECUTE is granted to the app role by db/grant-app-role.sql, which knows the
-- role name. PUBLIC is revoked explicitly: SECURITY DEFINER functions are
-- executable by PUBLIC by default, and this one reads password hashes.
REVOKE ALL ON FUNCTION verify_user_credentials(TEXT, TEXT) FROM PUBLIC;
