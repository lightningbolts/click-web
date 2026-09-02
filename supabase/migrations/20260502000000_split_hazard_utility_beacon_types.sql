-- Split legacy `hazard_utility` into distinct `hazard` and `utility` enum values for map_beacons.

ALTER TYPE public.map_beacon_type ADD VALUE IF NOT EXISTS 'hazard';

ALTER TYPE public.map_beacon_type ADD VALUE IF NOT EXISTS 'utility';

-- The enum values must be committed before they can be used in a typed
-- expression. The idempotent legacy-row backfill runs in the next migration.
