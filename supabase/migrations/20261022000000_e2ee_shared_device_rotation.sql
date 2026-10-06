-- E2EE v2: let a chat (direct or group) or a hub rotate its epoch when one phone is signed into
-- several member accounts.
--
-- The device identity lives in the phone's keychain, so the same phone signed into two accounts
-- registers the same device_id (and public key) for both. create_or_rotate_chat_epoch and
-- create_or_rotate_hub_epoch rejected any shared device_id as ambiguous, so such a chat or hub
-- could never rotate: every send that needed a rotation failed ("Something went wrong") until
-- the app was relaunched. A shared device_id is now accepted when every row carries the same
-- public key (one wrap decrypts for all of them), and the envelope is stored for each of those
-- rows. Differing keys stay ambiguous. Grants are unchanged (CREATE OR REPLACE keeps them).

CREATE OR REPLACE FUNCTION public.create_or_rotate_chat_epoch(
    p_chat_id UUID,
    p_actor_user_id UUID,
    p_sender_device_id TEXT,
    p_epoch INTEGER,
    p_membership_fingerprint TEXT,
    p_envelopes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_chat public.chats%ROWTYPE;
    v_members UUID[];
    v_active_devices UUID[];
    v_requested_devices UUID[];
    v_sender_device UUID;
    v_current_epoch INTEGER;
BEGIN
    IF p_chat_id IS NULL OR p_actor_user_id IS NULL
       OR p_sender_device_id IS NULL
       OR p_sender_device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
       OR p_epoch IS NULL OR p_epoch <= 0
       OR p_membership_fingerprint IS NULL
       OR p_membership_fingerprint !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
       OR jsonb_typeof(p_envelopes) <> 'array'
       OR jsonb_array_length(p_envelopes) = 0
       OR jsonb_array_length(p_envelopes) > 1024 THEN
        RAISE EXCEPTION 'invalid E2EE v2 epoch request' USING ERRCODE = '22023';
    END IF;

    -- Locking the chat serializes initialize/rotate calls and makes the complete epoch write
    -- all-or-nothing. Any later exception rolls back both the epoch and every envelope.
    SELECT c.* INTO v_chat
    FROM public.chats c
    WHERE c.id = p_chat_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'chat not found' USING ERRCODE = 'P0002'; END IF;

    v_members := public._e2ee_v2_chat_participants(p_chat_id);
    IF NOT (p_actor_user_id = ANY(v_members)) THEN
        RAISE EXCEPTION 'actor is not a chat member' USING ERRCODE = '42501';
    END IF;

    -- Never mark a chat upgraded while a current member lacks a v2 identity.
    -- The server gate also enforces this, but keeping the invariant in the
    -- transaction closes direct-RPC and race-condition bypasses.
    IF EXISTS (
        SELECT 1
        FROM unnest(v_members) AS member_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.chat_devices d
            WHERE d.user_id = member_id
              AND d.key_algorithm = 'X25519'
              AND d.crypto_version = 2
              AND d.revoked_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION 'all chat members need E2EE v2 devices' USING ERRCODE = '42501';
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
    FROM public.chat_key_epochs e
    WHERE e.chat_id = p_chat_id;
    IF v_current_epoch IS NULL THEN
        IF p_epoch <> 1 THEN
            RAISE EXCEPTION 'initial epoch must be 1' USING ERRCODE = '22023';
        END IF;
    ELSIF p_epoch <> v_current_epoch + 1 THEN
        RAISE EXCEPTION 'epoch must advance monotonically' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.chat_devices d
        WHERE d.user_id = ANY(v_members)
          AND d.key_algorithm = 'X25519'
          AND d.crypto_version = 2
          AND d.revoked_at IS NULL
        GROUP BY d.device_id
        HAVING count(DISTINCT d.identity_public_key) > 1
    ) THEN
        RAISE EXCEPTION 'active device identifiers are ambiguous' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::UUID[])
    INTO v_active_devices
    FROM public.chat_devices d
    WHERE d.user_id = ANY(v_members)
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;

    IF (
        SELECT count(DISTINCT item->>'recipient_device_id')
        FROM jsonb_array_elements(p_envelopes) item
    ) <> jsonb_array_length(p_envelopes) THEN
        RAISE EXCEPTION 'duplicate recipient device' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_envelopes) item
        WHERE jsonb_typeof(item) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
                   CASE WHEN jsonb_typeof(item) = 'object' THEN item ELSE '{}'::jsonb END
               )) <> 3
           OR NOT (item ?& ARRAY['recipient_device_id', 'sender_device_id', 'envelope'])
           OR item->>'sender_device_id' <> p_sender_device_id
           OR item->>'envelope' NOT LIKE 'e2e2:%'
    ) THEN
        RAISE EXCEPTION 'invalid epoch-key envelope set' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::UUID[])
    INTO v_requested_devices
    FROM jsonb_array_elements(p_envelopes) item
    JOIN public.chat_devices d
      ON d.device_id = item->>'recipient_device_id'
     AND d.user_id = ANY(v_members)
     AND d.key_algorithm = 'X25519'
     AND d.crypto_version = 2
     AND d.revoked_at IS NULL;

    IF v_requested_devices <> v_active_devices THEN
        RAISE EXCEPTION 'recipient device set does not match active chat devices' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.chat_key_epochs (chat_id, epoch, membership_fingerprint, created_by)
    VALUES (p_chat_id, p_epoch, p_membership_fingerprint, p_actor_user_id);

    -- One envelope per device identity; every member row sharing it receives the same wrap.
    INSERT INTO public.chat_recipient_key_envelopes
        (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
    SELECT p_chat_id, p_epoch, d.id, v_sender_device, item->>'envelope'
    FROM jsonb_array_elements(p_envelopes) item
    JOIN public.chat_devices d
      ON d.device_id = item->>'recipient_device_id'
     AND d.user_id = ANY(v_members)
     AND d.key_algorithm = 'X25519'
     AND d.crypto_version = 2
     AND d.revoked_at IS NULL;

    IF v_current_epoch IS NOT NULL THEN
        UPDATE public.chat_key_epochs
        SET retired_at = COALESCE(retired_at, now())
        WHERE chat_id = p_chat_id AND epoch = v_current_epoch;
    END IF;

    RETURN jsonb_build_object(
        'chat_id', p_chat_id,
        'epoch', p_epoch,
        'membership_fingerprint', p_membership_fingerprint,
        'recipient_count', jsonb_array_length(p_envelopes)
    );
END;
$$;

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
        HAVING count(DISTINCT d.identity_public_key) > 1
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

    -- One envelope per device identity; every participant row sharing it receives the same wrap.
    INSERT INTO public.hub_recipient_key_envelopes
        (hub_id, epoch, recipient_device_id, sender_device_id, envelope)
    SELECT p_hub_id, p_epoch, d.id, v_sender_device, item->>'envelope'
    FROM jsonb_array_elements(p_envelopes) item
    JOIN public.chat_devices d ON d.device_id = item->>'recipient_device_id'
    JOIN public.hub_participants hp ON hp.user_id = d.user_id AND hp.hub_id = p_hub_id
    WHERE d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;

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
