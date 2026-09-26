-- Relationship moments: anniversaries, memory prompts, group revival, waves, hangout
-- confirmations (one-sided / nearby logging), opt-in presence for "together now" detection,
-- and a guard so cron endpoints can be triggered by a public key without running twice.

-- 1. More nudge kinds + one generic dedupe key (unique per user, kind and key).
ALTER TABLE public.nudges DROP CONSTRAINT IF EXISTS nudges_nudge_type_check;
ALTER TABLE public.nudges ADD CONSTRAINT nudges_nudge_type_check CHECK (nudge_type = ANY (ARRAY[
  'reconnect_lull', 'shared_upcoming_event',
  'anniversary', 'memory_prompt', 'group_revival', 'wave', 'hangout_confirm'
]));
ALTER TABLE public.nudges ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS nudges_dedupe_uidx
  ON public.nudges (user_id, nudge_type, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 2. A hangout both people must confirm before it becomes a connection_encounters row.
--    source 'manual': one person logged it (they're pre-confirmed); 'nearby': detected.
CREATE TABLE IF NOT EXISTS public.hangout_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  user_ids uuid[] NOT NULL CHECK (cardinality(user_ids) = 2),
  confirmed_user_ids uuid[] NOT NULL DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('manual', 'nearby')),
  requested_by uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  gps_lat double precision,
  gps_lon double precision,
  location_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'expired')),
  encounter_id uuid,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hangout_confirmations_connection
  ON public.hangout_confirmations (connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hangout_confirmations_pending
  ON public.hangout_confirmations (expires_at) WHERE status = 'pending';
ALTER TABLE public.hangout_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hangout_confirmations_member_select ON public.hangout_confirmations;
CREATE POLICY hangout_confirmations_member_select ON public.hangout_confirmations
  FOR SELECT USING (auth.uid() = ANY (user_ids));

-- 3. Opt-in, ephemeral "I'm here" pings (latest only; purged after 2 hours). Only users who
--    turned on hangout detection ever write one. Server-only (no policies).
CREATE TABLE IF NOT EXISTS public.presence_pings (
  user_id uuid PRIMARY KEY,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  pinged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presence_pings_recent ON public.presence_pings (pinged_at);
ALTER TABLE public.presence_pings ENABLE ROW LEVEL SECURITY;

-- 4. At most one run per interval, whoever triggers it.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  name text PRIMARY KEY,
  last_started_at timestamptz NOT NULL
);
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_cron_run(p_name text, p_min_interval interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cron_runs AS r (name, last_started_at)
  VALUES (p_name, now())
  ON CONFLICT (name) DO UPDATE SET last_started_at = now()
  WHERE r.last_started_at < now() - p_min_interval;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_cron_run(text, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(text, interval) TO service_role;

-- Hourly maintenance schedule (applied 2026-09-26; replaces the Vault-based job, whose secrets
-- never existed). The anon key only gets a request past the gateway: claim_cron_run allows one
-- run per 50 minutes and the function reaches click-web with its injected service role key.
--   SELECT cron.unschedule('click-hourly-maintenance');
--   SELECT cron.schedule('click-hourly-maintenance', '0 * * * *', $$
--     SELECT net.http_post(
--       url := 'https://lrgcwnmcscimkmslihxp.supabase.co/functions/v1/cron-hourly-maintenance',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>'),
--       body := '{}'::jsonb
--     ) AS request_id;
--   $$);
