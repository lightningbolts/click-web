/**
 * @jest-environment node
 */

import {
  extractVenueNameFromSemanticLocation,
  resolveVenueFromEncounter,
} from '@/lib/enrichment/encounterVenueResolver';

describe('encounterVenueResolver', () => {
  it('prefers location_name when present', () => {
    expect(
      resolveVenueFromEncounter({
        location_name: 'Kane Hall',
        semantic_location: { name: 'Other' },
      }),
    ).toBe('Kane Hall');
  });

  it('reads Nominatim name from semantic_location', () => {
    expect(
      extractVenueNameFromSemanticLocation({
        name: 'Skagit Lane Bike House',
        address: { suburb: 'University District' },
      }),
    ).toBe('Skagit Lane Bike House');
  });

  it('rejects generic neighbourhood-only labels', () => {
    expect(
      resolveVenueFromEncounter({
        semantic_location: { name: 'West Campus' },
      }),
    ).toBeNull();
  });
});
