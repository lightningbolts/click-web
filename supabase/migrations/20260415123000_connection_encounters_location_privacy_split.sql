-- Location privacy split for encounters:
-- - semantic_location keeps full reverse-geocode payload (internal analytics only)
-- - display_location keeps a broad, public-safe city label for UI surfaces

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS semantic_location jsonb;

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS display_location text;

COMMENT ON COLUMN public.connection_encounters.semantic_location IS
    'Full reverse-geocoded payload from Nominatim; internal only, never exposed on public surfaces.';

COMMENT ON COLUMN public.connection_encounters.display_location IS
    'Privacy-safe city label for public surfaces like the Live Ticker.';

UPDATE public.connection_encounters
SET display_location = 'A new city'
WHERE display_location IS NULL OR btrim(display_location) = '';

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
            SELECT e.display_location
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
