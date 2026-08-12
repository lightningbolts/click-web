import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { apiError } from '@/lib/api/errors';

export type ParseParamsOk<T> = { ok: true; data: T };
export type ParseParamsFail = { ok: false; response: NextResponse };

/**
 * Parse route path params with a Zod schema.
 * Returns a standard `{ error, code }` envelope on failure.
 */
export function parseParams<T extends z.ZodType>(
  params: unknown,
  schema: T,
): ParseParamsOk<z.infer<T>> | ParseParamsFail {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first
      ? `${first.path.length ? first.path.join('.') + ': ' : ''}${first.message}`
      : 'Invalid path params';
    return {
      ok: false,
      response: apiError(message, 400, 'validation_error'),
    };
  }

  return { ok: true, data: parsed.data };
}
