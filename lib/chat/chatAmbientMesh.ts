/**
 * Ambient mesh color derivation for chat (mirrors mobile ChatAmbientColorSeeds).
 * Uses the **newest** crossing on the connection (`encounters[0]` when present).
 */

import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { normalizeWeatherSnapshot } from '@/lib/userProfile/formatSharedConnection';

export type AmbientRgb = { r: number; g: number; b: number };

type PrecipKind =
  | 'clear'
  | 'fog'
  | 'partly_cloudy'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'storm'
  | 'thunder'
  | 'snow'
  | 'unknown';

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function lerp(a: AmbientRgb, b: AmbientRgb, t: number): AmbientRgb {
  const x = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * x,
    g: a.g + (b.g - a.g) * x,
    b: a.b + (b.b - a.b) * x,
  };
}

function hueFromSemantic(semantic: string): number {
  if (!semantic) return 0.55;
  let h = 0;
  const H = 17;
  const M = 0x7fff;
  for (let i = 0; i < semantic.length; i++) {
    h = H * h + semantic.charCodeAt(i);
  }
  const u = Math.abs(h) & M;
  return u / M;
}

function classifyPrecipitation(condition: string, icon: string): PrecipKind {
  const w = condition;
  const i = icon;
  if (w.includes('thunder') || w.includes('lightning') || i.includes('thunder')) return 'thunder';
  if (w.includes('tornado') || w.includes('hurricane')) return 'thunder';
  if (w.includes('blizzard') || w.includes('snow') || w.includes('sleet') || w.includes('ice pellets') || w.includes('hail') || i.includes('snow'))
    return 'snow';
  if (w.includes('storm') || w.includes('squall') || i.includes('storm')) return 'storm';
  if (w.includes('drizzle') || w.includes('light rain') || w.includes('light shower')) return 'drizzle';
  if (w.includes('shower') || w.includes('rain') || w.includes('wet') || i.includes('rain') || i.includes('shower')) return 'rain';
  if (w.includes('overcast') || w.includes('cloudy') || w.includes('grey') || w.includes('gray') || w.includes('mostly cloud') || i.includes('cloud'))
    return 'cloudy';
  if (w.includes('partly') || w.includes('few clouds') || w.includes('scattered') || w.includes('broken clouds') || i.includes('partly'))
    return 'partly_cloudy';
  if (w.includes('fog') || w.includes('mist') || w.includes('haze') || i.includes('fog')) return 'fog';
  if (w.includes('clear') || w.includes('fair') || w.includes('sun') || w.includes('dry') || i.includes('clear') || i.includes('sun')) return 'clear';
  if (w || i) return 'unknown';
  return 'unknown';
}

function baseRgb(kind: PrecipKind, hue01: number): AmbientRgb {
  const warm = { r: 0.98, g: 0.72, b: 0.35 };
  const cool = { r: 0.35, g: 0.62, b: 0.95 };
  const mist = { r: 0.62, g: 0.68, b: 0.78 };
  const drizzle = { r: 0.52, g: 0.68, b: 0.88 };
  const rain = { r: 0.32, g: 0.52, b: 0.88 };
  const storm = { r: 0.22, g: 0.3, b: 0.48 };
  const thunder = { r: 0.38, g: 0.26, b: 0.58 };
  const snow = { r: 0.82, g: 0.9, b: 1.0 };
  const cloudy = { r: 0.5, g: 0.54, b: 0.6 };
  const partly = { r: 0.62, g: 0.7, b: 0.82 };
  switch (kind) {
    case 'thunder':
      return thunder;
    case 'storm':
      return storm;
    case 'rain':
      return rain;
    case 'drizzle':
      return drizzle;
    case 'cloudy':
      return cloudy;
    case 'partly_cloudy':
      return partly;
    case 'fog':
      return mist;
    case 'snow':
      return snow;
    case 'clear':
      return warm;
    default:
      return lerp(cool, mist, hue01);
  }
}

function applyTemperatureBias(rgb: AmbientRgb, tempC: number | undefined): AmbientRgb {
  if (tempC == null || !Number.isFinite(tempC)) return rgb;
  const bias = Math.max(0, Math.min(1, (tempC + 12) / 54));
  const cold = { r: 0.22, g: 0.48, b: 0.92 };
  const hot = { r: 0.98, g: 0.52, b: 0.28 };
  return lerp(rgb, lerp(cold, hot, bias), 0.16);
}

