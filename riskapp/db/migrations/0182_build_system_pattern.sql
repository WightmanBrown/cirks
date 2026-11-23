-- v182: a standard build states the system pattern it is built on (owner, 2026-11-18;
-- docs/system-patterns.md decisions 16-23).
--
-- A standard build is a short-hand way of creating a system from repeatable
-- components; someone modelling systems thinks of one as "our standard S1
-- Windows server". The build answers some of its pattern's questions, never
-- necessarily all: what differs between systems (most often where it runs) is
-- left to each system.
--
-- Never defaulted: NULL = not stated, shown with a warning (decision 23: a build
-- or a system that follows no pattern is still valid). Copy semantics are
-- unchanged (v148 decision 3): changing a build's pattern changes no system.

ALTER TABLE system_builds
  ADD COLUMN system_pattern text
    CONSTRAINT chk_build_system_pattern CHECK (system_pattern IN ('S1','S2','S3','S4','S5','S6','S7','S8'));

COMMENT ON COLUMN system_builds.system_pattern IS
  'The system pattern this standard build is built on (v182, S1-S8, src/lib/systemPatterns.js). NULL = not stated: allowed, shown with a warning. Never defaulted.';
