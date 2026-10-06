import { dashboardTabForPath } from '@/lib/shell/personalProductNav';
import { eventBackHref } from '@/components/events/EventBackLink';

describe('personalProductNav', () => {
  it('maps the remaining legacy routes to panes', () => {
    expect(dashboardTabForPath('/map')).toBe('map');
    expect(dashboardTabForPath('/settings')).toBeNull();
    expect(dashboardTabForPath('/clicks')).toBeNull();
    expect(dashboardTabForPath('/add')).toBeNull();
    expect(dashboardTabForPath('/me')).toBeNull();
    expect(dashboardTabForPath('/')).toBeNull();
  });
});

describe('eventBackHref', () => {
  const origin = 'https://joinclick.co';

  it('returns the public feed when the referrer is /events', () => {
    expect(eventBackHref({ referrer: `${origin}/events`, origin, signedIn: true })).toBe('/events');
  });

  it('returns /events for signed-in visitors from the dashboard', () => {
    expect(eventBackHref({ referrer: `${origin}/`, origin, signedIn: true })).toBe('/events');
  });

  it('returns the public feed for anonymous visitors', () => {
    expect(eventBackHref({ referrer: '', origin, signedIn: false })).toBe('/events');
  });
});
