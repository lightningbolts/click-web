BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(2);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hist-a@example.test', '', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, name, email)
VALUES ('a3000000-0000-4000-8000-000000000001', 'Avery History', 'hist-a@example.test')
ON CONFLICT (id) DO NOTHING;

-- Something from long ago, then a new alert: the inbox keeps both.
INSERT INTO public.activity_items (user_id, type, title, created_at)
VALUES ('a3000000-0000-4000-8000-000000000001', 'new_connection', 'You clicked with Blake', now() - interval '2 years');
SELECT public.record_activity('a3000000-0000-4000-8000-000000000001', 'wave', 'Blake waved');

SELECT is((SELECT count(*)::int FROM public.activity_items WHERE user_id = 'a3000000-0000-4000-8000-000000000001'), 2,
          'a new item never prunes old history');
SELECT is((SELECT min(created_at) < now() - interval '1 year' FROM public.activity_items
           WHERE user_id = 'a3000000-0000-4000-8000-000000000001'), true,
          'history from the very beginning stays readable');

SELECT * FROM finish();
ROLLBACK;
