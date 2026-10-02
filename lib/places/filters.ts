/**
 * Place filters (§4.6): the replacement for display thresholds. AND across fields, OR within list
 * fields, input order preserved. iOS `PlaceFilters.matches` must keep identical semantics; both
 * suites assert against `__tests__/fixtures/places/filters.json`.
 */

import { isPlaceCategory } from '@/lib/places/categories';
import type { EnergyLabel, PlaceCategory, PlaceSummary } from '@/lib/places/types';

export type PlaceFilters = {
  categories: PlaceCategory[];
  pulseNow: boolean;
  minReports: number;
  energies: EnergyLabel[];
  eventsToday: boolean;
  openNow: boolean;
  beenHere: boolean;
  clicksBeenHere: boolean;
  hasHub: boolean;
  hereNow: boolean;
};

export const NO_FILTERS: PlaceFilters = Object.freeze({
  categories: [],
  pulseNow: false,
  minReports: 0,
  energies: [],
  eventsToday: false,
  openNow: false,
  beenHere: false,
  clicksBeenHere: false,
  hasHub: false,
  hereNow: false,
}) as PlaceFilters;

const ENERGIES: readonly EnergyLabel[] = ['chill', 'steady', 'lively', 'packed'];

type FilterablePlace = Pick<
  PlaceSummary,
  'category' | 'pulse' | 'events_today_count' | 'next_event' | 'open_now' | 'viewer' | 'hub_id' | 'here_now_count'
>;

export function matchesPlaceFilters(place: FilterablePlace, f: PlaceFilters): boolean {
  const live = place.pulse?.state === 'live';
  if (f.categories.length > 0 && !f.categories.includes(place.category)) return false;
  if (f.pulseNow && !live) return false;
  if (f.minReports > 0 && !(live && place.pulse.report_count >= f.minReports)) return false;
  if (f.energies.length > 0 && !(live && place.pulse.label != null && f.energies.includes(place.pulse.label))) {
    return false;
  }
  if (f.eventsToday && !(place.events_today_count > 0 || place.next_event?.is_live === true)) return false;
  if (f.openNow && place.open_now !== true) return false;
  if (f.beenHere && place.viewer?.has_history !== true) return false;
  if (f.clicksBeenHere && !((place.viewer?.connections_been_here_count ?? 0) > 0)) return false;
  if (f.hasHub && place.hub_id == null) return false;
  if (f.hereNow && !(place.here_now_count > 0)) return false;
  return true;
}

export function applyPlaceFilters<T extends FilterablePlace>(places: T[], filters: PlaceFilters): T[] {
  return places.filter((p) => matchesPlaceFilters(p, filters));
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(params: ParamSource, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const v = params[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function flag(params: ParamSource, key: string): boolean {
  const v = readParam(params, key);
  return v === '1' || v === 'true';
}

function list(params: ParamSource, key: string): string[] {
  const v = readParam(params, key);
  if (!v) return [];
  return [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/** Unknown values are ignored, never an error. */
export function parsePlaceFilters(params: ParamSource): PlaceFilters {
  const minRaw = Number(readParam(params, 'min_reports'));
  return {
    categories: list(params, 'category').filter(isPlaceCategory),
    pulseNow: flag(params, 'pulse_now'),
    minReports: Number.isFinite(minRaw) && minRaw > 0 ? Math.floor(minRaw) : 0,
    energies: list(params, 'energy').filter((e): e is EnergyLabel => (ENERGIES as readonly string[]).includes(e)),
    eventsToday: flag(params, 'events_today'),
    openNow: flag(params, 'open_now'),
    beenHere: flag(params, 'been_here'),
    clicksBeenHere: flag(params, 'clicks_been_here'),
    hasHub: flag(params, 'has_hub'),
    hereNow: flag(params, 'here_now'),
  };
}
