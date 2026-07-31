import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  CONNECTION_FLOW_ALLOWED_EVENTS,
  emitConnectionFlowEvent,
} from '@/lib/server/telemetry/connectionFlowEvents';

type ConnectionFlowBody = {
  event?: unknown;
  event_type?: unknown;
  peer_count?: unknown;
  is_group?: unknown;
  is_reconnect?: unknown;
  selected_count?: unknown;
  candidate_count?: unknown;
  reason?: unknown;
};

/** Per-process sliding window: soft abuse guard (not shared across instances). */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const timestampsByKey = new Map<string, number[]>();

function rateLimitExceeded(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  let stamps = timestampsByKey.get(key) ?? [];
  stamps = stamps.filter((t) => t > windowStart);
  if (stamps.length >= RATE_LIMIT) {
    timestampsByKey.set(key, stamps);
    return true;
  }
  stamps.push(now);
  timestampsByKey.set(key, stamps);
  if (timestampsByKey.size > 50_000) {
    for (const [k, ts] of timestampsByKey) {
      const recent = ts.filter((t) => t > windowStart);
      if (recent.length === 0) timestampsByKey.delete(k);
      else timestampsByKey.set(k, recent);
    }
  }
  return false;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function sanitizeNonNegInt(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

function sanitizeBool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  return null;
}

function sanitizeReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

/**
 * Ingest anonymized proximity handshake / connection-flow telemetry from the KMP client.
 * Auth validates the session; no user_id or coordinates are persisted.
 * Separate from map friction (`system_friction_logs` / `/api/telemetry/friction`).
 *
 * Rate limit: 60 requests / minute / authenticated user (in-memory per instance).
 */
export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (rateLimitExceeded(user.id || clientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: ConnectionFlowBody;
  try {
    body = (await request.json()) as ConnectionFlowBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEvent =
    typeof body.event === 'string'
      ? body.event
      : typeof body.event_type === 'string'
        ? body.event_type
        : '';
  const eventType = rawEvent.trim();
  if (!CONNECTION_FLOW_ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
  }

  const admin = createAdminClient();
  const ok = await emitConnectionFlowEvent(admin, {
    event: eventType,
    peerCount: sanitizeNonNegInt(body.peer_count),
    isGroup: sanitizeBool(body.is_group),
    isReconnect: sanitizeBool(body.is_reconnect),
    selectedCount: sanitizeNonNegInt(body.selected_count),
    candidateCount: sanitizeNonNegInt(body.candidate_count),
    reason: sanitizeReason(body.reason),
  });

  if (!ok) {
    return NextResponse.json({ error: 'Failed to record connection-flow event' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
