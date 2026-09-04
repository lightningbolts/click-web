-- E2EE v2 rollout gate. The client keeps all private keys and epoch keys; these tables only
-- contain authenticated metadata and opaque envelopes. All lifecycle mutations go through the
-- service-role RPCs below so epoch metadata and its complete recipient set commit atomically.

CREATE TABLE IF NOT EXISTS public.chat_key_transfer_approvals (
    chat_id               UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    recipient_device_id   UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    approved_by_device_id UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    approved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, recipient_device_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_key_transfer_approvals_approver
    ON public.chat_key_transfer_approvals (approved_by_device_id, chat_id);

ALTER TABLE public.chat_key_transfer_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_key_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_recipient_key_envelopes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.chat_key_epochs'::regclass
          AND conname = 'chat_key_epochs_membership_fingerprint_strict'
    ) THEN
        ALTER TABLE public.chat_key_epochs
            ADD CONSTRAINT chat_key_epochs_membership_fingerprint_strict
            CHECK (membership_fingerprint ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.chat_recipient_key_envelopes'::regclass
          AND conname = 'chat_recipient_key_envelopes_e2e2_prefix'
    ) THEN
        ALTER TABLE public.chat_recipient_key_envelopes
            ADD CONSTRAINT chat_recipient_key_envelopes_e2e2_prefix
            CHECK (envelope LIKE 'e2e2:%');
    END IF;
END;
$$;

-- The device endpoint already uses the service role for registration and revocation. Clients
-- retain read-only access to their own active device row and cannot replace its public key.
REVOKE ALL ON public.chat_devices FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.chat_devices FROM authenticated;
GRANT SELECT ON public.chat_devices TO authenticated;
DROP POLICY IF EXISTS chat_devices_insert_own ON public.chat_devices;
DROP POLICY IF EXISTS chat_devices_update_own ON public.chat_devices;
DROP POLICY IF EXISTS chat_devices_select_own ON public.chat_devices;
CREATE POLICY chat_devices_select_own
    ON public.chat_devices FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND revoked_at IS NULL);

-- Epochs, approvals, and envelope lifecycle mutations are service-role-only. Envelope reads are
-- narrowed by the helper below to the caller's active device and an approval/predates check.
-- Message writes are also service-role-only so a client cannot bypass the API E2EE gate with a
-- direct PostgREST insert or update; legacy message reads remain unchanged.
REVOKE INSERT, UPDATE ON public.messages FROM authenticated;
DROP POLICY IF EXISTS "Users can create messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in their chats" ON public.messages;
DROP POLICY IF EXISTS messages_member_insert ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can mark messages as read in their chats" ON public.messages;
DROP POLICY IF EXISTS messages_sender_update ON public.messages;
DROP POLICY IF EXISTS messages_member_update ON public.messages;
REVOKE ALL ON public.chat_key_epochs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.chat_key_transfer_approvals FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_recipient_key_envelopes FROM authenticated;
REVOKE ALL ON public.chat_recipient_key_envelopes FROM PUBLIC, anon;
GRANT SELECT ON public.chat_recipient_key_envelopes TO authenticated;
GRANT ALL ON public.chat_devices TO service_role;
GRANT ALL ON public.chat_key_epochs TO service_role;
GRANT ALL ON public.chat_recipient_key_envelopes TO service_role;
GRANT ALL ON public.chat_key_transfer_approvals TO service_role;

DROP POLICY IF EXISTS chat_key_epochs_select_participant ON public.chat_key_epochs;
DROP POLICY IF EXISTS chat_key_epochs_insert_participant ON public.chat_key_epochs;
DROP POLICY IF EXISTS chat_key_epochs_update_participant ON public.chat_key_epochs;
DROP POLICY IF EXISTS chat_recipient_key_envelopes_select_participant ON public.chat_recipient_key_envelopes;
DROP POLICY IF EXISTS chat_recipient_key_envelopes_insert_participant ON public.chat_recipient_key_envelopes;
DROP POLICY IF EXISTS chat_recipient_key_envelopes_update_participant ON public.chat_recipient_key_envelopes;
DROP POLICY IF EXISTS chat_recipient_key_envelopes_delete_participant ON public.chat_recipient_key_envelopes;
DROP POLICY IF EXISTS chat_key_transfer_approvals_select ON public.chat_key_transfer_approvals;
DROP POLICY IF EXISTS chat_recipient_key_envelopes_select_device ON public.chat_recipient_key_envelopes;

