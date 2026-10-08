BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES ('00000000-0000-0000-0000-00000000c0de', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'recovery@example.test');

SELECT ok(NOT has_function_privilege('authenticated', 'public.enroll_chat_key_recovery(uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'clients cannot enroll directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_key_recovery_vaults', 'SELECT'),
  'clients cannot read recovery vaults');

SET LOCAL ROLE service_role;
SELECT is(
  public.enroll_chat_key_recovery('00000000-0000-0000-0000-00000000c0de', repeat('a', 1024),
    '{"version":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"QUJDREVGR0hJSktMTU5PUFFSU1RVVldY"}',
    '{"version":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"QUJDREVGR0hJSktMTU5PUFFSU1RVVldY"}'),
  1::bigint, 'enrolls a credential ID at the 1024-character limit');
SELECT throws_ok(
  $$SELECT public.enroll_chat_key_recovery('00000000-0000-0000-0000-00000000c0de', repeat('b', 16),
    '{"version":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"QUJDREVGR0hJSktMTU5PUFFSU1RVVldY"}',
    '{"version":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"QUJDREVGR0hJSktMTU5PUFFSU1RVVldY"}')$$,
  '23505', NULL, 'a second enrollment is a conflict, not a failure');
SELECT throws_ok(
  $$SELECT public.enroll_chat_key_recovery('00000000-0000-0000-0000-00000000c0de', 'not a credential',
    '{"version":1}', '{"version":1}')$$,
  '22023', NULL, 'rejects a malformed credential ID');
SELECT throws_ok(
  $$SELECT public.enroll_chat_key_recovery('00000000-0000-0000-0000-00000000c0de', repeat('c', 1025),
    '{"version":1}', '{"version":1}')$$,
  '22023', NULL, 'rejects a credential ID over 1024 characters');

SELECT * FROM finish();
ROLLBACK;
