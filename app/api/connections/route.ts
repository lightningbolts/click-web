import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Connections API
 *
 * GET  → Fetch connections for the authenticated user
 * POST → Create a new connection with proximity validation (Layers 2 & 3)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function createSupabaseSSRClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

/**
 * Haversine distance in meters between two lat/lon coordinate pairs.
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Compute the Proximity Confidence Score (0–100).
 *
 * | Signal                          | Points |
 * |─────────────────────────────────|────────|
 * | NFC connection method           | +50    |
 * | GPS distance < 10m              | +30    |
 * | GPS distance 10–50m             | +15    |
 * | GPS distance 50–100m            | +5     |
 * | GPS distance > 100m             | −40    |
 * | QR token age < 30s              | +10    |
 * | QR token age 30–60s             | +5     |
 * | QR token age > 60s              |  0     |
 * | Same WiFi BSSID                 | +15    |
 */
function computeProximityScore(params: {
  connectionMethod: string;
  gpsDistanceMeters: number | null;
  tokenAgeSeconds: number | null;
  sharedBssid: boolean;
  gpsAvailable: boolean;
}): { score: number; signals: Record<string, unknown> } {
  const { connectionMethod, gpsDistanceMeters, tokenAgeSeconds, sharedBssid, gpsAvailable } = params;

  let score = 0;

  // Connection method baseline
  if (connectionMethod === 'nfc') {
    score += 50;
  }

  // GPS distance scoring
  if (gpsDistanceMeters !== null && gpsAvailable) {
    if (gpsDistanceMeters < 10) score += 30;
    else if (gpsDistanceMeters <= 50) score += 15;
    else if (gpsDistanceMeters <= 100) score += 5;
    else score -= 40;
  }

  // QR token age scoring
  if (tokenAgeSeconds !== null) {
    if (tokenAgeSeconds < 30) score += 10;
    else if (tokenAgeSeconds <= 60) score += 5;
    // > 60s = 0 points
  }

  // WiFi BSSID match
  if (sharedBssid) {
    score += 15;
  }

  // Clamp to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const signals: Record<string, unknown> = {
    gps_distance_meters: gpsDistanceMeters !== null ? Math.round(gpsDistanceMeters * 10) / 10 : null,
    token_age_seconds: tokenAgeSeconds !== null ? Math.round(tokenAgeSeconds) : null,
    shared_bssid: sharedBssid,
    connection_method: connectionMethod,
    gps_available: gpsAvailable,
  };

  return { score, signals };
}

type ContextTagPayload = {
  id: string;
  label: string;
  emoji: string;
};

type MemoryCapsulePayload = {
  connectionId: string;
  locationName: string | null;
  geoLocation: { lat: number; lon: number } | null;
  connectedAtMs: number;
  weatherSnapshot: {
    condition: string;
    temperatureCelsius: number;
    iconCode: string | null;
  } | null;
  contextTag: ContextTagPayload | null;
  photoUri: string | null;
  noiseLevelCategory: 'QUIET' | 'MODERATE' | 'LOUD' | 'VERY_LOUD' | null;
};

function normalizeContextTag(input: unknown): ContextTagPayload | null {
  if (typeof input === 'string') {
    const label = input.trim();
    return label ? { id: 'custom', label, emoji: '✏️' } : null;
  }

  if (
    input &&
    typeof input === 'object' &&
    'id' in input &&
    'label' in input &&
    typeof input.id === 'string' &&
    typeof input.label === 'string'
  ) {
    const candidate = input as { id: string; label: string; emoji?: unknown };
    return {
      id: candidate.id,
      label: candidate.label,
      emoji: typeof candidate.emoji === 'string' ? candidate.emoji : '✏️',
    };
  }

  return null;
}

function resolveContextTagId(contextTag: ContextTagPayload | null): string | null {
  if (!contextTag) {
    return null;
  }

  return contextTag.id === 'custom' ? contextTag.label : contextTag.id;
}

function normalizeNoiseLevel(value: unknown): MemoryCapsulePayload['noiseLevelCategory'] {
  return value === 'QUIET' || value === 'MODERATE' || value === 'LOUD' || value === 'VERY_LOUD'
    ? value
    : null;
}

