BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(9);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'places-purge@example.test', '', now(), now());
INSERT INTO public.places (id, name) VALUES ('d2000000-0000-4000-8000-000000000002', 'Purge Place');

-- Rollup table: service role only, no user ids.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.place_daily_stats'::regclass), 'place_daily_stats has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.place_daily_stats', 'SELECT'), 'clients cannot read daily stats');
SELECT hasnt_column('public', 'place_daily_stats', 'user_id', 'daily stats carry no user ids');
SELECT ok(NOT has_function_privilege('authenticated', 'public.purge_place_presence(integer, integer, integer)', 'EXECUTE'), 'purge is service role only');

-- Retention.
INSERT INTO public.place_check_ins (id, place_id, user_id, checked_at, expires_at, proof, proof_weight)
VALUES
    ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', now() - interval '4 hours', now() - interval '1 hour', 'gps', 0.8),
    ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', now() - interval '100 days', now() - interval '100 days', 'gps', 0.8);
UPDATE public.place_check_ins SET checked_out_at = now() - interval '100 days' WHERE id = 'd3000000-0000-4000-8000-000000000002';
INSERT INTO public.place_pulses (place_id, user_id, proof, proof_weight, energy, created_at)
VALUES
    ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'gps', 0.8, 3, now() - interval '40 days'),
    ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'gps', 0.8, 2, now() - interval '500 days');

SELECT is(
    public.purge_place_presence(90, 30, 400),
    '{"closed": 1, "check_ins_deleted": 1, "pulses_anonymized": 2, "pulses_deleted": 1}'::jsonb,
    'purge closes expired, deletes old check-ins, anonymizes and deletes old Pulses'
);
SELECT is(
    (SELECT checkout_reason FROM public.place_check_ins WHERE id = 'd3000000-0000-4000-8000-000000000001'),
    'expired',
    'an expired open check-in is closed as expired'
);
SELECT is((SELECT count(*)::int FROM public.place_check_ins WHERE id = 'd3000000-0000-4000-8000-000000000002'), 0, 'check-ins older than 90 days are deleted');
SELECT is((SELECT count(*)::int FROM public.place_pulses WHERE user_id IS NOT NULL), 0, 'Pulse identity is removed after 30 days');
SELECT is((SELECT count(*)::int FROM public.place_pulses), 1, 'Pulses older than 400 days are deleted');

SELECT * FROM finish();
ROLLBACK;
