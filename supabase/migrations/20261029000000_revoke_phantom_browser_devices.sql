-- Phantom browser devices.
--
-- Two web bugs registered one browser as many devices: on a first visit every caller minted its
-- own identity (fixed in #151), and Safari, which reads stored X25519 keys back from IndexedDB as
-- null, minted a new one on every load (fixed with this migration's PR). Each phantom sent the
-- account a push and an approval prompt that could never unlock the browser, and stays in every
-- chat's device list until revoked.
--
-- Phantoms come in bursts: browser devices (labels like "Safari on Mac" or "Web browser") of one
-- account with the same label, registered within ten minutes of each other, and never seen again
-- (registering again moves last_seen_at). App devices are never touched: the apps register once,
-- so their last_seen_at never moves. Revoking keeps the rows (Settings › Devices hides them); a
-- browser that turns out to be live re-registers as a new device and asks to be approved.

WITH phantom AS (
    SELECT d.id
    FROM public.chat_devices d
    WHERE d.revoked_at IS NULL
      AND (d.device_label LIKE '% on %' OR lower(d.device_label) = 'web browser')
      AND d.created_at < now() - INTERVAL '1 hour'
      AND d.last_seen_at < d.created_at + INTERVAL '1 minute'
      AND EXISTS (
          SELECT 1
          FROM public.chat_devices sibling
          WHERE sibling.user_id = d.user_id
            AND sibling.id <> d.id
            AND sibling.device_label = d.device_label
            AND sibling.created_at BETWEEN d.created_at - INTERVAL '10 minutes'
                                       AND d.created_at + INTERVAL '10 minutes'
      )
),
revoked AS (
    UPDATE public.chat_devices d
    SET revoked_at = now()
    FROM phantom
    WHERE d.id = phantom.id
    RETURNING d.id
)
-- Their waiting requests end too, so the approval-email sweep skips them.
UPDATE public.chat_device_history_requests r
SET expires_at = now()
FROM revoked
WHERE r.recipient_device_id = revoked.id
  AND r.status = 'pending'
  AND r.expires_at > now();
