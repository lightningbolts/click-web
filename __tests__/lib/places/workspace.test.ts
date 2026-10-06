import { canWrite, placeStatusPill, resolveBusinessPlace, safeWorkspaceSuffix } from '@/lib/places/workspace';
import { placeHasInsights, userMayViewPlaceInsights } from '@/lib/server/places/entitlement';
import { workspaceSuffix, workspaceTabs } from '@/components/business/WorkspaceHeader';
import { setupSteps } from '@/components/business/SetupChecklist';
import { listingBlocker } from '@/components/business/PlaceProfileForm';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));

describe('Place workspace rules (spec §9)', () => {
  it('maps verification and listing to the status pill table', () => {
    expect(placeStatusPill({ verification_status: 'draft', listed: false })).toEqual({ label: 'Draft', variant: 'neutral' });
    expect(placeStatusPill({ verification_status: 'pending', listed: false })).toEqual({ label: 'In review', variant: 'warning' });
    expect(placeStatusPill({ verification_status: 'verified', listed: false }).label).toBe('Verified · Not listed');
    expect(placeStatusPill({ verification_status: 'verified', listed: true })).toEqual({ label: 'Live', variant: 'success' });
    expect(placeStatusPill({ verification_status: 'suspended', listed: true }).variant).toBe('destructive');
  });

  it('lets owners and managers write, never viewers', () => {
    expect([canWrite('owner'), canWrite('manager'), canWrite('viewer')]).toEqual([true, true, false]);
  });

  it('resolves /business to the cookie Place only while you still manage it', () => {
    const places = [{ id: 'a' }, { id: 'b' }];
    expect(resolveBusinessPlace(places, 'b')).toBe('b');
    expect(resolveBusinessPlace(places, 'gone')).toBe('a');
    expect(resolveBusinessPlace([], 'b')).toBeNull();
  });

  it('passes only known workspace paths through ?to=', () => {
    expect(safeWorkspaceSuffix('insights/traffic')).toBe('/insights/traffic');
    expect(safeWorkspaceSuffix('/billing/')).toBe('/billing');
    expect(safeWorkspaceSuffix('//evil.com')).toBe('');
    expect(safeWorkspaceSuffix('insights/../../x')).toBe('');
  });

  it('shows Billing to owners only and locks Insights when not entitled', () => {
    const owner = workspaceTabs({ id: 'p', role: 'owner', entitled: false });
    expect(owner.map((t) => t.href)).toContain('/business/places/p/billing');
    expect(workspaceTabs({ id: 'p', role: 'manager', entitled: true }).map((t) => t.href)).not.toContain('/business/places/p/billing');
    expect(workspaceSuffix('/business/places/p/insights/traffic', 'p')).toBe('/insights/traffic');
  });

  it('only active or trialing subscriptions include Insights', () => {
    expect(['active', 'trialing', 'past_due', 'canceled', null].map((s) => placeHasInsights({ subscription_status: s }))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('checks the Place in question: paying for Place A does not unlock Place B', async () => {
    const statusFor: Record<string, string> = { A: 'active', B: 'inactive' };
    const supabase = {
      from: (table: string) => {
        const filters: Record<string, string> = {};
        const q = {
          select: () => q,
          eq: (col: string, v: string) => {
            filters[col] = v;
            return q;
          },
          maybeSingle: async () =>
            table === 'users'
              ? { data: { role: null }, error: null }
              : { data: { places: { subscription_status: statusFor[filters.place_id] } }, error: null },
        };
        return q;
      },
    } as unknown as SupabaseClient;
    const user = { id: 'u1', email: 'owner@example.com' };
    expect(await userMayViewPlaceInsights(supabase, user, 'A')).toBe(true);
    expect(await userMayViewPlaceInsights(supabase, user, 'B')).toBe(false);
  });

  const base = {
    id: 'p',
    slug: 'p',
    name: 'P',
    category: 'cafe' as const,
    verification_status: 'pending' as const,
    listed: false,
    hub_enabled: false,
    photo_url: null,
    role: 'owner' as const,
    subscription_status: null,
    description: null,
    hours: null,
    website_url: null,
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    timezone: 'UTC',
    latitude: 1,
    longitude: 1,
    radius_meters: 75,
    entitled: false,
  };

  it('builds the setup checklist: draft submits, verified owners go live, viewers can’t', () => {
    const draft = setupSteps({ ...base, verification_status: 'draft' }, { hasEvent: false });
    expect(draft.find((s) => s.id === 'verification')).toMatchObject({ title: 'Submit for review', action: 'submit' });
    const verified = setupSteps({ ...base, verification_status: 'verified' }, { hasEvent: true });
    expect(verified.find((s) => s.id === 'live')?.action).toBe('go-live');
    expect(verified.find((s) => s.id === 'event')?.done).toBe(true);
    expect(setupSteps({ ...base, role: 'manager' }, { hasEvent: false }).some((s) => s.id === 'live')).toBe(false);
  });

  it('keeps Listed off until verified and complete', () => {
    expect(listingBlocker(base)).toMatch(/verifies/);
    expect(listingBlocker({ ...base, verification_status: 'verified' })).toBe('Add a photo, a description, hours first.');
    expect(listingBlocker({ ...base, verification_status: 'verified', photo_url: 'x', description: 'd', hours: { mon: [['09:00', '17:00']] } })).toBeNull();
  });
});
