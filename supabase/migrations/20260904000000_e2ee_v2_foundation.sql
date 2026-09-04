-- Release Train C E2EE v2 foundation. Additive and idempotent: no existing table or data is changed.
-- Route/API rollout and the v2 write flag remain a follow-up gate.

CREATE TABLE IF NOT EXISTS public.chat_devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    device_id           TEXT NOT NULL,
    identity_public_key TEXT NOT NULL,
    key_algorithm       TEXT NOT NULL DEFAULT 'X25519',
    crypto_version      SMALLINT NOT NULL DEFAULT 2,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at          TIMESTAMPTZ,
    CONSTRAINT chat_devices_key_algorithm_x25519 CHECK (key_algorithm = 'X25519'),
    CONSTRAINT chat_devices_crypto_version_2 CHECK (crypto_version = 2),
    CONSTRAINT chat_devices_user_device_unique UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.chat_key_epochs (
    chat_id               UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    epoch                 INTEGER NOT NULL,
    membership_fingerprint TEXT NOT NULL,
    created_by            UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at            TIMESTAMPTZ,
    CONSTRAINT chat_key_epochs_epoch_positive CHECK (epoch > 0),
    PRIMARY KEY (chat_id, epoch)
);

CREATE TABLE IF NOT EXISTS public.chat_recipient_key_envelopes (
    chat_id             UUID NOT NULL,
    epoch               INTEGER NOT NULL,
    recipient_device_id UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    sender_device_id    UUID NOT NULL REFERENCES public.chat_devices (id) ON DELETE CASCADE,
    envelope            TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chat_recipient_key_envelopes_epoch_fk
        FOREIGN KEY (chat_id, epoch)
        REFERENCES public.chat_key_epochs (chat_id, epoch)
        ON DELETE CASCADE,
    PRIMARY KEY (chat_id, epoch, recipient_device_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_devices_user_id
    ON public.chat_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_devices_active_user
    ON public.chat_devices (user_id, revoked_at)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_key_epochs_chat_created
    ON public.chat_key_epochs (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recipient_key_envelopes_recipient
    ON public.chat_recipient_key_envelopes (recipient_device_id, chat_id, epoch);
CREATE INDEX IF NOT EXISTS idx_chat_recipient_key_envelopes_sender
    ON public.chat_recipient_key_envelopes (sender_device_id, chat_id, epoch);

COMMENT ON TABLE public.chat_devices IS
    'Per-device v2 X25519 public identities. Private keys remain in client non-extractable storage.';
COMMENT ON COLUMN public.chat_devices.device_id IS
    'Stable client-generated device identifier, unique within one user account.';
COMMENT ON COLUMN public.chat_devices.identity_public_key IS
    'Base64 standard SPKI X25519 public key; no private key material is stored here.';
COMMENT ON TABLE public.chat_key_epochs IS
    'Chat epoch metadata for v2 symmetric keys; epoch key material remains client-side.';
COMMENT ON COLUMN public.chat_key_epochs.membership_fingerprint IS
    'Client-computed authenticated membership snapshot identifier for this epoch.';
COMMENT ON TABLE public.chat_recipient_key_envelopes IS
    'Per-recipient e2e2: wrapped epoch-key envelopes; ciphertext is opaque to Postgres.';

ALTER TABLE public.chat_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_key_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_recipient_key_envelopes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_devices FROM PUBLIC, anon;
REVOKE ALL ON public.chat_key_epochs FROM PUBLIC, anon;
REVOKE ALL ON public.chat_recipient_key_envelopes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.chat_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_key_epochs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_recipient_key_envelopes TO authenticated;
GRANT ALL ON public.chat_devices TO service_role;
GRANT ALL ON public.chat_key_epochs TO service_role;
GRANT ALL ON public.chat_recipient_key_envelopes TO service_role;

DROP POLICY IF EXISTS chat_devices_select_own ON public.chat_devices;
CREATE POLICY chat_devices_select_own
    ON public.chat_devices FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_devices_insert_own ON public.chat_devices;
CREATE POLICY chat_devices_insert_own
    ON public.chat_devices FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_devices_update_own ON public.chat_devices;
CREATE POLICY chat_devices_update_own
    ON public.chat_devices FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_key_epochs_select_participant ON public.chat_key_epochs;
CREATE POLICY chat_key_epochs_select_participant
    ON public.chat_key_epochs FOR SELECT TO authenticated
    USING (public.auth_uid_can_access_chat(chat_id));

DROP POLICY IF EXISTS chat_key_epochs_insert_participant ON public.chat_key_epochs;
CREATE POLICY chat_key_epochs_insert_participant
    ON public.chat_key_epochs FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND public.auth_uid_can_access_chat(chat_id)
    );

DROP POLICY IF EXISTS chat_key_epochs_update_participant ON public.chat_key_epochs;
CREATE POLICY chat_key_epochs_update_participant
    ON public.chat_key_epochs FOR UPDATE TO authenticated
    USING (public.auth_uid_can_access_chat(chat_id))
    WITH CHECK (public.auth_uid_can_access_chat(chat_id));

DROP POLICY IF EXISTS chat_recipient_key_envelopes_select_participant ON public.chat_recipient_key_envelopes;
CREATE POLICY chat_recipient_key_envelopes_select_participant
    ON public.chat_recipient_key_envelopes FOR SELECT TO authenticated
    USING (public.auth_uid_can_access_chat(chat_id));

DROP POLICY IF EXISTS chat_recipient_key_envelopes_insert_participant ON public.chat_recipient_key_envelopes;
CREATE POLICY chat_recipient_key_envelopes_insert_participant
    ON public.chat_recipient_key_envelopes FOR INSERT TO authenticated
    WITH CHECK (
        public.auth_uid_can_access_chat(chat_id)
        AND EXISTS (
            SELECT 1
            FROM public.chat_devices sender_device
            WHERE sender_device.id = sender_device_id
              AND sender_device.user_id = auth.uid()
              AND sender_device.revoked_at IS NULL
        )
    );

DROP POLICY IF EXISTS chat_recipient_key_envelopes_update_participant ON public.chat_recipient_key_envelopes;
CREATE POLICY chat_recipient_key_envelopes_update_participant
    ON public.chat_recipient_key_envelopes FOR UPDATE TO authenticated
    USING (
        public.auth_uid_can_access_chat(chat_id)
        AND EXISTS (
            SELECT 1
            FROM public.chat_devices sender_device
            WHERE sender_device.id = sender_device_id
              AND sender_device.user_id = auth.uid()
              AND sender_device.revoked_at IS NULL
        )
    )
    WITH CHECK (
        public.auth_uid_can_access_chat(chat_id)
        AND EXISTS (
            SELECT 1
            FROM public.chat_devices sender_device
            WHERE sender_device.id = sender_device_id
              AND sender_device.user_id = auth.uid()
              AND sender_device.revoked_at IS NULL
        )
    );

DROP POLICY IF EXISTS chat_recipient_key_envelopes_delete_participant ON public.chat_recipient_key_envelopes;
CREATE POLICY chat_recipient_key_envelopes_delete_participant
    ON public.chat_recipient_key_envelopes FOR DELETE TO authenticated
    USING (
        public.auth_uid_can_access_chat(chat_id)
        AND EXISTS (
            SELECT 1
            FROM public.chat_devices sender_device
            WHERE sender_device.id = sender_device_id
              AND sender_device.user_id = auth.uid()
        )
    );
