-- Verified-group eligibility must match what the app shows as a connection.
--
-- A fresh Tap to Connect / QR Click is stored as status 'pending' (its say-hi window), so
-- people who had just Clicked pairwise could not form a group: the three clique RPCs only
-- accepted 'active' / 'kept' edges. One shared predicate now defines a verified 1:1 edge:
-- active, kept, or a pending in-person Click. An unanswered "met before" request
-- (source = 'prior') is still excluded. Mirrors `isVerifiedPairConnection` in
-- lib/chat/groupCliqueKey.ts.
--
-- Also indexes matched_at so late group joiners (recently matched pending_handshakes) and
-- GET /api/connections/proximity recovery (matched_at equality) never scan the table.

CREATE OR REPLACE FUNCTION public.is_verified_pair(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE cardinality(c.user_ids) = 2
          AND c.user_ids @> ARRAY[a::text, b::text]
          AND (
              c.status IN ('active', 'kept')
              OR (c.status = 'pending' AND c.source <> 'prior')
          )
    );
$$;

-- Internal helper for the SECURITY DEFINER RPCs below; not callable by clients.
REVOKE ALL ON FUNCTION public.is_verified_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verified_clique_edges_exist(p_member_ids uuid[])
RETURNS boolean
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
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    INTO members
    FROM (SELECT DISTINCT unnest(coalesce(p_member_ids, ARRAY[]::uuid[])) AS x) s;

    n := array_length(members, 1);
    IF n IS NULL OR n < 2 THEN
        RETURN false;
    END IF;

    IF NOT (auth.uid() = ANY (members)) THEN
        RETURN false;
    END IF;

    FOR i IN 1..n LOOP
        FOR j IN (i + 1)..n LOOP
            IF NOT public.is_verified_pair(members[i], members[j]) THEN
                RETURN false;
            END IF;
        END LOOP;
    END LOOP;

    RETURN true;
END;
$$;

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
                IF NOT public.is_verified_pair(u, v) THEN
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
            IF NOT public.is_verified_pair(u, v) THEN
                RAISE EXCEPTION 'missing verified connection for pair % / %', u, v;
            END IF;
        END LOOP;
    END LOOP;

    INSERT INTO public.group_members (group_id, user_id, role, encrypted_group_key)
    VALUES (target_group_id, new_member_user_id, 'member', enc);
END;
$$;

CREATE INDEX IF NOT EXISTS pending_handshakes_matched_at_idx
    ON public.pending_handshakes USING btree (matched_at)
    WHERE matched_at IS NOT NULL;
