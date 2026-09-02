-- Legacy combined rows: default to `hazard` (cannot infer original user intent server-side).
-- This is intentionally separate from 20260502000000 because PostgreSQL does
-- not allow a newly added enum value to be used before that transaction commits.

UPDATE public.map_beacons
SET
    beacon_type = 'hazard'::public.map_beacon_type
WHERE
    beacon_type::text = 'hazard_utility';
