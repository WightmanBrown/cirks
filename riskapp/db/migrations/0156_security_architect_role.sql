-- migrate:no-transaction
-- 0156 — the Security Architect role (owner, 2026-10-12)
--
-- v155 gave the systems architecture template and the system architecture
-- patterns their own capability, architecture.write, held by the risk analyst,
-- the CISO and the admin. The owner's ruling at the time: "most (if not all)
-- risk analysts would also be architects; it's the other roles where this is
-- less clear, for example IAM in some cases but definitely not all of them."
--
-- "Some IAMs, not all" cannot be said with a grant to the IAM role: that is every
-- department manager. It is said with a ROLE a named person holds in addition to
-- their own, granted by the admin on the accounts page like any other.
--
-- This file adds only the enum value. The grants are in 0157: a new enum value
-- cannot be named in the statement batch that adds it (see 0111 / 0113).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'security_architect';
