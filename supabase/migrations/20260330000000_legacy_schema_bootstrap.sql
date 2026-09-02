-- Tracked foundation for the legacy Click schema consumed by later migrations.
--
-- Production projects already contain these relations, so every definition is
-- additive and guarded. A fresh `supabase db reset` has no manual SQL-editor
-- precondition, while an upgrade leaves existing tables, data, policies, and
-- grants untouched. Feature migrations remain the owners of all changes after
-- this compatibility foundation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

SET search_path = public, extensions, pg_temp;

DO $$
BEGIN
    CREATE TYPE public.connection_lifecycle_status AS ENUM (
        'pending',
        'active',
        'kept',
        'archived',
        'removed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- Public profile tables used by legacy routes and later migrations.
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    interests TEXT[] NOT NULL DEFAULT '{}'
);

-- Legacy pair/group connection contract. Environmental columns are retained
-- here because the timeline migration backfills them before removing them.
CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_ids TEXT[] NOT NULL DEFAULT '{}',
    created BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
    created_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry BIGINT NOT NULL DEFAULT 0,
    expiry_state TEXT,
    has_begun BOOLEAN NOT NULL DEFAULT false,
    last_message_at BIGINT,
    initiator_id UUID,
    responder_id UUID,
    connection_method TEXT,
    status public.connection_lifecycle_status,
    flagged BOOLEAN NOT NULL DEFAULT false,
    proximity_signals JSONB NOT NULL DEFAULT '{}'::JSONB,
    memory_capsule JSONB,
    full_location TEXT,
    geo_location JSONB,
    semantic_location TEXT,
    weather_condition TEXT,
    noise_level TEXT,
    exact_noise_level_db DOUBLE PRECISION,
    height_category TEXT,
    exact_barometric_elevation_m DOUBLE PRECISION,
    context_tag_id TEXT,
    context TEXT
);

-- Encounter rows are referenced by migrations that precede the historical
-- CREATE TABLE statement in this repository, so the base relation must exist
-- before the timestamped feature chain starts.
CREATE TABLE IF NOT EXISTS public.connection_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    encountered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    location_name TEXT,
    gps_coordinates geography (Point, 4326),
    gps_lat DOUBLE PRECISION,
    gps_lon DOUBLE PRECISION,
    weather_snapshot JSONB,
    noise_level TEXT,
    elevation_category TEXT,
    context_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
);

CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.connections (id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    time_created BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
    time_edited BIGINT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    message_type TEXT,
    metadata JSONB,
    local_sent_at BIGINT,
    read_at BIGINT
);

CREATE TABLE IF NOT EXISTS public.connection_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, connection_id)
);

CREATE TABLE IF NOT EXISTS public.connection_hidden (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, connection_id)
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.user_interests (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- This relation was historically created by supabase-setup.sql. Keep its
-- source-of-truth shape in the tracked chain. Waitlist access is owned by the
-- later, explicitly ordered waitlist-signup migration so this older bootstrap
-- never changes production policies or grants when rerun.
CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    source TEXT DEFAULT 'website',
    referrer_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at);
