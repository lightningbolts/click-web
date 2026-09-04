-- Hub E2EE v2 rollout. Hub key material remains client-side; these tables contain only
-- authenticated epoch metadata and opaque e2e2 envelopes. Hub lifecycle writes are service-only.

CREATE TABLE IF NOT EXISTS public.hub_key_epochs (
    hub_id                TEXT NOT NULL REFERENCES public.hub_venues (id) ON DELETE CASCADE,
    epoch                 INTEGER NOT NULL,
    membership_fingerprint TEXT NOT NULL,
    created_by            UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at            TIMESTAMPTZ,
    CONSTRAINT hub_key_epochs_epoch_positive CHECK (epoch > 0),
    CONSTRAINT hub_key_epochs_membership_fingerprint_strict
        CHECK (membership_fingerprint ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
    PRIMARY KEY (hub_id, epoch)
);

CREATE TABLE IF NOT EXISTS public.hub_recipient_key_envelopes (
    hub_id             TEXT NOT NULL,
    epoch              INTEGER NOT NULL,
    recipient_device_id UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    sender_device_id    UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    envelope            TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hub_recipient_key_envelopes_epoch_fk
        FOREIGN KEY (hub_id, epoch)
        REFERENCES public.hub_key_epochs (hub_id, epoch)
        ON DELETE CASCADE,
    CONSTRAINT hub_recipient_key_envelopes_e2e2_prefix CHECK (envelope LIKE 'e2e2:%'),
    PRIMARY KEY (hub_id, epoch, recipient_device_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_key_epochs_hub_created
    ON public.hub_key_epochs (hub_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_recipient_key_envelopes_recipient
    ON public.hub_recipient_key_envelopes (recipient_device_id, hub_id, epoch);
CREATE INDEX IF NOT EXISTS idx_hub_recipient_key_envelopes_sender
    ON public.hub_recipient_key_envelopes (sender_device_id, hub_id, epoch);

COMMENT ON TABLE public.hub_key_epochs IS
    'Hub E2EE v2 epoch metadata; epoch key material remains on client devices.';
COMMENT ON TABLE public.hub_recipient_key_envelopes IS
    'Per-recipient opaque hub E2EE v2 epoch-key envelopes.';

ALTER TABLE public.hub_key_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_recipient_key_envelopes ENABLE ROW LEVEL SECURITY;

-- No authenticated lifecycle mutation or direct epoch metadata access. The API calls the
-- service-only RPCs below with the server service role after the normal hub gatekeeper runs.
REVOKE ALL ON public.hub_key_epochs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hub_recipient_key_envelopes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.hub_recipient_key_envelopes FROM authenticated;
GRANT SELECT ON public.hub_recipient_key_envelopes TO authenticated;
GRANT ALL ON public.hub_key_epochs TO service_role;
GRANT ALL ON public.hub_recipient_key_envelopes TO service_role;

CREATE OR REPLACE FUNCTION public._e2ee_v2_hub_active_devices(p_hub_id TEXT)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
    SELECT COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::UUID[])
    FROM public.hub_participants hp
    JOIN public.chat_devices d ON d.user_id = hp.user_id
    WHERE hp.hub_id = p_hub_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public._e2ee_v2_hub_active_devices(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2ee_v2_hub_active_devices(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_or_rotate_hub_epoch(
    p_hub_id TEXT,
    p_actor_user_id UUID,
    p_sender_device_id TEXT,
    p_epoch INTEGER,
    p_membership_fingerprint TEXT,
    p_envelopes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_hub_id TEXT;
    v_members UUID[];
    v_active_devices UUID[];
    v_requested_devices UUID[];
    v_sender_device UUID;
    v_current_epoch INTEGER;
    v_item JSONB;
    v_recipient_device UUID;
    v_recipient_device_id TEXT;
BEGIN
    IF p_hub_id IS NULL
       OR p_hub_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
       OR p_actor_user_id IS NULL
       OR p_sender_device_id IS NULL
       OR p_sender_device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
       OR p_epoch IS NULL OR p_epoch <= 0
       OR p_membership_fingerprint IS NULL
       OR p_membership_fingerprint !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
       OR jsonb_typeof(p_envelopes) <> 'array'
       OR jsonb_array_length(p_envelopes) = 0
       OR jsonb_array_length(p_envelopes) > 1024 THEN
        RAISE EXCEPTION 'invalid hub E2EE v2 epoch request' USING ERRCODE = '22023';
    END IF;

    -- Serialize rotations per hub so an epoch and its complete recipient set commit atomically.
    SELECT hv.id INTO v_hub_id
    FROM public.hub_venues hv
    WHERE hv.id = p_hub_id
    FOR UPDATE;
    IF v_hub_id IS NULL THEN
        RAISE EXCEPTION 'hub not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.hub_participants hp
        WHERE hp.hub_id = p_hub_id AND hp.user_id = p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'actor is not an active hub participant' USING ERRCODE = '42501';
    END IF;

    -- An epoch may only be initialized or rotated once every active participant
    -- has a v2 identity. Otherwise the hub would be marked upgraded while a
    -- participant could neither receive the epoch key nor write safely.
    IF EXISTS (
        SELECT 1
        FROM public.hub_participants hp
        WHERE hp.hub_id = p_hub_id
          AND NOT EXISTS (
              SELECT 1
              FROM public.chat_devices d
              WHERE d.user_id = hp.user_id
                AND d.key_algorithm = 'X25519'
                AND d.crypto_version = 2
                AND d.revoked_at IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'all active hub participants need E2EE v2 devices' USING ERRCODE = '42501';
    END IF;

    SELECT d.id INTO v_sender_device
    FROM public.chat_devices d
    WHERE d.user_id = p_actor_user_id
      AND d.device_id = p_sender_device_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_sender_device IS NULL THEN
        RAISE EXCEPTION 'sender device is not active' USING ERRCODE = '42501';
    END IF;

    SELECT max(e.epoch) INTO v_current_epoch
    FROM public.hub_key_epochs e
    WHERE e.hub_id = p_hub_id;
    IF v_current_epoch IS NULL THEN
        IF p_epoch <> 1 THEN
            RAISE EXCEPTION 'initial hub epoch must be 1' USING ERRCODE = '22023';
        END IF;
    ELSIF p_epoch <> v_current_epoch + 1 THEN
        RAISE EXCEPTION 'hub epoch must advance monotonically' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT d.device_id
        FROM public.hub_participants hp
        JOIN public.chat_devices d ON d.user_id = hp.user_id
        WHERE hp.hub_id = p_hub_id
          AND d.key_algorithm = 'X25519'
          AND d.crypto_version = 2
          AND d.revoked_at IS NULL
        GROUP BY d.device_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'active hub device identifiers are ambiguous' USING ERRCODE = '22023';
    END IF;

    v_active_devices := public._e2ee_v2_hub_active_devices(p_hub_id);

    IF (
        SELECT count(DISTINCT item->>'recipient_device_id')
        FROM jsonb_array_elements(p_envelopes) item
    ) <> jsonb_array_length(p_envelopes) THEN
        RAISE EXCEPTION 'duplicate hub recipient device' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_envelopes) item
        WHERE jsonb_typeof(item) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
                   CASE WHEN jsonb_typeof(item) = 'object' THEN item ELSE '{}'::jsonb END
               )) <> 3
           OR NOT (item ?& ARRAY['recipient_device_id', 'sender_device_id', 'envelope'])
           OR item->>'recipient_device_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
           OR item->>'sender_device_id' <> p_sender_device_id
           OR item->>'envelope' NOT LIKE 'e2e2:%'
    ) THEN
        RAISE EXCEPTION 'invalid hub epoch-key envelope set' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::UUID[])
    INTO v_requested_devices
    FROM jsonb_array_elements(p_envelopes) item
    JOIN public.chat_devices d ON d.device_id = item->>'recipient_device_id'
    JOIN public.hub_participants hp ON hp.user_id = d.user_id AND hp.hub_id = p_hub_id
    WHERE d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;

    IF v_requested_devices <> v_active_devices THEN
        RAISE EXCEPTION 'hub recipient device set does not match active hub devices' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.hub_key_epochs (hub_id, epoch, membership_fingerprint, created_by)
    VALUES (p_hub_id, p_epoch, p_membership_fingerprint, p_actor_user_id);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_envelopes)
    LOOP
        v_recipient_device_id := v_item->>'recipient_device_id';
        SELECT d.id INTO v_recipient_device
        FROM public.chat_devices d
        JOIN public.hub_participants hp ON hp.user_id = d.user_id AND hp.hub_id = p_hub_id
        WHERE d.device_id = v_recipient_device_id
          AND d.key_algorithm = 'X25519'
          AND d.crypto_version = 2
          AND d.revoked_at IS NULL;

        INSERT INTO public.hub_recipient_key_envelopes
            (hub_id, epoch, recipient_device_id, sender_device_id, envelope)
        VALUES (p_hub_id, p_epoch, v_recipient_device, v_sender_device, v_item->>'envelope');
    END LOOP;

    IF v_current_epoch IS NOT NULL THEN
        UPDATE public.hub_key_epochs
        SET retired_at = COALESCE(retired_at, now())
        WHERE hub_id = p_hub_id AND epoch = v_current_epoch;
    END IF;

    RETURN jsonb_build_object(
        'hub_id', p_hub_id,
        'epoch', p_epoch,
        'membership_fingerprint', p_membership_fingerprint,
        'recipient_count', jsonb_array_length(p_envelopes)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_rotate_hub_epoch(TEXT, UUID, TEXT, INTEGER, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_rotate_hub_epoch(TEXT, UUID, TEXT, INTEGER, TEXT, JSONB)
    TO service_role;

CREATE OR REPLACE FUNCTION public.auth_uid_can_receive_hub_envelope(
    p_hub_id TEXT,
    p_epoch INTEGER,
    p_recipient_device_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.hub_participants hp
           JOIN public.chat_devices d ON d.user_id = hp.user_id
           WHERE hp.hub_id = p_hub_id
             AND d.id = p_recipient_device_id
             AND d.user_id = auth.uid()
             AND d.key_algorithm = 'X25519'
             AND d.crypto_version = 2
             AND d.revoked_at IS NULL
             AND d.created_at <= (
                 SELECT e.created_at FROM public.hub_key_epochs e
                 WHERE e.hub_id = p_hub_id AND e.epoch = p_epoch
             )
       );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_can_receive_hub_envelope(TEXT, INTEGER, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_uid_can_receive_hub_envelope(TEXT, INTEGER, UUID)
    TO authenticated;

DROP POLICY IF EXISTS hub_recipient_key_envelopes_select_device ON public.hub_recipient_key_envelopes;
CREATE POLICY hub_recipient_key_envelopes_select_device
    ON public.hub_recipient_key_envelopes FOR SELECT TO authenticated
    USING (public.auth_uid_can_receive_hub_envelope(hub_id, epoch, recipient_device_id));

CREATE OR REPLACE FUNCTION public.get_hub_key_envelopes_for_device(
    p_hub_id TEXT,
    p_user_id UUID,
    p_device_id TEXT
)
RETURNS TABLE (
    hub_id TEXT,
    epoch INTEGER,
    recipient_device_id UUID,
    sender_device_id TEXT,
    envelope TEXT,
    created_at TIMESTAMPTZ,
    membership_fingerprint TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_device UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.hub_participants hp
        WHERE hp.hub_id = p_hub_id AND hp.user_id = p_user_id
    ) THEN
        RETURN;
    END IF;

    SELECT d.id INTO v_device
    FROM public.chat_devices d
    WHERE d.user_id = p_user_id
      AND d.device_id = p_device_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_device IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT e.hub_id, e.epoch, e.recipient_device_id, sender.device_id, e.envelope,
           e.created_at, k.membership_fingerprint
    FROM public.hub_recipient_key_envelopes e
    JOIN public.hub_key_epochs k ON k.hub_id = e.hub_id AND k.epoch = e.epoch
    JOIN public.chat_devices sender ON sender.id = e.sender_device_id
    WHERE e.hub_id = p_hub_id
      AND e.recipient_device_id = v_device
      AND (
          (SELECT d.created_at FROM public.chat_devices d WHERE d.id = v_device) <= k.created_at
      )
    ORDER BY e.epoch ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hub_key_envelopes_for_device(TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hub_key_envelopes_for_device(TEXT, UUID, TEXT)
    TO service_role;

-- Once a hub has an epoch, the API gate below is the only message-write path. Existing rows and
-- authenticated reads remain available; system messages continue through their existing RPC.
REVOKE INSERT ON public.hub_messages FROM authenticated;
DROP POLICY IF EXISTS "hub_messages_insert_authenticated" ON public.hub_messages;
DROP POLICY IF EXISTS "hub_messages_insert_authorized" ON public.hub_messages;
