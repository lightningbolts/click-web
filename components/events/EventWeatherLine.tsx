'use client';

import {
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import useSWR from 'swr';
import { leadReading, usesFahrenheit, weatherSummary, type PlaceWeather, type WeatherReading } from '@/lib/events/eventWeather';

function icon(r: WeatherReading | null): LucideIcon {
  switch (r?.icon) {
    case 'cloudy':
      return r.is_day ? CloudSun : CloudMoon;
    case 'fog':
      return CloudFog;
    case 'drizzle':
      return CloudDrizzle;
    case 'rain':
      return CloudRain;
    case 'snow':
      return CloudSnow;
    case 'thunder':
      return CloudLightning;
    default:
      return r?.is_day === false ? Moon : Sun;
  }
}

async function fetchWeather(url: string): Promise<PlaceWeather | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as PlaceWeather) : null;
}

/**
 * "64° Cloudy now · 58° Rain at 7:00 PM, 70% chance of rain" under the event's address (spec 06 §4).
 * Fetched after the page paints and hidden until (and unless) there's something to say.
 */
export function EventWeatherLine({
  lat,
  lng,
  forecastAt,
  timeZone,
}: {
  lat: number;
  lng: number;
  /** The event's start while it's still ahead: the forecast is for then. */
  forecastAt: string | null;
  timeZone: string;
}) {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lng: lng.toFixed(4) });
  if (forecastAt) params.set('at', forecastAt);
  const { data } = useSWR(`/api/geo/weather?${params}`, fetchWeather, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 600_000,
    shouldRetryOnError: false,
  });
  if (!data) return null;
  const startLabel = forecastAt
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(Date.parse(forecastAt))
    : null;
  const summary = weatherSummary(data, { fahrenheit: usesFahrenheit(navigator.language), startLabel });
  if (!summary) return null;
  return (
    <p className="type-meta content-enter mt-1 flex items-start gap-1.5 text-fg-secondary" data-testid="event-weather">
      {createElement(icon(leadReading(data)), { size: 16, strokeWidth: 1.75, 'aria-hidden': true, className: 'mt-px shrink-0' })}
      <span>{summary}</span>
    </p>
  );
}
