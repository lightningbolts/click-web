-- Verified clique: dynamic initial name, leave/delete/rename RPCs.

-- Replace 2-arg create_verified_clique with 3-arg (Postgres cannot change signature via CREATE OR REPLACE alone).
DROP FUNCTION IF EXISTS public.create_verified_clique(uuid[], jsonb);

CREATE OR REPLACE FUNCTION public.create_verified_clique(
    target_user_ids uuid[],
    encrypted_keys jsonb,
    initial_group_name text DEFAULT 'Clique'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    members uuid[];
    n int;
    i int;
    j int;
    u uuid;
    v uuid;
    ok boolean;
    gname text;
    new_group_id uuid;
    new_chat_id uuid;
    enc text;
    anchor_peer uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    gname := left(
        coalesce(nullif(trim(initial_group_name), ''), 'Clique'),
        200
    );

    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    INTO members
    FROM (SELECT DISTINCT unnest(coalesce(target_user_ids, ARRAY[]::uuid[])) AS x) s;

    n := array_length(members, 1);
    IF n IS NULL OR n < 2 THEN
        RAISE EXCEPTION 'clique requires at least two distinct members';
    END IF;

    IF NOT (auth.uid() = ANY (members)) THEN
        RAISE EXCEPTION 'caller must be included in target_user_ids';
    END IF;

    SELECT m
    INTO anchor_peer
    FROM unnest(members) AS t(m)
    WHERE m <> auth.uid()
    ORDER BY m
    LIMIT 1;

    IF anchor_peer IS NULL THEN
        RAISE EXCEPTION 'could not resolve key anchor peer';
    END IF;

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

    FOREACH u IN ARRAY members LOOP
        enc := encrypted_keys ->> u::text;
        IF enc IS NULL OR length(trim(enc)) < 8 THEN
            RAISE EXCEPTION 'missing encrypted_group_key for member %', u;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE (
            SELECT array_agg(gm.user_id ORDER BY gm.user_id)
            FROM public.group_members gm
            WHERE gm.group_id = g.id
        ) = members
    ) THEN
        RAISE EXCEPTION 'verified click already exists for this member set';
    END IF;

    INSERT INTO public.groups (name, created_by, key_anchor_user_id)
    VALUES (gname, auth.uid(), anchor_peer)
    RETURNING id INTO new_group_id;

    FOREACH u IN ARRAY members LOOP
        enc := trim(encrypted_keys ->> u::text);
        INSERT INTO public.group_members (group_id, user_id, role, encrypted_group_key)
        VALUES (
            new_group_id,
            u,
            CASE WHEN u = auth.uid() THEN 'admin' ELSE 'member' END,
            enc
        );
    END LOOP;

    INSERT INTO public.chats (group_id, connection_id, created_at, updated_at)
    VALUES (new_group_id, NULL, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    RETURNING id INTO new_chat_id;

    RETURN new_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_verified_clique(uuid[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_verified_clique(uuid[], jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.create_verified_clique(uuid[], jsonb, text) IS
    'Creates a verified clique; name from initial_group_name (trimmed, capped); rejects duplicate member sets.';

-- Leave: remove caller from group_members (chat row removed when last member would need separate policy; not enforced here).
CREATE OR REPLACE FUNCTION public.leave_clique(target_group_id uuid)
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

    IF NOT public.auth_uid_in_group(target_group_id) THEN
        RAISE EXCEPTION 'not a member of this group';
    END IF;

    DELETE FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.leave_clique(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_clique(uuid) TO authenticated;

COMMENT ON FUNCTION public.leave_clique(uuid) IS
    'Authenticated user leaves a verified clique (removes their group_members row).';

-- Delete group: only creator may delete; cascades remove members and chats/messages.
CREATE OR REPLACE FUNCTION public.delete_clique(target_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    deleted_count int;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    DELETE FROM public.groups g
    WHERE g.id = target_group_id
      AND g.created_by = auth.uid();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'forbidden or group not found';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_clique(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_clique(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_clique(uuid) IS
    'Deletes a verified clique when caller is groups.created_by; cascades members and chats.';

-- Rename: any member can update display name (server-side trim + cap).
CREATE OR REPLACE FUNCTION public.rename_clique(target_group_id uuid, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    nm text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF NOT public.auth_uid_in_group(target_group_id) THEN
        RAISE EXCEPTION 'not a member of this group';
    END IF;

    nm := left(coalesce(nullif(trim(new_name), ''), 'Clique'), 200);

    UPDATE public.groups
    SET name = nm
    WHERE id = target_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_clique(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_clique(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_clique(uuid, text) IS
    'Member-only rename of groups.name for verified cliques.';
