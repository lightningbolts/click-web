-- Auto-unarchive: once both participants of an archived 1:1 connection have messaged since it
-- was archived (manual per-user archive or the 48h/7d gentle archive), the conversation is
-- live again, so every participant's `connection_archives` row is removed.
-- Never blocks the message insert: any failure is swallowed.

CREATE OR REPLACE FUNCTION public.auto_unarchive_on_mutual_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_connection_id uuid;
    v_archived_since timestamptz;
    v_senders integer;
BEGIN
    SELECT ch.connection_id INTO v_connection_id
    FROM public.chats ch
    WHERE ch.id = NEW.chat_id;

    IF v_connection_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT min(ca.archived_at) INTO v_archived_since
    FROM public.connection_archives ca
    WHERE ca.connection_id = v_connection_id;

    IF v_archived_since IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT count(DISTINCT m.user_id) INTO v_senders
    FROM public.messages m
    JOIN public.connections c ON c.id = v_connection_id
    WHERE m.chat_id = NEW.chat_id
      AND m.time_created >= (EXTRACT(EPOCH FROM v_archived_since) * 1000)::bigint
      AND m.user_id::text = ANY (c.user_ids::text[]);

    IF v_senders >= 2 THEN
        DELETE FROM public.connection_archives
        WHERE connection_id = v_connection_id;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[auto_unarchive_on_mutual_messages] %', SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_unarchive_on_mutual_messages() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_auto_unarchive_on_mutual_messages ON public.messages;
CREATE TRIGGER trigger_auto_unarchive_on_mutual_messages
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.auto_unarchive_on_mutual_messages();
