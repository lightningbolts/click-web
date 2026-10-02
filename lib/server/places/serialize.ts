import 'server-only';
import { parsePlaceHours, todayHoursLabel, isOpenAt } from '@/lib/places/hours';
import type {
  PlaceDetail,
  PlaceEventRef,
  PlaceSummary,
  PlaceViewerFlags,
  PulseSummary,
} from '@/lib/places/types';
import type { ConsumerPlaceRow, PlaceRow } from '@/lib/server/places/loadPlace';

export const DEFAULT_PLACE_TIMEZONE = 'America/Los_Angeles';

export function placePhotoUrl(photoPath: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  if (!photoPath || !base) return null;
  const encoded = photoPath.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/place-photos/${encoded}`;
}

export function placeTimezone(place: Pick<PlaceRow, 'timezone'>): string {
  return place.timezone?.trim() || DEFAULT_PLACE_TIMEZONE;
}

export function directionsFor(place: Pick<ConsumerPlaceRow, 'latitude' | 'longitude' | 'name'>): PlaceDetail['directions'] {
  const ll = `${place.latitude},${place.longitude}`;
  return {
    apple_maps_url: `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(place.name)}`,
    google_maps_url: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
  };
}

/** What `enrich.ts` computes for one Place. */
export type PlaceEnrichment = {
  pulse: PulseSummary;
  here_now_count: number;
  events_today_count: number;
  next_event: PlaceEventRef | null;
  hub_id: string | null;
  viewer: PlaceViewerFlags | null;
};

export function serializePlaceSummary(
  place: ConsumerPlaceRow,
  enrichment: PlaceEnrichment,
  options: { distanceMeters?: number | null; nowMs: number },
): PlaceSummary {
  const hours = parsePlaceHours(place.hours);
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    photo_url: placePhotoUrl(place.photo_path),
    latitude: place.latitude,
    longitude: place.longitude,
    radius_meters: place.radius_meters,
    distance_meters: options.distanceMeters != null ? Math.round(options.distanceMeters * 10) / 10 : null,
    address_line: place.address_line?.trim() || place.location?.trim() || null,
    city: place.city?.trim() || null,
    open_now: isOpenAt(hours, placeTimezone(place), options.nowMs),
    pulse: enrichment.pulse,
    here_now_count: enrichment.here_now_count,
    events_today_count: enrichment.events_today_count,
    next_event: enrichment.next_event,
    hub_id: enrichment.hub_id,
    viewer: enrichment.viewer,
  };
}

/** Detail-only fields; viewer-only ones are null / [] for anonymous callers. */
export type PlaceDetailExtras = Omit<
  PlaceDetail,
  keyof PlaceSummary | 'description' | 'website_url' | 'timezone' | 'hours' | 'today_hours_label' | 'directions'
>;

export function serializePlaceDetail(
  place: ConsumerPlaceRow,
  enrichment: PlaceEnrichment,
  extras: PlaceDetailExtras,
  options: { nowMs: number },
): PlaceDetail {
  const hours = parsePlaceHours(place.hours);
  const timezone = placeTimezone(place);
  return {
    ...serializePlaceSummary(place, enrichment, { distanceMeters: null, nowMs: options.nowMs }),
    description: place.description?.trim() || null,
    website_url: place.website_url?.trim() || null,
    timezone,
    hours,
    today_hours_label: todayHoursLabel(hours, timezone, options.nowMs),
    directions: directionsFor(place),
    ...extras,
  };
}

/** What a Place's managers see about their own Place (no per-user data). */
export type ManagerPlace = {
  id: string;
  slug: string | null;
  name: string;
  category: PlaceRow['category'];
  verification_status: PlaceRow['verification_status'];
  listed: boolean;
  hub_enabled: boolean;
  photo_url: string | null;
  role: 'owner' | 'manager' | 'viewer';
  subscription_status: string | null;
  description: string | null;
  hours: ReturnType<typeof parsePlaceHours>;
  website_url: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
};

export function serializeManagerPlace(place: PlaceRow, role: ManagerPlace['role']): ManagerPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    verification_status: place.verification_status,
    listed: place.listed,
    hub_enabled: place.hub_enabled,
    photo_url: placePhotoUrl(place.photo_path),
    role,
    subscription_status: place.subscription_status,
    description: place.description,
    hours: parsePlaceHours(place.hours),
    website_url: place.website_url,
    address_line: place.address_line ?? place.location,
    city: place.city,
    region: place.region,
    postal_code: place.postal_code,
    timezone: placeTimezone(place),
    latitude: place.latitude,
    longitude: place.longitude,
    radius_meters: place.radius_meters,
  };
}
