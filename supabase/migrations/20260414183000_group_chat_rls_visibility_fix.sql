-- Restore group chat visibility by extending chat/message access checks
-- from 1:1-connection membership to (connection membership OR group membership).

CREATE OR REPLACE FUNCTION public.auth_uid_can_access_chat(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
    SELECT
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.chats c
            WHERE c.id = p_chat_id
              AND (
                  (
                      c.connection_id IS NOT NULL
                      AND EXISTS (
                          SELECT 1
                          FROM public.connections conn
                          WHERE conn.id = c.connection_id
                            AND auth.uid()::text = ANY (conn.user_ids)
                      )
                  )
                  OR (
                      c.group_id IS NOT NULL
                      AND public.auth_uid_in_group(c.group_id)
                  )
              )
        );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_can_access_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_can_access_chat(uuid) TO authenticated;

COMMENT ON FUNCTION public.auth_uid_can_access_chat(uuid) IS
    'True when auth.uid() is allowed to read the chat via 1:1 connection membership or verified clique membership.';

-- Chats policies
DROP POLICY IF EXISTS "Users can view chats for their connections" ON public.chats;
DROP POLICY IF EXISTS "Users can create chats for their connections" ON public.chats;
DROP POLICY IF EXISTS "Users can update chats for their connections" ON public.chats;
DROP POLICY IF EXISTS "Users can view their own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can create chats" ON public.chats;
DROP POLICY IF EXISTS "chats_member_select" ON public.chats;
DROP POLICY IF EXISTS "chats_member_insert" ON public.chats;
DROP POLICY IF EXISTS "chats_member_update" ON public.chats;

CREATE POLICY "chats_member_select"
    ON public.chats FOR SELECT TO authenticated
    USING (public.auth_uid_can_access_chat(id));

CREATE POLICY "chats_member_insert"
    ON public.chats FOR INSERT TO authenticated
    WITH CHECK (
        (
            connection_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.connections conn
                WHERE conn.id = chats.connection_id
                  AND auth.uid()::text = ANY (conn.user_ids)
            )
        )
        OR (
            group_id IS NOT NULL
            AND public.auth_uid_in_group(group_id)
        )
    );

CREATE POLICY "chats_member_update"
    ON public.chats FOR UPDATE TO authenticated
    USING (public.auth_uid_can_access_chat(id))
    WITH CHECK (public.auth_uid_can_access_chat(id));

-- Messages policies
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can mark messages as read in their chats" ON public.messages;
DROP POLICY IF EXISTS "messages_member_select" ON public.messages;
DROP POLICY IF EXISTS "messages_member_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_sender_update" ON public.messages;
DROP POLICY IF EXISTS "messages_member_update" ON public.messages;

CREATE POLICY "messages_member_select"
    ON public.messages FOR SELECT TO authenticated
    USING (public.auth_uid_can_access_chat(chat_id));

CREATE POLICY "messages_member_insert"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.auth_uid_can_access_chat(chat_id)
    );

CREATE POLICY "messages_sender_update"
    ON public.messages FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_member_update"
    ON public.messages FOR UPDATE TO authenticated
    USING (public.auth_uid_can_access_chat(chat_id))
    WITH CHECK (public.auth_uid_can_access_chat(chat_id));

-- message_reactions policies (if table exists)
DO $$
BEGIN
    IF to_regclass('public.message_reactions') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Users can view reactions in their chats" ON public.message_reactions;
        DROP POLICY IF EXISTS "Users can add reactions to their chat messages" ON public.message_reactions;
        DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;
        DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
        DROP POLICY IF EXISTS "Users can remove their reactions" ON public.message_reactions;
        DROP POLICY IF EXISTS "reactions_member_select" ON public.message_reactions;
        DROP POLICY IF EXISTS "reactions_member_insert" ON public.message_reactions;
        DROP POLICY IF EXISTS "reactions_owner_delete" ON public.message_reactions;

        CREATE POLICY "reactions_member_select"
            ON public.message_reactions FOR SELECT TO authenticated
            USING (
                message_id IN (
                    SELECT m.id
                    FROM public.messages m
                    WHERE public.auth_uid_can_access_chat(m.chat_id)
                )
            );

        CREATE POLICY "reactions_member_insert"
            ON public.message_reactions FOR INSERT TO authenticated
            WITH CHECK (
                user_id = auth.uid()
                AND message_id IN (
                    SELECT m.id
                    FROM public.messages m
                    WHERE public.auth_uid_can_access_chat(m.chat_id)
                )
            );

        CREATE POLICY "reactions_owner_delete"
            ON public.message_reactions FOR DELETE TO authenticated
            USING (user_id = auth.uid());
    END IF;
END;
$$;

-- typing_events policies (if table exists)
DO $$
BEGIN
    IF to_regclass('public.typing_events') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Users can view typing events in their chats" ON public.typing_events;
        DROP POLICY IF EXISTS "Users can create typing events in their chats" ON public.typing_events;
        DROP POLICY IF EXISTS "Users can update typing events in their chats" ON public.typing_events;
        DROP POLICY IF EXISTS "typing_member_select" ON public.typing_events;
        DROP POLICY IF EXISTS "typing_member_insert" ON public.typing_events;
        DROP POLICY IF EXISTS "typing_member_update" ON public.typing_events;

        CREATE POLICY "typing_member_select"
            ON public.typing_events FOR SELECT TO authenticated
            USING (public.auth_uid_can_access_chat(chat_id));

        CREATE POLICY "typing_member_insert"
            ON public.typing_events FOR INSERT TO authenticated
            WITH CHECK (
                user_id = auth.uid()
                AND public.auth_uid_can_access_chat(chat_id)
            );

        CREATE POLICY "typing_member_update"
            ON public.typing_events FOR UPDATE TO authenticated
            USING (
                user_id = auth.uid()
                AND public.auth_uid_can_access_chat(chat_id)
            )
            WITH CHECK (
                user_id = auth.uid()
                AND public.auth_uid_can_access_chat(chat_id)
            );
    END IF;
END;
$$;
