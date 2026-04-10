-- Idempotent repair: duplicate public.chats rows for the same connection_id break
-- CREATE UNIQUE INDEX idx_chats_one_per_connection. Merge messages into the canonical
-- chat (newest updated_at / created_at / id) and delete extras, then ensure the index exists.

DROP INDEX IF EXISTS public.idx_chats_one_per_connection;

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
