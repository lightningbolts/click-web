import { NextResponse } from 'next/server';
import { runtimeEnvPresent } from '@/lib/server/runtimeEnv';

/**
 * Deploy sanity check: reports whether required runtime keys are visible to Workers
 * without leaking values. Used to verify dashboard vars + process.env population.
 */
export async function GET() {
  return NextResponse.json({
    ok:
      runtimeEnvPresent('NEXT_PUBLIC_SUPABASE_URL') &&
      runtimeEnvPresent('SUPABASE_SERVICE_ROLE_KEY'),
    keys: {
      NEXT_PUBLIC_SUPABASE_URL: runtimeEnvPresent('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: runtimeEnvPresent('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: runtimeEnvPresent('SUPABASE_SERVICE_ROLE_KEY'),
      NEXT_PUBLIC_BASE_URL: runtimeEnvPresent('NEXT_PUBLIC_BASE_URL'),
      LIVEKIT_API_KEY: runtimeEnvPresent('LIVEKIT_API_KEY'),
      LIVEKIT_API_SECRET: runtimeEnvPresent('LIVEKIT_API_SECRET'),
      LIVEKIT_WS_URL:
        runtimeEnvPresent('LIVEKIT_WS_URL') || runtimeEnvPresent('LIVEKIT_URL'),
    },
    compatibility: {
      // Helpful when debugging empty process.env on older Workers dates.
      nodeEnv: process.env.NODE_ENV ?? null,
      hasProcessEnvSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      hasProcessEnvServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    },
  });
}
