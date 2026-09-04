BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(30);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hub_key_epochs'::regclass), 'hub epochs have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hub_recipient_key_envelopes'::regclass), 'hub envelopes have RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated', 'public.hub_key_epochs', 'SELECT'), 'authenticated cannot directly read hub epochs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.hub_key_epochs', 'INSERT'), 'authenticated cannot write hub epochs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.hub_recipient_key_envelopes', 'INSERT'), 'authenticated cannot write hub envelopes');
SELECT ok(has_table_privilege('authenticated', 'public.hub_recipient_key_envelopes', 'SELECT'), 'authenticated envelope reads are policy-scoped');
SELECT ok(has_table_privilege('service_role', 'public.hub_key_epochs', 'INSERT'), 'service role can create hub epochs');
SELECT ok(has_table_privilege('service_role', 'public.hub_recipient_key_envelopes', 'INSERT'), 'service role can create hub envelopes');
SELECT ok(has_function_privilege('service_role', 'public.create_or_rotate_hub_epoch(text, uuid, text, integer, text, jsonb)', 'EXECUTE'), 'service role can rotate hub epochs');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_or_rotate_hub_epoch(text, uuid, text, integer, text, jsonb)', 'EXECUTE'), 'authenticated cannot rotate hub epochs');
SELECT ok(has_function_privilege('service_role', 'public.get_hub_key_envelopes_for_device(text, uuid, text)', 'EXECUTE'), 'service role can retrieve hub envelopes');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_hub_key_envelopes_for_device(text, uuid, text)', 'EXECUTE'), 'authenticated cannot pass arbitrary identity to retrieval');
SELECT ok(has_function_privilege('authenticated', 'public.auth_uid_can_receive_hub_envelope(text, integer, uuid)', 'EXECUTE'), 'authenticated policy helper is callable');
SELECT ok(NOT has_function_privilege('anon', 'public.auth_uid_can_receive_hub_envelope(text, integer, uuid)', 'EXECUTE'), 'anon cannot call policy helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.hub_recipient_key_envelopes'::regclass AND polname = 'hub_recipient_key_envelopes_select_device'), 'hub envelope reads use active-device policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.hub_key_epochs'::regclass), 'hub epochs have no direct client policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.hub_recipient_key_envelopes'::regclass AND polcmd IN ('a', 'w', 'd')), 'hub envelopes have no direct mutation policy');
SELECT ok(NOT has_table_privilege('authenticated', 'public.hub_messages', 'INSERT'), 'authenticated cannot bypass the hub message API gate');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hub_key_epochs'::regclass AND conname = 'hub_key_epochs_epoch_positive'), 'hub epoch is positive');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hub_recipient_key_envelopes'::regclass AND conname = 'hub_recipient_key_envelopes_e2e2_prefix'), 'hub envelope requires e2e2 prefix');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hub_key_epochs'::regclass AND conname = 'hub_key_epochs_membership_fingerprint_strict'), 'hub fingerprint is bounded');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hub_recipient_key_envelopes'::regclass AND conname = 'hub_recipient_key_envelopes_epoch_fk'), 'hub envelope references its epoch');
SELECT ok(EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'public.hub_key_epochs_pkey'::regclass), 'hub epoch primary key exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'public.hub_recipient_key_envelopes_pkey'::regclass), 'hub envelope primary key exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_e2ee_v2_hub_active_devices'), 'active hub device helper exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_or_rotate_hub_epoch'), 'hub lifecycle RPC exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_hub_key_envelopes_for_device'), 'hub retrieval RPC exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_uid_can_receive_hub_envelope'), 'hub receive policy helper exists');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$ INSERT INTO public.hub_key_epochs (hub_id, epoch, membership_fingerprint, created_by)
       VALUES ('hub-security-test', 1, 'members-v1', '81000000-0000-0000-0000-000000000001') $$,
    '42501', NULL, 'authenticated cannot insert hub epoch metadata directly'
);
SELECT throws_ok(
    $$ INSERT INTO public.hub_messages (hub_id, user_id, body)
       VALUES ('hub-security-test', '81000000-0000-0000-0000-000000000001', 'legacy') $$,
    '42501', NULL, 'authenticated cannot bypass the hub message API gate'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