function toConditionLabel(weatherCode: number): string {
  if (weatherCode === 0) return 'Sunny';
  if ([1, 2, 3].includes(weatherCode)) return 'Cloudy';
  if ([45, 48].includes(weatherCode)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'Drizzly';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'Rainy';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Snowy';
  if ([95, 96, 99].includes(weatherCode)) return 'Stormy';
  return 'Clear';
}

function toIconCode(weatherCode: number): string {
  if (weatherCode === 0) return 'clear';
  if ([1, 2, 3].includes(weatherCode)) return 'cloudy';
  if ([45, 48].includes(weatherCode)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'snow';
  if ([95, 96, 99].includes(weatherCode)) return 'thunder';
  return 'clear';
}

async function enrichMemoryCapsuleWeather(
  adminClient: ReturnType<typeof createAdminClient>,
  connectionId: string,
  lat: number,
  lon: number,
  memoryCapsule: MemoryCapsulePayload,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return;
  }

  try {
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      { cache: 'no-store' }
    );

    if (!weatherResponse.ok) {
      return;
    }

    const weatherJson = await weatherResponse.json() as {
      current_weather?: { temperature?: number; weathercode?: number };
    };
    const currentWeather = weatherJson.current_weather;
    if (
      currentWeather?.temperature == null ||
      currentWeather.weathercode == null
    ) {
      return;
    }

    const enrichedCapsule: MemoryCapsulePayload = {
      ...memoryCapsule,
      weatherSnapshot: {
        condition: toConditionLabel(currentWeather.weathercode),
        temperatureCelsius: currentWeather.temperature,
        iconCode: toIconCode(currentWeather.weathercode),
      },
    };

    const { error } = await adminClient
      .from('connections')
      .update({
        memory_capsule: enrichedCapsule,
        weather_condition: enrichedCapsule.weatherSnapshot?.condition ?? null,
      })
      .eq('id', connectionId);

    if (error) {
      console.error('Memory capsule weather update error:', error);
    }
  } catch (error) {
    console.error('Memory capsule weather fetch error:', error);
  }
}

