/**
 * POST /api/enrichment/event
 * Async background enrichment webhook — never blocks proximity binding.
 * Body: { encounter_id, lat, lon, timestamp }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { runEncounterEnrichment } from '@/lib/enrichment/runEncounterEnrichment';
import { parseBody } from '@/lib/api/parseBody';
import { enrichmentEventBodySchema } from '@/lib/api/schemas/connections';

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isValidCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function verifyWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.ENRICHMENT_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const provided = request.headers.get('x-enrichment-secret')?.trim();
  return provided === expected;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyWebhookSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, enrichmentEventBodySchema);
    if (!parsed.ok) return parsed.response;

    const raw = parsed.data;
    const encounterId = typeof raw.encounter_id === 'string' ? raw.encounter_id.trim() : '';
    const lat = raw.lat;
    const lon = raw.lon;
    const timestamp =
      typeof raw.timestamp === 'string' && raw.timestamp.trim().length > 0
        ? raw.timestamp.trim()
        : typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
          ? new Date(raw.timestamp).toISOString()
          : new Date().toISOString();

    if (!encounterId || !isUuidLike(encounterId)) {
      return NextResponse.json({ error: 'encounter_id must be a valid UUID' }, { status: 400 });
    }
    if (!isValidCoord(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: 'lat must be a finite number between -90 and 90' }, { status: 400 });
    }
    if (!isValidCoord(lon) || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'lon must be a finite number between -180 and 180' }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await runEncounterEnrichment(supabase, {
      encounter_id: encounterId,
      lat,
      lon,
      timestamp,
    });

    return NextResponse.json(
      {
        success: true,
        ...result.event,
        vibe: result.vibe,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('enrichment/event error:', msg);
    return NextResponse.json(
      {
        success: false,
        error: 'Enrichment degraded',
        message: msg,
      },
      { status: 200 },
    );
  }
}
