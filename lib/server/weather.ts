/**
 * Open-Meteo (no key) as the one weather source: encounter snapshots and the event location's
 * "right now / at start" line share these code tables.
 */

/** WMO weather code → short label. */
export function openMeteoCodeToLabel(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Clear';
}

/** WMO weather code → icon key (clients map it to their own symbols). */
export function openMeteoCodeToIcon(code: number): string {
  if (code === 0) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'clear';
}

export type WeatherReading = {
  temperature_c: number;
  condition: string;
  icon: string;
  is_day: boolean;
  /** Hourly forecasts only. */
  precipitation_probability: number | null;
};

export type PlaceWeather = { now: WeatherReading | null; at: (WeatherReading & { time: string }) | null };

const TIMEOUT_MS = 3_500;
/** Open-Meteo's hourly forecast reaches 16 days; a week out is where it's still worth showing. */
export const FORECAST_HORIZON_MS = 7 * 86_400_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function reading(temperature: unknown, code: unknown, isDay: unknown, precipitation: unknown = null): WeatherReading | null {
  if (!finite(temperature)) return null;
  const wmo = finite(code) ? code : 0;
  return {
    temperature_c: Math.round(temperature * 10) / 10,
    condition: openMeteoCodeToLabel(wmo),
    icon: openMeteoCodeToIcon(wmo),
    is_day: isDay !== 0,
    precipitation_probability: finite(precipitation) ? precipitation : null,
  };
}

/**
 * Current weather at a place and, when `atMs` is ahead and within the horizon, the hourly forecast
 * for then. Never throws: weather is a nicety, so failures read as `{ now: null, at: null }`.
 */
export async function fetchPlaceWeather(
  lat: number,
  lng: number,
  atMs: number | null,
  nowMs: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceWeather> {
  const empty: PlaceWeather = { now: null, at: null };
  const wantsForecast = atMs != null && atMs > nowMs + 60 * 60_000 && atMs - nowMs <= FORECAST_HORIZON_MS;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    '&current=temperature_2m,weather_code,is_day&timezone=UTC' +
    (wantsForecast ? '&hourly=temperature_2m,weather_code,is_day,precipitation_probability&forecast_days=8' : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return empty;
    const raw = (await res.json()) as {
      current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown };
      hourly?: { time?: unknown[]; temperature_2m?: unknown[]; weather_code?: unknown[]; is_day?: unknown[]; precipitation_probability?: unknown[] };
    };
    const now = raw.current ? reading(raw.current.temperature_2m, raw.current.weather_code, raw.current.is_day) : null;
    let at: PlaceWeather['at'] = null;
    if (wantsForecast && Array.isArray(raw.hourly?.time)) {
      // The hour the event starts in (times are UTC "YYYY-MM-DDTHH:00").
      const target = new Date(Math.floor(atMs! / 3_600_000) * 3_600_000).toISOString().slice(0, 13);
      const index = raw.hourly.time.findIndex((t) => typeof t === 'string' && t.startsWith(target));
      if (index >= 0) {
        const hourly = raw.hourly;
        const r = reading(hourly.temperature_2m?.[index], hourly.weather_code?.[index], hourly.is_day?.[index], hourly.precipitation_probability?.[index]);
        if (r) at = { ...r, time: `${target}:00:00.000Z` };
      }
    }
    return { now, at };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}
