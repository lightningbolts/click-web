-- Live updates: one recipient's failed send no longer drops everyone's hint.
--
-- live_notify caught errors around the whole loop, so a failure rolled back the hints already sent
-- in that statement and skipped the recipients after it. Each send now has its own handler.

CREATE OR REPLACE FUNCTION public.live_notify(p_user_ids uuid[], p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user uuid;
BEGIN
    FOR v_user IN SELECT DISTINCT x FROM unnest(p_user_ids) AS x WHERE x IS NOT NULL LOOP
        BEGIN
            PERFORM realtime.send(p_payload, 'changed', 'user:' || v_user::text, true);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'live_notify(%): %', v_user, SQLERRM;
        END;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.live_notify(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
