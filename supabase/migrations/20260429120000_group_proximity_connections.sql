ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_connections_group_member_sets
    ON public.connections USING gin (user_ids)
    WHERE is_group = true;

CREATE OR REPLACE FUNCTION public.create_verified_clique(
    target_user_ids UUID[],
    encrypted_keys JSONB,
    initial_group_name TEXT DEFAULT 'Clique'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    members UUID[];
    n INT;
    i INT;
    j INT;
    u UUID;
    v UUID;
    ok BOOLEAN;
    gname TEXT := COALESCE(NULLIF(trim(initial_group_name), ''), 'Clique');
    new_group_id UUID;
    new_chat_id UUID;
    enc TEXT;
    anchor_peer UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

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

    SELECT EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.status IN ('active', 'kept')
          AND cardinality(c.user_ids) = n
          AND c.user_ids @> (SELECT array_agg(m::text) FROM unnest(members) AS t(m))
          AND (c.is_group IS TRUE OR cardinality(c.user_ids) >= 3)
    ) INTO ok;

    IF NOT ok THEN
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
    END IF;

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
