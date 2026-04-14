-- Live ticker / RPC: normalize `connection_encounters.weather_snapshot` when stored as a JSON **string**
-- (scalar jsonb) and expose safe numeric fields for the public payload (condition + °C + wind only).

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
      NULLIF(trim(COALESCE(latest.display_location, '')), ''),
      'A new city'::text
    ),
    'connection_method',
    lower(COALESCE(p_row.connection_method, 'qr')),
    'weather_condition',
    NULLIF(
      trim(
        COALESCE(
          latest.ws ->> 'condition',
          latest.ws ->> 'Condition'
        )
      ),
      ''
    ),
    'weather_temperature_celsius',
    COALESCE(
      NULLIF(trim(latest.ws ->> 'temperatureCelsius'), '')::double precision,
      NULLIF(trim(latest.ws ->> 'temperature_celsius'), '')::double precision
    ),
    'weather_wind_speed_kph',
    COALESCE(
      NULLIF(trim(latest.ws ->> 'windSpeedKph'), '')::double precision,
      NULLIF(trim(latest.ws ->> 'wind_speed_kph'), '')::double precision
    ),
    'created',
    p_row.created,
    'created_utc',
    p_row.created_utc
  )
  FROM (SELECT 1) AS _dummy
    LEFT JOIN LATERAL (
      SELECT
        e.display_location,
        CASE
          WHEN e.weather_snapshot IS NULL THEN NULL::jsonb
          WHEN jsonb_typeof(e.weather_snapshot) = 'string' THEN (e.weather_snapshot #>> '{}')::jsonb
          ELSE e.weather_snapshot
        END AS ws
      FROM public.connection_encounters AS e
      WHERE e.connection_id = p_row.id
      ORDER BY e.encountered_at DESC NULLS LAST
      LIMIT 1
    ) AS latest ON true;
$$;

COMMENT ON FUNCTION public.build_sanitized_connection_payload(public.connections) IS
  'Privacy-safe ticker/RPC payload: latest encounter display_location + normalized weather_snapshot (object or stringified JSON) with camelCase/snake_case keys.';