// ─── GET — fetch user's connections ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseSSRClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch connections for the user
    const { data: connections, error } = await supabase
      .from('connections')
      .select('*')
      .contains('user_ids', [user.id])
      .order('created', { ascending: false });

    if (error) {
      console.error('Error fetching connections:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ connections: connections || [] });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — create connection with proximity validation ──────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseSSRClient();
    const body = await request.json();

    const {
      userId1,
      userId2,
      location1,        // { lat, lon } — initiator's GPS
      location2,        // { lat, lon } — scanner's GPS (if available)
      connectionMethod = 'qr',
      tokenAgeMs,       // milliseconds since token was created (null for NFC/legacy)
      wifiBssid1,       // initiator's WiFi BSSID (optional)
      wifiBssid2,       // scanner's WiFi BSSID (optional)
      contextTag,       // user-defined tag (optional)
      contextTagObject,
      initiatorId,
      responderId,
      initiator_id,
      responder_id,
      noiseLevelCategory,
    } = body;

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!userId1 || !userId2) {
      return NextResponse.json({ error: 'Missing userId1 or userId2' }, { status: 400 });
    }

    // Prevent self-connection
    if (userId1 === userId2) {
      return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if connection already exists
    const { data: existing } = await adminClient
      .from('connections')
      .select('id')
      .contains('user_ids', [userId1, userId2])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Connection already exists' }, { status: 409 });
    }

    // ── Layer 2: GPS proximity validation ──

    const loc1Valid = location1 && isFinite(location1.lat) && isFinite(location1.lon) &&
      !(location1.lat === 0 && location1.lon === 0);
    const loc2Valid = location2 && isFinite(location2.lat) && isFinite(location2.lon) &&
      !(location2.lat === 0 && location2.lon === 0);

    let gpsDistanceMeters: number | null = null;
    const gpsAvailable = loc1Valid || loc2Valid;

    if (loc1Valid && loc2Valid) {
      gpsDistanceMeters = haversineMeters(
        location1.lat, location1.lon,
        location2.lat, location2.lon
      );

      // Hard reject if distance > 150m
      if (gpsDistanceMeters > 150) {
        return NextResponse.json({
          error: 'proximity_check_failed',
          distance: Math.round(gpsDistanceMeters),
          message: 'Users appear to be too far apart for a physical connection',
        }, { status: 422 });
      }
    }

    // ── Layer 3: proximity confidence score ──

    const tokenAgeSeconds = tokenAgeMs != null ? tokenAgeMs / 1000 : null;
    const sharedBssid = !!(wifiBssid1 && wifiBssid2 && wifiBssid1 === wifiBssid2);

    const { score: proximityConfidence, signals: proximitySignals } = computeProximityScore({
      connectionMethod,
      gpsDistanceMeters,
      tokenAgeSeconds,
      sharedBssid,
      gpsAvailable,
    });

    // Compute geo_location without midpoint averaging to preserve real observed points.
    // If both are available, prefer initiator location1.
    let geoLocation: { lat: number; lon: number };
    if (loc1Valid && loc2Valid) {
      geoLocation = { lat: location1.lat, lon: location1.lon };
    } else if (loc1Valid) {
      geoLocation = { lat: location1.lat, lon: location1.lon };
    } else if (loc2Valid) {
      geoLocation = { lat: location2.lat, lon: location2.lon };
    } else {
      // No GPS available — use a null-island sentinel that the frontend filters out
      geoLocation = { lat: 0, lon: 0 };
    }

    const now = Date.now();
    const expiry = now + 30 * 24 * 60 * 60 * 1000; // 30 days
    const resolvedContextTag = normalizeContextTag(contextTagObject ?? contextTag);
    const resolvedContextTagId = resolveContextTagId(resolvedContextTag);
    const resolvedNoiseLevel = normalizeNoiseLevel(noiseLevelCategory);
    const resolvedInitiatorId = initiator_id ?? initiatorId ?? (connectionMethod === 'qr' ? userId2 : userId1);
    const resolvedResponderId = responder_id ?? responderId ?? (connectionMethod === 'qr' ? userId1 : userId2);

    const memoryCapsuleBase: Omit<MemoryCapsulePayload, 'connectionId'> = {
      locationName: null,
      geoLocation: geoLocation.lat === 0 && geoLocation.lon === 0 ? null : geoLocation,
      connectedAtMs: now,
      weatherSnapshot: null,
      contextTag: resolvedContextTag,
      photoUri: null,
      noiseLevelCategory: resolvedNoiseLevel,
    };

    const connectionData = {
      user_ids: [userId1, userId2],
      geo_location: geoLocation,
      created: now,
      expiry,
      should_continue: [false, false],
      has_begun: false,
      expiry_state: 'pending',
      proximity_confidence: proximityConfidence,
      proximity_signals: proximitySignals,
      connection_method: connectionMethod,
      flagged: proximityConfidence < 20,
      context_tag_id: resolvedContextTagId,
      initiator_id: resolvedInitiatorId,
      responder_id: resolvedResponderId,
      noise_level: resolvedNoiseLevel,
    };

    const { data: connection, error: insertError } = await adminClient
      .from('connections')
      .insert(connectionData)
      .select()
      .single();

    if (insertError) {
      console.error('Connection insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Also create a chat row for this connection (so it shows in the chat list)
    const { error: chatError } = await adminClient
      .from('chats')
      .insert({
        connection_id: connection.id,
        created_at: now,
        updated_at: now,
      });

    if (chatError) {
      console.error('Chat creation error (non-fatal):', chatError);
      // Non-fatal — connection was created
    }

    const memoryCapsule: MemoryCapsulePayload = {
      connectionId: connection.id,
      ...memoryCapsuleBase,
    };

    const { error: memoryCapsuleError } = await adminClient
      .from('connections')
      .update({ memory_capsule: memoryCapsule })
      .eq('id', connection.id);

    if (memoryCapsuleError) {
      console.error('Memory capsule base update error:', memoryCapsuleError);
    }

    void enrichMemoryCapsuleWeather(
      adminClient,
      connection.id,
      geoLocation.lat,
      geoLocation.lon,
      memoryCapsule
    );

    return NextResponse.json({
      success: true,
      connection,
      proximityConfidence,
    });

  } catch (error) {
    console.error('Connection creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
