import {
  Activity,
  Battery,
  Cloud,
  Compass,
  Gauge,
  Moon,
  Mountain,
  Sun,
  Thermometer,
  Volume2,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import {
  normalizeWeatherSnapshot,
  prettyElevationCategoryKey,
  prettyNoiseCategoryKey,
  type SharedConnectionPayload,
} from '@/lib/userProfile/formatSharedConnection';
import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';
import type { UserProfilePayload } from '@/lib/userProfile/profileModalTypes';

export function displayName(u: UserProfilePayload['user']): string {
  const fn = u.first_name?.trim();
  const ln = u.last_name?.trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
  return u.full_name?.trim() || u.name?.trim() || 'Member';
}

export function coerceSharedConnection(raw: unknown): SharedConnectionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== 'string') return null;
  const cr = o.created;
  const created = typeof cr === 'number' && Number.isFinite(cr) ? cr : 0;
  return { ...(o as object), id, created } as SharedConnectionPayload;
}

export function formatEncounterWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function encounterMetricPills(enc: ConnectionEncounterRow): { metricKey: string; Icon: LucideIcon; label: string }[] {
  const out: { metricKey: string; Icon: LucideIcon; label: string }[] = [];
  const ws = normalizeWeatherSnapshot(enc.weatherSnapshot);
  if (ws) {
    const cond =
      typeof ws.condition === 'string' && ws.condition.trim()
        ? ws.condition.trim()
        : typeof ws.iconCode === 'string' && ws.iconCode.trim()
          ? ws.iconCode.trim().replace(/^./, (c) => c.toUpperCase())
          : null;
    if (cond) out.push({ metricKey: 'wx-cond', Icon: Cloud, label: cond });

    const temp = typeof ws.temperatureCelsius === 'number' && Number.isFinite(ws.temperatureCelsius)
      ? ws.temperatureCelsius
      : null;
    if (temp != null) {
      const f = Math.round((temp * 9) / 5 + 32);
      out.push({ metricKey: 'temp', Icon: Thermometer, label: `${f}°F (${Math.round(temp)}°C)` });
    }
    const windKph =
      typeof ws.windSpeedKph === 'number' && Number.isFinite(ws.windSpeedKph) ? ws.windSpeedKph : null;
    if (windKph != null) {
      const degRaw = ws.windDirectionDegrees;
      const deg =
        typeof degRaw === 'number' && Number.isFinite(degRaw)
          ? degRaw
          : typeof degRaw === 'string' && degRaw.trim()
            ? Number(degRaw.trim())
            : NaN;
      let suffix = '';
      if (Number.isFinite(deg) && deg >= 0 && deg <= 359) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const x = ((deg % 360) + 360) % 360;
        const idx = (Math.floor((x + 22.5) / 45) % 8 + 8) % 8;
        suffix = ` ${dirs[idx]}`;
      }
      out.push({ metricKey: 'wind', Icon: Wind, label: `${Math.round(windKph)} km/h${suffix}` });
    }
    const p = typeof ws.pressureMslHpa === 'number' && Number.isFinite(ws.pressureMslHpa) ? ws.pressureMslHpa : null;
    if (p != null) {
      out.push({ metricKey: 'hpa', Icon: Gauge, label: `${Math.round(p)} hPa` });
    }
  }
  const noiseCat = enc.noiseLevel?.trim();
  if (noiseCat) {
    out.push({ metricKey: 'noise-cat', Icon: Volume2, label: prettyNoiseCategoryKey(noiseCat) });
  }
  const dbRaw = enc.exactNoiseLevelDb;
  if (dbRaw !== null && dbRaw !== undefined && typeof dbRaw === 'number' && Number.isFinite(dbRaw)) {
    out.push({ metricKey: 'db', Icon: Volume2, label: `${Math.round(dbRaw)} dB` });
  }
  const elCat = enc.elevationCategory?.trim();
  if (elCat) {
    out.push({ metricKey: 'el-cat', Icon: Mountain, label: prettyElevationCategoryKey(elCat) });
  }
  const elRaw =
    enc.relativeAltitudeM !== null &&
    enc.relativeAltitudeM !== undefined &&
    typeof enc.relativeAltitudeM === 'number' &&
    Number.isFinite(enc.relativeAltitudeM)
      ? enc.relativeAltitudeM
      : null;
  if (elRaw !== null) {
    out.push({ metricKey: 'el', Icon: Mountain, label: `${Math.round(elRaw)} m` });
  }
  const luxRaw = enc.luxLevel;
  if (luxRaw !== null && luxRaw !== undefined && typeof luxRaw === 'number' && Number.isFinite(luxRaw) && luxRaw >= 0) {
    const I = luxRaw < 15 ? Moon : Sun;
    out.push({ metricKey: 'lux', Icon: I, label: `${Math.round(luxRaw)} lx` });
  }
  const bat = enc.batteryLevel;
  if (bat !== null && bat !== undefined && typeof bat === 'number' && Number.isFinite(bat) && bat >= 0 && bat <= 100) {
    out.push({ metricKey: 'bat', Icon: Battery, label: `${Math.round(bat)}%` });
  }
  const az = enc.compassAzimuth;
  if (az !== null && az !== undefined && typeof az === 'number' && Number.isFinite(az)) {
    const d = Math.round(((az % 360) + 360) % 360);
    out.push({ metricKey: 'az', Icon: Compass, label: `${d}°` });
  }
  const mv = enc.motionVariance;
  if (mv !== null && mv !== undefined && typeof mv === 'number' && Number.isFinite(mv) && mv >= 0) {
    out.push({ metricKey: 'mv', Icon: Activity, label: mv.toFixed(2) });
  }
  return out;
}

export function ageFromBirthday(birthday?: string | null): number | null {
  if (!birthday?.trim()) return null;
  const d = new Date(birthday.slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const md = t.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
