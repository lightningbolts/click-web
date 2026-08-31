-- P2 cleanup: optional venue check-in → event attribution, interest tags on beacons.
-- Additive. No encounter column drops. P2.1 dual-ref report is a script, not DDL.

ALTER TABLE public.venue_check_ins
    ADD COLUMN IF NOT EXISTS beacon_id UUID NULL REFERENCES public.map_beacons (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venue_check_ins_beacon
    ON public.venue_check_ins (beacon_id)
    WHERE beacon_id IS NOT NULL;

COMMENT ON COLUMN public.venue_check_ins.beacon_id IS
    'Optional concurrent event beacon for a venue-level check-in. Unused by current writers.';

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_map_beacons_tags
    ON public.map_beacons USING GIN (tags);

COMMENT ON COLUMN public.map_beacons.tags IS
    'Interest/tag matching on events. Empty-array default; no mandatory backfill. Retroactive tagging is optional.';
