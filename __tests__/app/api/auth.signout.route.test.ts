/** @jest-environment node */

import { POST } from '@/app/api/auth/signout/route';

const mockSignOut = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { signOut: (...args: unknown[]) => mockSignOut(...args) } }),
}));

jest.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: jest.fn() }),
}));

test('signing out of this browser leaves the account signed in on its other devices', async () => {
  mockSignOut.mockResolvedValue({ error: null });
  const response = await POST();
  expect(response.status).toBe(200);
  // Supabase defaults to `global`, which revokes every session: the phone was signed out too.
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
});
