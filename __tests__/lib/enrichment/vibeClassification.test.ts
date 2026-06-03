/**
 * @jest-environment node
 */

import { classifyEncounterVibe } from '@/lib/enrichment/vibeClassification';
import { classifyTemporalBlock } from '@/lib/enrichment/temporalProfiler';
import { classifySolarState, solarElevationDegrees } from '@/lib/enrichment/astronomicalProfiler';
import {
  profileAcademicCalendar,
  isNearUwCampus,
  getFinalsWindow,
  formatYmd,
} from '@/lib/enrichment/academicCalendar';
import {
  parseSemanticLocation,
  classifyZoningCategory,
  evaluateSpaceProbability,
  scoreIndoorLikelihood,
} from '@/lib/enrichment/spatialZoning';
import { resolveConnectionArchetype } from '@/lib/enrichment/connectionArchetype';

describe('temporalProfiler', () => {
  it('maps local hours to temporal blocks', () => {
    expect(classifyTemporalBlock(7, 30)).toBe('Morning Routine');
    expect(classifyTemporalBlock(10, 0)).toBe('Mid-Morning Hub');
    expect(classifyTemporalBlock(13, 0)).toBe('Lunch Hour');
    expect(classifyTemporalBlock(22, 0)).toBe('Late Night Wind Down');
    expect(classifyTemporalBlock(2, 0)).toBe('After Hours');
    expect(classifyTemporalBlock(5, 0)).toBe('Dawn Patrol');
  });
});

describe('astronomicalProfiler', () => {
  it('classifies solar states from elevation', () => {
    expect(classifySolarState(20)).toBe('Daytime');
    expect(classifySolarState(3)).toBe('Golden Hour');
    expect(classifySolarState(-2)).toBe('Civil Twilight');
    expect(classifySolarState(-5)).toBe('Blue Hour');
    expect(classifySolarState(-10)).toBe('Nighttime');
  });

  it('computes finite elevation for Seattle noon', () => {
    const elev = solarElevationDegrees(47.6, -122.3, new Date('2026-06-21T20:00:00.000Z'));
    expect(Number.isFinite(elev)).toBe(true);
  });
});

describe('academicCalendar', () => {
  it('detects UW campus proximity', () => {
    expect(isNearUwCampus(47.655, -122.303)).toBe(true);
    expect(isNearUwCampus(40.7, -74.0)).toBe(false);
  });

  it('places finals the week after instruction ends', () => {
    const spring = {
      id: 'uw-spring-2026',
      title: 'UW Spring Quarter 2026',
      start: '2026-03-30',
      end: '2026-06-05',
    };
    const finals = getFinalsWindow(spring);
    expect(formatYmd(finals.start)).toBe('2026-06-06');
    expect(formatYmd(finals.end)).toBe('2026-06-12');
  });

  it('marks in-session before finals and finals week after quarter end', () => {
    const duringClasses = profileAcademicCalendar('2026-06-01', 47.655, -122.303);
    expect(duringClasses.academic_term).toContain('Spring Quarter 2026');
    expect(duringClasses.academic_era).toBe('In Session');

    const duringFinals = profileAcademicCalendar('2026-06-08', 47.655, -122.303);
    expect(duringFinals.academic_era).toBe('Finals Week');
  });

  it('resolves winter break after autumn finals week', () => {
    const profile = profileAcademicCalendar('2025-12-20', 47.655, -122.303);
    expect(profile.academic_era).toBe('Winter Break');
  });
});

