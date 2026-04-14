-- Live ticker / RPC: normalize `connection_encounters.weather_snapshot` when stored as a JSON **string**
-- (scalar jsonb) and expose safe numeric fields. Uses PL/pgSQL so one bad row cannot fail `jsonb_agg`.

CREATE OR REPLACE FUNCTION public.build_sanitized_connection_payload(p_row public.connections)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_display text;
  v_snap jsonb;
  v_ws jsonb;
  v_cond text;
  v_temp double precision;
  v_wind double precision;
BEGIN
  SELECT e.display_location, e.weather_snapshot
  INTO v_display, v_snap
  FROM public.connection_encounters AS e
  WHERE e.connection_id = p_row.id
  ORDER BY e.encountered_at DESC NULLS LAST
  LIMIT 1;

  v_ws := NULL;
  IF v_snap IS NOT NULL THEN
    IF jsonb_typeof(v_snap) = 'string' THEN
      BEGIN
        v_ws := (v_snap #>> '{}')::jsonb;
      EXCEPTION
        WHEN OTHERS THEN
          v_ws := NULL;
      END;
    ELSE
      v_ws := v_snap;
    END IF;
  END IF;

  v_cond := NULL;
  IF v_ws IS NOT NULL THEN
    v_cond := NULLIF(
      trim(COALESCE(v_ws ->> 'condition', v_ws ->> 'Condition', '')),
      ''
    );
  END IF;

  v_temp := NULL;
  IF v_ws IS NOT NULL THEN
    BEGIN
      v_temp := COALESCE(
        NULLIF(trim(v_ws ->> 'temperatureCelsius'), '')::double precision,
        NULLIF(trim(v_ws ->> 'temperature_celsius'), '')::double precision
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_temp := NULL;
    END;
  END IF;

  v_wind := NULL;
  IF v_ws IS NOT NULL THEN
    BEGIN
      v_wind := COALESCE(
        NULLIF(trim(v_ws ->> 'windSpeedKph'), '')::double precision,
        NULLIF(trim(v_ws ->> 'wind_speed_kph'), '')::double precision
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_wind := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id',
    p_row.id,
    'display_location',
    COALESCE(NULLIF(trim(COALESCE(v_display, '')), ''), 'A new city'::text),
    'connection_method',
    lower(COALESCE(p_row.connection_method, 'qr')),
    'weather_condition',
    v_cond,
    'weather_temperature_celsius',
    v_temp,
    'weather_wind_speed_kph',
    v_wind,
    'created',
    p_row.created,
    'created_utc',
    p_row.created_utc
  );
END;
$$;

COMMENT ON FUNCTION public.build_sanitized_connection_payload(public.connections) IS
  'Privacy-safe ticker/RPC payload: latest encounter display_location + weather (object or stringified JSON). Never raises on corrupt snapshot.';
