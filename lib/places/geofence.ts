/**
 * Check-in proof evaluation (§4.4). Pure: the caller loads the Place and anchor, and nothing here
 * stores or returns the user's coordinates, only distance and accuracy buckets.
 */

import type { PlacesConfig } from '@/lib/places/config';
import type {
  AccuracyBucket,
  CheckInProof,
  CheckInRejectReason,
  DistanceBucket,
} from '@/lib/places/types';

/** Copied from `lib/server/eventEngagement.ts` (that module imports next/server). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Copied from `lib/server/eventEngagement.ts`. */
export function isValidCheckInCoordinate(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function distanceBucket(meters: number): DistanceBucket {
  if (meters < 25) return '0_25';
  if (meters < 75) return '25_75';
  if (meters < 150) return '75_150';
  if (meters < 400) return '150_400';
  return '400_plus';
}

export function accuracyBucket(meters: number | null | undefined): AccuracyBucket {
  if (meters == null || !Number.isFinite(meters) || meters >= 100) return '100_plus';
  if (meters < 20) return '0_20';
  if (meters < 50) return '20_50';
  return '50_100';
}

export type GeofencePlace = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
};

export type CheckInAnchor = {
  id: string;
  venue_id: string | null;
  purpose: string | null;
  active: boolean | null;
};

export type ProofResult =
  | {
      ok: true;
      proof: CheckInProof;
      weight: number;
      distance_bucket: DistanceBucket | null;
      accuracy_bucket: AccuracyBucket | null;
      anchor_id: string | null;
    }
  | { ok: false; reason: CheckInRejectReason; distance_meters?: number };

type Coords = { lat?: number | null; lng?: number | null; accuracy?: number | null };

function placeCenter(place: GeofencePlace): { lat: number; lng: number } | null {
  if (place.latitude == null || place.longitude == null) return null;
  return { lat: place.latitude, lng: place.longitude };
}

export function evaluateGpsProof(input: Coords & { place: GeofencePlace; config: PlacesConfig }): ProofResult {
  const { place, lat, lng, accuracy, config } = input;
  const center = placeCenter(place);
  if (!center || !isValidCheckInCoordinate(lat, lng)) return { ok: false, reason: 'no_location' };
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy > config.gpsMaxAccuracyMeters) {
    return { ok: false, reason: 'low_accuracy' };
  }
  const d = haversineMeters(lat as number, lng as number, center.lat, center.lng);
  if (d > place.radius_meters + Math.min(accuracy, 50)) {
    return { ok: false, reason: 'out_of_bounds', distance_meters: Math.round(d) };
  }
  return {
    ok: true,
    proof: 'gps',
    weight: accuracy <= 50 ? 0.8 : 0.6,
    distance_bucket: distanceBucket(d),
    accuracy_bucket: accuracyBucket(accuracy),
    anchor_id: null,
  };
}

export function evaluateQrProof(
  input: Coords & { place: GeofencePlace; anchor: CheckInAnchor | null | undefined; config: PlacesConfig },
): ProofResult {
  const { place, anchor, lat, lng, accuracy, config } = input;
  if (!anchor || anchor.venue_id !== place.id || anchor.purpose !== 'check_in' || anchor.active !== true) {
    return { ok: false, reason: 'invalid_anchor' };
  }
  const center = placeCenter(place);
  if (center && isValidCheckInCoordinate(lat, lng)) {
    const d = haversineMeters(lat as number, lng as number, center.lat, center.lng);
    const acc = accuracy != null && Number.isFinite(accuracy) ? accuracy : 100;
    if (d > place.radius_meters * config.qrGpsSlackMultiplier + Math.min(acc, 100)) {
      return { ok: false, reason: 'out_of_bounds', distance_meters: Math.round(d) };
    }
    return {
      ok: true,
      proof: 'qr',
      weight: 1.0,
      distance_bucket: distanceBucket(d),
      accuracy_bucket: accuracyBucket(accuracy ?? null),
      anchor_id: anchor.id,
    };
  }
  return { ok: true, proof: 'qr', weight: 0.6, distance_bucket: null, accuracy_bucket: null, anchor_id: anchor.id };
}
