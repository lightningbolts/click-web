import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseGuestCsv,
  parseGuestEntries,
  truncateEmail,
  type GuestListSource,
  type ParsedGuestEntry,
} from '@/lib/events/guestListParse';
import { matchGuestEntries } from '@/lib/events/guestListMatch';
import { regenerateEventTeasers } from '@/lib/events/eventTeasers';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type GuestListStatus = {
  guest_list_id: string;
  source: GuestListSource;
  uploaded: number;
  matched: number;
  teasers: number;
  matched_at: string | null;
  entries: Array<{
    id: string;
    email_truncated: string | null;
    instagram_handle: string | null;
    matched: boolean;
    match_confidence: string;
  }>;
};

export async function persistGuestList(args: {
  admin: SupabaseClient;
  beaconId: string;
  organizerId: string;
  source: GuestListSource;
  entries: ParsedGuestEntry[];
}): Promise<GuestListStatus> {
  const { admin, beaconId, organizerId, source, entries } = args;
  const { data: list, error: listErr } = await admin
    .from('event_guest_lists')
    .insert({
      beacon_id: beaconId,
      organizer_id: organizerId,
      source,
    })
    .select('id')
    .single();
  if (listErr || !isRecord(list) || typeof list.id !== 'string') {
    throw new Error(listErr?.message ?? 'Failed to create guest list');
  }
  const guestListId = list.id;
  if (entries.length === 0) {
    return {
      guest_list_id: guestListId,
      source,
      uploaded: 0,
      matched: 0,
      teasers: 0,
      matched_at: null,
      entries: [],
    };
  }

  const matched = await matchGuestEntries(admin, entries);
  const insertRows = matched.map((e) => ({
    guest_list_id: guestListId,
    email: e.email,
    instagram_handle: e.instagram_handle,
    email_hash: e.email_hash,
    matched_user_id: e.matched_user_id,
    match_confidence: e.match_confidence,
  }));
  const { error: insErr } = await admin.from('event_guest_list_entries').insert(insertRows);
  if (insErr) {
    throw new Error(insErr.message);
  }

  const matchedUserIds = matched
    .map((e) => e.matched_user_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const teaserCount = await regenerateEventTeasers(admin, beaconId, matchedUserIds);
  const matchedAt = new Date().toISOString();
  await admin.from('event_guest_lists').update({ matched_at: matchedAt }).eq('id', guestListId);

  return loadGuestListStatus(admin, beaconId, {
    guestListId,
    source,
    matchedAt,
    uploaded: matched.length,
    matchedCount: matchedUserIds.length,
    teasers: teaserCount,
  });
}

export async function rematchGuestList(
  admin: SupabaseClient,
  beaconId: string,
): Promise<GuestListStatus | null> {
  const { data: list } = await admin
    .from('event_guest_lists')
    .select('id, source, matched_at')
    .eq('beacon_id', beaconId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!isRecord(list) || typeof list.id !== 'string') return null;

  const { data: rows, error } = await admin
    .from('event_guest_list_entries')
    .select('id, email, instagram_handle, email_hash')
    .eq('guest_list_id', list.id);
  if (error) throw new Error(error.message);

  const parsed: ParsedGuestEntry[] = (rows ?? []).map((row) => ({
    email: isRecord(row) && typeof row.email === 'string' ? row.email : null,
    instagram_handle: isRecord(row) && typeof row.instagram_handle === 'string' ? row.instagram_handle : null,
    email_hash: isRecord(row) && typeof row.email_hash === 'string' ? row.email_hash : null,
  }));
  const matched = await matchGuestEntries(admin, parsed);
  for (let i = 0; i < matched.length; i += 1) {
    const row = rows?.[i];
    if (!isRecord(row) || typeof row.id !== 'string') continue;
    await admin
      .from('event_guest_list_entries')
      .update({
        matched_user_id: matched[i].matched_user_id,
        match_confidence: matched[i].match_confidence,
      })
      .eq('id', row.id);
  }

  const matchedUserIds = matched
    .map((e) => e.matched_user_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const teaserCount = await regenerateEventTeasers(admin, beaconId, matchedUserIds);
  const matchedAt = new Date().toISOString();
  await admin.from('event_guest_lists').update({ matched_at: matchedAt }).eq('id', list.id);

  return loadGuestListStatus(admin, beaconId, {
    guestListId: list.id,
    source: typeof list.source === 'string' ? (list.source as GuestListSource) : 'manual',
    matchedAt,
    uploaded: matched.length,
    matchedCount: matchedUserIds.length,
    teasers: teaserCount,
  });
}

async function loadGuestListStatus(
  admin: SupabaseClient,
  beaconId: string,
  seed: {
    guestListId: string;
    source: GuestListSource;
    matchedAt: string | null;
    uploaded: number;
    matchedCount: number;
    teasers: number;
  },
): Promise<GuestListStatus> {
  const { data: entries } = await admin
    .from('event_guest_list_entries')
    .select('id, email, instagram_handle, matched_user_id, match_confidence')
    .eq('guest_list_id', seed.guestListId)
    .order('created_at', { ascending: true });

  void beaconId;
  return {
    guest_list_id: seed.guestListId,
    source: seed.source,
    uploaded: seed.uploaded,
    matched: seed.matchedCount,
    teasers: seed.teasers,
    matched_at: seed.matchedAt,
    entries: (entries ?? []).map((row) => ({
      id: isRecord(row) && typeof row.id === 'string' ? row.id : '',
      email_truncated: isRecord(row) && typeof row.email === 'string' ? truncateEmail(row.email) : null,
      instagram_handle: isRecord(row) && typeof row.instagram_handle === 'string' ? row.instagram_handle : null,
      matched: isRecord(row) && typeof row.matched_user_id === 'string',
      match_confidence: isRecord(row) && typeof row.match_confidence === 'string' ? row.match_confidence : 'none',
    })),
  };
}

export async function loadLatestGuestListStatus(
  admin: SupabaseClient,
  beaconId: string,
): Promise<GuestListStatus | null> {
  const { data: list } = await admin
    .from('event_guest_lists')
    .select('id, source, matched_at')
    .eq('beacon_id', beaconId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!isRecord(list) || typeof list.id !== 'string') return null;

  const [{ count: uploaded }, { count: matchedCount }, { count: teaserCount }] = await Promise.all([
    admin
      .from('event_guest_list_entries')
      .select('id', { count: 'exact', head: true })
      .eq('guest_list_id', list.id),
    admin
      .from('event_guest_list_entries')
      .select('id', { count: 'exact', head: true })
      .eq('guest_list_id', list.id)
      .not('matched_user_id', 'is', null),
    admin.from('event_teasers').select('id', { count: 'exact', head: true }).eq('beacon_id', beaconId),
  ]);

  return loadGuestListStatus(admin, beaconId, {
    guestListId: list.id,
    source: typeof list.source === 'string' ? (list.source as GuestListSource) : 'manual',
    matchedAt: typeof list.matched_at === 'string' ? list.matched_at : null,
    uploaded: uploaded ?? 0,
    matchedCount: matchedCount ?? 0,
    teasers: teaserCount ?? 0,
  });
}

export { parseGuestCsv, parseGuestEntries };
