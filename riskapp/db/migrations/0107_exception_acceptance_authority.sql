-- v107 — accepting a risk exception is a governance act: CISO or SIRO only.
--
-- Decision 2026-09-08 (docs/risk-ownership.md). A risk belongs to the department
-- that owns the system, and its accountable person is that department's IAO. The
-- party who lives with a risk must not be the party who signs off carrying it,
-- so acceptance moves to the organisational roles.
--
-- This also removes a deadlock. The separation-of-duties rule `exception.accept`
-- requires the acceptor not to be the risk owner. With the IAO owning every risk
-- in their department AND holding exceptions.accept, enabling that rule would
-- have silently stopped IAO acceptance everywhere — a control that could never
-- be turned on. With acceptance held only by roles that never own a departmental
-- risk, it is structurally satisfied.
--
-- admin keeps both: an administrator must be able to unblock and correct.
-- Revocation follows acceptance so a signature and its reversal cannot sit with
-- different people.
--
-- Scoped DELETE rather than a wholesale re-seed: role_permissions is the
-- admin-editable override layer, and an installation may have made other
-- deliberate changes. Only these four grants are withdrawn.

DELETE FROM role_permissions
 WHERE capability_key IN ('exceptions.accept', 'exceptions.revoke')
   AND role IN ('information_asset_owner', 'risk_analyst');
