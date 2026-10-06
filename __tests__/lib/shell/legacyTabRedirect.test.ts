import { legacyTabRedirect } from '@/lib/shell/legacyTabRedirect';

const go = (query: string) => legacyTabRedirect(new URLSearchParams(query));

describe('legacyTabRedirect', () => {
  it('leaves plain / alone', () => {
    expect(go('')).toBeNull();
    expect(go('utm_source=x')).toBeNull();
  });

  it.each([
    ['tab=settings', '/settings'],
    ['tab=map', '/map'],
    ['tab=identity', '/add'],
    ['tab=events', '/events'],
    ['tab=chat', '/clicks'],
    ['tab=chat&c=abc', '/clicks/c/abc'],
    ['tab=hubs', '/clicks?filter=hubs'],
    ['tab=hubs&hub=h%201', '/clicks/h/h%201'],
    ['tab=chat&c=a%2Fb', '/clicks/c/a%2Fb'],
    ['tab=memory', '/'],
    ['tab=whatever', '/'],
  ])('%s → %s', (query, target) => {
    expect(go(query)).toBe(target);
  });
});
