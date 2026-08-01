-- Backfill: beacon shares that were stored as message_type=text with beacon metadata.
UPDATE public.messages
SET message_type = 'beacon'
WHERE message_type = 'text'
  AND (
    (metadata ? 'beacon_id')
    OR (metadata ? 'beaconId')
  );
