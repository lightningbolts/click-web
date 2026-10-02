/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';
import { allMembersOptedIntoInsights } from '@/lib/server/connections/insightsOptIn';
import { expectFilter, makeSupabaseMock, type QueryResult } from '../../../helpers/supabaseRouteMocks';

function adminWith(users: QueryResult) {
  const mock = makeSupabaseMock({ tables: { users } });
  return { mock, admin: mock.supabase as unknown as SupabaseClient };
}

describe('allMembersOptedIntoInsights', () => {
  it('is true when every member opted in', async () => {
    const { admin, mock } = adminWith({
      data: [
        { id: 'a', location_include_in_insights_enabled: true },
        { id: 'b', location_include_in_insights_enabled: true },
      ],
      error: null,
    });
    await expect(allMembersOptedIntoInsights(admin, ['a', 'b', 'a'])).resolves.toBe(true);
    expectFilter(mock.builder('users'), 'id', ['a', 'b'], 'in');
  });

  it('is false when one member opted out', async () => {
    const { admin } = adminWith({
      data: [
        { id: 'a', location_include_in_insights_enabled: true },
        { id: 'b', location_include_in_insights_enabled: false },
      ],
      error: null,
    });
    await expect(allMembersOptedIntoInsights(admin, ['a', 'b'])).resolves.toBe(false);
  });

  it('treats a null setting as opted out', async () => {
    const { admin } = adminWith({
      data: [
        { id: 'a', location_include_in_insights_enabled: true },
        { id: 'b', location_include_in_insights_enabled: null },
      ],
      error: null,
    });
    await expect(allMembersOptedIntoInsights(admin, ['a', 'b'])).resolves.toBe(false);
  });

  it('is false when a member row is missing', async () => {
    const { admin } = adminWith({
      data: [{ id: 'a', location_include_in_insights_enabled: true }],
      error: null,
    });
    await expect(allMembersOptedIntoInsights(admin, ['a', 'b'])).resolves.toBe(false);
  });

  it('fails closed on a read error', async () => {
    const { admin } = adminWith({ data: null, error: { message: 'boom' } });
    await expect(allMembersOptedIntoInsights(admin, ['a', 'b'])).resolves.toBe(false);
  });

  it('is false for an empty member list', async () => {
    const { admin } = adminWith({ data: [], error: null });
    await expect(allMembersOptedIntoInsights(admin, [])).resolves.toBe(false);
  });
});
