import fixture from '../../fixtures/places/filters.json';
import { applyPlaceFilters, NO_FILTERS, parsePlaceFilters, type PlaceFilters } from '@/lib/places/filters';
import type { PlaceSummary } from '@/lib/places/types';

const places = fixture.places as unknown as PlaceSummary[];

describe('applyPlaceFilters (shared fixture, mirrored in click-ios)', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const result = applyPlaceFilters(places, c.filters as PlaceFilters);
    expect(result.map((p) => p.id)).toEqual(c.expected_ids);
  });

  it('NO_FILTERS matches every Place', () => {
    expect(applyPlaceFilters(places, NO_FILTERS)).toHaveLength(places.length);
  });
});

describe('parsePlaceFilters', () => {
  it('reads every query param', () => {
    const f = parsePlaceFilters(
      new URLSearchParams(
        'category=cafe,bar&pulse_now=1&min_reports=3&energy=lively,packed&events_today=1&open_now=true&been_here=1&clicks_been_here=1&has_hub=1&here_now=1',
      ),
    );
    expect(f).toEqual({
      categories: ['cafe', 'bar'],
      pulseNow: true,
      minReports: 3,
      energies: ['lively', 'packed'],
      eventsToday: true,
      openNow: true,
      beenHere: true,
      clicksBeenHere: true,
      hasHub: true,
      hereNow: true,
    });
  });

  it('ignores unknown values instead of failing', () => {
    expect(
      parsePlaceFilters(new URLSearchParams('category=church,cafe&energy=wild&min_reports=-4&pulse_now=yes&foo=1')),
    ).toEqual({ ...NO_FILTERS, categories: ['cafe'] });
  });

  it('defaults to no filters', () => {
    expect(parsePlaceFilters(new URLSearchParams())).toEqual(NO_FILTERS);
    expect(parsePlaceFilters({})).toEqual(NO_FILTERS);
  });
});
