/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockFetchPlaceWeather = jest.fn();

jest.mock('@/lib/server/rateLimit', () => ({
  READ_HEAVY_RATE_LIMIT_BINDING: 'READ_HEAVY',
  isRateLimited: jest.fn().mockResolvedValue(false),
}));
jest.mock('@/lib/server/weather', () => ({
  fetchPlaceWeather: (...args: unknown[]) => mockFetchPlaceWeather(...args),
}));

import { GET } from '@/app/api/geo/weather/route';

const get = (query: string) => GET(new NextRequest(`https://click.example/api/geo/weather?${query}`));

describe('GET /api/geo/weather', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchPlaceWeather.mockResolvedValue({ now: null, at: null });
  });

  it.each(['', 'lat=&lng=', 'lat=47.6', 'lng=-122.3', 'lat=91&lng=0', 'lat=x&lng=1'])(
    'rejects missing, empty or out-of-range coordinates (%s)',
    async (query) => {
      expect((await get(query)).status).toBe(400);
      expect(mockFetchPlaceWeather).not.toHaveBeenCalled();
    },
  );

  it('accepts the equator and the prime meridian', async () => {
    expect((await get('lat=0&lng=0')).status).toBe(200);
    expect(mockFetchPlaceWeather).toHaveBeenCalledWith(0, 0, null);
  });

  it('rejects an unparseable start time', async () => {
    expect((await get('lat=47.6&lng=-122.3&at=soon')).status).toBe(400);
  });
});
