-- 0170 — an optional estimated cost on a security solution (owner, 2026-11-03,
--        docs/reporting-ciso.md §6 decision 1)
--
-- The CISO's investment report (C1) ranks the work that removes the most risk.
-- Without money it can only rank by risk removed per system; with an estimate it
-- can say risk removed per pound, and the business can agree a level of
-- protection knowing its price.
--
-- Optional and never defaulted: NULL means "not known", and the report says so
-- rather than treating it as free. The basis says what the figure is for:
-- 'organisation' — bought once (a SIEM, a firewall service); 'per_system' — for
-- each system the solution is put on (an endpoint agent). One-off and annual are
-- separate because a budget is. Whole units of the organisation's currency.
-- Changes are audited by the route, as every other change to a solution.

ALTER TABLE delivery_patterns
  ADD COLUMN cost_one_off  BIGINT CHECK (cost_one_off >= 0),
  ADD COLUMN cost_annual   BIGINT CHECK (cost_annual >= 0),
  ADD COLUMN cost_basis    TEXT   CHECK (cost_basis IN ('organisation', 'per_system')),
  ADD COLUMN cost_note     TEXT,
  ADD COLUMN cost_set_by   UUID REFERENCES users(id),
  ADD COLUMN cost_set_at   TIMESTAMPTZ,
  -- A figure means nothing without saying what it buys; a basis with no figure
  -- is not an estimate.
  ADD CONSTRAINT chk_delivery_pattern_cost_basis
    CHECK ((cost_one_off IS NULL AND cost_annual IS NULL) = (cost_basis IS NULL));
