-- Allow any group member (not only creator) to add verified connections.

CREATE OR REPLACE FUNCTION public.add_clique_member(
    target_group_id uuid,
    new_member_user_id uuid,
    encrypted_group_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    members uuid[];
    n int;
    i int;
    j int;
    u uuid;
    v uuid;
    ok boolean;
    enc text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = target_group_id AND gm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'forbidden: must be a group member to add others';
    END IF;

    enc := trim(coalesce(encrypted_group_key, ''));
    IF length(enc) < 8 THEN
        RAISE EXCEPTION 'missing encrypted_group_key for new member';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = target_group_id AND gm.user_id = new_member_user_id
    ) THEN
        RAISE EXCEPTION 'user is already a member';
    END IF;

    SELECT coalesce(array_agg(gm.user_id ORDER BY gm.user_id), ARRAY[]::uuid[])
    INTO members
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id;

    n := array_length(members, 1);
    IF n IS NULL OR n < 2 THEN
        RAISE EXCEPTION 'group must have at least two members before adding';
    END IF;

    members := members || new_member_user_id;
    n := array_length(members, 1);

    FOR i IN 1..n LOOP
        FOR j IN (i + 1)..n LOOP
            u := members[i];
            v := members[j];
            SELECT EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.status IN ('active', 'kept')
                  AND cardinality(c.user_ids) = 2
                  AND c.user_ids @> ARRAY[u::text, v::text]
            ) INTO ok;
            IF NOT ok THEN
                RAISE EXCEPTION 'missing verified connection for pair % / %', u, v;
            END IF;
        END LOOP;
    END LOOP;

    INSERT INTO public.group_members (group_id, user_id, role, encrypted_group_key)
    VALUES (target_group_id, new_member_user_id, 'member', enc);
END;
$$;

COMMENT ON FUNCTION public.add_clique_member(uuid, uuid, text) IS
    'Group member adds someone to a verified clique after the server distributes the group master key.';
