import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

/**
 * QR Code Connection API — Proximity Verification Layer 1
 *
 * GET  → Generate a time-bounded, single-use QR token (90s TTL)
 * POST → Redeem a QR token (atomic, race-condition safe)
 *
 * Persisting a `connections` row (including reconnect after soft-remove) is handled by
 * `POST /api/connections` — not this route. That endpoint performs the pair lookup,
 * junction cleanup, and restore-before-insert flow for `unique_user_pair`.
 *
 * Old format: click://connect/{userId}  (static, vulnerable to screenshots)
 * New format: JSON with { token, userId, exp } (single-use, expires)
 */

// Helper: create an admin Supabase client (bypasses RLS for token ops)
function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { persistSession: false } }
    );
  }
  // Fallback to anon key if no service role key configured
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const OPEN_METEO_TIMEOUT_MS = 3_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
const DISPLAY_LOCATION_FALLBACK = 'A new city';

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function finiteBatteryPct(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const rounded = Math.round(v);
  return rounded >= 0 && rounded <= 100 ? rounded : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractDisplayLocation(semanticLocation: Record<string, unknown>): string {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return DISPLAY_LOCATION_FALLBACK;
  const city = firstNonEmptyString([
    address.city,
    address.town,
    address.village,
    address.hamlet,
  ]);
  if (!city) return DISPLAY_LOCATION_FALLBACK;
  const state = firstNonEmptyString([address.state]);
  return state ? `${city}, ${state}` : city;
}

function extractSpecificLocationName(semanticLocation: Record<string, unknown>): string | null {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (address) {
    const hn = firstNonEmptyString([address.house_number]);
    const rd = firstNonEmptyString([address.road]);
    if (hn != null && rd != null) return `${hn} ${rd}`;
  }

  return firstNonEmptyString([
    semanticLocation.name,
    address?.amenity,
    address?.building,
    address?.residential,
    address?.road,
  ]);
}

function openMeteoCodeToLabel(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Clear';
}

function openMeteoCodeToIcon(code: number): string {
  if (code === 0) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'clear';
}

async function fetchOpenMeteoWeatherSnapshot(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        pressure_msl?: number;
      };
    };
    const cur = raw.current;
    if (cur == null || typeof cur.temperature_2m !== 'number' || !Number.isFinite(cur.temperature_2m)) {
      return null;
    }
    const code =
      typeof cur.weather_code === 'number' && Number.isFinite(cur.weather_code) ? cur.weather_code : 0;
    const payload = {
      iconCode: openMeteoCodeToIcon(code),
      condition: openMeteoCodeToLabel(code),
      windSpeedKph:
        typeof cur.wind_speed_10m === 'number' && Number.isFinite(cur.wind_speed_10m)
          ? cur.wind_speed_10m
          : null,
      pressureMslHpa:
        typeof cur.pressure_msl === 'number' && Number.isFinite(cur.pressure_msl) ? cur.pressure_msl : null,
      temperatureCelsius: cur.temperature_2m,
      windDirectionDegrees:
        typeof cur.wind_direction_10m === 'number' && Number.isFinite(cur.wind_direction_10m)
          ? Math.round(cur.wind_direction_10m)
          : null,
    };
    return JSON.stringify(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNominatimReverseGeocode(lat: number, lon: number): Promise<{
  semanticLocation: Record<string, unknown> | null;
  displayLocation: string;
  specificLocationName: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_REVERSE_TIMEOUT_MS);
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
    if (!response.ok) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    return {
      semanticLocation: payload,
      displayLocation: extractDisplayLocation(payload),
      specificLocationName: extractSpecificLocationName(payload),
    };
  } catch {
    return {
      semanticLocation: null,
      displayLocation: DISPLAY_LOCATION_FALLBACK,
      specificLocationName: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGpsPair(input: {
  gpsLat: unknown;
  gpsLon: unknown;
  scannerLat: unknown;
  scannerLon: unknown;
}): { lat: number | null; lon: number | null } {
  const explicitLat = finiteNumber(input.gpsLat);
  const explicitLon = finiteNumber(input.gpsLon);
  if (
    explicitLat != null &&
    explicitLon != null &&
    !(explicitLat === 0 && explicitLon === 0)
  ) {
    return { lat: explicitLat, lon: explicitLon };
  }

  const scannerLat = finiteNumber(input.scannerLat);
  const scannerLon = finiteNumber(input.scannerLon);
  if (
    scannerLat != null &&
    scannerLon != null &&
    !(scannerLat === 0 && scannerLon === 0)
  ) {
    return { lat: scannerLat, lon: scannerLon };
  }

  return { lat: null, lon: null };
}

function isEncounterRateLimitError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false;
  const joined = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`;
  return joined.includes('encounter_rate_limit_3h');
}

type QrRedeemRpcResult = {
  success: boolean;
  error?: string;
  user_id?: string;
  token_age_ms?: number;
  distance_meters?: number;
};

/**
 * GET — Generate a QR token for the authenticated user
 *
 * Returns a JSON payload to encode in the QR code:
 *   { token, userId, exp }
 *
 * The token is stored in `qr_tokens` with a 90-second TTL and can
 * only be redeemed once via the POST endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedSupabase(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Generate cryptographically random token
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + 90_000; // 90 seconds

    // Capture initiator's GPS from query params (sent by mobile/web client)
    const lat = parseFloat(request.nextUrl.searchParams.get('lat') || '');
    const lon = parseFloat(request.nextUrl.searchParams.get('lon') || '');
    const hasValidGps = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);

    // Store token in qr_tokens table with initiator location for proximity enforcement
    const adminClient = createAdminClient();
    const { error: insertError } = await adminClient
      .from('qr_tokens')
      .insert({
        token,
        user_id: user.id,
        created_at: now,
        expires_at: expiresAt,
        redeemed: false,
        ...(hasValidGps ? { initiator_lat: lat, initiator_lon: lon } : {}),
      });

    if (insertError) {
      console.error('Failed to store QR token:', insertError);
      return NextResponse.json(
        { error: 'Failed to generate QR code' },
        { status: 500 }
      );
    }

    // Build the QR payload
    const qrPayload = {
      token,
      userId: user.id,
      exp: expiresAt,
    };

    // Also generate legacy URLs for backward compat display
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
        request.nextUrl.origin);

    const connectionUrl = `${baseUrl}/connect/${user.id}`;
    const clickId = `CLICK-${user.id.substring(0, 8).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      data: {
        // New token-based payload (encode this as the QR code content)
        qrPayload: JSON.stringify(qrPayload),
        token,
        expiresAt,
        // Legacy fields for display
        userId: user.id,
        clickId,
        connectionUrl,
        deepLink: `click://connect/${user.id}`,
        universalLink: connectionUrl,
        userName: displayNameFromUserMetadata(user.user_metadata) || null,
        userEmail: user.email,
      }
    });

  } catch (error) {
    console.error('QR API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST — Redeem a QR token and validate proximity
 *
 * Body: { token, scannerLocation?: { lat, lon } }
 *   OR legacy: { targetUserId }
 *
 * For token-based: atomically redeems the token via the `redeem_qr_token` RPC.
 * For legacy: validates the target user exists (backward compat).
 *
 * Returns:
 *   { userId, userName, tokenAgeMs } on success
 *   { error: "expired" | "already_used" | "not_found" } on failure
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedSupabase(request);
    const rawBody = (await request.json()) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // ── Token-based redemption (new flow) ──
    if (typeof body.token === 'string' && body.token.trim().length > 0) {
      const token = body.token;
      const scannerLocation = isRecord(body.scannerLocation) ? body.scannerLocation : null;
      const adminClient = createAdminClient();

      const gpsPair = normalizeGpsPair({
        gpsLat: body.gps_lat,
        gpsLon: body.gps_lon,
        scannerLat: scannerLocation?.lat,
        scannerLon: scannerLocation?.lon,
      });
      const manualLocationName =
        typeof body.location_name === 'string' && body.location_name.trim().length > 0
          ? body.location_name.trim()
          : null;

      const luxLevel = finiteNumber(body.lux_level);
      const motionVariance = finiteNumber(body.motion_variance);
      const compassAzimuth = finiteNumber(body.compass_azimuth);
      const batteryLevel = finiteBatteryPct(body.battery_level);
      const clientWeatherSnapshot =
        typeof body.weather_snapshot === 'string' && body.weather_snapshot.trim().length > 0
          ? body.weather_snapshot.trim()
          : null;

      // Build RPC params — include scanner GPS for proximity gate
      const rpcParams: Record<string, unknown> = { p_token: token };
      if (gpsPair.lat != null && gpsPair.lon != null) {
        rpcParams.p_scanner_lat = gpsPair.lat;
        rpcParams.p_scanner_lon = gpsPair.lon;
      }

      // Atomically redeem the token via RPC (includes proximity check)
      const { data: rpcResult, error: rpcError } = await adminClient
        .rpc('redeem_qr_token', rpcParams);

      if (rpcError) {
        console.error('Token redemption RPC error:', rpcError);
        return NextResponse.json(
          { error: 'Token validation failed' },
          { status: 500 }
        );
      }

      const result = rpcResult as QrRedeemRpcResult;

      if (!result.success) {
        if (result.error === 'proximity_failed') {
          return NextResponse.json(
            {
              error: 'proximity_failed',
              message: 'Connection failed: Users must be in the same physical location.',
              distanceMeters: result.distance_meters,
            },
            { status: 403 }
          );
        }
        return NextResponse.json(
          { error: result.error || 'not_found' },
          { status: 400 }
        );
      }

      const targetUserId = result.user_id!;
      const tokenAgeMs = result.token_age_ms || 0;

      // Prevent self-connection
      if (user.id === targetUserId) {
        return NextResponse.json(
          { error: 'Cannot connect with yourself' },
          { status: 400 }
        );
      }

      // Look up target user name and an existing connection row for this user pair.
      const { data: targetUser } = await adminClient
        .from('users')
        .select('id, name')
        .eq('id', targetUserId)
        .maybeSingle();

      const sortedPair = [user.id, targetUserId].sort();
      const { data: pairRows, error: pairLookupError } = await adminClient
        .from('connections')
        .select('id, user_ids')
        .contains('user_ids', sortedPair)
        .limit(10);

      if (pairLookupError) {
        console.error('QR API pair lookup failed:', pairLookupError);
        return NextResponse.json(
          { error: 'Failed to validate connection pair' },
          { status: 500 }
        );
      }

      const existingConnection = (pairRows ?? []).find((row) => {
        const userIds = Array.isArray(row.user_ids)
          ? row.user_ids.filter((id): id is string => typeof id === 'string')
          : [];
        return userIds.length === 2 && userIds.includes(user.id) && userIds.includes(targetUserId);
      });

      let encounterLogged = true;
      let encounterReason: string | undefined;

      if (existingConnection?.id) {
        let semanticLocation: Record<string, unknown> | null = null;
        let displayLocation = DISPLAY_LOCATION_FALLBACK;
        let specificLocationName: string | null = null;
        if (gpsPair.lat != null && gpsPair.lon != null) {
          const geocoded = await fetchNominatimReverseGeocode(gpsPair.lat, gpsPair.lon);
          semanticLocation = geocoded.semanticLocation;
          displayLocation = geocoded.displayLocation;
          specificLocationName = geocoded.specificLocationName;
        }

        const encounterInsert: Record<string, unknown> = {
          connection_id: existingConnection.id,
          encountered_at: new Date().toISOString(),
          display_location: displayLocation,
        };
        const resolvedLocationName = manualLocationName ?? specificLocationName;
        if (resolvedLocationName) {
          encounterInsert.location_name = resolvedLocationName;
        }
        if (gpsPair.lat != null && gpsPair.lon != null) {
          encounterInsert.gps_lat = gpsPair.lat;
          encounterInsert.gps_lon = gpsPair.lon;
        }
        if (semanticLocation != null) {
          encounterInsert.semantic_location = semanticLocation;
        }
        if (luxLevel != null) encounterInsert.lux_level = luxLevel;
        if (motionVariance != null) encounterInsert.motion_variance = motionVariance;
        if (compassAzimuth != null) encounterInsert.compass_azimuth = compassAzimuth;
        if (batteryLevel != null) encounterInsert.battery_level = batteryLevel;

        let resolvedWeather = clientWeatherSnapshot;
        if (resolvedWeather == null && gpsPair.lat != null && gpsPair.lon != null) {
          resolvedWeather = await fetchOpenMeteoWeatherSnapshot(gpsPair.lat, gpsPair.lon);
        }
        if (resolvedWeather != null) {
          encounterInsert.weather_snapshot = resolvedWeather;
        }

        const { error: encounterErr } = await adminClient
          .from('connection_encounters')
          .insert(encounterInsert);

        if (encounterErr) {
          if (isEncounterRateLimitError(encounterErr)) {
            encounterLogged = false;
            encounterReason = 'rate_limit_active';
            return NextResponse.json({
              success: true,
              encounter_logged: false,
              reason: encounterReason,
              connection_id: existingConnection.id,
              data: {
                targetUserId,
                targetUserName: targetUser?.name || 'Click User',
                initiatorId: user.id,
                tokenAgeMs,
                connectionId: existingConnection.id,
                encounterLogged: false,
                reason: encounterReason,
                message: 'Token redeemed — encounter logging is rate limited',
              },
            });
          }

          console.error('QR API encounter insert failed:', encounterErr);
          return NextResponse.json(
            { error: 'Failed to log encounter context' },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        encounter_logged: encounterLogged,
        ...(encounterReason ? { reason: encounterReason } : {}),
        connection_id: existingConnection?.id ?? null,
        data: {
          targetUserId,
          targetUserName: targetUser?.name || 'Click User',
          initiatorId: user.id,
          tokenAgeMs,
          connectionId: existingConnection?.id ?? null,
          encounterLogged,
          ...(encounterReason ? { reason: encounterReason } : {}),
          message: 'Token redeemed — ready to create connection',
        }
      });
    }

    // ── Legacy flow (old click://connect/{userId} format) ──
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : null;
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Missing token or targetUserId' },
        { status: 400 }
      );
    }

    // Prevent self-connection
    if (user.id === targetUserId) {
      return NextResponse.json(
        { error: 'Cannot connect with yourself' },
        { status: 400 }
      );
    }

    // Verify the target user exists
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        targetUserId,
        targetUserName: targetUser.name || 'Click User',
        initiatorId: user.id,
        tokenAgeMs: null, // Legacy — no token timing data
        message: 'Ready to create connection',
      }
    });

  } catch (error) {
    console.error('QR Verify Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
