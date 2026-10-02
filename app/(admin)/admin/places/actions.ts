'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isPlaceCategory } from '@/lib/places/categories';
import { slugCandidates, slugifyPlaceName } from '@/lib/places/slug';
import type { PlaceManagerRole } from '@/lib/places/types';
import { isAdminUser } from '@/lib/server/adminRole';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { ensurePlaceHub } from '@/lib/server/places/placeHub';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

/** Admin-only Click Places management (§5.10). v1 Places are created and verified by Click admins. */

type ActionType = 'notice' | 'error';

function redirectWithStatus(type: ActionType, message: string, placeId?: string): never {
  const params = new URLSearchParams({ [type]: message });
  if (placeId) params.set('place', placeId);
  redirect(`/admin/places?${params.toString()}`);
}

async function requireAdminSession(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirectWithStatus('error', 'You must be signed in as an admin.');
  if (!isAdminUser(user)) redirectWithStatus('error', 'Admin role required.');
  return user.id;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(formData: FormData, key: string, max: number): string | null {
  const value = text(formData, key);
  return value ? value.slice(0, max) : null;
}

function numberField(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function httpsUrl(raw: string | null): string | null | false {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : false;
  } catch {
    return false;
  }
}

async function loadPlace(placeId: string): Promise<PlaceRow> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from('places').select(PLACE_COLUMNS).eq('id', placeId).maybeSingle();
  if (error || !data) redirectWithStatus('error', 'Place not found.');
  return data as PlaceRow;
}

function done(message: string, placeId?: string): never {
  revalidatePath('/admin/places');
  redirectWithStatus('notice', message, placeId);
}

export async function createPlaceAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminSession();
  const name = text(formData, 'name');
  const category = text(formData, 'category');
  const latitude = numberField(formData, 'latitude');
  const longitude = numberField(formData, 'longitude');
  const radius = numberField(formData, 'radius_meters') ?? 75;
  const timezone = text(formData, 'timezone') || 'America/Los_Angeles';
  const city = optionalText(formData, 'city', 100);
  const website = httpsUrl(optionalText(formData, 'website_url', 500));

  if (!name || name.length > 120) redirectWithStatus('error', 'Name is required (max 120 characters).');
  if (!isPlaceCategory(category)) redirectWithStatus('error', 'Choose a category.');
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    redirectWithStatus('error', 'Latitude and longitude are required.');
  }
  if (!Number.isFinite(radius) || radius < 25 || radius > 750) redirectWithStatus('error', 'Radius must be 25–750 m.');
  if (!validTimezone(timezone)) redirectWithStatus('error', 'Unknown timezone.');
  if (website === false) redirectWithStatus('error', 'Website must be an https:// link.');

  const admin = createAdminSupabaseClient();
  const base = slugifyPlaceName(name, city);
  if (base.length < 3) redirectWithStatus('error', 'Name is too short to make a link.');
  const candidates = slugCandidates(base.slice(0, 76));
  const { data: taken } = await admin.from('places').select('slug').in('slug', candidates);
  const takenSet = new Set(((taken ?? []) as Array<{ slug: string }>).map((r) => r.slug));
  const slug = candidates.find((c) => !takenSet.has(c));
  if (!slug) redirectWithStatus('error', 'Too many Places share this name and city. Edit the name.');

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('places')
    .insert({
      name,
      slug,
      category,
      latitude,
      longitude,
      radius_meters: Math.round(radius),
      timezone,
      address_line: optionalText(formData, 'address_line', 200),
      city,
      region: optionalText(formData, 'region', 100),
      postal_code: optionalText(formData, 'postal_code', 20),
      country_code: optionalText(formData, 'country_code', 2)?.toUpperCase() ?? null,
      website_url: website,
      verification_status: 'verified',
      verified_at: now,
      verified_by: adminId,
      listed: false,
      subscription_status: 'inactive',
    })
    .select('id')
    .single();
  if (error || !data) redirectWithStatus('error', `Create failed: ${error?.message ?? 'unknown error'}`);
  done(`Created ${name} (${slug}). It is verified but not listed yet.`, (data as { id: string }).id);
}

