-- 0168 — metric_snapshots: the monthly capture that makes a trend possible
--
-- docs/metrics-and-reporting.md §2–5, built for the board summary
-- (docs/reporting-siro.md, report 9). CIRKS derives on read, which gives the
-- live figure for free and makes a trend impossible: a query cannot say what it
-- would have returned in March. So once a month the board's headline figures
-- are captured and kept — the one sanctioned exception to "derive, don't store".
--
-- The traps the design names, met here:
--   * numerator AND denominator are stored, never a percentage (in `summary`);
--   * the definition is versioned (`definition_ver`), so a trend never draws a
--     line across a change of meaning without saying so;
--   * one capture per metric per month, enforced by the UNIQUE constraint rather
--     than by the job checking first, so a restart or a second container cannot
--     produce two Marches.

CREATE TABLE metric_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key     TEXT NOT NULL,
  period         TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  definition_ver SMALLINT NOT NULL,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by    UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = the scheduled job
  summary        JSONB NOT NULL,
  detail         JSONB,
  UNIQUE (metric_key, period)
);

COMMENT ON TABLE metric_snapshots IS
  'Monthly capture of derived figures (v168), so a trend can be drawn: one row per metric per month (YYYY-MM). summary holds counts with their denominators, never percentages; definition_ver changes when the query behind a metric changes. Written by src/jobs/metricCapture.js; never edited.';
