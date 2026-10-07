import { formatTemperature, leadReading, usesFahrenheit, weatherSummary, type PlaceWeather } from '@/lib/events/eventWeather';

const reading = (temperature_c: number, condition: string, precipitation_probability: number | null = null) => ({
  temperature_c,
  condition,
  icon: 'cloudy',
  is_day: true,
  precipitation_probability,
});

describe('event weather', () => {
  it('picks °F by region', () => {
    expect(usesFahrenheit('en-US')).toBe(true);
    expect(usesFahrenheit('en')).toBe(true);
    expect(usesFahrenheit('en-GB')).toBe(false);
    expect(usesFahrenheit('fr')).toBe(false);
    expect(usesFahrenheit('not a locale')).toBe(true);
  });

  it('formats in the reader unit', () => {
    expect(formatTemperature(17.8, true)).toBe('64°');
    expect(formatTemperature(17.8, false)).toBe('18°');
  });

  it('says now, then the start, with the chance only from 30%', () => {
    const w = { now: reading(17.8, 'Cloudy'), at: { ...reading(14.4, 'Rain', 70), time: '' } } as PlaceWeather;
    expect(weatherSummary(w, { fahrenheit: true, startLabel: '7:00 PM' })).toBe('64° Cloudy now · 58° Rain at 7:00 PM, 70% chance of rain');
    const dry = { ...w, at: { ...w.at!, precipitation_probability: 20 } } as PlaceWeather;
    expect(weatherSummary(dry, { fahrenheit: true, startLabel: '7:00 PM' })).toBe('64° Cloudy now · 58° Rain at 7:00 PM');
    expect(weatherSummary(w, { fahrenheit: false, startLabel: null })).toBe('18° Cloudy now');
    expect(weatherSummary({ now: null, at: null } as PlaceWeather, { fahrenheit: true, startLabel: null })).toBeNull();
    expect(leadReading(w)).toBe(w.at);
    expect(leadReading({ ...w, at: null } as PlaceWeather)).toBe(w.now);
  });
});