export async function updatePlaceAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const patch: Record<string, unknown> = {};

  const name = text(formData, 'name');
  if (name) patch.name = name.slice(0, 120);
  const category = text(formData, 'category');
  if (category) {
    if (!isPlaceCategory(category)) redirectWithStatus('error', 'Unknown category.', place.id);
    patch.category = category;
  }
  const latitude = numberField(formData, 'latitude');
  const longitude = numberField(formData, 'longitude');
  const radius = numberField(formData, 'radius_meters');
  if (latitude != null) patch.latitude = latitude;
  if (longitude != null) patch.longitude = longitude;
  if (radius != null) patch.radius_meters = Math.round(radius);
  if ([latitude, longitude, radius].some((n) => n != null && !Number.isFinite(n))) {
    redirectWithStatus('error', 'Coordinates and radius must be numbers.', place.id);
  }
  const timezone = text(formData, 'timezone');
  if (timezone) {
    if (!validTimezone(timezone)) redirectWithStatus('error', 'Unknown timezone.', place.id);
    patch.timezone = timezone;
  }
  for (const [key, max] of [['address_line', 200], ['city', 100], ['region', 100], ['postal_code', 20], ['description', 500]] as const) {
    if (formData.has(key)) patch[key] = optionalText(formData, key, max);
  }
  if (formData.has('website_url')) {
    const website = httpsUrl(optionalText(formData, 'website_url', 500));
    if (website === false) redirectWithStatus('error', 'Website must be an https:// link.', place.id);
    patch.website_url = website;
  }
  const slug = text(formData, 'slug');
  if (slug && slug !== place.slug) patch.slug = slug;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('places').update(patch).eq('id', place.id);
  if (error) redirectWithStatus('error', `Update failed: ${error.message}`, place.id);

  const moved =
    (latitude != null && latitude !== place.latitude) ||
    (longitude != null && longitude !== place.longitude) ||
    (radius != null && Math.round(radius) !== place.radius_meters);
  let note = '';
  if (moved) {
    const hubPatch: Record<string, unknown> = {};
    if (latitude != null) hubPatch.geofence_lat = latitude;
    if (longitude != null) hubPatch.geofence_long = longitude;
    if (radius != null) hubPatch.radius_meters = Math.round(radius);
    await admin.from('hub_venues').update(hubPatch).eq('place_id', place.id);
    if (place.verification_status === 'verified') {
      const { data: count, error: rpcError } = await admin.rpc('backfill_place_encounters', { p_place_id: place.id });
      note = rpcError ? ` Backfill failed: ${rpcError.message}` : ` Re-attributed ${Number(count) || 0} encounters.`;
    }
  }
  done(`Saved ${place.name}.${note}`, place.id);
}

export async function setPlaceListedAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const listed = text(formData, 'listed') === 'true';
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('places').update({ listed }).eq('id', place.id);
  if (error) {
    redirectWithStatus(
      'error',
      listed
        ? `Can't list yet: a listed Place needs verification, coordinates, a slug and a category (${error.message}).`
        : `Update failed: ${error.message}`,
      place.id,
    );
  }
  done(listed ? `${place.name} is now listed.` : `${place.name} is no longer listed.`, place.id);
}

export async function setVerificationAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const status = text(formData, 'status');
  if (status !== 'verified' && status !== 'suspended') redirectWithStatus('error', 'Unknown status.', place.id);
  const patch: Record<string, unknown> =
    status === 'verified'
      ? { verification_status: 'verified', verified_at: new Date().toISOString(), verified_by: adminId }
      : { verification_status: 'suspended', listed: false };
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('places').update(patch).eq('id', place.id);
  if (error) redirectWithStatus('error', `Update failed: ${error.message}`, place.id);
  done(status === 'verified' ? `${place.name} verified.` : `${place.name} suspended and unlisted.`, place.id);
}

