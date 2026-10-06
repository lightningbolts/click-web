/** @jest-environment node */
import { fetchPlaceWeather } from '@/lib/server/weather';

const NOW = Date.parse('2026-10-06T18:20:00.000Z');

function respond(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;
}

describe('fetchPlaceWeather', () => {
  it('reads current conditions', async () => {
    const fetchImpl = respond({ current: { temperature_2m: 17.46, weather_code: 61, is_day: 1 } });
    const weather = await fetchPlaceWeather(47.6, -122.3, null, NOW, fetchImpl);
    expect(weather).toEqual({
      now: { temperature_c: 17.5, condition: 'Rain', icon: 'rain', is_day: true, precipitation_probability: null },
      at: null,
    });
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).not.toContain('hourly');
  });

  it('adds the forecast for the hour an upcoming event starts', async () => {
    const fetchImpl = respond({
      current: { temperature_2m: 12, weather_code: 0, is_day: 1 },
      hourly: {
        time: ['2026-10-08T01:00', '2026-10-08T02:00'],
        temperature_2m: [9, 8],
        weather_code: [3, 95],
        is_day: [0, 0],
        precipitation_probability: [10, 70],
      },
    });
    const weather = await fetchPlaceWeather(47.6, -122.3, Date.parse('2026-10-08T02:30:00.000Z'), NOW, fetchImpl);
    expect(weather.at).toEqual({
      temperature_c: 8, condition: 'Storm', icon: 'thunder', is_day: false, precipitation_probability: 70,
      time: '2026-10-08T02:00:00.000Z',
    });
  });

  it('skips the forecast for times too soon or too far out', async () => {
    for (const at of [NOW + 30 * 60_000, NOW + 9 * 86_400_000]) {
      const fetchImpl = respond({ current: { temperature_2m: 12, weather_code: 0, is_day: 1 } });
      await fetchPlaceWeather(47.6, -122.3, at, NOW, fetchImpl);
      expect((fetchImpl as jest.Mock).mock.calls[0][0]).not.toContain('hourly');
    }
  });

  it('never throws', async () => {
    expect(await fetchPlaceWeather(0, 0, null, NOW, respond({}, false))).toEqual({ now: null, at: null });
    const failing = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    expect(await fetchPlaceWeather(0, 0, null, NOW, failing)).toEqual({ now: null, at: null });
  });
});
