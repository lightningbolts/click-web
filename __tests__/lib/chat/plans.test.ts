import {
  makePlan,
  parsePlan,
  planIsOver,
  planMapsUrl,
  planRsvps,
  planSummary,
  planWire,
  PLAN_DECLINED_REACTION,
  PLAN_GOING_REACTION,
} from '@/lib/chat/plans';

describe('hangout plans (iOS HangoutPlan wire contract)', () => {
  const startsAt = new Date(2026, 8, 26, 19, 0).getTime();

  it('round-trips through metadata.plan with iOS field names', () => {
    const plan = makePlan({ title: ' Climb ', startsAt, endsAt: startsAt + 2 * 3600_000, placeName: 'IMA', latitude: 47.65, longitude: -122.3 });
    const wire = planWire(plan);
    expect(wire).toEqual({ title: 'Climb', starts_at: startsAt, ends_at: startsAt + 7_200_000, place_name: 'IMA', lat: 47.65, lon: -122.3 });
    expect(parsePlan({ plan: wire })).toEqual(plan);
  });

  it('drops an end that is not after the start and rejects plans without a title or start', () => {
    expect(makePlan({ title: 'x', startsAt, endsAt: startsAt - 1 }).endsAt).toBeNull();
    expect(parsePlan({ plan: { starts_at: startsAt } })).toBeNull();
    expect(parsePlan({ plan: { title: 'x' } })).toBeNull();
    expect(parsePlan({})).toBeNull();
  });

  it('summarizes like iOS for clients that do not render plans', () => {
    const plan = makePlan({ title: 'Coffee', startsAt, endsAt: startsAt + 3600_000, placeName: 'Allegro' });
    expect(planSummary(plan)).toBe('📅 Coffee · Sat, Sep 26, 7:00 PM–8:00 PM · 📍 Allegro');
  });

  it('assumes three hours when there is no end time', () => {
    const plan = makePlan({ title: 'x', startsAt });
    expect(planIsOver(plan, startsAt + 2 * 3600_000)).toBe(false);
    expect(planIsOver(plan, startsAt + 4 * 3600_000)).toBe(true);
  });

  it('reads RSVPs from ✅ / ❌ reactions and builds a maps link', () => {
    const reaction = (type: string, user: string) => ({ id: `${type}${user}`, message_id: 'm', user_id: user, reaction_type: type, created_at: 0 });
    expect(
      planRsvps({ reactions: { [PLAN_GOING_REACTION]: [reaction(PLAN_GOING_REACTION, 'a')], [PLAN_DECLINED_REACTION]: [reaction(PLAN_DECLINED_REACTION, 'b')] } }),
    ).toEqual({ going: ['a'], declined: ['b'] });
    expect(planMapsUrl(makePlan({ title: 'x', startsAt, placeName: 'Red Square' }))).toBe('https://maps.google.com/?q=Red%20Square');
  });
});
