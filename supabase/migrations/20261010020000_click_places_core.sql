-- Click Places, step 3: consumer-facing Place profile, presence (check-ins), Pulse, encounter →
-- place attribution, Place Hubs, nearby RPC, photo bucket and the click_places flag.
-- Additive and idempotent. Ships dark (click_places flag starts disabled).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.place_category AS ENUM (
        'cafe', 'bar', 'nightlife', 'music_venue', 'restaurant', 'gym', 'coworking',
        'study_space', 'entertainment', 'bookstore', 'campus_space', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.place_verification_status AS ENUM ('draft', 'pending', 'verified', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.place_presence_proof AS ENUM ('qr', 'gps', 'event', 'encounter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. places: consumer profile, geofence, verification, listing
--    (the legacy free-text address column is named "location"; the geography column is geo_point)
-- ---------------------------------------------------------------------------
ALTER TABLE public.places
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS category public.place_category,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS photo_path TEXT,
    ADD COLUMN IF NOT EXISTS hours JSONB,
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    ADD COLUMN IF NOT EXISTS address_line TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS postal_code TEXT,
    ADD COLUMN IF NOT EXISTS country_code TEXT,
    ADD COLUMN IF NOT EXISTS website_url TEXT,
    ADD COLUMN IF NOT EXISTS radius_meters INTEGER NOT NULL DEFAULT 75,
    ADD COLUMN IF NOT EXISTS verification_status public.place_verification_status NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS hub_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.places
    ADD COLUMN IF NOT EXISTS geo_point geography (Point, 4326)
    GENERATED ALWAYS AS (
        CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN ST_SetSRID (ST_MakePoint (longitude, latitude), 4326)::geography
        END
    ) STORED;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_slug_format') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_slug_format CHECK (
            slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_radius_range') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_radius_range CHECK (radius_meters BETWEEN 25 AND 750);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_description_len') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_description_len CHECK (
            description IS NULL OR char_length(description) <= 500
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_hours_object') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_hours_object CHECK (
            hours IS NULL OR jsonb_typeof(hours) = 'object'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_lat_lng_range') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_lat_lng_range CHECK (
            (latitude IS NULL OR latitude BETWEEN -90 AND 90)
            AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_listed_requires_verified') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_listed_requires_verified CHECK (
            NOT listed OR (
                verification_status = 'verified'
                AND latitude IS NOT NULL AND longitude IS NOT NULL
                AND slug IS NOT NULL AND category IS NOT NULL
            )
        );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS places_slug_key ON public.places (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_places_geo_point_gix ON public.places USING GIST (geo_point);
CREATE INDEX IF NOT EXISTS idx_places_listed ON public.places (listed) WHERE listed;

CREATE OR REPLACE FUNCTION public.places_touch_updated_at ()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_places_touch_updated_at ON public.places;
CREATE TRIGGER trg_places_touch_updated_at
    BEFORE UPDATE ON public.places
    FOR EACH ROW EXECUTE FUNCTION public.places_touch_updated_at ();

COMMENT ON COLUMN public.places.location IS 'Legacy free-text address from B2B signup. Prefer address_line/city.';
COMMENT ON COLUMN public.places.geo_point IS 'Generated from latitude/longitude; Place center for geofence and nearby.';
COMMENT ON COLUMN public.places.radius_meters IS 'Presence radius (25–750 m) for check-in and encounter attribution.';
COMMENT ON COLUMN public.places.listed IS 'Shown to consumers (map, /p page). Requires verified + coordinates + slug + category.';
COMMENT ON COLUMN public.places.hours IS 'Weekly hours: {"mon":[["07:00","15:00"]],...}; closing before opening means after midnight. Missing day = closed.';

-- ---------------------------------------------------------------------------
-- 3. place_check_ins: explicit, expiring presence. Coordinates are never stored.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "venue_check_ins_select_managers" ON public.place_check_ins;
DROP POLICY IF EXISTS "place_check_ins_select_own" ON public.place_check_ins;
CREATE POLICY "place_check_ins_select_own"
    ON public.place_check_ins FOR SELECT TO authenticated
    USING (user_id = auth.uid ());

REVOKE INSERT, UPDATE, DELETE ON public.place_check_ins FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venue_check_ins FROM authenticated, anon;

ALTER TABLE public.place_check_ins
    ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS checkout_reason TEXT,
    ADD COLUMN IF NOT EXISTS proof public.place_presence_proof,
    ADD COLUMN IF NOT EXISTS proof_weight REAL,
    ADD COLUMN IF NOT EXISTS anchor_id UUID REFERENCES public.nfc_anchors (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS distance_bucket TEXT,
    ADD COLUMN IF NOT EXISTS accuracy_bucket TEXT,
    ADD COLUMN IF NOT EXISTS share_with_connections BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS count_for_insights BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS app_version TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_checkout_reason') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_checkout_reason CHECK (
            checkout_reason IS NULL OR checkout_reason IN ('user', 'expired', 'superseded')
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_proof_kind') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_proof_kind CHECK (
            proof IS NULL OR proof IN ('qr', 'gps')
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_buckets') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_buckets CHECK (
            (distance_bucket IS NULL OR distance_bucket IN ('0_25', '25_75', '75_150', '150_400', '400_plus'))
            AND (accuracy_bucket IS NULL OR accuracy_bucket IN ('0_20', '20_50', '50_100', '100_plus'))
        );
    END IF;
END $$;

-- At most one open check-in per user per Place. Stale open rows are closed before inserting (§5.4).
CREATE UNIQUE INDEX IF NOT EXISTS place_check_ins_one_open
    ON public.place_check_ins (user_id, place_id) WHERE checked_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_place_check_ins_place_time
    ON public.place_check_ins (place_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_check_ins_user_time
    ON public.place_check_ins (user_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_check_ins_open
    ON public.place_check_ins (place_id, expires_at) WHERE checked_out_at IS NULL;

COMMENT ON TABLE public.place_check_ins IS
    'Click Places explicit check-ins. Written only by click-web (service role). Never expose rows to managers. Purged after 90 days.';

-- ---------------------------------------------------------------------------
-- 4. place_pulses: one structured reading by a present user. Service role only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.place_pulses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    place_id           UUID NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
    user_id            UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    check_in_id        UUID REFERENCES public.place_check_ins (id) ON DELETE SET NULL,
    beacon_id          UUID REFERENCES public.map_beacons (id) ON DELETE SET NULL,
    proof              public.place_presence_proof NOT NULL,
    proof_weight       REAL NOT NULL CHECK (proof_weight > 0 AND proof_weight <= 1),
    energy             SMALLINT CHECK (energy BETWEEN 1 AND 4),
    talkable           SMALLINT CHECK (talkable IN (0, 1)),
    category_question  TEXT CHECK (category_question IN ('seats', 'line', 'wait', 'equipment')),
    category_answer    SMALLINT CHECK (category_answer BETWEEN 1 AND 3),
    would_return       SMALLINT CHECK (would_return IN (0, 1)),
    question_version   SMALLINT NOT NULL DEFAULT 1,
    count_for_insights BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT place_pulses_has_answer CHECK (energy IS NOT NULL OR would_return IS NOT NULL),
    CONSTRAINT place_pulses_category_pair CHECK ((category_question IS NULL) = (category_answer IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_place_pulses_place_time ON public.place_pulses (place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_pulses_user_place_time
    ON public.place_pulses (user_id, place_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.place_pulses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_pulses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.place_pulses TO service_role;

COMMENT ON TABLE public.place_pulses IS
    'Click Places Pulse. energy: 1 chill, 2 steady, 3 lively, 4 packed. talkable/would_return: 1 yes, 0 no. category_answer: 1 low, 2 some, 3 high (meaning per category_question). user_id nulled after 30 days.';

-- ---------------------------------------------------------------------------
-- 5. QR anchors for check-in
-- ---------------------------------------------------------------------------
ALTER TABLE public.nfc_anchors
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'floorplan',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfc_anchors_purpose') THEN
        ALTER TABLE public.nfc_anchors ADD CONSTRAINT nfc_anchors_purpose CHECK (purpose IN ('floorplan', 'check_in'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Place Hub link (one hub per Place). The Place pin is the hub's map surface.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hub_venues_place_id_key
    ON public.hub_venues (place_id) WHERE place_id IS NOT NULL;

-- Same body as 20260831000000_event_auto_hubs.sql plus "AND h.place_id IS NULL".
CREATE OR REPLACE FUNCTION public.get_hubs_nearby(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id text,
    name text,
    category text,
    geofence_lat double precision,
    geofence_long double precision,
    radius_meters integer,
    expires_at timestamptz,
    distance_meters double precision,
    participant_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH nearby AS (
        SELECT
            h.id, h.name, h.category, h.geofence_lat, h.geofence_long, h.radius_meters, h.expires_at,
            ST_Distance(h.location, ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography) AS distance_meters
        FROM public.hub_venues h
        WHERE (h.expires_at IS NULL OR h.expires_at > now())
          AND h.event_beacon_id IS NULL
          AND h.place_id IS NULL
          AND ST_DWithin (h.location, ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography, radius_meters)
        ORDER BY distance_meters ASC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    )
    SELECT n.id, n.name, n.category, n.geofence_lat, n.geofence_long, n.radius_meters, n.expires_at,
           n.distance_meters, COALESCE(pc.cnt, 0::bigint) AS participant_count
    FROM nearby n
    LEFT JOIN (
        SELECT hub_id, COUNT(*)::bigint AS cnt FROM public.hub_participants GROUP BY hub_id
    ) pc ON pc.hub_id = n.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Encounter → Place attribution (all write paths, via trigger)
-- ---------------------------------------------------------------------------
ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connection_encounters_place_time
    ON public.connection_encounters (place_id, encountered_at DESC) WHERE place_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_place_at (p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT p.id
    FROM public.places p
    WHERE p_lat IS NOT NULL AND p_lng IS NOT NULL
      AND NOT (p_lat = 0 AND p_lng = 0)
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      -- 750 m prefilter (max radius) lets the GIST index work; then the per-Place radius.
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography, 750)
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography, p.radius_meters)
    ORDER BY ST_Distance (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_place_at (double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_place_at (double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.connection_encounters_assign_place ()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.place_id IS NULL AND NEW.gps_lat IS NOT NULL AND NEW.gps_lon IS NOT NULL THEN
        NEW.place_id := public.resolve_place_at (NEW.gps_lat, NEW.gps_lon);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_encounters_assign_place ON public.connection_encounters;
CREATE TRIGGER trg_connection_encounters_assign_place
    BEFORE INSERT OR UPDATE OF gps_lat, gps_lon ON public.connection_encounters
    FOR EACH ROW EXECUTE FUNCTION public.connection_encounters_assign_place ();

-- Re-attribute history after a Place is verified, moved, or its radius changes (admin action).
CREATE OR REPLACE FUNCTION public.backfill_place_encounters (p_place_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.connection_encounters SET place_id = NULL WHERE place_id = p_place_id;

    UPDATE public.connection_encounters e
    SET place_id = p_place_id
    FROM public.places p
    WHERE p.id = p_place_id
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      AND e.place_id IS NULL
      AND e.gps_lat IS NOT NULL AND e.gps_lon IS NOT NULL
      AND NOT (e.gps_lat = 0 AND e.gps_lon = 0)
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (e.gps_lon, e.gps_lat), 4326)::geography, p.radius_meters);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_place_encounters (uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_place_encounters (uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Nearby listed Places (service role; click-web serializes the public fields)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.places_nearby (
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_meters DOUBLE PRECISION DEFAULT 5000,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (place_id UUID, distance_meters DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT p.id,
           ST_Distance (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography)
    FROM public.places p
    WHERE p.listed
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      AND ST_DWithin (
          p.geo_point,
          ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography,
          LEAST(GREATEST(COALESCE(p_radius_meters, 5000), 50), 50000)
      )
    ORDER BY 2 ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.places_nearby (double precision, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.places_nearby (double precision, double precision, double precision, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Public photo bucket (reads public; writes service role only — no storage.objects policies)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('place-photos', 'place-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Feature flag (dark)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'click_places',
    'Click Places: Place pins, pages, check-in and Pulse (CLICK_PLACES_SPEC.md).',
    '{
      "checkin_ttl_minutes": 180,
      "gps_max_accuracy_meters": 100,
      "qr_gps_slack_multiplier": 3,
      "pulse_window_minutes": 90,
      "pulse_half_life_minutes": 30,
      "pulse_cooldown_minutes": 45,
      "pulse_edit_window_minutes": 15,
      "presence_encounter_window_minutes": 180,
      "would_return_window_minutes": 180,
      "last_pulse_lookback_hours": 168,
      "pattern_weeks": 8,
      "been_here_days": 90,
      "nearby_default_radius_meters": 5000,
      "nearby_max_radius_meters": 50000,
      "nearby_max_limit": 200
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
