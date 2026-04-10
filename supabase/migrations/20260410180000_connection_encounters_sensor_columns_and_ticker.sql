-- Sensor columns on connection_encounters + ticker / broadcast read from encounters
-- (restores display_location / weather_condition after connections.* env columns were dropped)

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS exact_noise_level_db double precision;

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS exact_barometric_elevation_m double precision;

COMMENT ON COLUMN public.connection_encounters.exact_noise_level_db IS
    'Measured ambient noise (dB SPL) at crossing time; mirrors legacy connections.exact_noise_level_db.';

COMMENT ON COLUMN public.connection_encounters.exact_barometric_elevation_m IS
    'Calibrated barometric elevation (m); mirrors legacy connections.exact_barometric_elevation_m.';

-- Best-effort backfill from JSON if values were ever embedded in weather_snapshot (camelCase or snake_case).
UPDATE public.connection_encounters e
SET
    exact_noise_level_db = COALESCE(
        e.exact_noise_level_db,
        NULLIF(trim(e.weather_snapshot ->> 'exactNoiseLevelDb'), '')::double precision,
        NULLIF(trim(e.weather_snapshot ->> 'exact_noise_level_db'), '')::double precision
    ),
    exact_barometric_elevation_m = COALESCE(
        e.exact_barometric_elevation_m,
        NULLIF(trim(e.weather_snapshot ->> 'exactBarometricElevationMeters'), '')::double precision,
        NULLIF(trim(e.weather_snapshot ->> 'exact_barometric_elevation_m'), '')::double precision
    )
WHERE e.exact_noise_level_db IS NULL
   OR e.exact_barometric_elevation_m IS NULL;

-- ---------------------------------------------------------------------------
-- Public ticker payload: pull locality + weather from latest encounter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_sanitized_connection_payload(p_row public.connections)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',
    p_row.id,
    'display_location',
    COALESCE(
        NULLIF(
            trim(
                (
                    SELECT e.location_name
                    FROM public.connection_encounters e
                    WHERE e.connection_id = p_row.id
                    ORDER BY e.encountered_at DESC NULLS LAST
                    LIMIT 1
                )
            ),
            ''
        ),
        'A new city'::text
    ),
    'connection_method',
    lower(COALESCE(p_row.connection_method, 'qr')),
    'weather_condition',
    (
        SELECT NULLIF(trim(e.weather_snapshot #>> '{condition}'), '')
        FROM public.connection_encounters e
        WHERE e.connection_id = p_row.id
        ORDER BY e.encountered_at DESC NULLS LAST
        LIMIT 1
    ),
    'created',
    p_row.created,
    'created_utc',
    p_row.created_utc
  );
$$;

-- Broadcast after the first encounter row exists (connection INSERT alone no longer carries geo/weather).
DROP TRIGGER IF EXISTS trg_broadcast_sanitized_connection ON public.connections;

CREATE OR REPLACE FUNCTION public.broadcast_sanitized_connection_from_encounter ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conn public.connections;
    v_payload jsonb;
    v_cnt int;
BEGIN
    SELECT COUNT(*)::int INTO v_cnt
    FROM public.connection_encounters
    WHERE connection_id = NEW.connection_id;

    IF v_cnt <> 1 THEN
        RETURN NEW;
    END IF;

    SELECT *
    INTO v_conn
    FROM public.connections
    WHERE id = NEW.connection_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_payload := public.build_sanitized_connection_payload(v_conn);

    PERFORM realtime.send(
        v_payload,
        'new_connection',
        'public-ticker',
        true
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_sanitized_connection_encounter ON public.connection_encounters;

CREATE TRIGGER trg_broadcast_sanitized_connection_encounter
    AFTER INSERT ON public.connection_encounters
    FOR EACH ROW
    EXECUTE FUNCTION public.broadcast_sanitized_connection_from_encounter ();

COMMENT ON FUNCTION public.broadcast_sanitized_connection_from_encounter () IS
    'AFTER INSERT on connection_encounters: when this is the origin encounter (only row), broadcast ticker payload.';