describe('evaluateSpaceProbability', () => {
  it('marks indoor for dorm zoning without lux telemetry', () => {
    const parsed = parseSemanticLocation({
      address: { neighbourhood: 'West Campus', building: 'dormitory' },
    });
    const result = evaluateSpaceProbability({
      zoningCategory: 'Residential / Dorm',
      parsed,
      elevation_category: 'HIGH_RISE',
      likelyNighttime: true,
    });
    expect(result.indoor).toBe(true);
  });

  it('marks outdoor for bright lux and park zoning', () => {
    const parsed = parseSemanticLocation({ class: 'leisure', type: 'park' });
    const score = scoreIndoorLikelihood({
      zoningCategory: 'Outdoor / Green Space',
      parsed,
      lux_level: 15_000,
    });
    expect(score).toBeLessThan(2);
    expect(
      evaluateSpaceProbability({
        zoningCategory: 'Outdoor / Green Space',
        parsed,
        lux_level: 15_000,
      }).indoor,
    ).toBe(false);
  });

  it('marks indoor for well-lit cafe (lux > 100)', () => {
    const parsed = parseSemanticLocation({ class: 'amenity', type: 'cafe' });
    const result = evaluateSpaceProbability({
      zoningCategory: 'Third Place / Social Space',
      parsed,
      lux_level: 500,
    });
    expect(result.indoor).toBe(true);
  });
});

describe('spatialZoning', () => {
  it('parses neighbourhood from Nominatim payload', () => {
    const parsed = parseSemanticLocation({
      class: 'amenity',
      type: 'cafe',
      address: { neighbourhood: 'University District', suburb: 'Seattle' },
    });
    expect(parsed.neighbourhood).toBe('University District');
    expect(classifyZoningCategory(parsed)).toBe('Third Place / Social Space');
  });
});

describe('connectionArchetype', () => {
  it('returns Sunday wind-down archetype', () => {
    const parsed = parseSemanticLocation({ address: { building: 'dormitory' } });
    const label = resolveConnectionArchetype({
      dayName: 'Sunday',
      dayOfWeek: 0,
      temporal_block: 'Late Night Wind Down',
      solar_state: 'Nighttime',
      academic_era: 'In Session',
      zoningCategory: 'Residential / Dorm',
      parsed,
    });
    expect(label).toBe('The Sunday Wind-Down');
  });

  it('returns morning coffee run', () => {
    const parsed = parseSemanticLocation({ class: 'amenity', type: 'cafe' });
    const label = resolveConnectionArchetype({
      dayName: 'Tuesday',
      dayOfWeek: 2,
      temporal_block: 'Morning Routine',
      solar_state: 'Daytime',
      academic_era: 'In Session',
      zoningCategory: 'Third Place / Social Space',
      parsed,
    });
    expect(label).toBe('The Morning Coffee Run');
  });
});

describe('classifyEncounterVibe', () => {
  it('produces full structural payload for UW cafe encounter', () => {
    const result = classifyEncounterVibe({
      encountered_at: '2026-06-02T16:00:00.000Z', // ~9am PDT at UW lon
      lat: 47.655,
      lon: -122.303,
      semantic_location: {
        class: 'amenity',
        type: 'cafe',
        address: { neighbourhood: 'University District' },
      },
      elevation_category: 'GROUND_LEVEL',
      lux_level: 500,
    });

    expect(result).not.toBeNull();
    expect(result!.archetype).toBeTruthy();
    expect(result!.temporal_block).toBe('Morning Routine');
    expect(result!.zoning_profile).toContain('University District');
    expect(result!.space_probability.indoor).toBe(true);
  });

  it('flags elevated indoor for high-rise dim lighting above commercial', () => {
    const result = classifyEncounterVibe({
      encountered_at: '2026-06-02T03:00:00.000Z',
      lat: 47.655,
      lon: -122.303,
      semantic_location: { class: 'amenity', type: 'restaurant' },
      elevation_category: 'HIGH_RISE',
      lux_level: 40,
      exact_barometric_elevation_m: 45,
    });

    expect(result!.space_probability.elevated).toBe(true);
    expect(result!.space_probability.indoor).toBe(true);
  });

  it('infers indoor for west campus dorm at night without lux', () => {
    const result = classifyEncounterVibe({
      encountered_at: '2026-02-05T06:00:00.000Z',
      lat: 47.655,
      lon: -122.303,
      semantic_location: {
        address: { neighbourhood: 'West Campus', suburb: 'University District', building: 'dormitory' },
      },
      elevation_category: 'HIGH_RISE',
    });
    expect(result!.space_probability.indoor).toBe(true);
  });
});
