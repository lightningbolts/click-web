-- Relative ground level: barometric device elevation minus terrain DEM at GPS (m).

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS relative_altitude_m double precision;

COMMENT ON COLUMN public.connection_encounters.relative_altitude_m IS
    'Height of the device above local terrain (m): exact_barometric_elevation_m minus terrain elevation from a DEM lookup at gps_lat/gps_lon.';
