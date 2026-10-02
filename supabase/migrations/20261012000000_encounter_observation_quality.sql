-- Per-device observation quality for connection encounters.
--
-- Each encounter row is one reporting user's own phone observation (`reporting_user_id`).
-- These columns keep the uncertainty and provenance that the phone measured alongside the
-- coordinate and barometer reading, so a 4 m fix and a 20 m fix are no longer
-- indistinguishable. Observations from different users are never merged or averaged.
--
-- All columns are nullable and additive: older clients send none of them.

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS gps_horizontal_accuracy_m double precision,
    ADD COLUMN IF NOT EXISTS gps_vertical_accuracy_m double precision,
    ADD COLUMN IF NOT EXISTS gps_altitude_m double precision,
    ADD COLUMN IF NOT EXISTS gps_ellipsoidal_altitude_m double precision,
    ADD COLUMN IF NOT EXISTS gps_observed_at timestamptz,
    ADD COLUMN IF NOT EXISTS gps_floor integer,
    ADD COLUMN IF NOT EXISTS gps_full_accuracy boolean,
    ADD COLUMN IF NOT EXISTS barometric_accuracy_m double precision,
    ADD COLUMN IF NOT EXISTS barometric_precision_m double precision,
    ADD COLUMN IF NOT EXISTS barometric_relative_altitude_m double precision,
    ADD COLUMN IF NOT EXISTS barometric_pressure_kpa double precision,
    ADD COLUMN IF NOT EXISTS terrain_elevation_m double precision;

COMMENT ON COLUMN public.connection_encounters.gps_horizontal_accuracy_m IS
    'Reporting device''s horizontal uncertainty radius (m, 1σ-style) for gps_lat/gps_lon. NULL for legacy clients.';
COMMENT ON COLUMN public.connection_encounters.gps_vertical_accuracy_m IS
    'Reporting device''s Core Location vertical uncertainty (m). Present only when positive (valid).';
COMMENT ON COLUMN public.connection_encounters.gps_altitude_m IS
    'Core Location / GNSS altitude above mean sea level (m). Independent of the barometer.';
COMMENT ON COLUMN public.connection_encounters.gps_ellipsoidal_altitude_m IS
    'Core Location altitude above the WGS 84 ellipsoid (m).';
COMMENT ON COLUMN public.connection_encounters.gps_observed_at IS
    'Device timestamp of the location fix used for this encounter (may precede encountered_at).';
COMMENT ON COLUMN public.connection_encounters.gps_floor IS
    'Logical building floor reported by the OS (CLLocation.floor). Never inferred from altitude.';
COMMENT ON COLUMN public.connection_encounters.gps_full_accuracy IS
    'false when the OS granted only reduced (approximate) location accuracy.';
COMMENT ON COLUMN public.connection_encounters.exact_barometric_elevation_m IS
    'Barometric absolute altitude estimate (m AMSL). Not exact despite the legacy name: see barometric_accuracy_m.';
COMMENT ON COLUMN public.connection_encounters.barometric_accuracy_m IS
    'Estimated 1σ uncertainty (m) of exact_barometric_elevation_m as reported by the altimeter.';
COMMENT ON COLUMN public.connection_encounters.barometric_precision_m IS
    'Altimeter-recommended display precision (m) for exact_barometric_elevation_m.';
COMMENT ON COLUMN public.connection_encounters.barometric_relative_altitude_m IS
    'Altimeter relative altitude (m) since the capture session''s first altimeter event.';
COMMENT ON COLUMN public.connection_encounters.barometric_pressure_kpa IS
    'Barometric pressure (kPa) recorded with the barometric reading.';
COMMENT ON COLUMN public.connection_encounters.terrain_elevation_m IS
    'DEM terrain elevation (m AMSL) at gps_lat/gps_lon used to derive relative_altitude_m.';
COMMENT ON COLUMN public.connection_encounters.relative_altitude_m IS
    'Height above local terrain (m): exact_barometric_elevation_m minus terrain_elevation_m. Derived asynchronously.';

-- Pending taps keep the spatial quality needed to reconstruct each user's own observation
-- after asynchronous matching. The remaining metadata lives in sensor_payload.
ALTER TABLE public.pending_handshakes
    ADD COLUMN IF NOT EXISTS horizontal_accuracy_m double precision,
    ADD COLUMN IF NOT EXISTS location_observed_at timestamptz;

COMMENT ON COLUMN public.pending_handshakes.horizontal_accuracy_m IS
    'Horizontal uncertainty (m) of lat/lon as measured by this user''s device.';
COMMENT ON COLUMN public.pending_handshakes.location_observed_at IS
    'Device timestamp of the location fix in lat/lon.';
