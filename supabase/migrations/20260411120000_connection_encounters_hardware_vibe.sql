-- Hardware vibe snapshot columns (tri-factor proximity) + handshake staging for pairwise vibe rules.
ALTER TABLE public.connection_encounters
    ADD COLUMN lux_level double precision;

ALTER TABLE public.connection_encounters
    ADD COLUMN motion_variance double precision;

ALTER TABLE public.connection_encounters
    ADD COLUMN compass_azimuth double precision;

ALTER TABLE public.connection_encounters
    ADD COLUMN battery_level integer;

COMMENT ON COLUMN public.connection_encounters.lux_level IS
    'Ambient light in lux (Android). iOS clients send a 0–100 brightness-derived proxy.';

COMMENT ON COLUMN public.connection_encounters.motion_variance IS
    'Variance of acceleration-vector magnitude over ~500ms at handshake time.';

COMMENT ON COLUMN public.connection_encounters.compass_azimuth IS
    'Compass azimuth in degrees [0,360) at handshake time when available.';

COMMENT ON COLUMN public.connection_encounters.battery_level IS
    'Device battery percent (0–100) at handshake time when available.';

ALTER TABLE public.proximity_handshake_events
    ADD COLUMN lux_level double precision;

ALTER TABLE public.proximity_handshake_events
    ADD COLUMN motion_variance double precision;

ALTER TABLE public.proximity_handshake_events
    ADD COLUMN compass_azimuth double precision;

ALTER TABLE public.proximity_handshake_events
    ADD COLUMN battery_level integer;
