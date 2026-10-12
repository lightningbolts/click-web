BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(30);

-- Fixtures: an admin, a regular user, one application with a resume object.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
    ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'recruiter@example.test', '', '{"role":"admin"}', now(), now(), now()),
    ('c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'someone@example.test', '', '{}', now(), now(), now());

INSERT INTO public.job_applications (
    id, position, full_name, email, school_year, majors, graduation_quarter, graduation_year, weekly_hours,
    start_date, interests, pitch, tried_click, referral_source, resume_path, resume_name, resume_type, resume_size
) VALUES (
    'd1000000-0000-4000-8000-000000000001', 'marketing-intern', 'Dubs Husky', 'pgtap-dubs@uw.edu', 'junior', 'Informatics',
    'spring', 2028, '5_10', '2026-11-01', ARRAY['social_media'], 'Energy and reach.', 'ios_beta', 'friend',
    'marketing-intern/d1000000-0000-4000-8000-000000000001.pdf', 'Dubs Resume.pdf', 'application/pdf', 1234
);

INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('job-application-resumes', 'marketing-intern/d1000000-0000-4000-8000-000000000001.pdf', NULL);

-- Shape, grants and constraints.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.job_applications'::regclass), 'job_applications has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.job_application_events'::regclass), 'job_application_events has RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.job_applications', 'SELECT'), 'anon cannot read applications');
SELECT ok(NOT has_table_privilege('anon', 'public.job_applications', 'INSERT'), 'anon cannot submit directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.job_applications', 'INSERT'), 'users cannot insert applications');
SELECT ok(NOT has_table_privilege('authenticated', 'public.job_applications', 'UPDATE'), 'users cannot update applications directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.job_application_events', 'INSERT'), 'users cannot write history');
SELECT ok(NOT has_function_privilege('anon', 'public.set_job_application_status(uuid, text, text)', 'EXECUTE'), 'anon cannot call the status RPC');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'job-application-resumes'), false, 'resume bucket is private');
SELECT is(
    (SELECT kind FROM public.job_application_events WHERE application_id = 'd1000000-0000-4000-8000-000000000001'),
    'submitted',
    'a submission logs its own history row'
);
SELECT is((SELECT status FROM public.job_applications WHERE id = 'd1000000-0000-4000-8000-000000000001'), 'new', 'new applications start as new');
SELECT throws_ok(
    $$INSERT INTO public.job_applications (position, full_name, email, school_year, majors, graduation_quarter, graduation_year, weekly_hours,
        start_date, interests, pitch, tried_click, referral_source, resume_path, resume_name, resume_type, resume_size)
      VALUES ('marketing-intern', 'Again', 'PGTAP-Dubs@uw.edu', 'junior', 'Info', 'spring', 2028, '5_10', '2026-11-01',
        ARRAY['social_media'], 'x', 'no', 'other', 'marketing-intern/other.pdf', 'r.pdf', 'application/pdf', 1)$$,
    '23505', NULL, 'one application per email per role (case-insensitive)'
);
SELECT throws_ok(
    $$INSERT INTO public.job_applications (position, full_name, email, school_year, majors, graduation_quarter, graduation_year, weekly_hours,
        start_date, interests, pitch, tried_click, referral_source, resume_path, resume_name, resume_type, resume_size)
      VALUES ('marketing-intern', 'Gmail', 'someone@gmail.com', 'junior', 'Info', 'spring', 2028, '5_10', '2026-11-01',
        ARRAY['social_media'], 'x', 'no', 'other', 'marketing-intern/gmail.pdf', 'r.pdf', 'application/pdf', 1)$$,
    '23514', NULL, 'only @uw.edu addresses are accepted'
);
SELECT throws_ok(
    $$UPDATE public.job_application_events SET kind = 'status_changed'$$,
    '42501', NULL, 'history is append-only'
);

-- A signed-in non-admin sees nothing and can change nothing.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{}}', true);
SELECT is((SELECT count(*)::int FROM public.job_applications), 0, 'non-admins read no applications');
SELECT is((SELECT count(*)::int FROM public.job_application_events), 0, 'non-admins read no history');
SELECT is((SELECT count(*)::int FROM public.job_application_status_counts('marketing-intern')), 0, 'non-admins get no counts');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'job-application-resumes'), 0, 'non-admins cannot see resumes');
SELECT throws_ok(
    $$SELECT public.set_job_application_status('d1000000-0000-4000-8000-000000000001', 'new', 'accepted')$$,
    '42501', NULL, 'non-admins cannot change status'
);
SELECT throws_ok(
    $$SELECT public.set_job_application_notes('d1000000-0000-4000-8000-000000000001', 'hi', NULL)$$,
    '42501', NULL, 'non-admins cannot write notes'
);
-- user_metadata is user-writable and must not grant anything.
SELECT set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"role":"admin"}}', true);
SELECT is((SELECT count(*)::int FROM public.job_applications), 0, 'user_metadata.role does not grant access');

-- An admin reads everything and changes review state through the RPCs.
SELECT set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated","email":"recruiter@example.test","app_metadata":{"role":"admin"}}', true);
SELECT is((SELECT count(*)::int FROM public.job_applications WHERE id = 'd1000000-0000-4000-8000-000000000001'), 1, 'admins read applications');
SELECT is(
    (SELECT count(*)::int FROM storage.objects
      WHERE bucket_id = 'job-application-resumes' AND name = 'marketing-intern/d1000000-0000-4000-8000-000000000001.pdf'),
    1,
    'admins can see (and so sign) resumes'
);
SELECT is(
    (SELECT total::int FROM public.job_application_status_counts('marketing-intern') WHERE status = 'new'),
    (SELECT count(*)::int FROM public.job_applications WHERE position = 'marketing-intern' AND status = 'new'),
    'admins get status counts'
);
SELECT lives_ok(
    $$SELECT public.set_job_application_status('d1000000-0000-4000-8000-000000000001', 'new', 'shortlisted')$$,
    'admins change status'
);
SELECT throws_ok(
    $$SELECT public.set_job_application_status('d1000000-0000-4000-8000-000000000001', 'new', 'rejected')$$,
    'PT409', NULL, 'a stale status change is rejected'
);
SELECT throws_ok(
    $$SELECT public.set_job_application_status('d9999999-0000-4000-8000-000000000009', 'new', 'rejected')$$,
    'P0002', NULL, 'an unknown application is reported'
);
SELECT lives_ok(
    $$SELECT public.set_job_application_notes('d1000000-0000-4000-8000-000000000001', 'Strong pitch.', NULL)$$,
    'admins write the first note'
);
SELECT throws_ok(
    $$SELECT public.set_job_application_notes('d1000000-0000-4000-8000-000000000001', 'Overwrite', NULL)$$,
    'PT409', NULL, 'a stale note save is rejected instead of overwriting'
);
SELECT results_eq(
    $$SELECT kind, from_status, to_status, actor_email FROM public.job_application_events
      WHERE application_id = 'd1000000-0000-4000-8000-000000000001' ORDER BY id$$,
    $$VALUES ('submitted'::text, NULL::text, 'new'::text, NULL::text),
             ('status_changed', 'new', 'shortlisted', 'recruiter@example.test'),
             ('notes_updated', NULL, NULL, 'recruiter@example.test')$$,
    'history records each change and who made it'
);

SELECT * FROM finish();
ROLLBACK;
