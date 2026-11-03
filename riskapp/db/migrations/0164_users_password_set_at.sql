-- v164: an account is created with sign-in locked, until an administrator sets
-- its password (owner, 2026-11-02).
--
-- A new account — from Admin → Account Management or from db/import.js without
-- a password — gets its own random password that nobody is told: a valid hash,
-- so every sign-in is refused. It stays ACTIVE, because only an active account
-- is a department's risk owner (v_department_risk_owner, v108) or an action
-- owner; an inactive one would leave a newly loaded organisation's risks
-- without an owner. The owner chose this over "inactive until a password is
-- set" for that reason, as for the Misty Isles install (2026-10-16).
--
-- password_set_at records the fact the screens need: NULL = no password has
-- been set for a person, so nobody can sign in to the account. It is set by
-- whatever sets a real password (reset-password, create-admin.js, the import
-- when given one), never by the random lock.
--
-- Existing accounts all hold a password somebody chose — a shared starting
-- password at worst — so they are counted as set, as of their last change.
-- The Misty Isles personas on an install built before this release are also
-- counted as set although nobody knows their passwords; the next build marks
-- them correctly.
--
-- The app role is granted the new column automatically: grant-app-role.sql
-- builds the users column list from the catalogue (H-17).

ALTER TABLE users ADD COLUMN password_set_at TIMESTAMPTZ;

UPDATE users SET password_set_at = updated_at;

COMMENT ON COLUMN users.password_set_at IS
  'When a person last set this account''s password. NULL = only the random lock it was created with: nobody can sign in until an administrator sets one (v164).';
