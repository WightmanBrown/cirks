-- v104 — a business service is composed of SYSTEMS, not information assets.
--
-- RATIONALE. Full argument in docs/business-service-model.md. In short: the
-- service ↔ information-asset link could not describe a real service. Naming the
-- assets behind "Government Communications" forces you to invent one that is not
-- information at all ("IP connectivity", which is MIGNet in disguise) or to link
-- everything. The register showed it: 86 of 95 active services had no asset.
--
-- Systems are what a service is actually made of, and nothing is lost — every
-- information asset already sits in at least one system, so service → systems →
-- assets reaches everything the old link reached.
--
-- IMPACT IS NOT INHERITED FROM THE SYSTEM. `systems.impact_c/i/a` is a
-- whole-system MAX across every department using it; MIGNet is 5/5/5 and
-- underpins everything, so MAX-over-systems would flatten every service to 5/5/5
-- and the model would stop discriminating. The service's impact instead derives
-- from the assets ITS OWN DEPARTMENT holds in those systems (plus is_shared).
-- Within MIG Corporate Email — 5/5/5 overall, 8 assets, 4 departments —
-- Education's stake is BIL 2 and Justice's is 5. That is the discrimination the
-- roll-up exists to provide.
--
-- ONE LINK, TWO ROLES. There is deliberately no separate "depends on" table.
-- Whether a department holds assets in a system is computable, so a single link
-- carries both roles: systems where it holds assets contribute impact AND
-- probability; systems where it holds none contribute probability only (service
-- exposure, computed on read — see the note). It self-corrects the day someone
-- adds an asset there.
--
-- BACKFILL TRANSLATES, IT DOES NOT DISCARD. The nine services carrying asset
-- rows are linked to the systems those assets live in, so no service silently
-- loses its stake and the change is auditable.

-- ── 1. The link ──────────────────────────────────────────────────────────────
CREATE TABLE business_service_systems (
  service_id  UUID        NOT NULL REFERENCES business_services(id) ON DELETE CASCADE,
  system_id   UUID        NOT NULL REFERENCES systems(id)           ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES users(id),
  PRIMARY KEY (service_id, system_id)
);

CREATE INDEX idx_bss_system ON business_service_systems(system_id);

COMMENT ON TABLE business_service_systems IS
  'A business service is composed of the systems that deliver it. One link, two '
  'roles: a system where the service''s department holds assets contributes impact '
  'and probability; one where it holds none contributes probability only (v104).';

-- ── 2. Translate the existing asset links ────────────────────────────────────
INSERT INTO business_service_systems (service_id, system_id)
SELECT DISTINCT bsa.service_id, sa.system_id
  FROM business_service_assets bsa
  JOIN system_assets sa ON sa.asset_id = bsa.asset_id
ON CONFLICT DO NOTHING;

-- ── 3. Re-point the derivation ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_service_impact(p_service_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_new_c SMALLINT;
  v_new_i SMALLINT;
  v_new_a SMALLINT;
BEGIN
  -- The service's own stake: assets in the systems it uses, filtered to its own
  -- department (or flagged shared). NOT the systems' whole-system impact — see
  -- the migration header.
  SELECT MAX(ia.confidentiality), MAX(ia.integrity), MAX(ia.availability)
    INTO v_new_c, v_new_i, v_new_a
  FROM business_service_systems bss
  JOIN business_services  bs ON bs.id = bss.service_id
  JOIN system_assets      sa ON sa.system_id = bss.system_id
  JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
  WHERE bss.service_id = p_service_id
    AND (ia.department_id = bs.department_id OR ia.is_shared);

  -- NULL when the service has no systems, or holds nothing in the ones it has.
  -- That is "no stake recorded", legitimately distinct from an impact of zero,
  -- and matches how an unrated asset keeps NULL.
  UPDATE business_services SET
    confidentiality = v_new_c,
    integrity       = v_new_i,
    availability    = v_new_a
  WHERE id = p_service_id;
END;
$$;

-- ── 4. Re-point the triggers ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_svc_info_asset_aiud ON business_service_assets;
DROP FUNCTION IF EXISTS public.trg_svc_info_asset_change();

CREATE FUNCTION public.trg_svc_system_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_service_impact(OLD.service_id);
    RETURN OLD;
  END IF;
  PERFORM recompute_service_impact(NEW.service_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_svc_system_aiud
  AFTER INSERT OR DELETE OR UPDATE ON business_service_systems
  FOR EACH ROW EXECUTE FUNCTION public.trg_svc_system_change();

-- An asset's CIA change now reaches services through its systems, not through a
-- direct service link, and only where the department matches.
CREATE OR REPLACE FUNCTION public.trg_info_asset_cia_change_svc() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  v_svc UUID;
BEGIN
  IF NEW.confidentiality IS DISTINCT FROM OLD.confidentiality
     OR NEW.integrity     IS DISTINCT FROM OLD.integrity
     OR NEW.availability  IS DISTINCT FROM OLD.availability
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active THEN
    FOR v_svc IN
      SELECT DISTINCT bss.service_id
        FROM system_assets sa
        JOIN business_service_systems bss ON bss.system_id = sa.system_id
        JOIN business_services bs ON bs.id = bss.service_id
       WHERE sa.asset_id = NEW.id
         AND (NEW.department_id = bs.department_id OR NEW.is_shared)
    LOOP
      PERFORM recompute_service_impact(v_svc);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- NEW dependency: moving an asset into or out of a system now changes what the
-- services on that system can see. Nothing propagated this before, because
-- services linked assets directly.
CREATE FUNCTION public.trg_system_asset_change_svc() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  v_svc UUID;
  v_system UUID;
BEGIN
  v_system := CASE WHEN TG_OP = 'DELETE' THEN OLD.system_id ELSE NEW.system_id END;
  FOR v_svc IN SELECT service_id FROM business_service_systems WHERE system_id = v_system LOOP
    PERFORM recompute_service_impact(v_svc);
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_system_asset_aiud_svc
  AFTER INSERT OR DELETE OR UPDATE ON system_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_system_asset_change_svc();

-- ── 5. Retire the old link ───────────────────────────────────────────────────
DROP TABLE business_service_assets;

-- ── 6. Re-derive every service under the new rule ────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM business_services LOOP
    PERFORM recompute_service_impact(r.id);
  END LOOP;
END $$;