export async function addPlaceManagerAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const email = text(formData, 'email').toLowerCase();
  const roleRaw = text(formData, 'role') || 'manager';
  const role: PlaceManagerRole = roleRaw === 'owner' || roleRaw === 'viewer' ? roleRaw : 'manager';
  if (!email.includes('@')) redirectWithStatus('error', 'Enter an email address.', place.id);

  const admin = createAdminSupabaseClient();
  const { data: user } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
  const userId = (user as { id?: string } | null)?.id;
  if (!userId) redirectWithStatus('error', `No Click account uses ${email}.`, place.id);

  const { error } = await admin
    .from('place_managers')
    .upsert({ user_id: userId, place_id: place.id, role }, { onConflict: 'user_id,place_id' });
  if (error) redirectWithStatus('error', `Could not add manager: ${error.message}`, place.id);
  done(`${email} is now a ${role} of ${place.name}.`, place.id);
}

export async function removePlaceManagerAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const managerId = text(formData, 'manager_id');
  const admin = createAdminSupabaseClient();
  const { data: rows } = await admin.from('place_managers').select('id, role').eq('place_id', place.id);
  const managers = (rows ?? []) as Array<{ id: string; role: string }>;
  const target = managers.find((m) => m.id === managerId);
  if (!target) redirectWithStatus('error', 'Manager not found.', place.id);
  if (target.role === 'owner' && managers.filter((m) => m.role === 'owner').length <= 1) {
    redirectWithStatus('error', "Can't remove the last owner. Add another owner first.", place.id);
  }
  const { error } = await admin.from('place_managers').delete().eq('id', target.id);
  if (error) redirectWithStatus('error', `Could not remove manager: ${error.message}`, place.id);
  done('Manager removed.', place.id);
}

export async function createAnchorAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const name = optionalText(formData, 'name', 80) ?? 'Counter';
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('nfc_anchors')
    .insert({ venue_id: place.id, name, map_x: 0, map_y: 0, purpose: 'check_in' });
  if (error) redirectWithStatus('error', `Could not create the code: ${error.message}`, place.id);
  done(`Check-in code "${name}" created.`, place.id);
}

export async function rotateAnchorAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const placeId = text(formData, 'place_id');
  const anchorId = text(formData, 'anchor_id');
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('nfc_anchors')
    .update({ qr_token: randomUUID(), rotated_at: new Date().toISOString() })
    .eq('id', anchorId)
    .eq('venue_id', placeId);
  if (error) redirectWithStatus('error', `Could not rotate the code: ${error.message}`, placeId);
  done('Code rotated. Print the new poster; the old code no longer works.', placeId);
}

export async function deactivateAnchorAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const placeId = text(formData, 'place_id');
  const anchorId = text(formData, 'anchor_id');
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('nfc_anchors').update({ active: false }).eq('id', anchorId).eq('venue_id', placeId);
  if (error) redirectWithStatus('error', `Could not deactivate the code: ${error.message}`, placeId);
  done('Code deactivated.', placeId);
}

export async function backfillEncountersAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('backfill_place_encounters', { p_place_id: place.id });
  if (error) redirectWithStatus('error', `Backfill failed: ${error.message}`, place.id);
  done(`Attributed ${Number(data) || 0} encounters to ${place.name}.`, place.id);
}

export async function setHubEnabledAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminSession();
  const place = await loadPlace(text(formData, 'place_id'));
  const enabled = text(formData, 'hub_enabled') === 'true';
  const admin = createAdminSupabaseClient();
  if (enabled && !place.hub_enabled) {
    const hub = await ensurePlaceHub(admin, place, adminId);
    if (!hub.ok) redirectWithStatus('error', `Could not create the Place Hub: ${hub.error}`, place.id);
  }
  const { error } = await admin.from('places').update({ hub_enabled: enabled }).eq('id', place.id);
  if (error) redirectWithStatus('error', `Update failed: ${error.message}`, place.id);
  done(enabled ? 'Place Hub enabled.' : 'Place Hub turned off (history kept).', place.id);
}
