/**
 * Structural vibe classification stored on `connection_encounters.vibe_capture`.
 * Coexists with sensor overflow keys and venue-vibe feedback (sentiment, category, …).
 */

export type TemporalBlock =
  | 'Morning Routine'
  | 'Mid-Morning Hub'
  | 'Lunch Hour'
  | 'Afternoon Grind'
  | 'Post-Work / Dinner Vibe'
  | 'Late Night Wind Down'
  | 'After Hours'
  | 'Dawn Patrol';

export type SolarState =
  | 'Daytime'
  | 'Nighttime'
  | 'Golden Hour'
  | 'Blue Hour'
  | 'Civil Twilight';

export type AcademicEra =
  | 'Syllabus Week'
  | 'Midterms Grind'
  | 'Finals Week'
  | 'Spring Break'
  | 'Summer Break'
  | 'Winter Break'
  | 'In Session'
  | 'Outside Academic Calendar';

export interface VibeCaptureSchema {
  solar_state: SolarState;
  temporal_block: TemporalBlock;
  academic_era: AcademicEra;
  academic_term: string;
  zoning_profile: string;
  space_probability: { indoor: boolean; elevated: boolean };
  archetype: string;
  /** ISO timestamp when structural classification was computed */
  classified_at?: string;
  /** Neighbourhood / suburb extracted from semantic_location (informational) */
  neighbourhood?: string;
  suburb?: string;
}

export type VibeClassificationInput = {
  encountered_at: string;
  lat: number;
  lon: number;
  semantic_location?: unknown;
  elevation_category?: string | null;
  lux_level?: number | null;
  exact_barometric_elevation_m?: number | null;
};
