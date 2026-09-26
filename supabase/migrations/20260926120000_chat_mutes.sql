-- Per-conversation push mutes (applied 2026-09-26). A row mutes one chat (or hub) for one user
-- until muted_until; a null muted_until mutes until turned back on. No row: notifications on.
-- Enforced by send-push-notification for chat_message pushes.
CREATE TABLE IF NOT EXISTS public.chat_mutes (
  user_id uuid NOT NULL,
  chat_id text NOT NULL,
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);
ALTER TABLE public.chat_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_mutes_owner_select ON public.chat_mutes;
CREATE POLICY chat_mutes_owner_select ON public.chat_mutes FOR SELECT USING (auth.uid() = user_id);
