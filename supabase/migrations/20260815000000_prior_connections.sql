-- Prior Connections: self-reported relationships that must never masquerade as
-- verified physical handshakes. Sensor columns on connection_encounters stay
-- reserved for real-world crossings; this migration does not generate encounters.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE public.connection_source AS ENUM ('handshake', 'prior');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.known_since_bucket AS ENUM (
        'childhood',
        'high_school',
        'college',
        'this_year',
        'unspecified'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS source public.connection_source NOT NULL DEFAULT 'handshake',
    ADD COLUMN IF NOT EXISTS confirmed_by_a boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS confirmed_by_b boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS known_since public.known_since_bucket DEFAULT 'unspecified',
    ADD COLUMN IF NOT EXISTS context_tag text DEFAULT NULL;

COMMENT ON COLUMN public.connections.source IS
    'handshake = mathematically verified co-presence; prior = self-reported. Insights must not mix these into one vanity total.';
COMMENT ON COLUMN public.connections.confirmed_by_a IS
    'Initiator (connections.initiator_id) has confirmed this prior connection.';
COMMENT ON COLUMN public.connections.confirmed_by_b IS
    'Responder (connections.responder_id) has confirmed this prior connection.';
COMMENT ON COLUMN public.connections.known_since IS
    'Self-reported time horizon for a prior connection. Unused for handshakes.';
COMMENT ON COLUMN public.connections.context_tag IS
    'Optional free-text context for a prior connection (e.g. High School track team). Distinct from encounter context tags.';

DO $$ BEGIN
    ALTER TABLE public.connections
        ADD CONSTRAINT check_prior_confirmation
        CHECK (source <> 'prior' OR (confirmed_by_a IS NOT NULL AND confirmed_by_b IS NOT NULL));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_connections_source_status
    ON public.connections (source, status);

-- Rate-limit prior connection *requests* (20 / sender / rolling 24h). Service-role only.
CREATE TABLE IF NOT EXISTS public.connection_requests_rate_limit (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id text NOT NULL,
    target_id text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_sender_day
    ON public.connection_requests_rate_limit (sender_id, created_at);

COMMENT ON TABLE public.connection_requests_rate_limit IS
    'Append-only audit of prior-connection requests used to enforce 20/user/24h.';

ALTER TABLE public.connection_requests_rate_limit ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.connection_requests_rate_limit TO service_role;

-- Lookup table of SHA-256(hex) hashes of a registered user's own email/phone.
-- Clients never upload plaintext contacts; discover matches client hashes to these rows.
CREATE TABLE IF NOT EXISTS public.user_contact_hashes (
    hash text PRIMARY KEY,
    user_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('email', 'phone')),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_contact_hashes_user_id
    ON public.user_contact_hashes (user_id);

COMMENT ON TABLE public.user_contact_hashes IS
    'SHA-256 hex of normalized email/E.164 phone for privacy-preserving contact matching. Service-role only.';

ALTER TABLE public.user_contact_hashes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_contact_hashes TO service_role;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_e164 text;

COMMENT ON COLUMN public.users.phone_e164 IS
    'Optional E.164 phone used only to populate user_contact_hashes for contact matching. Never returned by discover.';

CREATE OR REPLACE FUNCTION public.sync_user_contact_hashes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    email_hash text;
    phone_hash text;
    uid text;
    normalized_email text;
    normalized_phone text;
BEGIN
    uid := NEW.id::text;
    DELETE FROM public.user_contact_hashes WHERE user_id = uid;

    normalized_email := lower(trim(COALESCE(NEW.email, '')));
    IF length(normalized_email) > 2 AND position('@' IN normalized_email) > 1 THEN
        email_hash := encode(digest(normalized_email, 'sha256'), 'hex');
        INSERT INTO public.user_contact_hashes (hash, user_id, kind)
        VALUES (email_hash, uid, 'email')
        ON CONFLICT (hash) DO UPDATE SET user_id = EXCLUDED.user_id, kind = 'email';
    END IF;

    normalized_phone := regexp_replace(COALESCE(NEW.phone_e164, ''), '[^0-9+]', '', 'g');
    IF length(regexp_replace(normalized_phone, '[^0-9]', '', 'g')) >= 10 THEN
        IF left(normalized_phone, 1) <> '+' THEN
            IF length(regexp_replace(normalized_phone, '[^0-9]', '', 'g')) = 10 THEN
                normalized_phone := '+1' || regexp_replace(normalized_phone, '[^0-9]', '', 'g');
            ELSIF length(regexp_replace(normalized_phone, '[^0-9]', '', 'g')) = 11
                AND left(regexp_replace(normalized_phone, '[^0-9]', '', 'g'), 1) = '1' THEN
                normalized_phone := '+' || regexp_replace(normalized_phone, '[^0-9]', '', 'g');
            ELSE
                normalized_phone := '+' || regexp_replace(normalized_phone, '[^0-9]', '', 'g');
            END IF;
        END IF;
        phone_hash := encode(digest(normalized_phone, 'sha256'), 'hex');
        INSERT INTO public.user_contact_hashes (hash, user_id, kind)
        VALUES (phone_hash, uid, 'phone')
        ON CONFLICT (hash) DO UPDATE SET user_id = EXCLUDED.user_id, kind = 'phone';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_contact_hashes ON public.users;
CREATE TRIGGER trg_sync_user_contact_hashes
    AFTER INSERT OR UPDATE OF email, phone_e164 ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_contact_hashes();

-- Backfill hashes for existing profiles (emails only).
INSERT INTO public.user_contact_hashes (hash, user_id, kind)
SELECT
    encode(digest(lower(trim(u.email)), 'sha256'), 'hex') AS hash,
    u.id::text,
    'email'
FROM public.users u
WHERE u.email IS NOT NULL
  AND length(trim(u.email)) > 2
  AND position('@' IN u.email) > 1
ON CONFLICT (hash) DO UPDATE SET user_id = EXCLUDED.user_id, kind = 'email';
