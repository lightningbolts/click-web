-- Fix recurring Postgres errors:
-- 1) system_friction_logs RLS violations when clients/anon accidentally hold INSERT
-- 2) auto_archive_stale_connections FK failures when connections.user_ids reference
--    auth users missing from public.users (one bad row aborted the whole cron insert)

-- ── system_friction_logs: service_role only ──────────────────────────────────
REVOKE ALL ON TABLE public.system_friction_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.system_friction_logs FROM anon;
REVOKE ALL ON TABLE public.system_friction_logs FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.system_friction_logs TO service_role;

-- ── auto_archive: skip orphan user_ids so valid pairs still archive ──────────
CREATE OR REPLACE FUNCTION public.auto_archive_stale_connections()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    inserted integer;
BEGIN
    WITH stale AS (
        SELECT c.id,
               c.user_ids
        FROM public.connections c
        WHERE c.status IN ('pending', 'active')
          AND (
              (
                  c.last_message_at IS NULL
                  AND c.created < (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT - (48 * 3600 * 1000)
              )
              OR (
                  c.last_message_at IS NOT NULL
                  AND c.last_message_at < (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT - (7 * 24 * 3600 * 1000)
              )
          )
    ),
    pairs AS (
        SELECT s.id AS connection_id,
               u.uid AS user_id
        FROM stale s
        CROSS JOIN LATERAL (
            SELECT unnest(s.user_ids)::uuid AS uid
        ) u
    )
    INSERT INTO public.connection_archives (user_id, connection_id)
    SELECT p.user_id, p.connection_id
    FROM pairs p
    -- FK is public.users(id); skip deleted/orphan profile rows so cron doesn't abort.
    INNER JOIN public.users usr ON usr.id = p.user_id
    ON CONFLICT (user_id, connection_id) DO NOTHING;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$function$;

COMMENT ON FUNCTION public.auto_archive_stale_connections() IS
    'Inserts connection_archives for both users on stale pending/active connections (48h no message or 7d idle). Skips user_ids missing from public.users.';
