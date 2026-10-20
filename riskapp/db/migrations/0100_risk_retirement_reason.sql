-- migrate:no-transaction
-- v100 — record WHY a risk was retired, so management information can tell an
-- achievement from a mistake.
--
-- RATIONALE. `risks.is_active` has been the register's only ending, and it was
-- doing two incompatible jobs: "this threat no longer applies to this system"
-- (a real outcome, worth reporting) and "this was raised in error" (an erasure,
-- worth reporting to nobody). GET /operations/my-risk-trends counts every
-- deactivation since the last SWG as `eliminated_count`, so the tool has been
-- presenting typos as achievements.
--
-- A third ending is deliberately NOT a deactivation: a risk driven down to a
-- low score by successful treatment STAYS ACTIVE. That is not a preference —
-- my-risk-trends computes `reduced_count` from *active* risks whose score
-- improved, so retiring a treated risk removes it from the success count and
-- files it as a disappearance. Keeping it in the register is also the point:
-- a risk that went 20 → 4 through a named action is the best evidence an ISMS
-- produces. See docs/threat-identification.md.
--
-- Existing inactive risks keep retired_reason NULL, meaning "retired before the
-- distinction existed". The trend query treats NULL as NOT an error, so
-- historical eliminations keep counting — this preserves existing MI rather
-- than silently rewriting history.
--
-- no-transaction: CREATE TYPE … AS ENUM followed by use of that type in the
-- same transaction is fine, but the runner's convention is to run enum-creating
-- migrations outside one.

CREATE TYPE public.risk_retired_reason AS ENUM (
  'no_longer_applies',   -- the exposure genuinely ended; counts as eliminated
  'raised_in_error'      -- never a real risk; excluded from all MI
);

ALTER TABLE public.risks
  ADD COLUMN retired_reason public.risk_retired_reason,
  ADD COLUMN retired_at     timestamp with time zone,
  ADD COLUMN retired_by     uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.risks.retired_reason IS
  'Why the risk was deactivated. NULL on an inactive risk means it was retired before v100 introduced the distinction — treated as not-an-error by MI. Never set on an active risk.';

-- A reason only makes sense on a retired risk, and a retired risk should carry
-- one from here on. The NULL-reason case is permitted so pre-v100 rows remain
-- valid; the API requires a reason on every new retirement.
ALTER TABLE public.risks
  ADD CONSTRAINT chk_risk_retired_reason_only_when_inactive
  CHECK (retired_reason IS NULL OR is_active = FALSE);

CREATE INDEX idx_risks_retired_reason ON public.risks (retired_reason)
  WHERE is_active = FALSE;
