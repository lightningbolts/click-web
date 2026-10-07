import { appleMapsUrl, eventMapsDestination, googleMapsUrl, type MapsDestination } from '@/lib/events/mapsLinks';
import { publicEventFixture } from '../../helpers/publicEventFixture';

const pinned: MapsDestination = { lat: 47.66, lng: -122.31, name: 'Cafe Allegro', address: '4214 University Way NE' };
const unpinned: MapsDestination = { lat: null, lng: null, name: 'Cafe Allegro', address: '4214 University Way NE' };

describe('maps links', () => {
  it('routes to the pin for directions and shows it named otherwise', () => {
    expect(new URL(appleMapsUrl(pinned, true)).searchParams.get('daddr')).toBe('47.66,-122.31');
    const place = new URL(appleMapsUrl(pinned, false)).searchParams;
    expect([place.get('ll'), place.get('q')]).toEqual(['47.66,-122.31', 'Cafe Allegro']);
    expect(googleMapsUrl(pinned, true)).toBe('https://www.google.com/maps/dir/?api=1&destination=47.66%2C-122.31');
    expect(googleMapsUrl(pinned, false)).toBe('https://www.google.com/maps/search/?api=1&query=47.66%2C-122.31');
  });

  it('searches the address, else the name, without a pin', () => {
    expect(new URL(appleMapsUrl(unpinned, false)).searchParams.get('q')).toBe('4214 University Way NE');
    expect(new URL(googleMapsUrl({ ...unpinned, address: ' ' }, true)).searchParams.get('destination')).toBe('Cafe Allegro');
  });

  it('describes an event, or nothing when it has no place at all', () => {
    expect(eventMapsDestination(publicEventFixture())).toEqual(pinned);
    expect(eventMapsDestination(publicEventFixture({ location_name: null }))?.name).toBe('4214 University Way NE');
    expect(eventMapsDestination(publicEventFixture({ location_name: null, address: null }))?.name).toBe('Event location');
    expect(eventMapsDestination(publicEventFixture({ location_name: null, address: null, latitude: null, longitude: null }))).toBeNull();
  });
});
