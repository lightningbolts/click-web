import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configNumber } from '@/lib/server/featureFlags';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import {
  DEFAULT_RECONNECT_CONFIG,
  pickReconnectNudge,
  reconnectNearbyCopy,
  type PeerEncounter,
  type ReconnectConfig,
} from '@/lib/nudges/reconnectNearby';

export function reconnectConfigFrom(config: Record<string, unknown>): ReconnectConfig {
  const d = DEFAULT_RECONNECT_CONFIG;
  return {
    radiusMeters: configNumber(config, 'radius_meters', d.radiusMeters, { min: 25, max: 1000 }),
    minAgeDays: configNumber(config, 'min_age_days', d.minAgeDays, { min: 1, max: 365 }),
    cooldownDays: configNumber(config, 'cooldown_days', d.cooldownDays, { min: 1, max: 365 }),
    frequentPlaceDays: configNumber(config, 'frequent_place_days', d.frequentPlaceDays, { min: 2, max: 60 }),
    frequentWindowDays: configNumber(config, 'frequent_window_days', d.frequentWindowDays, { min: 7, max: 365 }),
  };
}

type UserRow = { id: string; name: string | null; first_name: string | null; image: string | null; ghost_mode?: boolean | null };

export type ReconnectNudgePayload = {
  id: string;
  connection_id: string;
  user: { id: string; name: string; avatar_url: string | null };
  met_at: string;
  place_name: string | null;
  title: string;
  body: string;
};

async function payloadFor(
  admin: SupabaseClient,
  row: { id: string; connection_id: string; encounter_id: string | null },
  peerId: string,
  encounter: { atMs: number; placeName: string | null },
  nowMs: number,
): Promise<ReconnectNudgePayload | null> {
  const { data } = await admin.from('users').select('id, name, first_name, image').eq('id', peerId).maybeSingle();
  const user = data as UserRow | null;
  if (!user) return null;
  const first = user.first_name?.trim() || user.name?.trim()?.split(/\s+/)[0] || 'someone';
  const copy = reconnectNearbyCopy(first, encounter.atMs, nowMs);
  return {
    id: row.id,
    connection_id: row.connection_id,
    user: { id: user.id, name: user.name?.trim() || first, avatar_url: user.image },
    met_at: new Date(encounter.atMs).toISOString(),
    place_name: encounter.placeName,
    ...copy,
  };
}

/**
 * The viewer's reconnection card for where they are now (coarse), or null. A card already shown
 * today is returned again (still open) so the Home card is stable; otherwise at most one new pick,
 * recorded so the daily limit and per-connection cooldown hold across devices.
 */
export async function reconnectNudgeFor(
  admin: SupabaseClient,
  viewerId: string,
  here: { lat: number; lng: number },
  config: ReconnectConfig,
  nowMs: number = Date.now(),
): Promise<ReconnectNudgePayload | null> {
  const peers = await loadViewerPeers(admin, viewerId);
  const since = new Date(nowMs - Math.max(config.cooldownDays, 1) * 86_400_000).toISOString();
  const [shownRes, mutesRes] = await Promise.all([
    admin.from('place_nudges').select('id, connection_id, encounter_id, shown_at, acted_at, dismissed_at').eq('user_id', viewerId).gt('shown_at', since),
    admin.from('nudge_mutes').select('target_type, target_id').eq('user_id', viewerId),
  ]);
  if (shownRes.error || mutesRes.error) throw new Error(`reconnect nearby: ${shownRes.error?.message ?? mutesRes.error?.message}`);
  const shown = (shownRes.data ?? []) as Array<{ id: string; connection_id: string; encounter_id: string | null; shown_at: string; acted_at: string | null; dismissed_at: string | null }>;

  // Today's card, if still open and still someone the viewer is connected to.
  const today = shown.find((s) => nowMs - Date.parse(s.shown_at) < 86_400_000);
  if (today) {
    if (today.acted_at || today.dismissed_at || !today.encounter_id) return null;
    const peer = [...peers.values()].find((p) => p.connectionId === today.connection_id);
    const { data: e } = await admin.from('connection_encounters').select('encountered_at, location_name').eq('id', today.encounter_id).maybeSingle();
    const enc = e as { encountered_at: string; location_name: string | null } | null;
    if (!peer || !enc) return null;
    return payloadFor(admin, today, peer.userId, { atMs: Date.parse(enc.encountered_at), placeName: enc.location_name }, nowMs);
  }

  if (peers.size === 0) return null;
  const peerByConnection = new Map([...peers.values()].map((p) => [p.connectionId, p.userId]));
  const [encRes, ghostRes] = await Promise.all([
    admin
      .from('connection_encounters')
      .select('id, connection_id, encountered_at, gps_lat, gps_lon, location_name')
      .in('connection_id', [...peerByConnection.keys()])
      .not('gps_lat', 'is', null)
      .not('gps_lon', 'is', null)
      .limit(5000),
    admin.from('users').select('id').in('id', [...peers.keys()]).eq('ghost_mode', true),
  ]);
  if (encRes.error) throw new Error(`reconnect nearby encounters: ${encRes.error.message}`);
  const ghosted = new Set(((ghostRes.data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const encounters: PeerEncounter[] = ((encRes.data ?? []) as Array<Record<string, unknown>>).flatMap((r) => {
    const peerId = peerByConnection.get(String(r.connection_id));
    const lat = Number(r.gps_lat);
    const lng = Number(r.gps_lon);
    if (!peerId || ghosted.has(peerId) || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      encounterId: String(r.id),
      connectionId: String(r.connection_id),
      peerId,
      atMs: Date.parse(String(r.encountered_at)),
      lat,
      lng,
      placeName: typeof r.location_name === 'string' ? r.location_name : null,
    }];
  });
  const mutes = (mutesRes.data ?? []) as Array<{ target_type: string; target_id: string }>;
  const pick = pickReconnectNudge({
    here,
    nowMs,
    encounters,
    shown: shown.map((s) => ({ connectionId: s.connection_id, shownAtMs: Date.parse(s.shown_at), dismissed: s.dismissed_at != null })),
    mutedPeople: new Set(mutes.filter((m) => m.target_type === 'person').map((m) => m.target_id)),
    mutedPlaces: new Set(mutes.filter((m) => m.target_type === 'place').map((m) => m.target_id)),
    config,
  });
  if (!pick) return null;

  const { data: inserted, error } = await admin
    .from('place_nudges')
    .insert({ user_id: viewerId, connection_id: pick.encounter.connectionId, encounter_id: pick.encounter.encounterId })
    .select('id, connection_id, encounter_id')
    .single();
  if (error) throw new Error(`place_nudges insert: ${error.message}`);
  return payloadFor(
    admin,
    inserted as { id: string; connection_id: string; encounter_id: string | null },
    pick.encounter.peerId,
    pick.encounter,
    nowMs,
  );
}
