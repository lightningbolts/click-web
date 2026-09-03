BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(26);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'e2ee-a@example.test', '', now(), now()),
    ('20000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'e2ee-b@example.test', '', now(), now()),
    ('30000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'e2ee-outsider@example.test', '', now(), now());

INSERT INTO public.connections (id, user_ids, status)
VALUES (
    '40000000-0000-0000-0000-000000000404',
    ARRAY['10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000202'],
    'active'
);

INSERT INTO public.chats (id, connection_id)
VALUES ('50000000-0000-0000-0000-000000000505', '40000000-0000-0000-0000-000000000404');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_devices'::regclass), 'chat_devices has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_key_epochs'::regclass), 'chat_key_epochs has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_recipient_key_envelopes'::regclass), 'envelopes have RLS enabled');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_devices'::regclass AND polname = 'chat_devices_select_own'), 'device select policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_devices'::regclass AND polname = 'chat_devices_insert_own'), 'device insert policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_key_epochs'::regclass AND polname = 'chat_key_epochs_select_participant'), 'epoch participant select policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_recipient_key_envelopes'::regclass AND polname = 'chat_recipient_key_envelopes_insert_participant'), 'envelope participant insert policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_devices'::regclass AND conname = 'chat_devices_key_algorithm_x25519'), 'X25519 algorithm constraint exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_devices'::regclass AND conname = 'chat_devices_crypto_version_2'), 'crypto version constraint exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_devices'::regclass AND conname = 'chat_devices_user_device_unique'), 'user/device uniqueness exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_key_epochs'::regclass AND conname = 'chat_key_epochs_epoch_positive'), 'positive epoch constraint exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_recipient_key_envelopes'::regclass AND conname = 'chat_recipient_key_envelopes_epoch_fk'), 'envelope epoch foreign key exists');
SELECT ok(NOT has_table_privilege('anon', 'public.chat_devices', 'SELECT'), 'anon cannot read devices');
SELECT ok(NOT has_table_privilege('anon', 'public.chat_key_epochs', 'SELECT'), 'anon cannot read epochs');
SELECT ok(NOT has_table_privilege('anon', 'public.chat_recipient_key_envelopes', 'SELECT'), 'anon cannot read envelopes');
SELECT ok(has_table_privilege('service_role', 'public.chat_devices', 'SELECT'), 'service_role retains device access');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_epochs', 'SELECT'), 'service_role retains epoch access');
SELECT ok(has_table_privilege('service_role', 'public.chat_recipient_key_envelopes', 'SELECT'), 'service_role retains envelope access');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000101', true);
INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key)
VALUES ('60000000-0000-0000-0000-000000000606', '10000000-0000-0000-0000-000000000101', 'device-a', 'spki-a');
SELECT is((SELECT count(*)::integer FROM public.chat_devices), 1, 'user sees only own device');
SELECT throws_ok(
    $$ INSERT INTO public.chat_devices (user_id, device_id, identity_public_key)
       VALUES ('20000000-0000-0000-0000-000000000202', 'device-b', 'spki-b') $$,
    '42501', NULL, 'user cannot register another user device'
);
SELECT throws_ok(
    $$ INSERT INTO public.chat_key_epochs (chat_id, epoch, membership_fingerprint, created_by)
       VALUES ('50000000-0000-0000-0000-000000000505', 0, 'fp-zero', '10000000-0000-0000-0000-000000000101') $$,
    '23514', NULL, 'epoch zero is rejected'
);
INSERT INTO public.chat_key_epochs (chat_id, epoch, membership_fingerprint, created_by)
VALUES ('50000000-0000-0000-0000-000000000505', 1, 'fp-one', '10000000-0000-0000-0000-000000000101');
SELECT is((SELECT count(*)::integer FROM public.chat_key_epochs), 1, 'chat participant can create an epoch');

RESET ROLE;
INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key)
VALUES ('70000000-0000-0000-0000-000000000707', '20000000-0000-0000-0000-000000000202', 'device-b', 'spki-b');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000101', true);
UPDATE public.chat_devices SET revoked_at = now()
WHERE id = '60000000-0000-0000-0000-000000000606';
SELECT is(
    (SELECT revoked_at IS NOT NULL FROM public.chat_devices WHERE id = '60000000-0000-0000-0000-000000000606'),
    true,
    'device owner can revoke their device'
);
SELECT throws_ok(
    $$ INSERT INTO public.chat_recipient_key_envelopes
       (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
       VALUES (
           '50000000-0000-0000-0000-000000000505', 1,
           '70000000-0000-0000-0000-000000000707',
           '60000000-0000-0000-0000-000000000606', 'e2e2:fixture'
       ) $$,
    '42501', NULL, 'revoked device cannot write envelopes'
);

SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000303', true);
SELECT is((SELECT count(*)::integer FROM public.chat_key_epochs), 0, 'outsider cannot read chat epochs');
SELECT throws_ok(
    $$ INSERT INTO public.chat_key_epochs (chat_id, epoch, membership_fingerprint, created_by)
       VALUES ('50000000-0000-0000-0000-000000000505', 2, 'fp-two', '30000000-0000-0000-0000-000000000303') $$,
    '42501', NULL, 'outsider cannot write chat epochs'
);

SELECT * FROM finish();
ROLLBACK;
