-- Fix remaining uuid = text: auth.uid() is text; comparing directly to uuid parameter failed.

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
    IF auth.uid() IS NULL OR auth.uid()::text <> target_user_id::text THEN
        RAISE EXCEPTION 'not authorized'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.connection_archives (user_id, connection_id)
    SELECT target_user_id, c.id
    FROM public.connections c
    WHERE target_user_id::text = ANY (c.user_ids)
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
