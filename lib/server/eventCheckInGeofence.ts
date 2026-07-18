import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  type EventBeaconRow,
  haversineMeters,
  isValidCheckInCoordinate,
  resolveCheckInRadiusMeters,
  resolveBeaconCoordinates,
} from "@/lib/server/eventEngagement";

export type CheckInGeofenceOk = {
  ok: true;
  distanceMeters: number;
  radiusMeters: number;
  venueScale: string;
  latitude: number;
  longitude: number;
};

export type CheckInGeofenceFail = {
  ok: false;
  response: NextResponse;
  distanceMeters?: number;
  radiusMeters?: number;
  venueScale?: string;
  rejectReason: "invalid_coords" | "out_of_bounds" | "missing_beacon_coords";
};

/**
 * Validates caller GPS against the event beacon's venue-scale check-in radius.
 */
export async function assertEventCheckInGeofence(
  admin: SupabaseClient,
  beacon: EventBeaconRow,
  latitude: number | null,
  longitude: number | null,
): Promise<CheckInGeofenceOk | CheckInGeofenceFail> {
  if (
    latitude == null ||
    longitude == null ||
    !isValidCheckInCoordinate(latitude, longitude)
  ) {
    return {
      ok: false,
      rejectReason: "invalid_coords",
      response: NextResponse.json(
        { error: "Location required to check in", reject_reason: "invalid_coords" },
        { status: 400 },
      ),
    };
  }

  const userLat: number = latitude;
  const userLon: number = longitude;

  const coords = await resolveBeaconCoordinates(admin, beacon.id, {
    lat: beacon.lat,
    lng: beacon.lng,
  });

  if (coords.lat == null || coords.lng == null) {
    return {
      ok: false,
      rejectReason: "missing_beacon_coords",
      response: NextResponse.json(
        { error: "Beacon location unavailable", reject_reason: "missing_beacon_coords" },
        { status: 500 },
      ),
    };
  }

  const { radiusMeters, venueScale } = resolveCheckInRadiusMeters(beacon.metadata);
  const distanceMeters = haversineMeters(userLat, userLon, coords.lat, coords.lng);

  if (distanceMeters > radiusMeters) {
    return {
      ok: false,
      rejectReason: "out_of_bounds",
      distanceMeters,
      radiusMeters,
      venueScale,
      response: NextResponse.json(
        {
          error: "OUT_OF_BOUNDS",
          message: "Move closer to the event to check in",
          reject_reason: "out_of_bounds",
          distance_meters: Math.round(distanceMeters * 100) / 100,
          radius_meters: radiusMeters,
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    distanceMeters,
    radiusMeters,
    venueScale,
    latitude: userLat,
    longitude: userLon,
  };
}
