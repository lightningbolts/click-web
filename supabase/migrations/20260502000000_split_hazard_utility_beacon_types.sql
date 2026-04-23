-- Split legacy `hazard_utility` into distinct `hazard` and `utility` enum values for map_beacons.

ALTER TYPE public.map_beacon_type ADD VALUE IF NOT EXISTS 'hazard';

ALTER TYPE public.map_beacon_type ADD VALUE IF NOT EXISTS 'utility';

-- Legacy combined rows: default to `hazard` (cannot infer original user intent server-side).
UPDATE public.map_beacons
SET
    beacon_type = 'hazard'::public.map_beacon_type
WHERE
    beacon_type::text = 'hazard_utility';
