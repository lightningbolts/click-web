/** Token normalization, GPS proximity, and graph matching for async proximity binds. */

export const PROXIMITY_MATCH_MAX_M = 15;
export const RECENT_CONNECTION_LOCK_MS = 15 * 1000;
export const ENCOUNTER_DEBOUNCE_MAX_M = 50;
export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
export const EXTENDED_HANGOUT_TAG = 'Extended Hangout';
export const MOTION_VARIANCE_ACTIVE_THRESHOLD = 1.25;

export type HandshakeRowLite = {
  id: string;
  user_id: string;
  my_token: unknown;
  heard_tokens: unknown;
  lat: unknown;
  lon: unknown;
  created_at: string;
  lux_level?: unknown;
  motion_variance?: unknown;
  compass_azimuth?: unknown;
  battery_level?: unknown;
  sensor_payload?: unknown;
};

export function normalizeToken(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const d = t.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return d.length === 4 ? d : null;
}

export function parseHeardTokensField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeToken).filter((t): t is string => t != null);
}

export function parseDetectedDevicesField(raw: unknown): string[] {
  return parseHeardTokensField(raw);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Union of audio heard_tokens + BLE detected_devices stored on a pending row. */
export function peerEvidenceTokens(row: HandshakeRowLite): string[] {
  const heard = parseHeardTokensField(row.heard_tokens);
  const payload = isRecord(row.sensor_payload) ? row.sensor_payload : null;
  const bleFromPayload = parseDetectedDevicesField(
    payload?.detected_devices_ble ?? payload?.detected_devices,
  );
  return [...new Set([...heard, ...bleFromPayload])];
}

export function hasProximityPeerEvidence(heardTokens: string[], detectedDevices: string[]): boolean {
  return heardTokens.length > 0 || detectedDevices.length > 0;
}

/** Tokens shared by every row in a candidate clique (1-to-N group overlap). */
export function sharedOverlappingPeerTokens(rows: HandshakeRowLite[]): string[] {
  if (rows.length === 0) return [];
  const sets = rows.map((r) => new Set(peerEvidenceTokens(r)));
  const [first, ...rest] = sets;
  if (!first) return [];
  const shared: string[] = [];
  for (const token of first) {
    if (rest.every((s) => s.has(token))) {
      shared.push(token);
    }
  }
  return shared;
}

export function rowMyTokenNorm(row: HandshakeRowLite): string | null {
  return normalizeToken(row.my_token);
}

export function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function finiteBatteryPct(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 100) return null;
  return r;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function tokenSetsIntersect(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  for (const x of b) {
    if (sa.has(x)) return true;
  }
  return false;
}

/** Skip distance check if either side lacks usable GPS. */
export function gpsPairWithinProximityMax(
  la: number | null,
  lo: number | null,
  lb: number | null,
  mb: number | null,
): boolean {
  if (la == null || lo == null || lb == null || mb == null) return true;
  if (la === 0 && lo === 0) return true;
  if (lb === 0 && mb === 0) return true;
  return haversineMeters(la, lo, lb, mb) <= PROXIMITY_MATCH_MAX_M;
}

export function tokenEvidenceBetweenRows(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
  const ta = rowMyTokenNorm(a);
  const tb = rowMyTokenNorm(b);
  if (!ta || !tb) return false;
  const heardA = peerEvidenceTokens(a);
  const heardB = peerEvidenceTokens(b);
  const mutual = heardA.includes(tb) && heardB.includes(ta);
  if (mutual) return true;
  return tokenSetsIntersect(heardA, heardB);
}

/** Async matching: no sliding time window — token + GPS evidence only. */
export function handshakeRowsLinked(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
  if (!tokenEvidenceBetweenRows(a, b)) return false;
  const la = finiteNumber(a.lat);
  const lo = finiteNumber(a.lon);
  const lb = finiteNumber(b.lat);
  const mb = finiteNumber(b.lon);
  return gpsPairWithinProximityMax(la, lo, lb, mb);
}

export function latestHandshakeRowPerUser(rows: HandshakeRowLite[]): Map<string, HandshakeRowLite> {
  const m = new Map<string, HandshakeRowLite>();
  for (const r of rows) {
    if (!r?.user_id) continue;
    const uid = String(r.user_id);
    const prev = m.get(uid);
    const t = Date.parse(String(r.created_at));
    const prevT = prev ? Date.parse(String(prev.created_at)) : -1;
    if (!prev || (Number.isFinite(t) && t >= prevT)) {
      m.set(uid, r);
    }
  }
  return m;
}

export function buildUserAdjacency(nodes: HandshakeRowLite[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (u: string, v: string) => {
    if (u === v) return;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      if (handshakeRowsLinked(a, b)) {
        addEdge(String(a.user_id), String(b.user_id));
      }
    }
  }
  return adj;
}

export function bfsComponent(startUserId: string, adj: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  const q: string[] = [];
  if (!adj.has(startUserId)) return out;
  out.add(startUserId);
  q.push(startUserId);
  while (q.length) {
    const u = q.pop()!;
    for (const v of adj.get(u) ?? []) {
      if (!out.has(v)) {
        out.add(v);
        q.push(v);
      }
    }
  }
  return out;
}

export function twelveHourUtcBlockId(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / TWELVE_HOURS_MS);
}

export function utcTimeOfDayLabelFromMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function isDuplicateKeyError(err: { message?: string; code?: string } | null): boolean {
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

export function isEncounterRateLimitError(
  err: { message?: string; details?: string; hint?: string } | null,
): boolean {
  if (!err) return false;
  const combined = [err.message ?? '', err.details ?? '', err.hint ?? ''].join(' ');
  return combined.includes('encounter_rate_limit_3h');
}

export function mergeContextTagLists(client: string[], derived: string[]): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const t of client) add(t);
  for (const t of derived) add(t);
  return out;
}

export function buildVibeContextTags(input: {
  lux: number | null;
  selfMotion: number | null;
  peerMotion: number | null;
  selfAz: number | null;
  peerAz: number | null;
  battery: number | null;
}): string[] {
  const tags: string[] = [];
  const add = (t: string) => {
    if (!tags.includes(t)) tags.push(t);
  };
  const { lux, selfMotion, peerMotion, selfAz, peerAz, battery } = input;
  if (lux != null) {
    if (lux < 15) add('Dimly Lit');
    if (lux > 10_000) add('Bright Outdoors');
  }
  if (selfAz != null && peerAz != null) {
    const raw = Math.abs(selfAz - peerAz);
    const diff = Math.min(raw, 360 - raw);
    if (diff >= 160 && diff <= 200) add('Met Face-to-Face');
  }
  if (battery != null && battery <= 5) add('Living on the Edge (Low Battery)');
  if (
    selfMotion != null &&
    peerMotion != null &&
    selfMotion > MOTION_VARIANCE_ACTIVE_THRESHOLD &&
    peerMotion > MOTION_VARIANCE_ACTIVE_THRESHOLD
  ) {
    add('Active/Moving');
  }
  return tags;
}

export function sameMemberSet(a: string[] | undefined | null, b: string[]): boolean {
  const aa = [...new Set(a ?? [])].sort();
  const bb = [...new Set(b)].sort();
  return aa.length === bb.length && aa.every((x, i) => x === bb[i]);
}
