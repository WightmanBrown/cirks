-- v176: security solution patterns (owner, 2026-11-10; docs/meta-architecture.md §11).
--
-- Eight generic shapes a security solution takes (P1 governing document … P8
-- physical protection), each made of named slots: P5 central security service is
-- a team, a security system, a part on each system and the policy that defines
-- its configuration. The patterns themselves are shipped with the code
-- (src/lib/solutionPatterns.js), like the objectives CIRKS can deliver; the
-- database records only what a person decides:
--
--   * which pattern a solution implements (NULL = not stated, never defaulted);
--   * slots that are not needed for this solution (a network-only scanner has no
--     part on the system), so the pattern does not read them as missing;
--   * which slot a part fills, where matching by type and place is not enough
--     (a training record is an information component like the policy it
--     evidences). NULL = matched automatically.
--
-- Report only: how complete a solution is against its pattern is derived on
-- read and changes no objective's state and no risk score.

ALTER TABLE delivery_patterns
  ADD COLUMN solution_pattern text
    CONSTRAINT chk_delivery_pattern_solution_pattern CHECK (solution_pattern IN ('P1','P2','P3','P4','P5','P6','P7','P8')),
  ADD COLUMN slots_not_needed text[] NOT NULL DEFAULT '{}';

ALTER TABLE delivery_pattern_parts
  ADD COLUMN slot_key text
    CONSTRAINT chk_delivery_pattern_part_slot_key CHECK (slot_key ~ '^[a-z][a-z_]{0,39}$');

COMMENT ON COLUMN delivery_patterns.solution_pattern IS
  'The security solution pattern this solution implements (P1-P8, src/lib/solutionPatterns.js). NULL = not stated.';
COMMENT ON COLUMN delivery_patterns.slots_not_needed IS
  'Slots of its pattern this solution does not need (e.g. on_system for a network-only scanner).';
COMMENT ON COLUMN delivery_pattern_parts.slot_key IS
  'The pattern slot this part fills, when stated; NULL = matched by component type and place.';
