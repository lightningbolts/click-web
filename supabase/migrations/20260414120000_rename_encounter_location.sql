-- RPC: rename a crossing's display place label; only participants on the parent connection may call.

CREATE OR REPLACE FUNCTION public.rename_encounter_location(encounter_id uuid, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    cid uuid;
    nm text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    SELECT e.connection_id INTO cid
    FROM public.connection_encounters e
    WHERE e.id = encounter_id;

    IF cid IS NULL THEN
        RAISE EXCEPTION 'encounter not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = cid
          AND auth.uid()::text = ANY (c.user_ids)
    ) THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    nm := left(coalesce(nullif(trim(new_name), ''), ''), 500);
    IF nm = '' THEN
        RAISE EXCEPTION 'name required';
    END IF;

    UPDATE public.connection_encounters
    SET location_name = nm
    WHERE id = encounter_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_encounter_location(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_encounter_location(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_encounter_location(uuid, text) IS
    'Participant-only rename of connection_encounters.location_name (correct bad reverse-geocode labels).';

-- Allow direct row updates by participants (RPC also enforces membership).
DROP POLICY IF EXISTS "connection_encounters_participant_update" ON public.connection_encounters;
CREATE POLICY "connection_encounters_participant_update" ON public.connection_encounters FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = connection_encounters.connection_id
          AND auth.uid()::text = ANY (c.user_ids)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = connection_encounters.connection_id
          AND auth.uid()::text = ANY (c.user_ids)
    )
);

GRANT UPDATE ON public.connection_encounters TO authenticated;