CREATE OR REPLACE FUNCTION public._e2ee_v2_chat_participants(p_chat_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_connection_id UUID;
    v_group_id UUID;
    v_members UUID[];
BEGIN
    SELECT c.connection_id, c.group_id
    INTO v_connection_id, v_group_id
    FROM public.chats c
    WHERE c.id = p_chat_id;

    IF v_group_id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT gm.user_id ORDER BY gm.user_id), ARRAY[]::UUID[])
        INTO v_members
        FROM public.group_members gm
        WHERE gm.group_id = v_group_id;
    ELSIF v_connection_id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT parsed.user_id ORDER BY parsed.user_id), ARRAY[]::UUID[])
        INTO v_members
        FROM public.connections c
        CROSS JOIN LATERAL unnest(c.user_ids) AS u(user_id_text)
        CROSS JOIN LATERAL (SELECT u.user_id_text::UUID AS user_id) parsed
        WHERE c.id = v_connection_id;
    ELSE
        v_members := ARRAY[]::UUID[];
    END IF;

    RETURN v_members;
END;
$$;

REVOKE ALL ON FUNCTION public._e2ee_v2_chat_participants(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2ee_v2_chat_participants(UUID) TO service_role;

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
    v_item JSONB;
    v_recipient_device UUID;
    v_recipient_device_id TEXT;
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
        HAVING count(*) > 1
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

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_envelopes)
    LOOP
        v_recipient_device_id := v_item->>'recipient_device_id';
        SELECT d.id INTO v_recipient_device
        FROM public.chat_devices d
        WHERE d.device_id = v_recipient_device_id
          AND d.user_id = ANY(v_members)
          AND d.key_algorithm = 'X25519'
          AND d.crypto_version = 2
          AND d.revoked_at IS NULL;

        INSERT INTO public.chat_recipient_key_envelopes
            (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
        VALUES (p_chat_id, p_epoch, v_recipient_device, v_sender_device, v_item->>'envelope');
    END LOOP;

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

REVOKE ALL ON FUNCTION public.create_or_rotate_chat_epoch(UUID, UUID, TEXT, INTEGER, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_rotate_chat_epoch(UUID, UUID, TEXT, INTEGER, TEXT, JSONB)
    TO service_role;

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
    v_oldest_epoch TIMESTAMPTZ;
    v_item JSONB;
    v_epoch INTEGER;
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

    SELECT d.id INTO v_recipient
    FROM public.chat_devices d
    WHERE d.device_id = p_recipient_device_id
      AND d.user_id = ANY(v_members)
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_recipient IS NULL OR v_recipient = v_approver THEN
        RAISE EXCEPTION 'recipient device is not an eligible active chat device' USING ERRCODE = '42501';
    END IF;

    SELECT min(e.created_at) INTO v_oldest_epoch
    FROM public.chat_key_epochs e
    WHERE e.chat_id = p_chat_id;
    IF v_oldest_epoch IS NULL THEN
        RAISE EXCEPTION 'chat has no E2EE v2 epoch' USING ERRCODE = 'P0002';
    END IF;
    IF (SELECT d.created_at FROM public.chat_devices d WHERE d.id = v_approver) > v_oldest_epoch THEN
        RAISE EXCEPTION 'approving device did not predate the chat epoch' USING ERRCODE = '42501';
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

        IF EXISTS (
            SELECT 1 FROM public.chat_recipient_key_envelopes e
            WHERE e.chat_id = p_chat_id
              AND e.epoch = v_epoch
              AND e.recipient_device_id = v_recipient
              AND e.envelope <> v_item->>'envelope'
        ) THEN
            RAISE EXCEPTION 'historical envelope already exists with different material' USING ERRCODE = '23505';
        END IF;

        INSERT INTO public.chat_recipient_key_envelopes
            (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
        VALUES (p_chat_id, v_epoch, v_recipient, v_approver, v_item->>'envelope')
        ON CONFLICT (chat_id, epoch, recipient_device_id) DO NOTHING;
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
        'approved_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_chat_key_transfer(UUID, UUID, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_chat_key_transfer(UUID, UUID, TEXT, TEXT, JSONB)
    TO service_role;

CREATE OR REPLACE FUNCTION public.auth_uid_can_receive_chat_envelope(
    p_chat_id UUID,
    p_epoch INTEGER,
    p_recipient_device_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_device_created_at TIMESTAMPTZ;
    v_epoch_created_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL OR NOT public.auth_uid_can_access_chat(p_chat_id) THEN
        RETURN false;
    END IF;

    SELECT d.created_at INTO v_device_created_at
    FROM public.chat_devices d
    WHERE d.id = p_recipient_device_id
      AND d.user_id = auth.uid()
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_device_created_at IS NULL THEN RETURN false; END IF;

    SELECT e.created_at INTO v_epoch_created_at
    FROM public.chat_key_epochs e
    WHERE e.chat_id = p_chat_id AND e.epoch = p_epoch;
    IF v_epoch_created_at IS NULL THEN RETURN false; END IF;

    RETURN v_device_created_at <= v_epoch_created_at
        OR EXISTS (
            SELECT 1
            FROM public.chat_key_transfer_approvals a
            JOIN public.chat_devices approver ON approver.id = a.approved_by_device_id
            WHERE a.chat_id = p_chat_id
              AND a.recipient_device_id = p_recipient_device_id
              AND approver.revoked_at IS NULL
              AND approver.key_algorithm = 'X25519'
              AND approver.crypto_version = 2
        );
END;
$$;

REVOKE ALL ON FUNCTION public.auth_uid_can_receive_chat_envelope(UUID, INTEGER, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_uid_can_receive_chat_envelope(UUID, INTEGER, UUID)
    TO authenticated;

CREATE POLICY chat_recipient_key_envelopes_select_device
    ON public.chat_recipient_key_envelopes FOR SELECT TO authenticated
    USING (public.auth_uid_can_receive_chat_envelope(chat_id, epoch, recipient_device_id));

CREATE OR REPLACE FUNCTION public.get_chat_key_envelopes_for_device(
    p_chat_id UUID,
    p_user_id UUID,
    p_device_id TEXT
)
RETURNS TABLE (
    chat_id UUID,
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
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_members UUID[];
    v_device UUID;
BEGIN
    v_members := public._e2ee_v2_chat_participants(p_chat_id);
    IF NOT (p_user_id = ANY(v_members)) THEN RETURN; END IF;

    SELECT d.id INTO v_device
    FROM public.chat_devices d
    WHERE d.user_id = p_user_id
      AND d.device_id = p_device_id
      AND d.key_algorithm = 'X25519'
      AND d.crypto_version = 2
      AND d.revoked_at IS NULL;
    IF v_device IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT e.chat_id, e.epoch, e.recipient_device_id, sender.device_id, e.envelope,
           e.created_at, k.membership_fingerprint
    FROM public.chat_recipient_key_envelopes e
    JOIN public.chat_key_epochs k ON k.chat_id = e.chat_id AND k.epoch = e.epoch
    JOIN public.chat_devices sender ON sender.id = e.sender_device_id
    WHERE e.chat_id = p_chat_id
      AND e.recipient_device_id = v_device
      AND (
          (SELECT d.created_at FROM public.chat_devices d WHERE d.id = v_device) <= k.created_at
          OR EXISTS (
              SELECT 1
              FROM public.chat_key_transfer_approvals a
              JOIN public.chat_devices approver ON approver.id = a.approved_by_device_id
              WHERE a.chat_id = e.chat_id
                AND a.recipient_device_id = v_device
                AND approver.revoked_at IS NULL
                AND approver.key_algorithm = 'X25519'
                AND approver.crypto_version = 2
          )
      )
    ORDER BY e.epoch ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_key_envelopes_for_device(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_key_envelopes_for_device(UUID, UUID, TEXT)
    TO service_role;
