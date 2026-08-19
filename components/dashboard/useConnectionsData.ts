'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import {
  extractEventContext,
  extractNoiseSummary,
  extractWeatherSummary,
  normalizeNoiseCategory,
} from '@/lib/dashboard/connectionExtras';
import { parseConnectionEncounters } from '@/lib/dashboard/connectionEncounters';
import { formatDetailedEncounterLocation } from '@/lib/location/detailedEncounterLocation';
import { computeIntentOverlapLabel } from '@/lib/dashboard/intentOverlap';
import {
  normalizeAvailabilityIntentRows,
  type AvailabilityIntentRow,
} from '@/lib/userProfile/availability';
import type { DisplayNamesBatchResponse } from '@/types/database-connections';
import { normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Loading and live-patching of the dashboard's connection records: the
 * `bundle=dashboard` fetch (with display names, avatars, and availability
 * overlap), single-row realtime patches, the initial-load gate, the
 * post-connection vibe prompt, and the Supabase realtime subscription.
 * Extracted verbatim from DashboardView.
 */
export function useConnectionsData({
  user,
  getAuthHeaders,
  connectionRecords,
  setConnectionRecords,
  setMapConnectionRecords,
  setArchivedConnectionIds,
  setCoreConnectionIds,
  setConnectionsInitialLoadComplete,
  updateArchivedIds,
  setVibePromptConnection,
}: {
  user: any;
  getAuthHeaders: () => Promise<HeadersInit>;
  connectionRecords: ConnectionRecord[];
  setConnectionRecords: Dispatch<SetStateAction<ConnectionRecord[]>>;
  setMapConnectionRecords: Dispatch<SetStateAction<ConnectionRecord[]>>;
  setArchivedConnectionIds: Dispatch<SetStateAction<Set<string>>>;
  setCoreConnectionIds: Dispatch<SetStateAction<Set<string>>>;
  setConnectionsInitialLoadComplete: Dispatch<SetStateAction<boolean>>;
  updateArchivedIds: (updater: (prev: Set<string>) => Set<string>) => void;
  setVibePromptConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
}) {
  const seenConnectionIdsRef = useRef<Set<string> | null>(null);
  const connectionsLoadUserIdRef = useRef<string | null>(null);
  const mapRowToRecordRef = useRef<((conn: Record<string, unknown>) => ConnectionRecord) | null>(null);
  const realtimePatchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConnections = useCallback(async () => {
    const markInitialLoadComplete = () => {
      setConnectionsInitialLoadComplete(true);
    };

    if (!user?.id) {
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      setArchivedConnectionIds(new Set());
      markInitialLoadComplete();
      return;
    }

    const supabase = getSupabaseClient();

    const setEmptyConnections = () => {
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      setArchivedConnectionIds(new Set());
    };

    try {
      const headers = await getAuthHeaders();
      const bundleRes = await fetch('/api/connections?bundle=dashboard', {
        headers,
        cache: 'no-store',
      });

      if (!bundleRes.ok) {
        const errPayload = (await bundleRes.json().catch(() => ({}))) as { error?: string };
        console.error('Error fetching connections:', errPayload.error || bundleRes.statusText);
        setEmptyConnections();
        return;
      }

      const bundlePayload = (await bundleRes.json()) as {
        active?: Record<string, unknown>[];
        archived?: Record<string, unknown>[];
        map?: Record<string, unknown>[];
        core?: string[];
      };

      const activeRows = bundlePayload.active ?? [];
      const archivedRows = bundlePayload.archived ?? [];
      const mapRows = bundlePayload.map ?? [];

      const archivedIds = new Set(
        archivedRows
          .map((r) => r.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      setArchivedConnectionIds(archivedIds);
      const coreIds = new Set(
        (bundlePayload.core ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      setCoreConnectionIds(coreIds);
      const archiveKey = user.id ? `click:archived-connections:${user.id}` : null;
      if (archiveKey && typeof window !== 'undefined') {
        localStorage.setItem(archiveKey, JSON.stringify(Array.from(archivedIds)));
      }

      const mergedById = new Map<string, Record<string, unknown>>();
      for (const row of activeRows) {
        const id = row.id;
        if (typeof id === 'string') mergedById.set(id, row);
      }
      for (const row of archivedRows) {
        const id = row.id;
        if (typeof id === 'string' && !mergedById.has(id)) mergedById.set(id, row);
      }

      const merged = Array.from(mergedById.values());
      if (merged.length === 0) {
        setEmptyConnections();
        return;
      }

      const mergedIdSet = new Set(merged.map((r) => r.id).filter((id): id is string => typeof id === 'string'));
      const rowsForDisplayNames = [...merged, ...mapRows.filter((r) => typeof r.id === 'string' && !mergedIdSet.has(r.id))];

      const otherUserIds = rowsForDisplayNames
        .flatMap((conn) => {
          const ids = conn.user_ids;
          if (!Array.isArray(ids)) return [] as string[];
          return ids.filter((x): x is string => typeof x === 'string' && x !== user.id);
        })
        .filter((id, i, arr) => arr.indexOf(id) === i);

      let userNameMap: Record<string, string> = {};
      let userImageMap: Record<string, string | null> = {};
      if (otherUserIds.length > 0) {
        try {
          const nameRes = await fetch('/api/users/display-names', {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ userIds: otherUserIds }),
          });
          if (nameRes.ok) {
            const payload = (await nameRes.json()) as DisplayNamesBatchResponse;
            userNameMap = payload.names ?? {};
            const batchImages = payload.images;
            if (batchImages && typeof batchImages === 'object') {
              for (const [uid, raw] of Object.entries(batchImages)) {
                if (typeof uid !== 'string' || !uid.trim()) continue;
                userImageMap[uid] =
                  typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
              }
            }
          }
        } catch {
          // Fall through to direct DB lookup below.
        }

        if (Object.keys(userNameMap).length === 0 && supabase) {
          let usersData: any[] | null = null;
          const { data: d1, error: e1 } = await supabase
            .from('users')
            .select('id, name, full_name, first_name, last_name, email, image')
            .in('id', otherUserIds);
          if (!e1 && d1) {
            usersData = d1;
          } else {
            const { data: d2 } = await supabase
              .from('users')
              .select('id, name, email, image')
              .in('id', otherUserIds);
            usersData = d2;
          }

          if (usersData) {
            userNameMap = Object.fromEntries(
              usersData.map((u: any) => {
                const fromParts = [u.first_name, u.last_name]
                  .filter((x: unknown) => typeof x === 'string' && (x as string).trim())
                  .join(' ')
                  .trim();
                const resolvedName =
                  fromParts ||
                  (typeof u.full_name === 'string' && u.full_name.trim()) ||
                  (typeof u.name === 'string' && u.name.trim()) ||
                  (typeof u.email === 'string' && u.email.includes('@') ? u.email.split('@')[0] : '') ||
                  '';
                return [u.id, resolvedName];
              })
            );
            userImageMap = Object.fromEntries(
              usersData.map((u: any) => {
                const img = typeof u.image === 'string' && u.image.trim() ? u.image.trim() : null;
                return [u.id, img] as [string, string | null];
              }),
            );
          }
        }
      }

      let selfIntentRows: AvailabilityIntentRow[] = [];
      const peerIntentByUserId = new Map<string, AvailabilityIntentRow[]>();
      if (supabase) {
        try {
          const { data: mine } = await supabase
            .from('availability_intents')
            .select('id,timeframe,intent_tag,expires_at')
            .eq('user_id', user.id);
          selfIntentRows = normalizeAvailabilityIntentRows(mine ?? []);

          if (otherUserIds.length > 0) {
            const { data: peerRows, error: peerIntentErr } = await supabase
              .from('availability_intents')
              .select('user_id,id,timeframe,intent_tag,expires_at')
              .in('user_id', otherUserIds);
            if (!peerIntentErr && peerRows) {
              const acc = new Map<string, unknown[]>();
              for (const row of peerRows as Record<string, unknown>[]) {
                const uid = row.user_id;
                if (typeof uid !== 'string' || !uid.trim()) continue;
                const cur = acc.get(uid) ?? [];
                cur.push(row);
                acc.set(uid, cur);
              }
              for (const [uid, rows] of acc) {
                peerIntentByUserId.set(uid, normalizeAvailabilityIntentRows(rows));
              }
            }
          }
        } catch {
          /* overlap badges are optional */
        }
      }

      const mapRowToRecord = (conn: Record<string, unknown>): ConnectionRecord => {
        const userIds = (conn.user_ids as string[] | undefined) ?? [];
        const otherUserId = userIds.find((id) => id !== user.id);
        const otherUserName = (otherUserId && userNameMap[otherUserId]) || null;

        const encs = parseConnectionEncounters(conn);
        const latestEnc = encs[0];
        const originEnc = encs.length > 0 ? encs[encs.length - 1] : undefined;

        const encounterPlaceLine =
          latestEnc != null
            ? formatDetailedEncounterLocation({
                locationName: latestEnc.locationName,
                displayLocation: latestEnc.displayLocation,
                semanticLocation: latestEnc.semanticLocation,
              })
            : undefined;
        const encounterFallbackLabel = (() => {
          if (!latestEnc) return undefined;
          const a = latestEnc.locationName?.trim();
          const b = latestEnc.displayLocation?.trim();
          if (a && b && a !== b) return `${a} · ${b}`;
          return a || b || undefined;
        })();
        const syntheticSemantic = encounterPlaceLine ?? encounterFallbackLabel;
        /** When crossings exist, never prefer stale `connections.semantic_location` over encounter-derived labels. */
        const connForExtras: Record<string, unknown> =
          encs.length > 0 && syntheticSemantic
            ? { ...conn, semantic_location: syntheticSemantic }
            : encs.length > 0
              ? { ...conn }
              : conn;

        // Map pins: stored geo_location, then first-meet (origin) GPS — never latest beacon crossing.
        let geoLoc: { latitude: number; longitude: number } | undefined;
        const geo = conn.geo_location as Record<string, unknown> | null | undefined;
        if (geo && typeof geo === 'object') {
          const rawLat = geo.lat ?? geo.latitude;
          const rawLon = geo.lon ?? geo.longitude ?? geo.lng ?? geo.long;
          const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
          const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
          if (
            typeof lat === 'number' && typeof lon === 'number' &&
            isFinite(lat) && isFinite(lon) &&
            !(lat === 0 && lon === 0)
          ) {
            geoLoc = { latitude: lat, longitude: lon };
          }
        }
        if (!geoLoc) {
          const pinEnc = originEnc ?? latestEnc;
          if (
            pinEnc &&
            typeof pinEnc.gpsLat === 'number' &&
            typeof pinEnc.gpsLon === 'number' &&
            Number.isFinite(pinEnc.gpsLat) &&
            Number.isFinite(pinEnc.gpsLon) &&
            !(pinEnc.gpsLat === 0 && pinEnc.gpsLon === 0)
          ) {
            geoLoc = { latitude: pinEnc.gpsLat, longitude: pinEnc.gpsLon };
          }
        }

        const displayName =
          (typeof otherUserName === 'string' && otherUserName.trim()) ||
          'Connection';

        const rawDateValue = conn.created_utc || conn.created || conn.created_at || 0;
        const createdMs =
          typeof conn.created === 'number' && Number.isFinite(conn.created)
            ? conn.created
            : new Date(typeof rawDateValue === 'number' ? rawDateValue : String(rawDateValue)).getTime();

        const dateMetValue =
          originEnc?.encounteredAt ??
          conn.created_utc ??
          conn.created ??
          conn.created_at ??
          0;

        const overlapLabel =
          otherUserId != null && otherUserId.length > 0
            ? computeIntentOverlapLabel(selfIntentRows, peerIntentByUserId.get(otherUserId) ?? [])
            : null;

        const peerAvatarUrl =
          otherUserId != null && otherUserId.length > 0 ? userImageMap[otherUserId] ?? null : null;

        return {
          id: String(conn.id),
          otherUserId,
          userIds,
          name: displayName,
          avatarUrl: peerAvatarUrl,
          dateMet: new Date(typeof dateMetValue === 'number' ? dateMetValue : String(dateMetValue ?? 0)),
          location:
            syntheticSemantic ??
            (encs.length > 0
              ? 'A new location'
              : typeof conn.semantic_location === 'string' && conn.semantic_location.trim()
                ? conn.semantic_location.trim()
                : 'A new location'),
          context: extractEventContext(connForExtras),
          weatherSummary: extractWeatherSummary(connForExtras),
          noiseSummary: extractNoiseSummary(connForExtras),
          noiseCategory: normalizeNoiseCategory(connForExtras),
          status: normalizeConnectionStatus(conn),
          lastMessageAt:
            typeof conn.last_message_at === 'number' && Number.isFinite(conn.last_message_at)
              ? conn.last_message_at
              : null,
          connectionCreatedMs: Number.isFinite(createdMs) ? createdMs : undefined,
          hasBegun: conn.has_begun === true,
          expiryState: typeof conn.expiry_state === 'string' ? conn.expiry_state : null,
          geo_location: geoLoc,
          encounters:
            encs.length > 0
              ? encs.map((e) => ({
                  id: e.id,
                  encounteredAt: new Date(e.encounteredAt),
                  locationName: e.locationName?.trim() || undefined,
                  displayLocation: e.displayLocation?.trim() || undefined,
                  semanticLocation: e.semanticLocation,
                  contextTags: e.contextTags,
                  ...(typeof e.exactNoiseLevelDb === 'number' && Number.isFinite(e.exactNoiseLevelDb)
                    ? { exactNoiseLevelDb: e.exactNoiseLevelDb }
                    : {}),
                  ...(typeof e.exactBarometricElevationM === 'number' &&
                  Number.isFinite(e.exactBarometricElevationM)
                    ? { exactBarometricElevationM: e.exactBarometricElevationM }
                    : {}),
                  ...(typeof e.relativeAltitudeM === 'number' && Number.isFinite(e.relativeAltitudeM)
                    ? { relativeAltitudeM: e.relativeAltitudeM }
                    : {}),
                  ...(typeof e.luxLevel === 'number' && Number.isFinite(e.luxLevel) ? { luxLevel: e.luxLevel } : {}),
                  ...(typeof e.motionVariance === 'number' && Number.isFinite(e.motionVariance)
                    ? { motionVariance: e.motionVariance }
                    : {}),
                  ...(typeof e.compassAzimuth === 'number' && Number.isFinite(e.compassAzimuth)
                    ? { compassAzimuth: e.compassAzimuth }
                    : {}),
                  ...(typeof e.batteryLevel === 'number' &&
                  Number.isFinite(e.batteryLevel) &&
                  e.batteryLevel >= 0 &&
                  e.batteryLevel <= 100
                    ? { batteryLevel: e.batteryLevel }
                    : {}),
                  ...(e.weatherSnapshot != null ? { weatherSnapshot: e.weatherSnapshot } : {}),
                }))
              : undefined,
          intentOverlapLabel: overlapLabel,
          source: typeof conn.source === 'string' ? conn.source : 'handshake',
          knownSince: typeof conn.known_since === 'string' ? conn.known_since : null,
        };
      };

      mapRowToRecordRef.current = mapRowToRecord;

      const records: ConnectionRecord[] = merged
        .map(mapRowToRecord)
        .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime());

      const mapRecords: ConnectionRecord[] = mapRows
        .map(mapRowToRecord)
        .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime());

      setConnectionRecords(records);
      setMapConnectionRecords(mapRecords);
    } catch (err) {
      console.error('Unexpected error fetching connections:', err);
      setEmptyConnections();
    } finally {
      markInitialLoadComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, getAuthHeaders]);

  const patchConnectionRow = useCallback(
    async (connectionId: string) => {
      if (!user?.id || !connectionId.trim()) return;
      const mapper = mapRowToRecordRef.current;
      if (!mapper) {
        void loadConnections();
        return;
      }
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/connections?connectionId=${encodeURIComponent(connectionId.trim())}`,
          { headers, cache: 'no-store' },
        );
        if (!res.ok) {
          if (res.status === 404) {
            setConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
            setMapConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
            return;
          }
          void loadConnections();
          return;
        }
        const payload = (await res.json()) as { connection?: Record<string, unknown> };
        const conn = payload.connection;
        if (!conn || typeof conn.id !== 'string') {
          setConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
          setMapConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
          return;
        }
        const record = mapper(conn);
        const sortByDate = (a: ConnectionRecord, b: ConnectionRecord) =>
          b.dateMet.getTime() - a.dateMet.getTime();
        setConnectionRecords((prev) => {
          const next = prev.filter((r) => r.id !== record.id);
          next.push(record);
          return next.sort(sortByDate);
        });
        setMapConnectionRecords((prev) => {
          const next = prev.filter((r) => r.id !== record.id);
          next.push(record);
          return next.sort(sortByDate);
        });
      } catch {
        void loadConnections();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAuthHeaders, loadConnections, user?.id],
  );

  const scheduleConnectionPatch = useCallback(
    (connectionId: string) => {
      if (realtimePatchDebounceRef.current) clearTimeout(realtimePatchDebounceRef.current);
      realtimePatchDebounceRef.current = setTimeout(() => {
        realtimePatchDebounceRef.current = null;
        void patchConnectionRow(connectionId);
      }, 250);
    },
    [patchConnectionRow],
  );

  // Fetch user connections (initial load + refetch). Reset gate when the signed-in user changes.
  useEffect(() => {
    if (!user?.id) return;
    if (connectionsLoadUserIdRef.current !== user.id) {
      connectionsLoadUserIdRef.current = user.id;
      setConnectionsInitialLoadComplete(false);
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      const archiveKey = `click:archived-connections:${user.id}`;
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(archiveKey);
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
              setArchivedConnectionIds(
                new Set(
                  parsed.filter((id): id is string => typeof id === 'string' && id.length > 0),
                ),
              );
            } else {
              setArchivedConnectionIds(new Set());
            }
          } else {
            setArchivedConnectionIds(new Set());
          }
        } catch {
          setArchivedConnectionIds(new Set());
        }
      } else {
        setArchivedConnectionIds(new Set());
      }
    }
    void loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadConnections]);

  // After a new connection appears, offer optional venue vibe capture (Business Insights).
  useEffect(() => {
    if (!user?.id) return;
    if (connectionRecords.length === 0) return;
    const ids = connectionRecords.map((c) => c.id);
    if (seenConnectionIdsRef.current === null) {
      seenConnectionIdsRef.current = new Set(ids);
      return;
    }
    const newOnes = connectionRecords.filter((c) => !seenConnectionIdsRef.current!.has(c.id));
    newOnes.forEach((c) => seenConnectionIdsRef.current!.add(c.id));
    const eligible = newOnes.find((c) => {
      if (typeof window === 'undefined') return false;
      try {
        return !window.sessionStorage.getItem(`click:vibe-skip:${c.id}`);
      } catch {
        return true;
      }
    });
    if (eligible) {
      setVibePromptConnection((cur) => cur ?? eligible);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionRecords, user?.id]);

  // Stay in sync when a connection row or junction table changes (patch single row when possible).
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const uid = user.id;
    const channel = supabase
      .channel(`dashboard-connections:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          const connectionId = typeof row?.id === 'string' ? row.id : null;
          if (connectionId) scheduleConnectionPatch(connectionId);
          else void loadConnections();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_archives',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId === 'string' && connectionId.length > 0) {
            updateArchivedIds((prev) => new Set(prev).add(connectionId));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_archives',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.old as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId === 'string' && connectionId.length > 0) {
            updateArchivedIds((prev) => {
              const next = new Set(prev);
              next.delete(connectionId);
              return next;
            });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_hidden',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId !== 'string' || connectionId.length === 0) return;
          setConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
          setMapConnectionRecords((prev) => prev.filter((r) => r.id !== connectionId));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_hidden',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.old as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId === 'string' && connectionId.length > 0) {
            scheduleConnectionPatch(connectionId);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_core',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId === 'string' && connectionId.length > 0) {
            setCoreConnectionIds((prev) => new Set(prev).add(connectionId));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_core',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.old as { connection_id?: string } | undefined;
          const connectionId = row?.connection_id;
          if (typeof connectionId === 'string' && connectionId.length > 0) {
            setCoreConnectionIds((prev) => {
              const next = new Set(prev);
              next.delete(connectionId);
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      if (realtimePatchDebounceRef.current) clearTimeout(realtimePatchDebounceRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConnections, scheduleConnectionPatch, updateArchivedIds, user?.id]);

  return { loadConnections, patchConnectionRow, scheduleConnectionPatch };
}
