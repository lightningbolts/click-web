-- Lazy-sweep: archive stale connections for one user into connection_archives (per-user junction).
-- Replaces reliance on pg_cron; clients call this RPC immediately before fetching connections.

CREATE OR REPLACE FUNCTION public.sweep_stale_connections_for_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    now_ms bigint := cast(extract(epoch from now()) * 1000 as bigint);
    forty_eight_hours_ms bigint := 48 * 60 * 60 * 1000;
    seven_days_ms bigint := 7 * 24 * 60 * 60 * 1000;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> target_user_id THEN
        RAISE EXCEPTION 'not authorized'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.connection_archives (user_id, connection_id)
    SELECT target_user_id, c.id
    FROM public.connections c
    WHERE target_user_id = ANY (c.user_ids)
      AND c.status IN ('pending', 'active')
      AND (
          (c.last_message_at IS NULL AND (now_ms - c.created) > forty_eight_hours_ms)
          OR
          (c.last_message_at IS NOT NULL AND (now_ms - c.last_message_at) > seven_days_ms)
          OR
          (c.expiry > 0 AND now_ms > c.expiry)
      )
    ON CONFLICT (user_id, connection_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.sweep_stale_connections_for_user(uuid) IS
    'Inserts connection_archives rows for target_user_id on stale pending/active connections (48h pending, 7d idle, or past expiry). Caller must be that user.';

GRANT EXECUTE ON FUNCTION public.sweep_stale_connections_for_user(uuid) TO authenticated;
