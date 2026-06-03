-- Event enrichment knowledge graph: normalized registry + spatial venue cache.
-- connection_encounters.event_id links to events_registry.id (no JSONB event blobs on encounters).

-- ---------------------------------------------------------------------------
-- 1. connection_encounters: nullable event_id FK-style reference (text PK in registry)
-- ---------------------------------------------------------------------------

ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS event_id text;

CREATE INDEX IF NOT EXISTS idx_connection_encounters_event_id
    ON public.connection_encounters (event_id)
    WHERE event_id IS NOT NULL;

COMMENT ON COLUMN public.connection_encounters.event_id IS
    'Normalized reference to events_registry.id; populated asynchronously by enrichment pipeline.';

-- ---------------------------------------------------------------------------
-- 2. event_venues_cache — spatial resolution cache (lat/lon grid → venue name)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_venues_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lat numeric(7, 4) NOT NULL,
    lon numeric(7, 4) NOT NULL,
    venue_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_venues_cache_lat_lon_unique UNIQUE (lat, lon)
);

CREATE INDEX IF NOT EXISTS idx_event_venues_cache_lat_lon
    ON public.event_venues_cache (lat, lon);

COMMENT ON TABLE public.event_venues_cache IS
    'Grid-snapped venue names from OSM/Overpass; keyed by lat/lon rounded to 4 decimal places.';

-- ---------------------------------------------------------------------------
-- 3. events_registry — central hub for normalized event metadata
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events_registry (
    id text PRIMARY KEY,
    category text NOT NULL,
    title text NOT NULL,
    venue_name text NOT NULL,
    event_date date NOT NULL,
    provider text NOT NULL,
    provider_internal_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_registry_category_check CHECK (
        category IN ('sports', 'music', 'conference', 'generic')
    )
);

CREATE INDEX IF NOT EXISTS idx_events_registry_venue_name
    ON public.events_registry (venue_name);

CREATE INDEX IF NOT EXISTS idx_events_registry_event_date
    ON public.events_registry (event_date);

CREATE INDEX IF NOT EXISTS idx_events_registry_venue_date
    ON public.events_registry (venue_name, event_date);

COMMENT ON TABLE public.events_registry IS
    'Normalized event catalog; heavy payloads resolved on-demand via API, not stored here.';

-- ---------------------------------------------------------------------------
-- 4. RLS — read-only for authenticated; writes via service_role enrichment jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_venues_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_venues_cache_select_authenticated" ON public.event_venues_cache;
CREATE POLICY "event_venues_cache_select_authenticated"
    ON public.event_venues_cache
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "events_registry_select_authenticated" ON public.events_registry;
CREATE POLICY "events_registry_select_authenticated"
    ON public.events_registry
    FOR SELECT
    TO authenticated
    USING (true);

GRANT SELECT ON public.event_venues_cache TO authenticated;
GRANT SELECT ON public.events_registry TO authenticated;
GRANT ALL ON public.event_venues_cache TO service_role;
GRANT ALL ON public.events_registry TO service_role;

-- Allow enrichment pipeline to update encounter event_id (service_role bypasses RLS).
-- Participants retain existing SELECT on connection_encounters; no client UPDATE grant added.
