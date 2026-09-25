-- Keep legacy rows, but never infer mailbox ownership from signup alone.
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
-- Older installations may not yet have the optional attribution columns.
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website';
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS referrer_user_id UUID;
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
REVOKE INSERT, UPDATE, DELETE ON public.waitlist FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.waitlist_verifications (
    email TEXT PRIMARY KEY CHECK (email = lower(trim(email))),
    token_hash TEXT UNIQUE NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    send_count INTEGER NOT NULL DEFAULT 1,
    source TEXT,
    referrer_user_id UUID
);
ALTER TABLE public.waitlist_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_verifications FROM anon, authenticated;
GRANT ALL ON public.waitlist_verifications TO service_role;

-- Atomic upsert enforces the email cooldown across concurrent Worker instances.
CREATE OR REPLACE FUNCTION public.request_waitlist_verification(
    p_email TEXT, p_token_hash TEXT, p_source TEXT DEFAULT NULL,
    p_referrer_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.waitlist
               WHERE lower(email) = lower(trim(p_email)) AND verified_at IS NOT NULL) THEN
        RETURN false;
    END IF;
    INSERT INTO public.waitlist_verifications AS pending
        (email, token_hash, expires_at, source, referrer_user_id)
    VALUES (lower(trim(p_email)), p_token_hash, now() + interval '24 hours', p_source, p_referrer_user_id)
    ON CONFLICT (email) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        sent_at = now(),
        window_started_at = CASE WHEN pending.window_started_at <= now() - interval '24 hours'
            THEN now() ELSE pending.window_started_at END,
        send_count = CASE WHEN pending.window_started_at <= now() - interval '24 hours'
            THEN 1 ELSE pending.send_count + 1 END,
        source = coalesce(pending.source, EXCLUDED.source),
        referrer_user_id = coalesce(pending.referrer_user_id, EXCLUDED.referrer_user_id)
    WHERE pending.sent_at <= now() - interval '2 minutes'
      AND (pending.send_count < 5 OR pending.window_started_at <= now() - interval '24 hours');
    RETURN FOUND;
END;
$$;

-- Consume the token and confirm the address in one transaction. A rollback
-- preserves the token if insertion fails; a replay cannot confirm twice.
CREATE OR REPLACE FUNCTION public.confirm_waitlist_email(p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    pending public.waitlist_verifications%ROWTYPE;
BEGIN
    DELETE FROM public.waitlist_verifications
    WHERE token_hash = p_token_hash AND expires_at > now()
    RETURNING * INTO pending;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE public.waitlist SET verified_at = coalesce(verified_at, now())
    WHERE lower(email) = pending.email;
    IF NOT FOUND THEN
        INSERT INTO public.waitlist (email, source, referrer_user_id, verified_at)
        VALUES (pending.email, coalesce(pending.source, 'website'), pending.referrer_user_id, now())
        ON CONFLICT (email) DO UPDATE SET verified_at = coalesce(public.waitlist.verified_at, EXCLUDED.verified_at);
    END IF;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_waitlist_verification(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_waitlist_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_waitlist_verification(TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_waitlist_email(TEXT) TO service_role;
