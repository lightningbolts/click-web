import { activityHref } from '@/lib/activity/activityHref';

describe('activityHref', () => {
  it('routes event rows to the event, RSVP requests to manage', () => {
    expect(activityHref({ type: 'event_rsvp', data: { beacon_id: 'b1' } })).toBe('/e/b1');
    expect(activityHref({ type: 'event_rsvp_request', data: { beacon_id: 'b1' } })).toBe('/e/b1/manage');
  });

  it('routes connection rows to the thread, then the actor, then Activity', () => {
    expect(activityHref({ type: 'message', data: { connection_id: 'c1' }, actor: { id: 'u1' } })).toBe('/clicks/c/c1');
    expect(activityHref({ type: 'wave', data: {}, actor: { id: 'u1' } })).toBe('/people/u1');
    expect(activityHref({ type: 'system', data: {} })).toBe('/activity');
  });
});
