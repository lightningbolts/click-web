-- Ephemeral tri-factor proximity handshake rows for Edge Function clustering.
create table if not exists public.proximity_handshake_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  my_token text not null,
  heard_tokens text[] not null default '{}',
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create index if not exists proximity_handshake_events_created_at_idx
  on public.proximity_handshake_events (created_at desc);

comment on table public.proximity_handshake_events is
  'Short-lived BLE/audio handshake pings; cleaned by Edge Function after matching.';
