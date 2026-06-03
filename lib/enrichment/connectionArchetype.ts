import type {
  AcademicEra,
  SolarState,
  TemporalBlock,
} from '@/lib/enrichment/vibeCaptureSchema';
import type { ZoningCategory } from '@/lib/enrichment/spatialZoning';
import { isNightlifeVenue, type ParsedSemanticLocation } from '@/lib/enrichment/spatialZoning';

export type ArchetypeInput = {
  dayName: string;
  dayOfWeek: number;
  temporal_block: TemporalBlock;
  solar_state: SolarState;
  academic_era: AcademicEra;
  zoningCategory: ZoningCategory;
  parsed: ParsedSemanticLocation;
};

/**
 * Multi-variable heuristic tree → localized connection archetype label.
 */
export function resolveConnectionArchetype(input: ArchetypeInput): string {
  const {
    dayName,
    dayOfWeek,
    temporal_block,
    academic_era,
    zoningCategory,
    parsed,
  } = input;

  const amenity = (parsed.amenity ?? parsed.osmType ?? '').toLowerCase();
  const isCafe = amenity === 'cafe' || amenity === 'coffee_shop';
  const isSunday = dayOfWeek === 0;
  const isWeekendNight = (dayOfWeek === 5 || dayOfWeek === 6) && temporal_block === 'After Hours';

  // Heuristic 1: Sunday wind-down in residential
  if (
    isSunday &&
    temporal_block === 'Late Night Wind Down' &&
    zoningCategory === 'Residential / Dorm'
  ) {
    return 'The Sunday Wind-Down';
  }

  // Heuristic 2: Finals midnight grind
  if (
    academic_era === 'Finals Week' &&
    temporal_block === 'After Hours' &&
    zoningCategory === 'Institutional / Study Space'
  ) {
    return 'The Finals Midnight Grind';
  }

  // Heuristic 3: Morning coffee run
  if (temporal_block === 'Morning Routine' && isCafe) {
    return 'The Morning Coffee Run';
  }

  // Heuristic 4: Night out
  if (isWeekendNight && isNightlifeVenue(parsed)) {
    return 'Night Out';
  }

  // Extended heuristics
  if (academic_era === 'Syllabus Week' && zoningCategory === 'Institutional / Study Space') {
    return 'The Syllabus Week Meetup';
  }

  if (temporal_block === 'Lunch Hour' && zoningCategory === 'Third Place / Social Space') {
    return 'The Lunch Break Connection';
  }

  if (
    temporal_block === 'Post-Work / Dinner Vibe' &&
    zoningCategory === 'Third Place / Social Space'
  ) {
    return 'The Dinner Table Link';
  }

  if (
    input.solar_state === 'Golden Hour' &&
    zoningCategory === 'Outdoor / Green Space'
  ) {
    return 'The Golden Hour Walk';
  }

  if (
    academic_era === 'Midterms Grind' &&
    zoningCategory === 'Institutional / Study Space'
  ) {
    return 'The Midterms Study Session';
  }

  if (zoningCategory === 'Transitional Transit Zone') {
    return 'The Crossroads Encounter';
  }

  if (temporal_block === 'Dawn Patrol') {
    return 'The Dawn Patrol';
  }

  // Fallback: compose from day + temporal block
  return `The ${dayName} ${temporal_block}`;
}
