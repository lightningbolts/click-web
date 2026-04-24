alter table public.connection_encounters
  add column if not exists vibe_capture jsonb default '{}'::jsonb;
