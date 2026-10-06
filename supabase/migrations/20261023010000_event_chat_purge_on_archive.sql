-- Follow-up to 20261023000000_event_chat_retention.
--
-- 1. An archived event chat is cleared entirely: its last messages no longer linger up to another
--    day under the 24-hour rule meant for community hubs.
-- 2. The expiry backfill also honors the camelCase `metadata.eventTimezone` alias, as the runtime
--    (`eventTimezoneFromMetadata`) does. Re-running it is idempotent for rows already moved.

WITH zoned AS (
    SELECT
        h.id,
        b.ends_at,
        COALESCE(
            (SELECT t.name FROM pg_timezone_names t
             WHERE t.name = COALESCE(
                 NULLIF(b.event_timezone, ''),
                 NULLIF(b.metadata ->> 'event_timezone', ''),
                 NULLIF(b.metadata ->> 'eventTimezone', '')
             )
             LIMIT 1),
            'UTC'
        ) AS tz
    FROM public.hub_venues h
    JOIN public.map_beacons b ON b.id = h.event_beacon_id
    WHERE b.ends_at IS NOT NULL
      AND (h.expires_at IS NULL OR h.expires_at > now())
)
UPDATE public.hub_venues h
SET expires_at = (
    (date_trunc('day', (z.ends_at - interval '1 millisecond') AT TIME ZONE z.tz)
        + interval '1 day' + interval '10 hours') AT TIME ZONE z.tz
) + interval '24 hours'
FROM zoned z
WHERE h.id = z.id;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge_hub_messages_24h';
        PERFORM cron.schedule(
            'purge_hub_messages_24h',
            '*/15 * * * *',
            $purge$
            DELETE FROM public.hub_messages m
            USING public.hub_venues h
            WHERE h.id = m.hub_id
              AND (
                  -- Community hubs: a rolling 24 hours.
                  (h.event_beacon_id IS NULL AND m.created_at < now() - interval '24 hours')
                  -- Event chats: everything, once archived.
                  OR (h.event_beacon_id IS NOT NULL AND h.expires_at IS NOT NULL AND h.expires_at <= now())
              );
            $purge$
        );
    END IF;
END
$$;
