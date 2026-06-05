-- Re-engagement collaboration sessions (Disposable Roll + Squad Map Drops).
-- Created when existing friends bump phones (is_new_connection = false).
--
-- If a prior attempt failed with connection_id TEXT, drop the partial table first:
--   DROP TABLE IF EXISTS public.collaboration_sessions;

CREATE TABLE IF NOT EXISTS public.collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats (id) ON DELETE SET NULL,
  collaboration_ttl TIMESTAMPTZ NOT NULL,
  participant_user_ids TEXT[] NOT NULL,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collaboration_sessions_connection_idx
  ON public.collaboration_sessions (connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collaboration_sessions_reveal_cron_idx
  ON public.collaboration_sessions (collaboration_ttl)
  WHERE notification_sent = FALSE;

ALTER TABLE public.collaboration_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collaboration_sessions_select_participant ON public.collaboration_sessions;
CREATE POLICY collaboration_sessions_select_participant ON public.collaboration_sessions
  FOR SELECT
  USING (
    auth.uid()::text = ANY (participant_user_ids)
  );

COMMENT ON TABLE public.collaboration_sessions IS
  'Time-locked re-engagement window after existing-friend proximity bumps; powers Disposable Roll and Squad map drops.';
