-- v166: two-factor sign-in can be set up (H-05; owner, 2026-11-02: "I didn't
-- realise that 2FA is not implemented. Can you get this done please").
--
-- Sign-in already asked for a code when users.totp_enabled was set, but nothing
-- ever wrote users.totp_secret, so no account could use it. Now a person sets it
-- up for themselves (My account): CIRKS makes a secret, they scan it into an
-- authenticator app, and it is switched on only once they have typed a code
-- that proves the app has it.
--
-- THE SECRET NEVER LEAVES THE DATABASE. Since H-17 (v112) the app role holds no
-- SELECT on users.totp_secret, so a compromised container yields nobody's
-- second factor. The app WRITES a new secret (UPDATE needs no SELECT), and every
-- check of a code happens here, in SECURITY DEFINER functions, as the password
-- check does (verify_user_credentials). The pending secret is withheld the same
-- way (db/grant-app-role.sql).
--
-- RFC 6238 as authenticator apps use it: base32 secret, HMAC-SHA1, 30-second
-- steps, 6 digits, one step either side for clock drift. A code is accepted only
-- for a later step than the last one accepted (totp_last_step), so a code that
-- has been used — or seen over someone's shoulder — cannot be used again.

ALTER TABLE users
  ADD COLUMN totp_pending_secret TEXT,
  ADD COLUMN totp_pending_at     TIMESTAMPTZ,
  ADD COLUMN totp_enabled_at     TIMESTAMPTZ,
  ADD COLUMN totp_last_step      BIGINT;

COMMENT ON COLUMN users.totp_pending_secret IS
  'A secret being set up, not yet confirmed with a code (v166). Withheld from the app role like totp_secret.';
COMMENT ON COLUMN users.totp_last_step IS
  'The last 30-second step a code was accepted for; an older or equal one is refused, so a code cannot be replayed (v166).';

-- Base32 (RFC 4648) to bytes. Spaces, dashes and padding are ignored, as
-- authenticator apps ignore them.
CREATE OR REPLACE FUNCTION totp_base32_decode(p TEXT) RETURNS BYTEA
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s      TEXT := upper(regexp_replace(p, '[\s=-]', '', 'g'));
  buffer BIGINT := 0;
  bits   INT := 0;
  result BYTEA := ''::BYTEA;
  v      INT;
BEGIN
  FOR i IN 1..length(s) LOOP
    v := strpos(alphabet, substr(s, i, 1)) - 1;
    IF v < 0 THEN RAISE EXCEPTION 'not base32: %', substr(s, i, 1); END IF;
    buffer := (buffer << 5) | v;
    bits := bits + 5;
    IF bits >= 8 THEN
      bits := bits - 8;
      result := result || set_byte('\x00'::BYTEA, 0, ((buffer >> bits) & 255)::INT);
      buffer := buffer & ((1::BIGINT << bits) - 1);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- The 6-digit code for one 30-second step (RFC 4226 dynamic truncation).
CREATE OR REPLACE FUNCTION totp_code(p_key BYTEA, p_step BIGINT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  h   BYTEA := hmac(int8send(p_step), p_key, 'sha1');
  off INT := get_byte(h, 19) & 15;
  bin BIGINT;
BEGIN
  bin := ((get_byte(h, off) & 127)::BIGINT << 24) | (get_byte(h, off + 1)::BIGINT << 16)
       | (get_byte(h, off + 2)::BIGINT << 8) | get_byte(h, off + 3)::BIGINT;
  RETURN lpad((bin % 1000000)::TEXT, 6, '0');
END;
$$;

-- Check a code against the account's secret — the confirmed one, or with
-- p_pending the one being set up — and, if it is right, record its step so it
-- cannot be used again. Never returns the secret.
CREATE OR REPLACE FUNCTION verify_user_totp(p_user UUID, p_code TEXT, p_pending BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_secret TEXT;
  v_last   BIGINT;
  v_key    BYTEA;
  v_now    BIGINT := floor(extract(epoch FROM clock_timestamp()) / 30)::BIGINT;
  v_code   TEXT := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
BEGIN
  IF v_code !~ '^[0-9]{6}$' THEN RETURN FALSE; END IF;
  SELECT CASE WHEN p_pending THEN u.totp_pending_secret ELSE u.totp_secret END, u.totp_last_step
    INTO v_secret, v_last
    FROM users u WHERE u.id = p_user
     FOR UPDATE;
  IF v_secret IS NULL THEN RETURN FALSE; END IF;
  v_key := totp_base32_decode(v_secret);
  FOR s IN (v_now - 1)..(v_now + 1) LOOP
    IF (v_last IS NULL OR s > v_last) AND totp_code(v_key, s) = v_code THEN
      UPDATE users SET totp_last_step = s WHERE id = p_user;
      RETURN TRUE;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- Switch two-factor sign-in on: the code proves the authenticator app holds the
-- pending secret, which then becomes the account's secret. Done here because
-- copying one column into another reads it, which the app role may not.
CREATE OR REPLACE FUNCTION confirm_user_totp(p_user UUID, p_code TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT verify_user_totp(p_user, p_code, TRUE) THEN RETURN FALSE; END IF;
  UPDATE users
     SET totp_secret = totp_pending_secret, totp_enabled = TRUE, totp_enabled_at = now(),
         totp_pending_secret = NULL, totp_pending_at = NULL, updated_at = now()
   WHERE id = p_user;
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION verify_user_totp(UUID, TEXT, BOOLEAN) IS
  'Check a sign-in code without disclosing the secret (H-05/H-17, v166). SECURITY DEFINER; refuses a step already used.';
COMMENT ON FUNCTION confirm_user_totp(UUID, TEXT) IS
  'Switch two-factor sign-in on once a code from the pending secret is right (v166). SECURITY DEFINER.';

-- EXECUTE for the app role is granted by db/grant-app-role.sql, which knows its
-- name. Definer functions are executable by PUBLIC by default; these read secrets.
REVOKE ALL ON FUNCTION verify_user_totp(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_user_totp(UUID, TEXT) FROM PUBLIC;
