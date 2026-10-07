const added: Array<{ el: HTMLElement; lngLat: [number, number]; removed: boolean }> = [];
jest.mock('@/lib/maps/maplibre', () => ({
  Marker: class {
    rec: { el: HTMLElement; lngLat: [number, number]; removed: boolean };
    constructor({ element }: { element: HTMLElement }) {
      this.rec = { el: element, lngLat: [0, 0], removed: false };
    }
    setLngLat(ll: [number, number]) {
      this.rec.lngLat = ll;
      return this;
    }
    addTo() {
      added.push(this.rec);
      return this;
    }
    remove() {
      this.rec.removed = true;
    }
  },
}));

import { MapMarkerLayer, pinLabel, renderPin, safeImageUrl, type PinModel } from '@/components/map/mapMarkers';
import { collectPins, selectionKey } from '@/components/map/collectPins';

const person: PinModel = { kind: 'person', key: 'conn:c1', lng: 1, lat: 2, seed: 'u1', name: 'Ada Lovelace', avatarUrl: null, count: 1, connIds: ['c1'] };
const cluster: PinModel = { kind: 'cluster', key: 's:c7', lng: 1, lat: 2, count: 12, source: 's', clusterId: 7, label: '12 people you met here, zoom in', network: true };
const event: PinModel = { kind: 'event', key: 'b:e1', lng: 1, lat: 2, id: 'e1', title: 'Launch', imageUrl: 'https://img/x.jpg', live: true };

beforeEach(() => {
  added.length = 0;
});

describe('map DOM pins (spec §7.5)', () => {
  it('draws people as avatars (initials without a photo) with a count for shared spots', () => {
    const el = document.createElement('button');
    renderPin(el, { ...person, count: 3 });
    expect(el.className).toContain('map-pin-person');
    expect(el.querySelector('.map-pin-face')?.textContent).toBe('AL');
    expect(el.querySelector('.map-pin-count')?.textContent).toBe('3');
    expect(el.getAttribute('aria-label')).toBe('Ada Lovelace and 2 more');
  });

  it('draws events as thumbnails with a LIVE pill and clusters as count capsules', () => {
    const el = document.createElement('button');
    renderPin(el, event);
    expect(el.querySelector('.map-pin-live')?.textContent).toBe('LIVE');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://img/x.jpg');
    expect(pinLabel(event)).toBe('Launch, live now');
    renderPin(el, cluster);
    expect(el.textContent).toBe('12');
  });

  it('keeps the marker element\'s own classes when a pin re-renders', () => {
    const el = document.createElement('button');
    el.classList.add('maplibregl-marker', 'maplibregl-marker-anchor-center');
    renderPin(el, person);
    renderPin(el, { ...event, live: false });
    expect([...el.classList].sort()).toEqual(
      ['map-pin', 'map-pin-event', 'maplibregl-marker', 'maplibregl-marker-anchor-center'].sort(),
    );
  });

  it('marks people and their clusters as the network layer, under every other pin', () => {
    const el = document.createElement('button');
    renderPin(el, person);
    expect(el.classList.contains('map-pin-network')).toBe(true);
    renderPin(el, cluster);
    expect(el.classList.contains('map-pin-network')).toBe(true);
    renderPin(el, { ...cluster, network: false });
    expect(el.classList.contains('map-pin-network')).toBe(false);
    renderPin(el, event);
    expect(el.classList.contains('map-pin-network')).toBe(false);
  });

  it('never puts non-http image URLs on a pin', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('data:image/png;base64,xx')).toBeNull();
    expect(safeImageUrl('https://cdn/x.png')).toBe('https://cdn/x.png');
  });

  it('diffs by key: reuses unchanged pins, re-renders changed ones, removes gone ones', () => {
    const onSelect = jest.fn();
    const layer = new MapMarkerLayer({ project: () => ({ x: 0, y: 0 }) } as never, { onSelect });
    layer.sync([person, cluster]);
    expect(added).toHaveLength(2);
    const personEl = added[0].el;
    layer.sync([{ ...person, lng: 5 }, event]);
    expect(added).toHaveLength(3);
    expect(added[0].el).toBe(personEl);
    expect(added[0].lngLat).toEqual([5, 2]);
    expect(added[1].removed).toBe(true);
    expect(layer.size()).toBe(2);

    layer.setSelected('b:e1');
    expect(added[2].el.hasAttribute('data-selected')).toBe(true);
    added[2].el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'b:e1' }));
  });

  it('collects clusters and points from loaded tiles, deduped and enriched', () => {
    const feat = (props: Record<string, unknown>, at = [1, 2]) => ({ geometry: { type: 'Point', coordinates: at }, properties: props });
    const tiles: Record<string, unknown[]> = {
      conn: [feat({ cluster_id: 3, people: 9 }), feat({ connIds: 'c1', count: 1 }), feat({ connIds: 'c1', count: 1 })],
      off: [feat({ id: 'e1', title: 'Launch' }), feat({ cluster_id: 4, point_count: 5 })],
      places: [feat({ id: 'p1' })],
    };
    const map = { getSource: (id: string) => (tiles[id] ? {} : undefined), querySourceFeatures: (id: string) => tiles[id] ?? [] };
    const pins = collectPins(map as never, { connections: 'conn', beacons: ['off'], places: 'places' }, {
      connections: [{ id: 'c1', name: 'Ada', otherUserId: 'u1', avatarUrl: 'https://a/1.jpg' } as never],
      beacons: [{ id: 'e1', beacon_type: 'event', metadata: {} } as never],
      places: [{ id: 'p1', name: 'Café', photo_url: null, pulse: { state: 'live' } } as never],
      showPeople: true,
      nowMs: 0,
    });
    expect(pins.map((p) => p.key)).toEqual(['conn:c3', 'off:c4', 'conn:c1', 'b:e1', 'p:p1']);
    expect(pins[0]).toMatchObject({ kind: 'cluster', count: 9, network: true });
    expect(pins[1]).toMatchObject({ kind: 'cluster', count: 5, network: false });
    expect(pins[2]).toMatchObject({ kind: 'person', avatarUrl: 'https://a/1.jpg' });
    expect(pins[4]).toMatchObject({ kind: 'place', live: true });
  });

  it('maps selections to pin keys', () => {
    expect(selectionKey({ kind: 'connections', ids: ['a', 'b'] })).toBe('conn:a,b');
    expect(selectionKey({ kind: 'place', id: 'p' })).toBe('p:p');
    expect(selectionKey(null)).toBeNull();
  });
});
