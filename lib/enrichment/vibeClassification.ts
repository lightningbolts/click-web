import { profileSolarState } from '@/lib/enrichment/astronomicalProfiler';
import { profileAcademicCalendar, localCalendarYmd } from '@/lib/enrichment/academicCalendar';
import { resolveConnectionArchetype } from '@/lib/enrichment/connectionArchetype';
import {
  classifyZoningCategory,
  evaluateSpaceProbability,
  formatZoningProfile,
  parseSemanticLocation,
} from '@/lib/enrichment/spatialZoning';
import { classifyTemporalBlock, toLocalEncounterTime } from '@/lib/enrichment/temporalProfiler';
import type {
  VibeCaptureSchema,
  VibeClassificationInput,
} from '@/lib/enrichment/vibeCaptureSchema';

/**
 * Pure structural classification — no I/O, safe for unit tests and parallel async runs.
 */
export function classifyEncounterVibe(input: VibeClassificationInput): VibeCaptureSchema | null {
  const { encountered_at, lat, lon } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const local = toLocalEncounterTime(encountered_at, lon);
  if (!local) return null;

  const solar = profileSolarState(lat, lon, encountered_at);
  if (!solar) return null;

  const temporal_block = classifyTemporalBlock(local.localHour, local.localMinute);
  const localYmd = localCalendarYmd(encountered_at, lon);
  const academic = localYmd
    ? profileAcademicCalendar(localYmd, lat, lon)
    : { academic_era: 'Outside Academic Calendar' as const, academic_term: 'Unknown Term' };

  const parsed = parseSemanticLocation(input.semantic_location);
  const zoningCategory = classifyZoningCategory(parsed);
  const zoning_profile = formatZoningProfile(parsed, zoningCategory);
  const space_probability = evaluateSpaceProbability({
    elevation_category: input.elevation_category,
    lux_level: input.lux_level,
    exact_barometric_elevation_m: input.exact_barometric_elevation_m,
    relative_altitude_m: input.relative_altitude_m,
    noise_level: input.noise_level,
    exact_noise_level_db: input.exact_noise_level_db,
    zoningCategory,
    parsed,
    likelyNighttime: solar.solar_state === 'Nighttime' || solar.solar_state === 'Blue Hour',
  });

  const archetype = resolveConnectionArchetype({
    dayName: local.dayName,
    dayOfWeek: local.dayOfWeek,
    temporal_block,
    solar_state: solar.solar_state,
    academic_era: academic.academic_era,
    zoningCategory,
    parsed,
  });

  return {
    solar_state: solar.solar_state,
    temporal_block,
    academic_era: academic.academic_era,
    academic_term: academic.academic_term,
    zoning_profile,
    space_probability,
    archetype,
    classified_at: new Date().toISOString(),
    neighbourhood: parsed.neighbourhood,
    suburb: parsed.suburb,
  };
}
