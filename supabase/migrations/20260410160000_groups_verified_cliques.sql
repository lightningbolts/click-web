-- Group Cliques: mathematically verified fully-connected subgraphs + per-user wrapped group keys.
-- Decouples public.chats from 1:1 connections via XOR(connection_id, group_id).

-- ─── 1. Core tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL DEFAULT 'Clique',
    created_by           UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    key_anchor_user_id   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.groups IS
    'Verified clique (fully connected via pairwise active connections).';

COMMENT ON COLUMN public.groups.key_anchor_user_id IS
    'Lowest-UUID member other than created_by; creator''s wrapped group key uses the 1:1 channel with this user.';

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id             UUID NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role                 TEXT NOT NULL DEFAULT 'member',
    encrypted_group_key  TEXT NOT NULL,
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

COMMENT ON COLUMN public.group_members.encrypted_group_key IS
    'Ciphertext for this user''s copy of the symmetric group key (1:1 channel sealed, e.g. Click e2e: wire format).';

CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members (user_id);

-- ─── 2. Chats: nullable connection_id, optional group_id, XOR constraint ─────

ALTER TABLE public.chats
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups (id) ON DELETE CASCADE;

ALTER TABLE public.chats
    ALTER COLUMN connection_id DROP NOT NULL;

ALTER TABLE public.chats
    DROP CONSTRAINT IF EXISTS chats_connection_xor_group;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_connection_xor_group CHECK (
        (connection_id IS NOT NULL AND group_id IS NULL)
        OR (connection_id IS NULL AND group_id IS NOT NULL)
    );

-- Legacy data may contain multiple chat rows per 1:1 connection (race / retries). Collapse
-- before enforcing one row per connection_id (messages follow the kept chat).
WITH ranked AS (
    SELECT
        id,
        connection_id,
        ROW_NUMBER() OVER (
            PARTITION BY connection_id
            ORDER BY
                updated_at DESC NULLS LAST,
                created_at DESC NULLS LAST,
                id
        ) AS rn
    FROM public.chats
    WHERE
        connection_id IS NOT NULL
        AND group_id IS NULL
),
merge_map AS (
    SELECT
        r_loser.id AS loser_id,
        r_keep.id AS keeper_id
    FROM ranked r_loser
    INNER JOIN ranked r_keep ON r_loser.connection_id = r_keep.connection_id
        AND r_keep.rn = 1
    WHERE
        r_loser.rn > 1
)
UPDATE public.messages m
SET
    chat_id = mm.keeper_id
FROM
    merge_map mm
WHERE
    m.chat_id = mm.loser_id;

WITH ranked AS (
    SELECT
        id,
        connection_id,
        ROW_NUMBER() OVER (
            PARTITION BY connection_id
            ORDER BY
                updated_at DESC NULLS LAST,
                created_at DESC NULLS LAST,
                id
        ) AS rn
    FROM public.chats
    WHERE
        connection_id IS NOT NULL
        AND group_id IS NULL
),
merge_map AS (
    SELECT
        r_loser.id AS loser_id,
        r_keep.id AS keeper_id
    FROM ranked r_loser
    INNER JOIN ranked r_keep ON r_loser.connection_id = r_keep.connection_id
        AND r_keep.rn = 1
    WHERE
        r_loser.rn > 1
)
DELETE FROM public.chats c
USING merge_map mm
WHERE
    c.id = mm.loser_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_one_per_connection
    ON public.chats (connection_id)
    WHERE connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_one_per_group
    ON public.chats (group_id)
    WHERE group_id IS NOT NULL;

-- ─── 3. RLS (new tables) ───────────────────────────────────────────────────

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_member" ON public.groups;
CREATE POLICY "groups_select_member"
    ON public.groups FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.group_members gm
            WHERE gm.group_id = groups.id
              AND gm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "group_members_select_peers" ON public.group_members;
CREATE POLICY "group_members_select_peers"
    ON public.group_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.group_members m
            WHERE m.group_id = group_members.group_id
              AND m.user_id = auth.uid()
        )
    );

-- Inserts happen via SECURITY DEFINER RPC; block direct client inserts.
DROP POLICY IF EXISTS "groups_no_direct_insert" ON public.groups;
CREATE POLICY "groups_no_direct_insert"
    ON public.groups FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS "group_members_no_direct_insert" ON public.group_members;
CREATE POLICY "group_members_no_direct_insert"
    ON public.group_members FOR INSERT
    WITH CHECK (false);

GRANT SELECT ON public.groups TO authenticated;
GRANT SELECT ON public.group_members TO authenticated;

-- ─── 4. RPC: create_verified_clique ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_verified_clique(
    target_user_ids UUID[],
    encrypted_keys JSONB
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
    gname TEXT := 'Clique';
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

    -- Every unordered pair must have an active/kept 1:1 connection (TEXT[] user_ids).
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

    -- encrypted_keys must contain a non-empty ciphertext string for every member (JSON keys as uuid text).
    FOREACH u IN ARRAY members LOOP
        enc := encrypted_keys ->> u::text;
        IF enc IS NULL OR length(trim(enc)) < 8 THEN
            RAISE EXCEPTION 'missing encrypted_group_key for member %', u;
        END IF;
    END LOOP;

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

REVOKE ALL ON FUNCTION public.create_verified_clique(UUID[], JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_verified_clique(UUID[], JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_verified_clique(UUID[], JSONB) IS
    'Creates a verified clique when every pair in target_user_ids has an active/kept connection; stores wrapped group keys and one group chat row. Caller must be a member.';
