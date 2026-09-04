BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(57);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'e2ee-rollout-a@example.test', '', now(), now()),
    ('82000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'e2ee-rollout-b@example.test', '', now(), now()),
    ('83000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'e2ee-rollout-outsider@example.test', '', now(), now());

INSERT INTO public.connections (id, created, expiry, user_ids, status)
VALUES (
    '84000000-0000-0000-0000-000000000004',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now() + interval '1 day') * 1000)::bigint,
    ARRAY['81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002'],
    'active'
);

INSERT INTO public.chats (id, connection_id, created_at, updated_at)
VALUES (
    '85000000-0000-0000-0000-000000000005',
    '84000000-0000-0000-0000-000000000004',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now()) * 1000)::bigint
);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_key_transfer_approvals'::regclass), 'transfer approvals have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_devices'::regclass), 'devices have RLS enabled after rollout');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_key_epochs'::regclass), 'epochs have RLS enabled after rollout');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_recipient_key_envelopes'::regclass), 'envelopes have RLS enabled after rollout');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_devices'::regclass AND polname = 'chat_devices_select_own'), 'device reads remain caller-owned');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_recipient_key_envelopes'::regclass AND polname = 'chat_recipient_key_envelopes_select_device'), 'envelope reads use active-device policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_key_epochs'::regclass AND polcmd IN ('a', 'w', 'd')), 'epochs have no direct authenticated mutation policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chat_key_transfer_approvals'::regclass), 'approvals have no direct client policy');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_key_epochs', 'SELECT'), 'authenticated cannot directly read epoch metadata');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_key_epochs', 'INSERT'), 'authenticated cannot create epochs directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_key_transfer_approvals', 'INSERT'), 'authenticated cannot create approvals directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_devices', 'UPDATE'), 'authenticated cannot replace or revoke device keys directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_recipient_key_envelopes', 'INSERT'), 'authenticated cannot insert envelopes directly');
SELECT ok(has_table_privilege('authenticated', 'public.chat_recipient_key_envelopes', 'SELECT'), 'authenticated has envelope SELECT privilege');
SELECT ok(NOT has_table_privilege('authenticated', 'public.messages', 'INSERT'), 'authenticated cannot bypass the message E2EE gate');
SELECT ok(NOT has_table_privilege('authenticated', 'public.messages', 'UPDATE'), 'authenticated cannot bypass the message edit E2EE gate');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_epochs', 'INSERT'), 'service role can insert epoch metadata');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_epochs', 'UPDATE'), 'service role can retire epoch metadata');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_epochs', 'DELETE'), 'service role can delete epoch metadata');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_transfer_approvals', 'INSERT'), 'service role can insert approvals');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_transfer_approvals', 'UPDATE'), 'service role can replace approvals');
SELECT ok(has_table_privilege('service_role', 'public.chat_key_transfer_approvals', 'DELETE'), 'service role can delete approvals');
SELECT ok(has_function_privilege('service_role', 'public.create_or_rotate_chat_epoch(uuid, uuid, text, integer, text, jsonb)', 'EXECUTE'), 'service role can invoke atomic epoch lifecycle');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_or_rotate_chat_epoch(uuid, uuid, text, integer, text, jsonb)', 'EXECUTE'), 'authenticated cannot invoke epoch lifecycle');
SELECT ok(has_function_privilege('service_role', 'public.approve_chat_key_transfer(uuid, uuid, text, text, jsonb)', 'EXECUTE'), 'service role can invoke approvals');
SELECT ok(NOT has_function_privilege('authenticated', 'public.approve_chat_key_transfer(uuid, uuid, text, text, jsonb)', 'EXECUTE'), 'authenticated cannot invoke approvals');
SELECT ok(has_function_privilege('service_role', 'public.get_chat_key_envelopes_for_device(uuid, uuid, text)', 'EXECUTE'), 'service role can invoke scoped retrieval');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_chat_key_envelopes_for_device(uuid, uuid, text)', 'EXECUTE'), 'authenticated cannot pass arbitrary user ids to retrieval');
SELECT ok(has_function_privilege('authenticated', 'public.auth_uid_can_receive_chat_envelope(uuid, integer, uuid)', 'EXECUTE'), 'RLS helper is callable by authenticated policy evaluation');
SELECT ok(NOT has_function_privilege('anon', 'public.auth_uid_can_receive_chat_envelope(uuid, integer, uuid)', 'EXECUTE'), 'anon cannot call envelope RLS helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_key_epochs'::regclass AND conname = 'chat_key_epochs_membership_fingerprint_strict'), 'membership fingerprint is constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_recipient_key_envelopes'::regclass AND conname = 'chat_recipient_key_envelopes_e2e2_prefix'), 'stored envelopes require e2e2 prefix');

INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key, created_at)
VALUES
    ('86000000-0000-0000-0000-000000000006', '81000000-0000-0000-0000-000000000001', 'rollout-a', 'public-a', now() - interval '1 day'),
    ('87000000-0000-0000-0000-000000000007', '82000000-0000-0000-0000-000000000002', 'rollout-b', 'public-b', now() - interval '1 day');

SET LOCAL ROLE service_role;
SELECT is(
    (public.create_or_rotate_chat_epoch(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a',
        1,
        'rollout-members-v1',
        jsonb_build_array(
            jsonb_build_object('recipient_device_id', 'rollout-a', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:epoch1-a'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:epoch1-b')
        )
    )->>'recipient_count'),
    '2',
    'atomic epoch creation reports the complete initial recipient set'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.chat_key_epochs WHERE chat_id = '85000000-0000-0000-0000-000000000005'), 1, 'initial epoch metadata is committed');
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE chat_id = '85000000-0000-0000-0000-000000000005' AND epoch = 1), 2, 'initial epoch envelopes are committed atomically');

INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key, created_at)
VALUES ('88000000-0000-0000-0000-000000000008', '82000000-0000-0000-0000-000000000002', 'rollout-b-new', 'public-b-new', now() + interval '1 day');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.chat_devices), 2, 'RLS returns only the caller-owned active devices');
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE recipient_device_id = '87000000-0000-0000-0000-000000000007'), 1, 'predating device can read its historical envelope');
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE recipient_device_id = '88000000-0000-0000-0000-000000000008'), 0, 'new device cannot read historical material before approval');
SELECT throws_ok(
    $$ INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key)
       VALUES ('89000000-0000-0000-0000-000000000009', '82000000-0000-0000-0000-000000000002', 'forbidden-device', 'forbidden-key') $$,
    '42501', NULL, 'authenticated cannot register a device directly'
);
SELECT throws_ok(
    $$ UPDATE public.chat_devices SET identity_public_key = 'forbidden-key'
       WHERE id = '87000000-0000-0000-0000-000000000007' $$,
    '42501', NULL, 'authenticated cannot replace or revoke a device key directly'
);
SELECT throws_ok(
    $$ INSERT INTO public.chat_key_epochs (chat_id, epoch, membership_fingerprint, created_by)
       VALUES ('85000000-0000-0000-0000-000000000005', 2, 'forbidden', '82000000-0000-0000-0000-000000000002') $$,
    '42501', NULL, 'authenticated cannot write an epoch directly'
);
SELECT throws_ok(
    $$ INSERT INTO public.chat_recipient_key_envelopes
       (chat_id, epoch, recipient_device_id, sender_device_id, envelope)
       VALUES ('85000000-0000-0000-0000-000000000005', 1,
               '87000000-0000-0000-0000-000000000007',
               '86000000-0000-0000-0000-000000000006', 'e2e2:forbidden') $$,
    '42501', NULL, 'authenticated cannot write an envelope directly'
);
SELECT throws_ok(
    $$ INSERT INTO public.chat_key_transfer_approvals
       (chat_id, recipient_device_id, approved_by_device_id)
       VALUES ('85000000-0000-0000-0000-000000000005',
               '88000000-0000-0000-0000-000000000008',
               '86000000-0000-0000-0000-000000000006') $$,
    '42501', NULL, 'authenticated cannot write a transfer approval directly'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is(
    (public.approve_chat_key_transfer(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a',
        'rollout-b-new',
        jsonb_build_array(
            jsonb_build_object(
                'epoch', 1,
                'recipient_device_id', 'rollout-b-new',
                'sender_device_id', 'rollout-a',
                'envelope', 'e2e2:historical-b-new'
            )
        )
    )->>'recipient_device_id'),
    '88000000-0000-0000-0000-000000000008',
    'service role approves transfer to the new device'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE recipient_device_id = '88000000-0000-0000-0000-000000000008'), 1, 'approved device can read newly wrapped historical envelope material');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is(
    (public.create_or_rotate_chat_epoch(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a',
        2,
        'rollout-members-v2',
        jsonb_build_array(
            jsonb_build_object('recipient_device_id', 'rollout-a', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:epoch2-a'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:epoch2-b'),
            jsonb_build_object('recipient_device_id', 'rollout-b-new', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:epoch2-b-new')
        )
    )->>'recipient_count'),
    '3',
    'epoch rotation reports the exact active-device recipient set'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.chat_key_epochs WHERE chat_id = '85000000-0000-0000-0000-000000000005'), 2, 'epoch rotation commits one new epoch');
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE chat_id = '85000000-0000-0000-0000-000000000005' AND epoch = 2), 3, 'epoch rotation commits one envelope for every active device');
SELECT is((SELECT retired_at IS NOT NULL FROM public.chat_key_epochs WHERE chat_id = '85000000-0000-0000-0000-000000000005' AND epoch = 1), true, 'rotation retires the prior epoch');

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$ SELECT public.create_or_rotate_chat_epoch(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a', 3, 'missing-recipient',
        jsonb_build_array(
            jsonb_build_object('recipient_device_id', 'rollout-a', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:missing-a'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:missing-b')
        )
    ) $$,
    '42501', NULL, 'rotation rejects a recipient set missing an active device'
);
SELECT throws_ok(
    $$ SELECT public.create_or_rotate_chat_epoch(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a', 2, 'replay',
        jsonb_build_array(
            jsonb_build_object('recipient_device_id', 'rollout-a', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:replay-a'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:replay-b'),
            jsonb_build_object('recipient_device_id', 'rollout-b-new', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:replay-b-new')
        )
    ) $$,
    '23505', NULL, 'replayed epoch numbers are rejected'
);
SELECT throws_ok(
    $$ SELECT public.create_or_rotate_chat_epoch(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a', 3, 'duplicate-recipient',
        jsonb_build_array(
            jsonb_build_object('recipient_device_id', 'rollout-a', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:duplicate-a'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:duplicate-b'),
            jsonb_build_object('recipient_device_id', 'rollout-b', 'sender_device_id', 'rollout-a', 'envelope', 'e2e2:duplicate-b-again')
        )
    ) $$,
    '23505', NULL, 'duplicate recipients are rejected'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.chat_key_epochs WHERE chat_id = '85000000-0000-0000-0000-000000000005'), 2, 'rejected rotations do not leave partial epoch metadata');
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE chat_id = '85000000-0000-0000-0000-000000000005'), 6, 'rejected rotations do not leave partial envelope material');

SET LOCAL ROLE service_role;
UPDATE public.chat_devices SET revoked_at = now()
WHERE id = '86000000-0000-0000-0000-000000000006';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.chat_recipient_key_envelopes WHERE recipient_device_id = '88000000-0000-0000-0000-000000000008'), 0, 'revoking the approver removes historical transfer access');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.chat_devices), 0, 'revoked devices disappear from active-device RLS');
RESET ROLE;
INSERT INTO public.chat_devices (id, user_id, device_id, identity_public_key, created_at)
VALUES ('89000000-0000-0000-0000-000000000009', '81000000-0000-0000-0000-000000000001', 'rollout-a-new', 'public-a-new', now() + interval '1 day');
SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$ SELECT public.approve_chat_key_transfer(
        '85000000-0000-0000-0000-000000000005',
        '81000000-0000-0000-0000-000000000001',
        'rollout-a',
        'rollout-a-new',
        jsonb_build_array(
            jsonb_build_object(
                'epoch', 1,
                'recipient_device_id', 'rollout-a-new',
                'sender_device_id', 'rollout-a',
                'envelope', 'e2e2:historical-a-new'
            )
        )
    ) $$,
    '42501', NULL, 'revoked approver cannot approve a new historical transfer'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
