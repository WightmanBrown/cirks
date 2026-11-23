-- v183: a simple menu or the full menu, per person (owner, 2026-11-18).
--
-- Demonstrated as an Information Asset Owner, CIRKS "looks very complex": the
-- menus offer the design and library pages (threats, system patterns, standard
-- builds, the control library, the SoA, scopes, the remediation roll-up and
-- the security architecture pages) that most owners never need. The simple menu
-- leaves them out; the full menu shows everything the person may open.
--
-- NULL = the default for the person's role (simple for owners, managers, the
-- SIRO, the meeting secretary and SOC analysts; full for everyone else), so a
-- role change moves the default with it. A menu entry hidden here is still
-- reachable by link: this decides what the menu offers, never what may be seen.

ALTER TABLE users
  ADD COLUMN menu_mode text CONSTRAINT chk_users_menu_mode CHECK (menu_mode IN ('simple', 'full'));

COMMENT ON COLUMN users.menu_mode IS
  'The menu this person chose (v183): simple | full. NULL = the default for their role (src/routes/users/index.js MENU_SIMPLE_ROLES).';
