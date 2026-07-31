-- Scale indexes for pending_handshakes geo/token-scoped candidate queries.
-- Partial indexes keep unmatched rows hot for proximity match + cron cleanup
-- without scanning matched or expired history.

CREATE INDEX IF NOT EXISTS pending_handshakes_unmatched_my_token_idx
    ON public.pending_handshakes (my_token)
    WHERE matched_at IS NULL;

CREATE INDEX IF NOT EXISTS pending_handshakes_unmatched_lat_lon_idx
    ON public.pending_handshakes (lat, lon)
    WHERE matched_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_handshakes_unmatched_expires_at_idx
    ON public.pending_handshakes (expires_at)
    WHERE matched_at IS NULL;

COMMENT ON INDEX public.pending_handshakes_unmatched_my_token_idx IS
    'Unmatched token lookup for geo/token-scoped proximity candidate queries at scale.';

COMMENT ON INDEX public.pending_handshakes_unmatched_lat_lon_idx IS
    'Unmatched lat/lon bbox scans for geo/token-scoped proximity candidate queries at scale.';

COMMENT ON INDEX public.pending_handshakes_unmatched_expires_at_idx IS
    'Unmatched expires_at for hourly cron cleanup of stale pending_handshakes.';
