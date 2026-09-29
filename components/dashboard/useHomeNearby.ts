'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { displayTitleForBeacon, type MapBeaconRecord } from '@/lib/map/mapBeacons';
import { eventStartAtFromMetadata, eventEndAtFromMetadata, metaString } from '@/lib/events/eventMetadata';
import type { SavedHomeEvent } from '@/lib/dashboard/homeFeed';
import { fetchHomeData } from './HomeActivityRecap';

export function useHomeNearby(userId: string, now: number) {
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState('Open Map to enable nearby discovery.');
  useEffect(() => {
    let cancelled = false;
    let permission: PermissionStatus | undefined;
    function update() {
      if (cancelled) return;
      if (permission?.state !== 'granted') {
        setCoordinates(null);
        setLocationMessage('Turn on location in Map to see what’s live near you.');
        return;
      }
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (!cancelled && permission?.state === 'granted') {
          setCoordinates({ lat: coords.latitude, lon: coords.longitude });
          setLocationMessage('');
        }
      }, () => { if (!cancelled) setLocationMessage('Couldn’t find your location. Open Map to try again.'); }, { maximumAge: 60_000, timeout: 10_000 });
    }
    if (navigator.permissions && navigator.geolocation) {
      void navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (cancelled) return;
        permission = result;
        permission.addEventListener('change', update);
        update();
      }).catch(() => { if (!cancelled) setLocationMessage('Open Map to enable nearby discovery.'); });
    }
    return () => { cancelled = true; permission?.removeEventListener('change', update); };
  }, [userId]);

  const query = coordinates ? `lat=${coordinates.lat}&lon=${coordinates.lon}&radius_meters=15000` : null;
  const result = useSWR(query ? ['home-nearby', userId, query] : null, async ([, , params]) => {
    const [beacons, hubs] = await Promise.all([
      fetchHomeData<{ beacons: MapBeaconRecord[] }>(`/api/beacons?${params}`),
      fetchHomeData<{ hubs: { id: string }[] }>(`/api/hub/nearby?${params}`),
    ]);
    return { beacons: beacons.beacons, hubs: hubs.hubs };
  }, { refreshInterval: 60_000 });
  const beacons = (coordinates ? result.data?.beacons ?? [] : []).filter((b) => {
    if (Date.parse(b.expires_at) <= now) return false;
    // The endpoint also includes the caller's beacons outside the requested radius.
    const rad = Math.PI / 180;
    const a = Math.sin((b.lat - coordinates!.lat) * rad / 2) ** 2 + Math.cos(b.lat * rad) * Math.cos(coordinates!.lat * rad) * Math.sin((b.lng - coordinates!.lon) * rad / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a))) <= 15_000;
  });
  const events: SavedHomeEvent[] = beacons.filter((b) => b.beacon_type === 'event').map((b) => ({
    beacon_id: b.id, title: displayTitleForBeacon(b), created_at: b.created_at, expires_at: b.expires_at,
    event_start_at: eventStartAtFromMetadata(b.metadata), event_end_at: eventEndAtFromMetadata(b.metadata),
    location_name: metaString(b.metadata, 'location_name', 'place_name', 'venue_name'),
  }));
  return { ...result, events, beaconCount: beacons.length, hubCount: result.data?.hubs.length ?? 0, locationMessage };
}
