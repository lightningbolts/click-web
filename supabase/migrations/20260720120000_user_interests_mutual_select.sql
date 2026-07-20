-- Allow mutual connections to SELECT peer user_interests (mirrors user_availability).
-- Owner-only policies remain for INSERT/UPDATE; this adds a second SELECT policy.

DROP POLICY IF EXISTS "Users can view interests of connections" ON public.user_interests;

CREATE POLICY "Users can view interests of connections"
    ON public.user_interests
    FOR SELECT
    USING (
        user_id IN (
            SELECT unnest(user_ids)::uuid
            FROM public.connections
            WHERE auth.uid()::text = ANY (user_ids)
        )
    );
