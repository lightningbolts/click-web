-- Event chats live for the whole event, not a rolling 24 hours.
--
-- Before: `purge_hub_messages_24h` deleted every hub message older than 24 hours, so an event chat
-- created a week out lost its planning, and the night-of thread was gone the next evening.
-- Now an event chat keeps its history from the moment the event is created until it is archived
-- a day after the event's Click Drops reveal (10:00 local the morning after it ends; see
-- lib/server/eventHubAccess.ts). Archiving closes the chat (the gatekeeper answers 410 past
-- hub_venues.expires_at) and the purge clears it. Community hubs keep the rolling 24-hour purge.

-- 1. Open event hubs move to the new archive time (reveal at 10:00 in the event's zone, + 24 h).
WITH zoned AS (
    SELECT
        h.id,
        b.ends_at,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM pg_timezone_names t
                WHERE t.name = COALESCE(NULLIF(b.event_timezone, ''), NULLIF(b.metadata ->> 'event_timezone', ''))
            )
            THEN COALESCE(NULLIF(b.event_timezone, ''), NULLIF(b.metadata ->> 'event_timezone', ''))
            ELSE 'UTC'
        END AS tz
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

COMMENT ON COLUMN public.hub_venues.expires_at IS
    'Null = permanent (community hubs). Event hubs: archived a day after the event''s Click Drops reveal; past this the chat closes and its messages are purged.';

-- 2. The purge spares open event chats (idx_hub_messages_created_at already serves the scan).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge_hub_messages_24h';
        PERFORM cron.schedule(
            'purge_hub_messages_24h',
            '*/15 * * * *',
            $purge$
            DELETE FROM public.hub_messages m
            WHERE m.created_at < now() - interval '24 hours'
              AND NOT EXISTS (
                  SELECT 1 FROM public.hub_venues h
                  WHERE h.id = m.hub_id
                    AND h.event_beacon_id IS NOT NULL
                    AND (h.expires_at IS NULL OR h.expires_at > now())
              );
            $purge$
        );
    END IF;
END
$$;
