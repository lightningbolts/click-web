/**
 * POST /api/enrichment/event
 * Async background enrichment webhook — never blocks proximity binding.
 * Body: { encounter_id, lat, lon, timestamp }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { runEventEnrichmentPipeline } from '@/lib/enrichment/enrichmentPipeline';

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const encounterId = typeof raw.encounter_id === 'string' ? raw.encounter_id.trim() : '';
    const lat = raw.lat;
    const lon = raw.lon;
    const timestamp =
      typeof raw.timestamp === 'string' && raw.timestamp.trim().length > 0
        ? raw.timestamp.trim()
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
    const result = await runEventEnrichmentPipeline(supabase, {
      encounter_id: encounterId,
      lat,
      lon,
      timestamp,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
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
