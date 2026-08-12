import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeContextTag,
  normalizeContextTagsArray,
  normalizeNoiseLevelCategory,
  resolveContextTagId,
} from '@/lib/server/connectionEncounterContextTag';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  deriveHeightCategoryFromRelativeAltitudeM,
  fetchTerrainElevationMeters,
} from '@/lib/server/terrainElevation';
import { parseBody } from '@/lib/api/parseBody';
import { parseParams } from '@/lib/api/parseParams';
import { tagsBodySchema } from '@/lib/api/schemas/connections';
import { connectionIdParamSchema } from '@/lib/api/schemas/common';

function finiteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeClientNoiseLevelString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeElevationCategoryString(value: unknown): string | null {
  return normalizeClientNoiseLevelString(value);
}

function mergeContextTags(existing: string[] | null | undefined, nextId: string | null): string[] {
  const base = Array.isArray(existing) ? [...existing] : [];
  if (nextId == null || nextId.trim().length === 0) {
    return base;
  }
  const trimmed = nextId.trim();
  if (!base.includes(trimmed)) {
    base.push(trimmed);
  }
  return base;
}

/**
 * PATCH — merge context tags and optional encounter sensor fields on the latest
 * `connection_encounters` row for a connection (post-crossing tag flow).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const paramParsed = parseParams(await params, connectionIdParamSchema);
    if (!paramParsed.ok) return paramParsed.response;
    const connectionId = paramParsed.data.connectionId;

    const parsed = await parseBody(request, tagsBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const contextTag = body.contextTag ?? body.context_tag;
    const contextTagObject = body.contextTagObject ?? body.context_tag_object;
    const incomingTagIds = normalizeContextTagsArray(body.context_tags ?? body.contextTags);
    const noiseLevelCategory = body.noiseLevelCategory ?? body.noise_level_category;
    const heightCategoryRaw = body.height_category ?? body.heightCategory;
    const elevationCategoryRaw = body.elevation_category ?? body.elevationCategory;
    const exactNoiseLevelDb = body.exactNoiseLevelDb ?? body.exact_noise_level_db;
    const exactBarometricElevationMeters =
      body.exactBarometricElevationMeters ?? body.exact_barometric_elevation_m;
    const clientNoiseLevelString = normalizeClientNoiseLevelString(
      body.noise_level ?? body.noiseLevel,
    );

    const resolvedContextTag = normalizeContextTag(contextTagObject ?? contextTag);
    const resolvedContextTagId = resolveContextTagId(resolvedContextTag);
    const enumNoiseLevel = normalizeNoiseLevelCategory(noiseLevelCategory);
    const resolvedNoiseForEncounter = enumNoiseLevel ?? clientNoiseLevelString;
    const resolvedElevationCategory =
      normalizeElevationCategoryString(elevationCategoryRaw) ??
      normalizeElevationCategoryString(heightCategoryRaw);

    if (
      resolvedContextTagId == null &&
      incomingTagIds.length === 0 &&
      resolvedNoiseForEncounter == null &&
      resolvedElevationCategory == null &&
      finiteNumber(exactNoiseLevelDb) == null &&
      finiteNumber(exactBarometricElevationMeters) == null
    ) {
      return NextResponse.json(
        { error: 'Provide at least contextTag, noise_level, height_category, or barometric/noise fields' },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const trimmedConnId = connectionId.trim();

    const { data: row, error: fetchError } = await adminClient
      .from('connections')
      .select('id, user_ids')
      .eq('id', trimmedConnId)
      .maybeSingle();

    if (fetchError) {
      console.error('connection tags lookup:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const ids = (row?.user_ids as string[] | null) ?? [];
    if (!row || !ids.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const { data: latestEnc, error: encLookupErr } = await adminClient
      .from('connection_encounters')
      .select(
        'id, context_tags, gps_lat, gps_lon, noise_level, elevation_category, exact_noise_level_db, exact_barometric_elevation_m, relative_altitude_m',
      )
      .eq('connection_id', trimmedConnId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encLookupErr) {
      console.error('connection tags encounter lookup:', encLookupErr);
      return NextResponse.json({ error: encLookupErr.message }, { status: 400 });
    }

    if (!latestEnc?.id) {
      return NextResponse.json({ error: 'No encounter row to update' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {};

    const prevTags = (latestEnc as { context_tags?: string[] | null }).context_tags;
    let mergedTags: string[] = Array.isArray(prevTags) ? [...prevTags] : [];
    for (const id of incomingTagIds) {
      mergedTags = mergeContextTags(mergedTags, id);
    }
    if (resolvedContextTagId != null) {
      mergedTags = mergeContextTags(mergedTags, resolvedContextTagId);
    }
    if (incomingTagIds.length > 0 || resolvedContextTagId != null) {
      updatePayload.context_tags = mergedTags.length > 0 ? mergedTags : [];
    }

    if (resolvedNoiseForEncounter != null) {
      updatePayload.noise_level = resolvedNoiseForEncounter;
    }
    if (resolvedElevationCategory != null) {
      updatePayload.elevation_category = resolvedElevationCategory;
    }

    const encDb = finiteNumber(exactNoiseLevelDb);
    if (encDb != null) {
      updatePayload.exact_noise_level_db = encDb;
    }

    const encElev = finiteNumber(exactBarometricElevationMeters);
    if (encElev != null) {
      updatePayload.exact_barometric_elevation_m = encElev;
    }

    let lat = finiteNumber((latestEnc as { gps_lat?: unknown }).gps_lat);
    let lon = finiteNumber((latestEnc as { gps_lon?: unknown }).gps_lon);
    const coordsFromBodyLat = finiteNumber(body.lat ?? body.gps_lat);
    const coordsFromBodyLon = finiteNumber(body.lon ?? body.gps_lon);
    if (
      coordsFromBodyLat != null &&
      coordsFromBodyLon != null &&
      !(coordsFromBodyLat === 0 && coordsFromBodyLon === 0)
    ) {
      lat = coordsFromBodyLat;
      lon = coordsFromBodyLon;
      updatePayload.gps_lat = lat;
      updatePayload.gps_lon = lon;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: true, encounter: latestEnc });
    }

    const { data: updated, error: upErr } = await adminClient
      .from('connection_encounters')
      .update(updatePayload)
      .eq('id', latestEnc.id)
      .select()
      .maybeSingle();

    if (upErr) {
      console.error('connection_encounters tags update:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    if (
      encElev != null &&
      lat != null &&
      lon != null &&
      !(lat === 0 && lon === 0) &&
      updated?.id
    ) {
      try {
        void (async () => {
          try {
            const terrainM = await fetchTerrainElevationMeters(lat, lon);
            if (terrainM == null) return;
            const relativeAltitudeM = encElev - terrainM;
            const elevationCategory = deriveHeightCategoryFromRelativeAltitudeM(relativeAltitudeM);
            const { error: relErr } = await adminClient
              .from('connection_encounters')
              .update({
                relative_altitude_m: relativeAltitudeM,
                ...(elevationCategory != null ? { elevation_category: elevationCategory } : {}),
              })
              .eq('id', updated.id);
            if (relErr) {
              console.error('connection_encounters relative_altitude async update:', relErr);
            }
          } catch (openElevErr) {
            console.error('Open-Elevation lookup failed (non-fatal):', openElevErr);
          }
        })();
      } catch (relScheduleErr) {
        console.error('relative_altitude follow-up failed (non-fatal):', relScheduleErr);
      }
    }

    return NextResponse.json({ success: true, encounter: updated });
  } catch (e) {
    console.error('connection tags PATCH:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
