-- Richer per-device connection sensor capture (location velocity/provenance, versioned raw
-- sensor observation) and aggregate capture-quality telemetry.
--
-- Each encounter row remains one reporting user's own observation. Everything is nullable
-- and additive; older clients send none of it.

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS gps_speed_mps double precision,
    ADD COLUMN IF NOT EXISTS gps_speed_accuracy_mps double precision,
    ADD COLUMN IF NOT EXISTS gps_course_deg double precision,
    ADD COLUMN IF NOT EXISTS gps_course_accuracy_deg double precision,
    ADD COLUMN IF NOT EXISTS gps_simulated boolean,
    ADD COLUMN IF NOT EXISTS gps_external_accessory boolean,
    ADD COLUMN IF NOT EXISTS sensor_observation jsonb;

DO $$
BEGIN
    ALTER TABLE public.connection_encounters
        ADD CONSTRAINT connection_encounters_sensor_observation_size
        CHECK (sensor_observation IS NULL OR octet_length(sensor_observation::text) <= 65536);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.connection_encounters.gps_speed_mps IS
    'Reporting device''s Core Location speed (m/s). NULL when the OS reported it invalid.';
COMMENT ON COLUMN public.connection_encounters.gps_speed_accuracy_mps IS
    'Uncertainty (m/s) of gps_speed_mps.';
COMMENT ON COLUMN public.connection_encounters.gps_course_deg IS
    'Reporting device''s course over ground (degrees from true north). NULL when invalid.';
COMMENT ON COLUMN public.connection_encounters.gps_course_accuracy_deg IS
    'Uncertainty (degrees) of gps_course_deg.';
COMMENT ON COLUMN public.connection_encounters.gps_simulated IS
    'true when the OS flagged the fix as produced by software simulation.';
COMMENT ON COLUMN public.connection_encounters.gps_external_accessory IS
    'true when the fix came from an external accessory (e.g. a GNSS receiver).';
COMMENT ON COLUMN public.connection_encounters.sensor_observation IS
    'Versioned raw connection sensor observation from the reporting device (schema_version): '
    'location, barometer, short motion window, heading/magnetometer, BLE RSSI/timing, '
    'ultrasonic signal metrics, device context. Never raw audio. Bounded to 64 KB.';

-- Aggregate capture quality for tuning (no user ids, no coordinates, no tokens).
ALTER TABLE public.connection_flow_events
    ADD COLUMN IF NOT EXISTS capture_quality jsonb;
ALTER TABLE public.connection_flow_events_p
    ADD COLUMN IF NOT EXISTS capture_quality jsonb;

COMMENT ON COLUMN public.connection_flow_events.capture_quality IS
    'Allowlisted numeric/boolean capture-quality aggregates (accuracy, latencies, SNR). No identifiers or coordinates.';
