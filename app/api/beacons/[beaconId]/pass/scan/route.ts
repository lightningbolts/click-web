import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { parsePassCredential, passTokenVersion, verifyEventPassToken, verifyTicketToken } from '@/lib/events/eventPass';
import { eventPassKey, hasRsvpPass, loadPassHolder } from '@/lib/server/eventPass';
import { recordDoorCheckIn } from '@/lib/server/events/doorCheckIn';
import { hashTicketToken } from '@/lib/server/ticketing/credentials';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';
import { parseBody } from '@/lib/api/parseBody';
import { passScanBodySchema } from '@/lib/api/schemas/beacons';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type PassScanResult =
  | 'checked_in'
  | 'already_checked_in'
  | 'not_going'
  | 'wrong_event'
  | 'invalid'
  | 'refunded'
  | 'event_cancelled';

type Reply = (result: PassScanResult, extra?: Record<string, unknown>) => NextResponse;
type Manager = { admin: SupabaseClient; userId: string; beacon: { venue_id: string | null } };

const TICKET_RESULTS: Record<string, PassScanResult> = {
  accepted: 'checked_in',
  already_checked_in: 'already_checked_in',
  wrong_event: 'wrong_event',
  refunded: 'refunded',
  event_cancelled: 'event_cancelled',
};

/**
 * POST `{ credential }` or `{ ticket_id }` — a host (or co-host) admits someone at the door.
 *
 * One scanner reads both credentials. A Click Pass only says who it belongs to, so admission is
 * decided live: the holder must still be going. A ticket is checked in atomically by the database,
 * so two scanners can't admit it twice. Either way a first scan checks the guest in and opens the
 * event chat to them; a repeat answers `already_checked_in` with the time, so a shared screenshot
 * is caught. Every outcome is a 200 with the holder's name and photo for the host to match.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }) {
  try {
    const { beaconId } = await params;
    const manager = await requireEventManager(request, beaconId);
    if (!manager.ok) return manager.response;
    const parsed = await parseBody(request, passScanBodySchema);
    if (!parsed.ok) return parsed.response;
    const key = eventPassKey();
    if (!key) return apiError('Click Pass is not configured', 503, 'pass_unavailable');

    const reply: Reply = (result, extra = {}) =>
      NextResponse.json({ result, attendee: null, checked_in_at: null, ...extra });

    if ('ticket_id' in parsed.data) {
      if (!ticketingEnabled()) return reply('invalid');
      const { data, error } = await manager.admin
        .from('tickets')
        .select('beacon_id, qr_token_hash')
        .eq('id', parsed.data.ticket_id)
        .maybeSingle();
      if (error) throw new Error(`ticket lookup failed: ${error.message}`);
      const ticket = data as { beacon_id: string; qr_token_hash: string } | null;
      if (!ticket) return reply('invalid');
      if (ticket.beacon_id !== beaconId) return reply('wrong_event');
      return await admitTicket(manager, beaconId, ticket.qr_token_hash, reply);
    }

    const credential = parsePassCredential(parsed.data.credential);
    if (!credential.ok) return reply('invalid');
    if (credential.beaconId && credential.beaconId !== beaconId.toLowerCase()) return reply('wrong_event');

    if (passTokenVersion(credential.token) === 2) {
      if (!ticketingEnabled() || !verifyTicketToken(key, beaconId, credential.token)) return reply('invalid');
      return await admitTicket(manager, beaconId, hashTicketToken(credential.token), reply);
    }

    const userId = verifyEventPassToken(key, beaconId, credential.token);
    if (!userId) return reply('invalid');
    return await admitPass(manager, beaconId, userId, reply);
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/pass/scan:', e);
    return apiError('Check-in failed', 500);
  }
}

async function admitPass(manager: Manager, beaconId: string, userId: string, reply: Reply): Promise<NextResponse> {
  const { admin } = manager;
  const [holder, going, beacon, existing] = await Promise.all([
    loadPassHolder(admin, userId),
    hasRsvpPass(admin, beaconId, userId),
    admin.from('map_beacons').select('event_cancelled_at').eq('id', beaconId).maybeSingle(),
    admin
      .from('event_check_ins')
      .select('checked_in_at, checked_out_at, check_in_count')
      .eq('beacon_id', beaconId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  // A failed read must never look like "not checked in yet": that would wave a shared pass through.
  if (existing.error) throw new Error(`pass scan lookup: ${existing.error.message}`);
  if (beacon.error) throw new Error(`pass scan event: ${beacon.error.message}`);
  const attendee = { user_id: holder.userId, name: holder.name, avatar_url: holder.avatarUrl };
  if ((beacon.data as { event_cancelled_at: string | null } | null)?.event_cancelled_at) {
    return reply('event_cancelled', { attendee });
  }
  if (!going) return reply('not_going', { attendee });

  const row = existing.data as { checked_in_at: string; checked_out_at: string | null; check_in_count: number | null } | null;
  if (row && row.checked_out_at == null) {
    return reply('already_checked_in', { attendee, checked_in_at: row.checked_in_at });
  }

  const { checkedInAt, hereNow } = await recordDoorCheckIn(admin, {
    beaconId,
    userId,
    venueId: manager.beacon.venue_id ?? null,
    scannedBy: manager.userId,
    source: 'pass_scan',
    priorCount: row?.check_in_count ?? 0,
  });
  return reply('checked_in', { attendee, checked_in_at: checkedInAt, check_in_count: hereNow });
}

async function admitTicket(manager: Manager, beaconId: string, tokenHash: string, reply: Reply): Promise<NextResponse> {
  const { admin } = manager;
  const { data, error } = await admin.rpc('ticketing_check_in', {
    p_beacon: beaconId,
    p_token_hash: tokenHash,
    p_scanner: manager.userId,
  });
  if (error) throw new Error(`ticketing_check_in failed: ${error.message}`);
  const scan = data as {
    result: string;
    owner_user_id?: string;
    tier_name?: string | null;
    checked_in_at?: string;
  };

  const result = TICKET_RESULTS[scan.result] ?? 'invalid';
  if (!scan.owner_user_id || result === 'invalid' || result === 'wrong_event') return reply(result);

  const holder = await loadPassHolder(admin, scan.owner_user_id);
  const attendee = { user_id: holder.userId, name: holder.name, avatar_url: holder.avatarUrl };
  const tierName = scan.tier_name ?? null;
  if (result !== 'checked_in') {
    return reply(result, {
      attendee,
      tier_name: tierName,
      checked_in_at: result === 'already_checked_in' ? (scan.checked_in_at ?? null) : null,
    });
  }

  const { checkedInAt, hereNow } = await recordDoorCheckIn(admin, {
    beaconId,
    userId: scan.owner_user_id,
    venueId: manager.beacon.venue_id ?? null,
    scannedBy: manager.userId,
    source: 'ticket_scan',
  });
  return reply('checked_in', { attendee, tier_name: tierName, checked_in_at: checkedInAt, check_in_count: hereNow });
}
