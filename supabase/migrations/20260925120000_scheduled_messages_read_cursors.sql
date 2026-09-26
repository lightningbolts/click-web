-- Scheduled messages + per-member read cursors (group read receipts).

-- A message composed (and, for E2EE chats, encrypted) now and inserted into `messages` at
-- `send_at` by /api/cron/scheduled-messages. Written only by the server (service role).
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_at bigint NOT NULL,            -- ms epoch
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_messages_due ON public.scheduled_messages (send_at);
CREATE INDEX IF NOT EXISTS scheduled_messages_owner ON public.scheduled_messages (user_id, chat_id);
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_messages_owner_select ON public.scheduled_messages;
CREATE POLICY scheduled_messages_owner_select ON public.scheduled_messages
  FOR SELECT USING (auth.uid() = user_id);

-- How far each member has read a chat (ms epoch of the read). Upserted by
-- PATCH /api/chat/messages/read; members see each other's (Instagram-style receipts).
CREATE TABLE IF NOT EXISTS public.chat_read_cursors (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_through bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
ALTER TABLE public.chat_read_cursors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_read_cursors_member_select ON public.chat_read_cursors;
CREATE POLICY chat_read_cursors_member_select ON public.chat_read_cursors
  FOR SELECT USING (public.auth_uid_can_access_chat(chat_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_read_cursors'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_cursors;
  END IF;
END $$;

-- Delivery runs every minute (SQL Editor, after deploying click-web and the
-- cron-scheduled-messages edge function; same Vault secrets as click-hourly-maintenance):
--   SELECT cron.schedule('click-scheduled-messages', '* * * * *', $$
--     SELECT net.http_post(
--       url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
--              || '/functions/v1/cron-scheduled-messages',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
--       ),
--       body := '{}'::jsonb
--     ) AS request_id;
--   $$);
