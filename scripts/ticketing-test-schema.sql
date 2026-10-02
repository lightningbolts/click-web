-- Minimal surrounding application schema for isolated PostgreSQL RPC tests.
-- Only used inside the temporary database created by test-ticketing-postgres.cjs.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.users(id UUID PRIMARY KEY REFERENCES auth.users(id),name TEXT,image TEXT);
CREATE TABLE public.map_beacons(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),creator_id UUID REFERENCES auth.users(id),venue_id UUID,beacon_type TEXT DEFAULT 'event',event_visibility TEXT DEFAULT 'public');
CREATE TABLE public.venue_managers(venue_id UUID,user_id UUID);
CREATE TABLE public.beacon_attendees(beacon_id UUID REFERENCES map_beacons(id),user_id UUID REFERENCES auth.users(id),source TEXT,PRIMARY KEY(beacon_id,user_id));
CREATE TABLE public.event_guest_rsvps(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),beacon_id UUID REFERENCES map_beacons(id));
CREATE TABLE public.event_rsvp_requests(beacon_id UUID REFERENCES map_beacons(id),user_id UUID,status TEXT);
CREATE TABLE public.event_guest_lists(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),beacon_id UUID);
CREATE TABLE public.event_guest_list_entries(guest_list_id UUID,matched_user_id UUID);
CREATE TABLE public.stripe_webhook_events(id TEXT PRIMARY KEY);
