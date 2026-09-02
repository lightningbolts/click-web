-- Assert map_beacons.hub_id (20260901200000 / event_auto_hubs.sql).
-- Safe: all fixture writes live in a transaction that always rolls back.
--
--   bash scripts/test_map_beacons_hub_id.sh
--   bash scripts/test_map_beacons_hub_id.sh --apply
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/test_map_beacons_hub_id.sql
--   Or paste this file into the Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert (cond boolean, name text, detail text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF cond THEN
        RAISE NOTICE 'PASS  %', name;
    ELSE
        RAISE EXCEPTION 'FAIL  % — %', name, NULLIF(detail, '');
    END IF;
END;
$$;

DO $$
DECLARE
    v_user uuid;
    v_beacon uuid := '00000000-0000-4000-8000-00b0eac0n001';
    v_hub text := 'hub_migtest_map_beacons_hub_id';
    v_col_type text;
    v_nullable text;
    v_fk_del char;
    v_fk_def text;
    v_rpc jsonb;
    v_nearby_ids text[];
    v_hub_id_after text;
    v_beacon_left uuid;
BEGIN
    SELECT c.udt_name, c.is_nullable
    INTO v_col_type, v_nullable
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'map_beacons'
      AND c.column_name = 'hub_id';

    PERFORM pg_temp.assert(
        v_col_type IS NOT NULL,
        'map_beacons.hub_id exists',
        'Run click-web/scripts/event_auto_hubs.sql or 20260901200000_map_beacons_hub_id.sql'
    );
    PERFORM pg_temp.assert(v_col_type = 'text', 'map_beacons.hub_id is text', 'got ' || v_col_type);
    PERFORM pg_temp.assert(v_nullable = 'YES', 'map_beacons.hub_id is nullable', 'ON DELETE SET NULL needs NULL');

    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'hub_venues'
              AND column_name = 'event_beacon_id'
        ),
        'hub_venues.event_beacon_id exists'
    );

    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'map_beacons'
              AND indexname = 'map_beacons_hub_id_idx'
        ),
        'map_beacons_hub_id_idx exists'
    );

    SELECT c.confdeltype, pg_get_constraintdef(c.oid)
    INTO v_fk_del, v_fk_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'map_beacons'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ~* 'hub_id'
    LIMIT 1;

    PERFORM pg_temp.assert(
        v_fk_def IS NOT NULL AND v_fk_def ~* 'hub_venues',
        'map_beacons.hub_id FK → hub_venues(id)',
        COALESCE(v_fk_def, 'no FK found')
    );
    PERFORM pg_temp.assert(
        v_fk_del = 'n',
        'map_beacons.hub_id ON DELETE SET NULL',
        COALESCE(v_fk_def, 'confdeltype=' || COALESCE(v_fk_del::text, '?'))
    );

    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fetch_map_beacons_within'
              AND pg_get_functiondef(p.oid) ~ 'b\.hub_id'
        ),
        'fetch_map_beacons_within reads b.hub_id'
    );
    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fetch_creator_active_map_beacons'
              AND pg_get_functiondef(p.oid) ~ 'b\.hub_id'
        ),
        'fetch_creator_active_map_beacons reads b.hub_id'
    );
    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'get_hubs_nearby'
              AND pg_get_functiondef(p.oid) ~ 'event_beacon_id IS NULL'
        ),
        'get_hubs_nearby excludes event hubs'
    );

    SELECT id INTO v_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF v_user IS NULL THEN
        RAISE NOTICE 'SKIP  fixture DML (no auth.users row to borrow)';
        RAISE NOTICE 'ALL map_beacons.hub_id catalog checks passed';
        RETURN;
    END IF;

    INSERT INTO public.map_beacons (
        id,
        creator_id,
        beacon_type,
        location,
        metadata,
        expires_at,
        visibility_audience,
        show_creator_name
    )
    VALUES (
        v_beacon,
        v_user,
        'event',
        ST_SetSRID (ST_MakePoint (-122.3321, 47.6062), 4326)::geography,
        jsonb_build_object('title', 'hub_id migration test'),
        now() + interval '2 days',
        'everyone',
        false
    );

    INSERT INTO public.hub_venues (
        id,
        name,
        category,
        geofence_lat,
        geofence_long,
        radius_meters,
        expires_at,
        creator_id,
        event_beacon_id
    )
    VALUES (
        v_hub,
        'hub_id migration test',
        'event',
        47.6062,
        -122.3321,
        80,
        now() + interval '2 days',
        v_user,
        v_beacon
    );

    UPDATE public.map_beacons
    SET hub_id = v_hub
    WHERE id = v_beacon;

    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM public.map_beacons
            WHERE id = v_beacon AND hub_id = v_hub
        ),
        'can write map_beacons.hub_id'
    );

    BEGIN
        UPDATE public.map_beacons
        SET hub_id = 'hub_does_not_exist_migtest'
        WHERE id = v_beacon;
        PERFORM pg_temp.assert(false, 'hub_id FK rejects unknown hub', 'update succeeded');
    EXCEPTION
        WHEN foreign_key_violation THEN
            PERFORM pg_temp.assert(true, 'hub_id FK rejects unknown hub');
    END;

    SELECT public.fetch_creator_active_map_beacons (v_user, 50) INTO v_rpc;
    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(v_rpc, '[]'::jsonb)) el
            WHERE el->>'id' = v_beacon::text
              AND el->>'hub_id' = v_hub
        ),
        'fetch_creator_active_map_beacons emits hub_id',
        COALESCE(v_rpc::text, 'null')
    );

    SELECT public.fetch_map_beacons_within (47.6062, -122.3321, 5000, 200) INTO v_rpc;
    PERFORM pg_temp.assert(
        EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(v_rpc, '[]'::jsonb)) el
            WHERE el->>'id' = v_beacon::text
              AND el->>'hub_id' = v_hub
        ),
        'fetch_map_beacons_within emits hub_id',
        COALESCE(v_rpc::text, 'null')
    );

    SELECT COALESCE(array_agg(id), ARRAY[]::text[])
    INTO v_nearby_ids
    FROM public.get_hubs_nearby (47.6062, -122.3321, 15000, 50);
    PERFORM pg_temp.assert(
        NOT (v_hub = ANY (v_nearby_ids)),
        'get_hubs_nearby hides event hub',
        array_to_string(v_nearby_ids, ',')
    );

    DELETE FROM public.hub_venues WHERE id = v_hub;

    SELECT hub_id, id
    INTO v_hub_id_after, v_beacon_left
    FROM public.map_beacons
    WHERE id = v_beacon;

    PERFORM pg_temp.assert(v_beacon_left = v_beacon, 'deleting hub keeps the beacon');
    PERFORM pg_temp.assert(v_hub_id_after IS NULL, 'ON DELETE SET NULL clears map_beacons.hub_id');

    RAISE NOTICE 'ALL map_beacons.hub_id tests passed';
END;
$$;

ROLLBACK;
