-- Lossless spatial telemetry: retain per-user raw GPS on each encounter row.
ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS reporting_user_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_connection_encounters_reporting_user
    ON public.connection_encounters (connection_id, reporting_user_id, encountered_at DESC);

-- Per-user 3h rate limit when reporting_user_id is set; legacy rows keep connection-wide guard.
CREATE OR REPLACE FUNCTION public.connection_encounters_before_insert ()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_cnt bigint;
BEGIN
    IF NEW.reporting_user_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.connection_encounters e
            WHERE e.connection_id = NEW.connection_id
              AND e.reporting_user_id = NEW.reporting_user_id
              AND e.encountered_at > (now() - interval '3 hours')
        ) THEN
            RAISE EXCEPTION 'encounter_rate_limit_3h'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1
            FROM public.connection_encounters e
            WHERE e.connection_id = NEW.connection_id
              AND e.encountered_at > (now() - interval '3 hours')
        ) THEN
            RAISE EXCEPTION 'encounter_rate_limit_3h'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_cnt
    FROM public.connection_encounters
    WHERE connection_id = NEW.connection_id;

    IF v_cnt >= 10000 THEN
        DELETE FROM public.connection_encounters e
        WHERE e.id = (
                SELECT id
                FROM public.connection_encounters
                WHERE connection_id = NEW.connection_id
                ORDER BY encountered_at ASC
                LIMIT 1
            );
    END IF;

    RETURN NEW;
END;
$$;
