-- Verified clique admin: add / remove members (creator-only).

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
        SELECT 1 FROM public.groups g
        WHERE g.id = target_group_id AND g.created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'forbidden: only group creator may add members';
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

REVOKE ALL ON FUNCTION public.add_clique_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_clique_member(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.add_clique_member(uuid, uuid, text) IS
    'Creator adds a member to a verified clique after client distributes the group master key.';

CREATE OR REPLACE FUNCTION public.remove_clique_member(
    target_group_id uuid,
    member_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF member_user_id = auth.uid() THEN
        RAISE EXCEPTION 'use leave_clique to remove yourself';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = target_group_id AND g.created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'forbidden: only group creator may remove members';
    END IF;

    DELETE FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = member_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'member not found in group';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_clique_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_clique_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_clique_member(uuid, uuid) IS
    'Creator removes another member from a verified clique (revokes group access).';
