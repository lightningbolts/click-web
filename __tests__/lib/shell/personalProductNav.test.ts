import {
  dashboardTabHref,
  isSignedInProductPath,
  parseDashboardTab,
  personalProductNavItems,
} from '@/lib/shell/personalProductNav';
import { eventBackHref } from '@/components/events/EventBackLink';

describe('personalProductNav', () => {
  it('defaults unknown tabs to memory', () => {
    expect(parseDashboardTab(null)).toBe('memory');
    expect(parseDashboardTab('nope')).toBe('memory');
    expect(parseDashboardTab('events')).toBe('events');
  });

  it('builds hrefs for every dashboard tab', () => {
    expect(dashboardTabHref('events')).toBe('/?tab=events');
    expect(personalProductNavItems().map((item) => item.id)).toEqual([
      'memory',
      'events',
      'map',
      'chat',
      'identity',
      'settings',
    ]);
  });

  it('treats event routes as signed-in product chrome', () => {
    expect(isSignedInProductPath('/')).toBe(true);
    expect(isSignedInProductPath('/events')).toBe(true);
    expect(isSignedInProductPath('/events/new')).toBe(true);
    expect(isSignedInProductPath('/e/abc')).toBe(true);
    expect(isSignedInProductPath('/about')).toBe(false);
  });
});

describe('eventBackHref', () => {
  const origin = 'https://joinclick.co';

  it('returns the public feed when the referrer is /events', () => {
    expect(eventBackHref({ referrer: `${origin}/events`, origin, signedIn: true })).toBe('/events');
  });

  it('returns the dashboard events tab for signed-in visitors from the dashboard', () => {
    expect(eventBackHref({ referrer: `${origin}/`, origin, signedIn: true })).toBe('/?tab=events');
  });

  it('returns the public feed for anonymous visitors', () => {
    expect(eventBackHref({ referrer: '', origin, signedIn: false })).toBe('/events');
  });
});
