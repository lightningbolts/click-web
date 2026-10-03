-- Approving a new device from a phone you already use (the primary path), with email kept as the
-- fallback for accounts whose other devices are on older builds.
--
-- When a newer device registers, its history request is created with email_deferred = true and the
-- account's devices get a push. A device already on the account approves by proving it holds its
-- identity key: the server wraps a random challenge to that key (same envelope as epoch keys) and
-- the device returns it. If nothing decides within a few minutes, the per-minute cron emails the
-- magic link as before. Requests created before this migration keep their already-sent email
-- (email_deferred defaults to false). Additive and idempotent.

ALTER TABLE public.chat_device_history_requests
    ADD COLUMN IF NOT EXISTS email_deferred BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_via TEXT CHECK (decided_via IS NULL OR decided_via IN ('email', 'device')),
    ADD COLUMN IF NOT EXISTS decided_by_device_id UUID REFERENCES public.chat_devices (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_device_history_requests_email_due
    ON public.chat_device_history_requests (created_at)
    WHERE status = 'pending' AND email_deferred AND email_sent_at IS NULL;

-- What kind of device registered ("iPhone", "iPad", "Web browser"), shown in the approval prompt.
ALTER TABLE public.chat_devices
    ADD COLUMN IF NOT EXISTS device_label TEXT CHECK (device_label IS NULL OR char_length(device_label) BETWEEN 1 AND 64);

-- One-time challenges for device approval: only a hash of the challenge is stored.
CREATE TABLE IF NOT EXISTS public.chat_device_approval_challenges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID NOT NULL REFERENCES public.chat_device_history_requests (id) ON DELETE CASCADE,
    approving_device_id UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    nonce_hash          TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
    used_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_device_approval_challenges_request
    ON public.chat_device_approval_challenges (request_id);

ALTER TABLE public.chat_device_approval_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_device_approval_challenges FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.chat_device_approval_challenges IS
    'Server only. A device approves a history request by unwrapping a challenge sent to its identity key.';
