import { businessRedirects, INSIGHTS_PAGE_MAP, resolveBusinessRedirect } from '@/lib/shell/businessRedirects';
import { legacyTabRedirect } from '@/lib/shell/legacyTabRedirect';

const V = '11111111-1111-4111-8111-111111111111';
const q = (s: string) => new URLSearchParams(s);

/** Every row of the spec §6.3 redirect table (plus the §9.5 Insights mapping). */
describe('redirects (spec §6.3)', () => {
  it.each([
    ['tab=memory', '/'],
    ['tab=chat', '/clicks'],
    ['tab=chat&c=abc', '/clicks/c/abc'],
    ['tab=hubs&hub=h1', '/clicks/h/h1'],
    ['tab=hubs', '/clicks?filter=hubs'],
    ['tab=map', '/map'],
    ['tab=identity', '/add'],
    ['tab=settings', '/settings'],
    ['tab=events', '/events'],
  ])('/?%s → %s', (query, to) => {
    expect(legacyTabRedirect(q(query))).toBe(to);
  });

  it('sends /insights to the resolver, or to the Place when venue_id is given', () => {
    expect(resolveBusinessRedirect('/insights', q(''))).toBe('/business');
    expect(resolveBusinessRedirect('/insights', q(`venue_id=${V}`))).toBe(`/business/places/${V}/insights`);
  });

  it.each(Object.entries(INSIGHTS_PAGE_MAP))('/insights/%s maps to section "%s"', (page, section) => {
    const suffix = section ? `/${section}` : '';
    expect(resolveBusinessRedirect(`/insights/${page}`, q(`venue_id=${V}`))).toBe(`/business/places/${V}/insights${suffix}`);
    expect(resolveBusinessRedirect(`/insights/${page}`, q(''))).toBe(`/business?to=insights${suffix}`);
  });

  it('meets §9.10: /insights/heatmap?venue_id=X → traffic', () => {
    expect(resolveBusinessRedirect('/insights/heatmap', q(`venue_id=${V}`))).toBe(`/business/places/${V}/insights/traffic`);
  });

  it('retires /business/signup for onboarding, and every rule is permanent', () => {
    expect(resolveBusinessRedirect('/business/signup', q('checkout=success'))).toBe('/business/get-started');
    expect(businessRedirects().every((r) => r.permanent)).toBe(true);
  });

  it('ignores a malformed venue_id instead of building a bad path', () => {
    expect(resolveBusinessRedirect('/insights/heatmap', q('venue_id=../../etc'))).toBeNull();
  });
});
