-- Run against an isolated local database AFTER applying the verification migration.
-- Every test runs in a transaction and rolls back its fixtures.
BEGIN;
DO $$
DECLARE
    h1 TEXT := repeat('a', 64);
    h2 TEXT := repeat('b', 64);
    h3 TEXT := repeat('c', 64);
    referral UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    n INTEGER;
BEGIN
    DELETE FROM public.waitlist_verifications;
    DELETE FROM public.waitlist;

    IF NOT public.request_waitlist_verification('terajzhang@gmail.com', h1, 'deep_link', referral) THEN
        RAISE EXCEPTION 'initial request must issue a token';
    END IF;
    IF EXISTS (SELECT 1 FROM public.waitlist) THEN RAISE EXCEPTION 'pending address entered waitlist'; END IF;
    IF public.confirm_waitlist_email(h2) THEN RAISE EXCEPTION 'fabricated token passed'; END IF;
    IF public.request_waitlist_verification('TERAJZHANG@gmail.com', h2) THEN RAISE EXCEPTION 'cooldown bypassed using case'; END IF;
    IF NOT public.confirm_waitlist_email(h1) THEN RAISE EXCEPTION 'valid token rejected'; END IF;
    IF public.confirm_waitlist_email(h1) THEN RAISE EXCEPTION 'replayed token passed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.waitlist WHERE email = 'terajzhang@gmail.com'
        AND verified_at IS NOT NULL AND source = 'deep_link' AND referrer_user_id = referral) THEN
        RAISE EXCEPTION 'verified signup or attribution missing';
    END IF;
    IF public.request_waitlist_verification('terajzhang@gmail.com', h2) THEN RAISE EXCEPTION 'confirmed address sent duplicate email'; END IF;

    IF NOT public.request_waitlist_verification('made-up-mailbox-49271@example.com', h2) THEN RAISE EXCEPTION 'request failed'; END IF;
    IF EXISTS (SELECT 1 FROM public.waitlist WHERE email = 'made-up-mailbox-49271@example.com') THEN
        RAISE EXCEPTION 'unconfirmed fabricated mailbox entered waitlist';
    END IF;
    UPDATE public.waitlist_verifications SET expires_at = now() - interval '1 second' WHERE token_hash = h2;
    IF public.confirm_waitlist_email(h2) THEN RAISE EXCEPTION 'expired token passed'; END IF;

    UPDATE public.waitlist_verifications SET sent_at = now() - interval '3 minutes' WHERE token_hash = h2;
    IF NOT public.request_waitlist_verification('made-up-mailbox-49271@example.com', h3) THEN RAISE EXCEPTION 'resend failed'; END IF;
    IF public.confirm_waitlist_email(h2) THEN RAISE EXCEPTION 'superseded token passed'; END IF;
    FOR n IN 3..5 LOOP
        UPDATE public.waitlist_verifications SET sent_at = now() - interval '3 minutes' WHERE token_hash = h3;
        IF NOT public.request_waitlist_verification('made-up-mailbox-49271@example.com', h3) THEN RAISE EXCEPTION 'daily quota too strict'; END IF;
    END LOOP;
    UPDATE public.waitlist_verifications SET sent_at = now() - interval '3 minutes' WHERE token_hash = h3;
    IF public.request_waitlist_verification('made-up-mailbox-49271@example.com', h3) THEN RAISE EXCEPTION 'daily quota bypassed'; END IF;
    UPDATE public.waitlist_verifications SET window_started_at = now() - interval '25 hours' WHERE token_hash = h3;
    IF NOT public.request_waitlist_verification('made-up-mailbox-49271@example.com', h3) THEN RAISE EXCEPTION 'quota did not reset'; END IF;
    DELETE FROM public.waitlist_verifications;

    INSERT INTO public.waitlist(email, source) VALUES ('Legacy@Example.com', 'original');
    IF EXISTS (SELECT 1 FROM public.waitlist WHERE email = 'Legacy@Example.com' AND verified_at IS NOT NULL) THEN
        RAISE EXCEPTION 'legacy signup automatically verified';
    END IF;
    PERFORM public.request_waitlist_verification('legacy@example.com', h1, 'new');
    IF NOT public.confirm_waitlist_email(h1) THEN RAISE EXCEPTION 'legacy verification failed'; END IF;
    IF (SELECT count(*) FROM public.waitlist WHERE lower(email) = 'legacy@example.com') <> 1 THEN
        RAISE EXCEPTION 'legacy duplicate created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.waitlist WHERE email = 'Legacy@Example.com' AND verified_at IS NOT NULL AND source = 'original') THEN
        RAISE EXCEPTION 'legacy attribution overwritten';
    END IF;

    -- A failed insertion must roll back token consumption so the user can retry.
    ALTER TABLE public.waitlist ADD CONSTRAINT test_waitlist_failure CHECK (email <> 'rollback@example.com');
    PERFORM public.request_waitlist_verification('rollback@example.com', h2);
    BEGIN
        PERFORM public.confirm_waitlist_email(h2);
        RAISE EXCEPTION 'expected insertion failure';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.waitlist_verifications WHERE token_hash = h2) THEN
        RAISE EXCEPTION 'insertion failure consumed token';
    END IF;
    ALTER TABLE public.waitlist DROP CONSTRAINT test_waitlist_failure;
    IF NOT public.confirm_waitlist_email(h2) THEN RAISE EXCEPTION 'retry after insertion failure failed'; END IF;

    IF has_table_privilege('anon', 'public.waitlist', 'INSERT') OR
       has_table_privilege('authenticated', 'public.waitlist', 'INSERT') OR
       has_table_privilege('anon', 'public.waitlist_verifications', 'SELECT') OR
       has_function_privilege('anon', 'public.confirm_waitlist_email(text)', 'EXECUTE') OR
       has_function_privilege('authenticated', 'public.request_waitlist_verification(text,text,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'client role can bypass verification';
    END IF;
END;
$$;
ROLLBACK;
