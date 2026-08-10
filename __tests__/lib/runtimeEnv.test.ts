/**
 * @jest-environment node
 */

/**
 * Guarantees static process.env.NAME reads stay wired for Next.js inlining + OpenNext.
 * Dynamic process.env[name] alone is insufficient for NEXT_PUBLIC_* in production Workers.
 */

describe('runtimeEnv static key coverage', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  it('reads NEXT_PUBLIC_SUPABASE_URL via static access path', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
    const { runtimeEnv, runtimeEnvPresent } = await import('@/lib/server/runtimeEnv');
    expect(runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')).toBe('https://example.supabase.co');
    expect(runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')).toBe('svc-test-key');
    expect(runtimeEnvPresent('NEXT_PUBLIC_SUPABASE_URL')).toBe(true);
    expect(runtimeEnvPresent('SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
  });

  it('returns undefined when keys are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { runtimeEnv } = await import('@/lib/server/runtimeEnv');
    expect(runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')).toBeUndefined();
    expect(runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')).toBeUndefined();
  });
});
