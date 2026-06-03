/**
 * @jest-environment node
 */

import { classifyEncounterVibe } from '@/lib/enrichment/vibeClassification';
import { classifyTemporalBlock } from '@/lib/enrichment/temporalProfiler';
import { classifySolarState, solarElevationDegrees } from '@/lib/enrichment/astronomicalProfiler';
import { profileAcademicCalendar, isNearUwCampus } from '@/lib/enrichment/academicCalendar';
import { parseSemanticLocation, classifyZoningCategory } from '@/lib/enrichment/spatialZoning';
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

  it('resolves UW spring quarter finals era', () => {
    const profile = profileAcademicCalendar('2026-06-01', 47.655, -122.303);
    expect(profile.academic_term).toContain('Spring Quarter 2026');
    expect(profile.academic_era).toBe('Finals Week');
  });

  it('resolves winter break', () => {
    const profile = profileAcademicCalendar('2025-12-20', 47.655, -122.303);
    expect(profile.academic_era).toBe('Winter Break');
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
    expect(result!.space_probability.indoor).toBe(false);
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
});
