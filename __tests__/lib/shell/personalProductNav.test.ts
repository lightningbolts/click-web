import {
  dashboardTabForPath,
  dashboardTabHref,
  parseDashboardTab,
} from '@/lib/shell/personalProductNav';
import { eventBackHref } from '@/components/events/EventBackLink';

describe('personalProductNav', () => {
  it('defaults unknown tabs to memory', () => {
    expect(parseDashboardTab(null)).toBe('memory');
    expect(parseDashboardTab('nope')).toBe('memory');
    expect(parseDashboardTab('events')).toBe('events');
  });

  it('builds route hrefs (no ?tab=) for every pane', () => {
    expect(dashboardTabHref('events')).toBe('/events');
    expect(dashboardTabHref('memory')).toBe('/');
    expect(dashboardTabHref('chat')).toBe('/clicks');
    expect(dashboardTabHref('hubs')).toBe('/clicks?filter=hubs');
    expect(dashboardTabHref('map')).toBe('/map');
    expect(dashboardTabHref('identity')).toBe('/add');
    expect(dashboardTabHref('settings')).toBe('/settings');
  });

  it('maps app routes back to panes', () => {
    expect(dashboardTabForPath('/clicks')).toBe('chat');
    expect(dashboardTabForPath('/clicks', 'hubs')).toBe('hubs');
    expect(dashboardTabForPath('/map')).toBe('map');
    expect(dashboardTabForPath('/add')).toBe('identity');
    expect(dashboardTabForPath('/settings')).toBe('settings');
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
