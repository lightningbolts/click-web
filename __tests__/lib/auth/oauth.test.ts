import { buildRedirectUrl, scopesForProvider, startOAuth } from '@/lib/auth/oauth';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('OAuth helpers', () => {
  describe('scopesForProvider', () => {
    it('requests OIDC scopes for Google', () => {
      expect(scopesForProvider('google')).toBe('openid profile email');
    });
    it('requests name + email for Apple', () => {
      expect(scopesForProvider('apple')).toBe('name email');
    });
  });

  describe('buildRedirectUrl', () => {
    it('points at /api/auth/callback and URL-encodes next', () => {
      const url = buildRedirectUrl('https://clickplatforms.app', '/dashboard?tab=map');
      expect(url).toBe('https://clickplatforms.app/api/auth/callback?next=%2Fdashboard%3Ftab%3Dmap');
    });
    it('defaults next to /dashboard', () => {
      expect(buildRedirectUrl('https://x.test')).toBe('https://x.test/api/auth/callback?next=%2Fdashboard');
    });
  });

  describe('startOAuth', () => {
    it('passes provider, redirect, and scopes to supabase.auth.signInWithOAuth', async () => {
      const signInWithOAuth = jest.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/authorize/...' },
        error: null,
      });
      const fake = { auth: { signInWithOAuth } } as unknown as SupabaseClient;

      const result = await startOAuth(fake, {
        provider: 'google',
        origin: 'https://clickplatforms.app',
        next: '/dashboard',
      });

      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://clickplatforms.app/api/auth/callback?next=%2Fdashboard',
          scopes: 'openid profile email',
        },
      });
      expect(result).toEqual({
        url: 'https://accounts.google.com/authorize/...',
        error: null,
      });
    });

    it('surfaces provider errors without a redirect URL', async () => {
      const signInWithOAuth = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Provider not enabled' },
      });
      const fake = { auth: { signInWithOAuth } } as unknown as SupabaseClient;

      const result = await startOAuth(fake, {
        provider: 'apple',
        origin: 'https://clickplatforms.app',
      });

      expect(result).toEqual({ url: null, error: 'Provider not enabled' });
    });

    it('uses the Apple scope list when provider is apple', async () => {
      const signInWithOAuth = jest.fn().mockResolvedValue({ data: { url: 'x' }, error: null });
      const fake = { auth: { signInWithOAuth } } as unknown as SupabaseClient;
      await startOAuth(fake, { provider: 'apple', origin: 'https://x.test' });
      expect(signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'apple',
          options: expect.objectContaining({ scopes: 'name email' }),
        }),
      );
    });
  });
});
