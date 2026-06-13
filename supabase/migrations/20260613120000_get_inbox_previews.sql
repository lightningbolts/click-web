-- Batch inbox preview + unread counts for direct (connection) chats.
-- Replaces per-chat latest-message queries and 10k-row unread scans on mobile.

CREATE OR REPLACE FUNCTION public.get_inbox_previews()
RETURNS TABLE (
  chat_id uuid,
  connection_id uuid,
  last_message_id uuid,
  last_message_user_id uuid,
  last_message_content text,
  last_message_time_created bigint,
  last_message_type text,
  last_message_metadata jsonb,
  last_message_is_read boolean,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH user_chats AS (
    SELECT c.id AS chat_id, c.connection_id
    FROM public.chats c
    INNER JOIN public.connections conn ON conn.id = c.connection_id
    -- connections.user_ids is TEXT[]; auth.uid() is uuid — compare as text (see sweep_stale_connections).
    WHERE auth.uid()::text = ANY (conn.user_ids)
      AND c.connection_id IS NOT NULL
  ),
  latest AS (
    SELECT DISTINCT ON (m.chat_id)
      m.chat_id,
      m.id AS last_message_id,
      m.user_id AS last_message_user_id,
      m.content AS last_message_content,
      m.time_created AS last_message_time_created,
      m.message_type AS last_message_type,
      m.metadata AS last_message_metadata,
      m.is_read AS last_message_is_read
    FROM public.messages m
    INNER JOIN user_chats uc ON uc.chat_id = m.chat_id
    ORDER BY m.chat_id, m.time_created DESC
  ),
  unread AS (
    SELECT m.chat_id, COUNT(*)::bigint AS unread_count
    FROM public.messages m
    INNER JOIN user_chats uc ON uc.chat_id = m.chat_id
    WHERE m.is_read = false
      AND m.user_id IS DISTINCT FROM auth.uid()
    GROUP BY m.chat_id
  )
  SELECT
    uc.chat_id,
    uc.connection_id,
    l.last_message_id,
    l.last_message_user_id,
    l.last_message_content,
    l.last_message_time_created,
    l.last_message_type,
    l.last_message_metadata,
    COALESCE(l.last_message_is_read, false),
    COALESCE(u.unread_count, 0::bigint)
  FROM user_chats uc
  LEFT JOIN latest l ON l.chat_id = uc.chat_id
  LEFT JOIN unread u ON u.chat_id = uc.chat_id;
$$;

COMMENT ON FUNCTION public.get_inbox_previews() IS
  'Latest message + unread count per direct (connection) chat for auth.uid(). One round-trip for inbox list.';

GRANT EXECUTE ON FUNCTION public.get_inbox_previews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_previews() TO service_role;
