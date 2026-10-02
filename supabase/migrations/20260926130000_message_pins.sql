-- Pinned messages in direct and group chats (applied 2026-09-26). Any member can pin or unpin; every member sees
-- the chat's pins. Unpinning sets unpinned_at (an UPDATE, which realtime can filter by chat,
-- unlike a DELETE); re-pinning clears it. Rows go with their message or chat.
CREATE TABLE IF NOT EXISTS public.message_pins (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  unpinned_at timestamptz,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS message_pins_active ON public.message_pins (chat_id, pinned_at DESC) WHERE unpinned_at IS NULL;

-- Written only by /api/chat/pins (service role, after the chat-access check); members read.
ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_pins_member_select ON public.message_pins;
CREATE POLICY message_pins_member_select ON public.message_pins
  FOR SELECT USING (public.auth_uid_can_access_chat(chat_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_pins;
  END IF;
END $$;
