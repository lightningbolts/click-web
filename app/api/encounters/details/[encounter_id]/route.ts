/**
 * GET /api/encounters/details/[encounter_id]
 * Apple Photos-style on-demand context resolver for a memory capsule.
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  ConnectionEncounterEnrichmentRow,
  EncounterDetailsResponse,
} from '@/types/enrichment-schema';
import { getVenueFromCache, getRegistryEventById } from '@/lib/enrichment/eventCache';
import { resolveDynamicContext } from '@/lib/enrichment/dynamicResolvers';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ encounter_id: string }> },
) {
  try {
    const { encounter_id: encounterId } = await context.params;
    if (!encounterId || !isUuidLike(encounterId)) {
      return NextResponse.json({ error: 'Invalid encounter_id' }, { status: 400 });
    }

    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: encounterRow, error: encErr } = await supabase
      .from('connection_encounters')
      .select(
        'id, connection_id, encountered_at, location_name, gps_lat, gps_lon, event_id, weather_snapshot, context_tags',
      )
      .eq('id', encounterId)
      .maybeSingle();

    if (encErr) {
      console.error('encounters/details fetch:', encErr.message);
      return NextResponse.json({ error: 'Failed to load encounter' }, { status: 500 });
    }
    if (!encounterRow) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 });
    }

    const encounter = encounterRow as ConnectionEncounterEnrichmentRow;

    const { data: connRow, error: connErr } = await supabase
      .from('connections')
      .select('user_ids')
      .eq('id', encounter.connection_id)
      .maybeSingle();

    if (connErr) {
      console.error('encounters/details connection:', connErr.message);
      return NextResponse.json({ error: 'Failed to verify access' }, { status: 500 });
    }

    const userIds = (connRow?.user_ids ?? []) as string[];
    if (!userIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let event = null;
    if (encounter.event_id) {
      event = await getRegistryEventById(supabase, encounter.event_id);
    }

    let venue_cache = null;
    if (
      typeof encounter.gps_lat === 'number' &&
      typeof encounter.gps_lon === 'number' &&
      Number.isFinite(encounter.gps_lat) &&
      Number.isFinite(encounter.gps_lon)
    ) {
      const cached = await getVenueFromCache(supabase, encounter.gps_lat, encounter.gps_lon);
      if (cached) {
        venue_cache = {
          venue_name: cached.venue_name,
          lat: cached.lat,
          lon: cached.lon,
        };
      }
    }

    let dynamic = null;
    if (event) {
      dynamic = await resolveDynamicContext(event);
    }

    let enrichment_status: EncounterDetailsResponse['enrichment_status'] = 'base_only';
    if (event) {
      enrichment_status = 'linked';
    } else if (venue_cache) {
      enrichment_status = 'venue_only';
    }

    const payload: EncounterDetailsResponse = {
      encounter,
      event,
      venue_cache,
      dynamic,
      enrichment_status,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('encounters/details error:', msg);

    return NextResponse.json(
      {
        error: 'Partial context unavailable',
        message: msg,
      },
      { status: 200 },
    );
  }
}
