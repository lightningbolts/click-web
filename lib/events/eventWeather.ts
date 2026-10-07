import type { PlaceWeather, WeatherReading } from '@/lib/server/weather';

export type { PlaceWeather, WeatherReading };

/** Countries that read temperatures in °F. */
const FAHRENHEIT_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);

export function usesFahrenheit(locale: string | undefined): boolean {
  try {
    const region = new Intl.Locale(locale || 'en-US').maximize().region;
    return FAHRENHEIT_REGIONS.has(region ?? 'US');
  } catch {
    return true;
  }
}

/** "64°" / "18°" in the reader's own unit. */
export function formatTemperature(celsius: number, fahrenheit: boolean): string {
  return `${Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius)}°`;
}

/**
 * "64° Cloudy now · 58° Rain at 7 PM, 70% chance of rain" (spec 06 §4, iOS `PlaceWeather.summary`):
 * now first, then the start-hour forecast when there is one; the chance only from 30 %.
 */
export function weatherSummary(
  weather: PlaceWeather,
  opts: { fahrenheit: boolean; startLabel: string | null },
): string | null {
  const parts: string[] = [];
  if (weather.now) parts.push(`${formatTemperature(weather.now.temperature_c, opts.fahrenheit)} ${weather.now.condition} now`);
  if (weather.at && opts.startLabel) {
    let line = `${formatTemperature(weather.at.temperature_c, opts.fahrenheit)} ${weather.at.condition} at ${opts.startLabel}`;
    const chance = weather.at.precipitation_probability;
    if (chance != null && chance >= 30) line += `, ${chance}% chance of rain`;
    parts.push(line);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** The reading that matters most for the icon: the start forecast when there is one. */
export function leadReading(weather: PlaceWeather): WeatherReading | null {
  return weather.at ?? weather.now;
}
