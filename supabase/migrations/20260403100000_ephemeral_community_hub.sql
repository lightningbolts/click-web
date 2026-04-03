-- Ephemeral Community Hub: geofence registry, chat persistence, Realtime publication.
--
-- NOTE: public.venues already exists (Click Insights B2B). This feature uses
-- public.hub_venues with the columns required for proximity verification
-- (id = deep-link hub_id, e.g. local_point).

-- ---------------------------------------------------------------------------
-- 1. hub_venues — proximity registry for click://hub/{id}
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hub_venues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    geofence_lat DOUBLE PRECISION NOT NULL,
    geofence_long DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 50 CHECK (radius_meters > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_venues_created_at ON public.hub_venues (created_at);

COMMENT ON TABLE public.hub_venues IS
    'Geofence centers for ephemeral community hubs; id matches deep-link hub_id (click://hub/{id}).';

-- ---------------------------------------------------------------------------
-- 2. hub_messages — ephemeral chat rows (TTL enforced by pg_cron, see below)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hub_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id TEXT NOT NULL REFERENCES public.hub_venues (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(trim(body)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_messages_hub_created
    ON public.hub_messages (hub_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_messages_created_at
    ON public.hub_messages (created_at);

COMMENT ON TABLE public.hub_messages IS
    'Ephemeral hub chat messages; delete rows older than 24h via scheduled job.';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.hub_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_messages ENABLE ROW LEVEL SECURITY;

-- Registry is maintained via service role / SQL; clients verify via Edge Function only.
-- No SELECT policies for anon/authenticated (service_role bypasses RLS).

-- Authenticated users can read/write messages for any hub they know the id for;
-- proximity is enforced by verify-hub-proximity before the app opens the channel.

DROP POLICY IF EXISTS "hub_messages_select_authenticated" ON public.hub_messages;
CREATE POLICY "hub_messages_select_authenticated"
    ON public.hub_messages FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "hub_messages_insert_authenticated" ON public.hub_messages;
CREATE POLICY "hub_messages_insert_authenticated"
    ON public.hub_messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON public.hub_messages TO authenticated;
REVOKE ALL ON public.hub_venues FROM authenticated;
REVOKE ALL ON public.hub_venues FROM anon;

-- ---------------------------------------------------------------------------
-- 5. Realtime (postgres_changes on hub_messages)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hub_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hub_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Suggested pg_cron job (run manually in SQL editor or via migration if pg_cron enabled)
-- ---------------------------------------------------------------------------
-- Prerequisites on Supabase: enable extension pg_cron (Dashboard → Database → Extensions)
-- and ensure the cron job runs as a role that can delete from public.hub_messages.
--
-- Example: purge messages older than 24 hours every 15 minutes
--
-- SELECT cron.schedule(
--   'purge_hub_messages_24h',
--   '*/15 * * * *',
--   $cron$
--   DELETE FROM public.hub_messages
--   WHERE created_at < (now() AT TIME ZONE 'utc') - interval '24 hours';
--   $cron$
-- );
--
-- To remove the job later:
-- SELECT cron.unschedule('purge_hub_messages_24h');
--
-- Alternative without pg_cron: invoke a Supabase Edge Function on a schedule
-- (Dashboard → Edge Functions → Cron) that runs the same DELETE using service_role.