function applyWindSpeedDesat(rgb: AmbientRgb, windKph: number | undefined): AmbientRgb {
  if (windKph == null || !Number.isFinite(windKph) || windKph < 0) return rgb;
  const amount = Math.min(1, windKph / 72) * 0.14;
  const gray = { r: 0.55, g: 0.56, b: 0.58 };
  return lerp(rgb, gray, amount);
}

function windDirectionNudge(deg: number | undefined): AmbientRgb {
  if (deg == null || !Number.isFinite(deg)) return { r: 0, g: 0, b: 0 };
  const r = ((((deg % 360) + 360) % 360) * Math.PI) / 180;
  return {
    r: Math.sin(r) * 0.05,
    g: Math.cos(r) * 0.04,
    b: (Math.sin(r) - Math.cos(r)) * 0.025,
  };
}

function channelNudge(rgb: AmbientRgb, d: AmbientRgb, w: number): AmbientRgb {
  const x = Math.max(0, Math.min(1, w));
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    r: clamp(rgb.r + d.r * x),
    g: clamp(rgb.g + d.g * x),
    b: clamp(rgb.b + d.b * x),
  };
}

function latestWeatherRecord(connection: ConnectionRecord): Record<string, unknown> | null {
  const enc = connection.encounters?.[0];
  return normalizeWeatherSnapshot(enc?.weatherSnapshot);
}

/** rgba() strings for CSS gradients (low alpha — mesh tint only). */
export function deriveAmbientMeshCss(connection: ConnectionRecord, isGroupClique: boolean): {
  c1: string;
  c2: string;
  c3: string;
} {
  if (isGroupClique) {
    return {
      c1: 'rgba(56,108,235,0.22)',
      c2: 'rgba(115,184,255,0.18)',
      c3: 'rgba(31,72,140,0.2)',
    };
  }

  const ws = latestWeatherRecord(connection);
  const condition =
    (typeof ws?.condition === 'string' && ws.condition.trim()) ||
    (connection.weatherSummary?.split('·')[0]?.trim() ?? '') ||
    '';
  const icon = typeof ws?.iconCode === 'string' ? ws.iconCode.toLowerCase() : '';
  const wLower = condition.toLowerCase();
  const kind = classifyPrecipitation(wLower, icon);
  const semantic = (connection.location ?? '').toLowerCase();
  const hue01 = hueFromSemantic(semantic);

  let primary = baseRgb(kind, hue01);
  if (kind === 'unknown') {
    const w = `${wLower} ${icon}`;
    if (w.includes('wind')) primary = lerp(primary, { r: 0.4, g: 0.58, b: 0.82 }, 0.55);
    if (w.includes('green') || w.includes('tree')) primary = lerp(primary, { r: 0.32, g: 0.72, b: 0.48 }, 0.35);
  }

  const tempC = num(ws?.temperatureCelsius);
  const windKph = num(ws?.windSpeedKph);
  const windDeg = (() => {
    const d = ws?.windDirectionDegrees;
    if (typeof d === 'number' && Number.isFinite(d)) return Math.round(d);
    if (typeof d === 'string' && d.trim()) {
      const n = Number(d.trim());
      return Number.isFinite(n) ? Math.round(n) : undefined;
    }
    return undefined;
  })();

  primary = applyTemperatureBias(primary, tempC);
  primary = applyWindSpeedDesat(primary, windKph);

  const cool = { r: 0.35, g: 0.62, b: 0.95 };
  const warm = { r: 0.98, g: 0.72, b: 0.35 };
  let secondary = lerp(primary, cool, 0.32);
  let tertiary = lerp(primary, warm, 0.22 + 0.14 * hue01);
  const wn = windDirectionNudge(windDeg);
  secondary = channelNudge(secondary, wn, 0.45);
  tertiary = channelNudge(tertiary, { r: -wn.r, g: wn.g, b: wn.b }, 0.4);

  const a = 0.2;
  const toRgba = (c: AmbientRgb) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  return { c1: toRgba(primary), c2: toRgba(secondary), c3: toRgba(tertiary) };
}
