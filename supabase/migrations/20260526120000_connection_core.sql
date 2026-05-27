-- Per-user "core" (pinned/favorite) connections.

CREATE TABLE IF NOT EXISTS connection_core (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id   uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    pinned_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_core_user_id
    ON connection_core(user_id);

ALTER TABLE connection_core ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own core connections"
    ON connection_core
    FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
