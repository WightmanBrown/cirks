-- 0132 — the app role can no longer read API-key hashes either (H-17, part 2)
--
-- WHY. v112 moved the PASSWORD comparison into the database and withdrew SELECT
-- on `users.password_hash` and `users.totp_secret`. H-17 named two more targets
-- and they were left: `api_keys.key_hash` and `refresh_tokens`. Checked on
-- CIRKS-test 2026-09-25 — password_hash and totp_secret are indeed unreadable by
-- `cirks_app`, and `api_keys.key_hash` is still readable.
--
-- WHAT THIS IS WORTH, honestly. Both remaining columns hold SHA-256 of a
-- high-entropy random value (192-bit key, 256-bit refresh token), not a password
-- hash: they cannot be cracked, and reading one yields nothing replayable. That
-- is why this is the small end of H-17 and why the row said "the single smallest
-- change with the largest effect" about the *password* half, which is done. What
-- is left is symmetry and blast radius — an attacker who can read every hash can
-- at least confirm whether a key they already hold is live, and enumerate the
-- estate. There are **0** API keys on CIRKS-test, so withdrawing the privilege
-- costs nothing today and is free to have in place before the first one is
-- minted.
--
-- `refresh_tokens` is DELIBERATELY NOT MOVED. The app rotates tokens, revokes
-- families on reuse and lists sessions: that is ordinary DML across the whole
-- table, and re-expressing it as definer functions would move the session logic
-- into SQL for no gain against an unreversible hash. Recorded in H-17 rather than
-- left as a silent omission.
--
-- The hash is computed in the DATABASE here (pgcrypto `digest`), matching the
-- app's `crypto.createHash('sha256').digest('hex')` exactly — hex, lower case.
-- Unlike v112's bcrypt note, sha256 has no `$2a$`/`$2b$` trap: it is one
-- algorithm with one output.

-- The privilege change itself lives in db/grant-app-role.sql, which the
-- entrypoint runs after every migrate: it is opt-in (H-01) and must not fail on
-- an installation that has no separate app role. Granting EXECUTE here would
-- break exactly that case.

CREATE OR REPLACE FUNCTION verify_api_key(p_key TEXT)
RETURNS TABLE (id UUID, label TEXT, role TEXT, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT k.id, k.label, k.role, k.expires_at, k.revoked_at
    FROM api_keys k
   WHERE k.key_hash = encode(digest(p_key, 'sha256'), 'hex')
     AND k.revoked_at IS NULL
     AND (k.expires_at IS NULL OR k.expires_at > now())
$$;

COMMENT ON FUNCTION verify_api_key(TEXT) IS
  'Resolve a presented API key to its live row without the caller reading api_keys.key_hash (v132, H-17). SECURITY DEFINER; the app role holds EXECUTE only.';

