import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { apiError } from '@/lib/api/errors';

export type ParseBodyOk<T> = { ok: true; data: T };
export type ParseBodyFail = { ok: false; response: NextResponse };

/**
 * Parse a JSON request body with a Zod schema.
 * Returns a standard `{ error, code }` envelope on failure.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<ParseBodyOk<z.infer<T>> | ParseBodyFail> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError('Invalid JSON body', 400, 'invalid_json'),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first
      ? `${first.path.length ? first.path.join('.') + ': ' : ''}${first.message}`
      : 'Invalid request body';
    return {
      ok: false,
      response: apiError(message, 400, 'validation_error'),
    };
  }

  return { ok: true, data: parsed.data };
}
