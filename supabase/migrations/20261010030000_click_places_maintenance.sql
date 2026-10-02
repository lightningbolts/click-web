-- Click Places, step 4: manager-facing daily rollup + retention.

CREATE TABLE IF NOT EXISTS public.place_daily_stats (
    place_id                UUID NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
    day                     DATE NOT NULL,                         -- in places.timezone
    check_ins               INTEGER NOT NULL DEFAULT 0,
    unique_visitors         INTEGER NOT NULL DEFAULT 0,
    repeat_visitors         INTEGER NOT NULL DEFAULT 0,            -- visited this Place on an earlier day too
    check_ins_by_hour       INTEGER[] NOT NULL DEFAULT array_fill(0, ARRAY[24]),
    dwell_minutes_sum       INTEGER NOT NULL DEFAULT 0,            -- explicit check-outs only
    dwell_samples           INTEGER NOT NULL DEFAULT 0,
    pulses                  INTEGER NOT NULL DEFAULT 0,
    energy_counts           INTEGER[] NOT NULL DEFAULT array_fill(0, ARRAY[4]),   -- chill..packed
    talkable_yes            INTEGER NOT NULL DEFAULT 0,
    talkable_no             INTEGER NOT NULL DEFAULT 0,
    would_return_yes        INTEGER NOT NULL DEFAULT 0,
    would_return_no         INTEGER NOT NULL DEFAULT 0,
    event_check_ins         INTEGER NOT NULL DEFAULT 0,            -- check-ins during an official event window
    new_connections         INTEGER NOT NULL DEFAULT 0,
    repeat_connections      INTEGER NOT NULL DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (place_id, day)
);

ALTER TABLE public.place_daily_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_daily_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.place_daily_stats TO service_role;

COMMENT ON TABLE public.place_daily_stats IS
    'Manager-facing aggregates per Place per local day. Counts only insights-eligible rows (count_for_insights). No user ids.';

CREATE OR REPLACE FUNCTION public.purge_place_presence (
    p_check_in_days INTEGER DEFAULT 90,
    p_pulse_identity_days INTEGER DEFAULT 30,
    p_pulse_days INTEGER DEFAULT 400
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed INTEGER; v_deleted INTEGER; v_anonymized INTEGER; v_pulses_deleted INTEGER;
BEGIN
    UPDATE public.place_check_ins
    SET checked_out_at = expires_at, checkout_reason = 'expired'
    WHERE checked_out_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now();
    GET DIAGNOSTICS v_closed = ROW_COUNT;

    DELETE FROM public.place_check_ins
    WHERE checked_at < now() - make_interval(days => p_check_in_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    UPDATE public.place_pulses
    SET user_id = NULL, check_in_id = NULL
    WHERE user_id IS NOT NULL AND created_at < now() - make_interval(days => p_pulse_identity_days);
    GET DIAGNOSTICS v_anonymized = ROW_COUNT;

    DELETE FROM public.place_pulses
    WHERE created_at < now() - make_interval(days => p_pulse_days);
    GET DIAGNOSTICS v_pulses_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'closed', v_closed, 'check_ins_deleted', v_deleted,
        'pulses_anonymized', v_anonymized, 'pulses_deleted', v_pulses_deleted
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_place_presence (integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_place_presence (integer, integer, integer) TO service_role;
