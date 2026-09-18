BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(14);

SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hub_message_reactions'::regclass),
    'hub message reactions have RLS enabled'
);
SELECT ok(
    has_table_privilege('authenticated', 'public.hub_message_reactions', 'SELECT'),
    'authenticated may read policy-scoped Hub reactions'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'INSERT'),
    'authenticated cannot insert Hub reactions directly'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'UPDATE'),
    'authenticated cannot update Hub reactions directly'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'DELETE'),
    'authenticated cannot delete Hub reactions directly'
);
SELECT ok(
    has_table_privilege('service_role', 'public.hub_message_reactions', 'INSERT'),
    'service role may persist Hub reactions'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.hub_message_reactions'::regclass
          AND polname = 'hub_message_reactions_select_authorized'
          AND polcmd = 'r'
    ),
    'Hub reaction reads use the authoritative access policy'
);
SELECT ok(
    (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.hub_message_reactions'::regclass),
    'Hub reactions use full replica identity for deterministic delete payloads'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_messages', 'UPDATE'),
    'authenticated cannot bypass the Hub edit API'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_messages', 'DELETE'),
    'authenticated cannot bypass the Hub delete API'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.hub_message_reactions'::regclass
          AND conname = 'hub_message_reactions_unique'
    ),
    'Hub reactions enforce one row per message/user/reaction'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$ INSERT INTO public.hub_message_reactions (
           hub_message_id,
           hub_id,
           user_id,
           reaction_type
       ) VALUES (
           '33333333-3333-4333-8333-333333333333',
           'hub-security-test',
           '11111111-1111-4111-8111-111111111111',
           '👍'
       ) $$,
    '42501',
    NULL,
    'authenticated cannot insert Hub reactions directly'
);
SELECT throws_ok(
    $$ UPDATE public.hub_messages SET body = 'bypass' WHERE false $$,
    '42501',
    NULL,
    'authenticated cannot update Hub messages directly'
);
SELECT throws_ok(
    $$ DELETE FROM public.hub_messages WHERE false $$,
    '42501',
    NULL,
    'authenticated cannot delete Hub messages directly'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
