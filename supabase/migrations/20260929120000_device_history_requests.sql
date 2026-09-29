-- Email-approved chat history for a user's newer devices.
--
-- When a user registers an additional E2EE v2 device, click-web records a pending request and
-- emails the account a magic link. Approving it (from a session that proves email access) lets
-- the user's OLDER devices wrap the historical epoch keys they hold for the new device and upload
-- them through approve_chat_key_transfer. The server never sees an epoch key.
--
-- This migration also tightens approve_chat_key_transfer:
--   * recipients must be the actor's own device (no sharing history with other members' devices);
--   * the recipient must have an approved, unexpired history request;
--   * the approving device must itself hold an envelope for every epoch it transfers (replaces the
--     "approver predates the oldest epoch" rule, so a device that received history can pass it on);
--   * epochs the recipient already has an envelope for are skipped instead of failing the batch,
--     so several older devices can fulfil the same request without conflicting.

CREATE TABLE IF NOT EXISTS public.chat_device_history_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    recipient_device_id UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'denied')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    decided_at          TIMESTAMPTZ,
    UNIQUE (recipient_device_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_device_history_requests_user
    ON public.chat_device_history_requests (user_id, status);

ALTER TABLE public.chat_device_history_requests ENABLE ROW LEVEL SECURITY;

-- Reads and writes go through click-web's service role; signed-in users may only read their own.
REVOKE ALL ON public.chat_device_history_requests FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.chat_device_history_requests FROM authenticated;
GRANT SELECT ON public.chat_device_history_requests TO authenticated;
DROP POLICY IF EXISTS chat_device_history_requests_select_own ON public.chat_device_history_requests;
CREATE POLICY chat_device_history_requests_select_own
    ON public.chat_device_history_requests
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Approved requests stay usable for backfill this long after approval (older devices that were
-- offline when the email was approved still catch up when they next open the app).
CREATE OR REPLACE FUNCTION public._chat_history_request_is_live(p_recipient UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.chat_device_history_requests r
        WHERE r.recipient_device_id = p_recipient
          AND r.status = 'approved'
          AND r.decided_at > now() - INTERVAL '30 days'
    );
$$;

REVOKE ALL ON FUNCTION public._chat_history_request_is_live(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._chat_history_request_is_live(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_chat_key_transfer(
    p_chat_id UUID,
    p_actor_user_id UUID,
    p_approving_device_id TEXT,
    p_recipient_device_id TEXT,
    p_historical_envelopes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_members UUID[];
    v_approver UUID;
    v_recipient UUID;
    v_item JSONB;
    v_epoch INTEGER;
    v_inserted INTEGER := 0;
BEGIN
    IF p_chat_id IS NULL OR p_actor_user_id IS NULL
       OR p_approving_device_id IS NULL
       OR p_recipient_device_id IS NULL
       OR jsonb_typeof(p_historical_envelopes) <> 'array'
       OR jsonb_array_length(p_historical_envelopes) = 0
       OR jsonb_array_length(p_historical_envelopes) > 1024 THEN
        RAISE EXCEPTION 'invalid historical key transfer request' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_historical_envelopes) item
        WHERE jsonb_typeof(item) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
                   CASE WHEN jsonb_typeof(item) = 'object' THEN item ELSE '{}'::jsonb END
               )) <> 4
           OR NOT (item ?& ARRAY['epoch', 'recipient_device_id', 'sender_device_id', 'envelope'])
           OR item->>'epoch' !~ '^[1-9][0-9]*$'
           OR item->>'recipient_device_id' <> p_recipient_device_id
           OR item->>'sender_device_id' <> p_approving_device_id
           OR item->>'envelope' NOT LIKE 'e2e2:%'
    ) THEN
        RAISE EXCEPTION 'invalid historical key transfer envelope set' USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT count(DISTINCT item->>'epoch')
        FROM jsonb_array_elements(p_historical_envelopes) item
    ) <> jsonb_array_length(p_historical_envelopes) THEN
        RAISE EXCEPTION 'duplicate historical epoch' USING ERRCODE = '23505';
    END IF;

    v_members := public._e2ee_v2_chat_participants(p_chat_id);
    IF NOT (p_actor_user_id = ANY(v_members)) THEN
        RAISE EXCEPTION 'actor is not a chat member' USING ERRCODE = '42501';
    END IF;

    SELECT d.id INTO v_approver
    FROM public.chat_devices d
    WHERE d.user_id = p_actor_user_id
      AND d.device_id = p_approving_device_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_approver IS NULL THEN
        RAISE EXCEPTION 'approving device is not active' USING ERRCODE = '42501';
    END IF;

    -- Own devices only: the recipient must belong to the same account as the approver.
    SELECT d.id INTO v_recipient
    FROM public.chat_devices d
    WHERE d.device_id = p_recipient_device_id
      AND d.user_id = p_actor_user_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_recipient IS NULL OR v_recipient = v_approver THEN
        RAISE EXCEPTION 'recipient device is not one of your active devices' USING ERRCODE = '42501';
    END IF;

    IF NOT public._chat_history_request_is_live(v_recipient) THEN
        RAISE EXCEPTION 'history sharing for this device has not been approved by email' USING ERRCODE = '42501';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_historical_envelopes)
    LOOP
        v_epoch := (v_item->>'epoch')::INTEGER;
        IF NOT EXISTS (
            SELECT 1 FROM public.chat_key_epochs e
            WHERE e.chat_id = p_chat_id AND e.epoch = v_epoch
        ) THEN
            RAISE EXCEPTION 'historical epoch does not belong to chat' USING ERRCODE = 'P0002';
        END IF;

        -- The approver can only share a key it was itself given.
        IF NOT EXISTS (
            SELECT 1 FROM public.chat_recipient_key_envelopes e
            WHERE e.chat_id = p_chat_id
              AND e.epoch = v_epoch
              AND e.recipient_device_id = v_approver
        ) THEN
            RAISE EXCEPTION 'approving device does not hold this epoch' USING ERRCODE = '42501';
        END IF;

        -- Another of the user's devices may already have fulfilled this epoch: skip, don't fail.
        IF EXISTS (
            SELECT 1 FROM public.chat_recipient_key_envelopes e
            WHERE e.chat_id = p_chat_id
              AND e.epoch = v_epoch
              AND e.recipient_device_id = v_recipient
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.chat_recipient_key_envelopes
            (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
        VALUES (p_chat_id, v_epoch, v_recipient, v_approver, v_item->>'envelope')
        ON CONFLICT (chat_id, epoch, recipient_device_id) DO NOTHING;
        v_inserted := v_inserted + 1;
    END LOOP;

    INSERT INTO public.chat_key_transfer_approvals
        (chat_id, recipient_device_id, approved_by_device_id)
    VALUES (p_chat_id, v_recipient, v_approver)
    ON CONFLICT (chat_id, recipient_device_id) DO UPDATE
    SET approved_by_device_id = EXCLUDED.approved_by_device_id,
        approved_at = now();

    RETURN jsonb_build_object(
        'chat_id', p_chat_id,
        'recipient_device_id', v_recipient,
        'approved_by_device_id', v_approver,
        'inserted', v_inserted,
        'approved_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_chat_key_transfer(UUID, UUID, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_chat_key_transfer(UUID, UUID, TEXT, TEXT, JSONB)
    TO service_role;

-- What the calling (older) device should wrap: for each approved request on one of the user's
-- other devices, every (chat, epoch) the caller holds a key envelope for and the recipient lacks.
CREATE OR REPLACE FUNCTION public.get_device_history_backfill(
    p_user_id UUID,
    p_approving_device_id TEXT
)
RETURNS TABLE (
    request_id UUID,
    recipient_device_id TEXT,
    recipient_public_key TEXT,
    chat_id UUID,
    epoch INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_approver UUID;
BEGIN
    SELECT d.id INTO v_approver
    FROM public.chat_devices d
    WHERE d.user_id = p_user_id
      AND d.device_id = p_approving_device_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_approver IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT r.id, rd.device_id, rd.identity_public_key, mine.chat_id, mine.epoch
    FROM public.chat_device_history_requests r
    JOIN public.chat_devices rd ON rd.id = r.recipient_device_id
    JOIN public.chat_recipient_key_envelopes mine ON mine.recipient_device_id = v_approver
    WHERE r.user_id = p_user_id
      AND rd.user_id = p_user_id
      AND rd.id <> v_approver
      AND rd.revoked_at IS NULL
      AND public._chat_history_request_is_live(r.recipient_device_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.chat_recipient_key_envelopes theirs
          WHERE theirs.chat_id = mine.chat_id
            AND theirs.epoch = mine.epoch
            AND theirs.recipient_device_id = rd.id
      )
    ORDER BY r.id, mine.chat_id, mine.epoch;
END;
$$;

REVOKE ALL ON FUNCTION public.get_device_history_backfill(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_history_backfill(UUID, TEXT) TO service_role;
