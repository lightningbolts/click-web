-- Allow Disposable Roll collaboration sessions to target group chats directly.

ALTER TABLE public.collaboration_sessions
  ALTER COLUMN connection_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collaboration_sessions_connection_or_chat_chk'
      AND conrelid = 'public.collaboration_sessions'::regclass
  ) THEN
    ALTER TABLE public.collaboration_sessions
      ADD CONSTRAINT collaboration_sessions_connection_or_chat_chk
      CHECK (connection_id IS NOT NULL OR chat_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS collaboration_sessions_chat_idx
  ON public.collaboration_sessions (chat_id, created_at DESC)
  WHERE chat_id IS NOT NULL;
