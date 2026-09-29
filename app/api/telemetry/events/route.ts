import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import {
  CLIENT_PRODUCT_EVENTS,
  PRODUCT_EVENTS,
  emitProductEvent,
  returnMilestone,
  type ProductEvent,
} from '@/lib/server/telemetry/productEvents';

const bodySchema = z.object({
  event: z.enum(PRODUCT_EVENTS as unknown as [ProductEvent, ...ProductEvent[]]),
  props: z.record(z.string(), z.unknown()).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  app_version: z.string().max(32).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});

/**
 * POST /api/telemetry/events { event, props?, platform?, app_version?, occurred_at? } — the few
 * pilot events only a client can see (install, app_open, recap_opened). An app open on day 2 or
 * day 7 after install also records the retention milestone once. Always 202: telemetry never
 * blocks or errors the app.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await featureMutationRateLimitResponse('product_events', user.id);
  if (limited) return limited;
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!CLIENT_PRODUCT_EVENTS.has(body.event)) {
    return NextResponse.json({ error: 'Event is recorded by the server' }, { status: 400 });
  }
  try {
    const admin = createAdminSupabaseClient();
    const occurredAt = body.occurred_at && Date.parse(body.occurred_at) <= Date.now() + 60_000 ? body.occurred_at : null;
    const meta = { platform: body.platform ?? null, appVersion: body.app_version ?? null, occurredAt };
    const recorded = await emitProductEvent(admin, user.id, body.event, body.props ?? {}, meta);

    if (recorded && body.event === 'app_open') {
      const { data: install } = await admin
        .from('product_events')
        .select('occurred_at')
        .eq('user_id', user.id)
        .eq('event', 'install')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const installAt = (install as { occurred_at?: string } | null)?.occurred_at;
      const milestone = installAt ? returnMilestone(Date.parse(installAt), Date.parse(occurredAt ?? new Date().toISOString())) : null;
      if (milestone) {
        const { count } = await admin
          .from('product_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event', milestone)
          .gte('occurred_at', installAt!);
        if (!count) await emitProductEvent(admin, user.id, milestone, {}, meta);
      }
    }
  } catch (e) {
    console.warn('[telemetry/events]', e instanceof Error ? e.message : String(e));
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
