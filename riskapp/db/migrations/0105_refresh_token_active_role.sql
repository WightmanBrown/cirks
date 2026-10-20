-- v105 — the active role survives a token refresh.
--
-- RATIONALE. Access tokens live 15 minutes. When one expires the client silently
-- refreshes, and refresh re-read the user row and signed the new token with
-- `users.role` — the PRIMARY role. Neither the refresh token (`{ sub, family }`)
-- nor this table carried the active role, so there was nothing to restore it
-- from.
--
-- The effect: a user switches to a role they legitimately hold, works for up to
-- fifteen minutes, and is then quietly returned to their primary role. The UI
-- keeps showing the switched role, because the frontend stores the switched user
-- object separately and nothing updates it. So the screen says "Admin" while the
-- token says "risk_analyst".
--
-- Reported as "I switched to Admin and deleting a service says 'Only the owning
-- department can delete this service'" — a message about departments for what
-- was really an expired role switch. Undiagnosable from the symptom.
--
-- It fails toward LOWER privilege, so it is a correctness and trust problem
-- rather than a security hole. But it silently breaks every elevated action for
-- every multi-role user, fifteen minutes in.
--
-- WHY ON THE TOKEN FAMILY, NOT THE USER. Storing the active role on `users`
-- would make it a property of the person rather than of the session, so signing
-- in on a second device would inherit the first device's elevation. A refresh
-- token family IS the session; the role belongs there.
--
-- NULL means "the user's primary role", which is what every existing row means —
-- so no backfill is needed and no session is disturbed by this migration.
--
-- The value is a hint, never an authority: refresh re-verifies the user still
-- holds the role (via v_user_roles) before re-issuing it. A role revoked while
-- a refresh token is outstanding must not come back to life on the next refresh.

ALTER TABLE refresh_tokens
  ADD COLUMN active_role user_role;

COMMENT ON COLUMN refresh_tokens.active_role IS
  'The role this session is operating as; NULL = the user''s primary role. '
  'Re-verified against v_user_roles on every refresh before being re-issued — '
  'a revoked role must not be resurrected by an outstanding refresh token.';
