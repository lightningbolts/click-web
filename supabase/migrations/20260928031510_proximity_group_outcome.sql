-- Tap to Connect group outcome.
--
-- 1. pending_handshakes.group_connection_id: the group connection a tap ended up in. Set on
--    every selected member's tap row when a group is created or reconnected, including rows
--    that were already matched 1:1 before a late joiner arrived. GET
--    /api/connections/proximity returns this group, so phones that showed a 1:1 result
--    switch to "Group created".
--
-- 2. archive_superseded_proximity_groups: when a larger group is formed from the same
--    hangout (a 4th person joins after a 3-person group was just created), the smaller
--    proximity group is archived if nobody has messaged in it yet. Groups with messages are
--    never touched. Service role only.

ALTER TABLE public.pending_handshakes
    ADD COLUMN IF NOT EXISTS group_connection_id uuid
    REFERENCES public.connections(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.archive_superseded_proximity_groups(
    p_member_ids text[],
    p_keep_id uuid,
    p_since timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.connections c
    SET status = 'archived'
    WHERE c.is_group IS TRUE
      AND c.id <> p_keep_id
      AND c.connection_method = 'proximity'
      AND c.status IN ('pending', 'active')
      AND c.created_utc >= p_since
      AND c.user_ids <@ p_member_ids
      AND cardinality(c.user_ids) < cardinality(p_member_ids)
      AND NOT EXISTS (
          SELECT 1
          FROM public.chats ch
          JOIN public.messages m ON m.chat_id = ch.id
          WHERE ch.connection_id = c.id
      );
$$;

REVOKE ALL ON FUNCTION public.archive_superseded_proximity_groups(text[], uuid, timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_superseded_proximity_groups(text[], uuid, timestamptz)
    TO service_role;
